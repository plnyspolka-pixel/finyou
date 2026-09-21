/**
 * „Co nowego" — jedno źródło prawdy dla raportu aktywności platformy w oknie
 * czasowym. Używają go:
 *  - narzędzie MCP `get_updates_since` (agent w Claude.ai / ChatGPT pyta
 *    „co nowego od ostatniego razu"),
 *  - tick `/api/public/hooks/activity-digest-tick` (pg_cron co 30 min → push
 *    + e-mail do zespołu, tylko gdy coś się wydarzyło).
 *
 * Uprawnienia sprawdza WOŁAJĄCY (narzędzie MCP: `isAdmin`; tick: sekret
 * crona) — tu pracujemy na kliencie z rolą serwisową.
 *
 * Sekcje raportu (wszystko po `created_at` w oknie [since, until)):
 *  - nowe leady (`leads`),
 *  - nowe wnioski pożyczkowe (`loan_applications`),
 *  - wiadomości przychodzące od klientów/inwestorów (`lead_communications`,
 *    direction = inbound, kanały rozmowne),
 *  - nowe oferty inwestorów (`investor_offers`),
 *  - odpowiedzi instytucji finansujących na rozesłane oferty
 *    (`offer_distribution_messages`, direction = inbound),
 *  - opłacone dostępy (`access_payments`, status = paid, po `processed_at`).
 */

export type ActivityLead = {
  id: string;
  who: string;
  email: string | null;
  phone: string | null;
  type: string;
  status: string;
  source: string | null;
  created_at: string;
  url: string;
};

export type ActivityApplication = {
  id: string;
  status: string;
  loan_amount: number | null;
  preferred_period_months: number | null;
  completeness_percent: number;
  source: string | null;
  created_at: string;
  url: string;
};

export type ActivityInboundMessage = {
  id: string;
  lead_id: string | null;
  who: string;
  channel: string;
  subject: string | null;
  snippet: string;
  created_at: string;
  url: string;
};

export type ActivityInvestorOffer = {
  id: string;
  loan_application_id: string;
  investor_id: string;
  offer_status: string;
  proposed_amount: number | null;
  period_months: number | null;
  created_at: string;
  url: string;
};

export type ActivityInstitutionReply = {
  id: string;
  loan_application_id: string | null;
  from_email: string | null;
  subject: string | null;
  snippet: string;
  created_at: string;
  url: string;
};

export type ActivityPayment = {
  id: string;
  audience: string;
  product_id: string;
  buyer_email: string | null;
  paid_amount_grosz: number | null;
  currency: string;
  processed_at: string | null;
  url: string;
};

export type ActivityCounts = {
  leads: number;
  applications: number;
  inbound_messages: number;
  investor_offers: number;
  institution_replies: number;
  payments: number;
};

export type ActivityUpdates = {
  since: string;
  until: string;
  total: number;
  counts: ActivityCounts;
  /** Sekcje, w których lista została ucięta do limitu (liczniki są pełne). */
  truncated: Array<keyof ActivityCounts>;
  /** Sekcje, których nie udało się odczytać (komunikat błędu). */
  errors: string[];
  leads: ActivityLead[];
  applications: ActivityApplication[];
  inbound_messages: ActivityInboundMessage[];
  investor_offers: ActivityInvestorOffer[];
  institution_replies: ActivityInstitutionReply[];
  payments: ActivityPayment[];
};

/** Kanały, które w skrzynce są „korespondencją" (bez logów technicznych). */
export const INBOUND_CONVERSATION_CHANNELS = [
  "email",
  "messenger",
  "instagram",
  "chat",
  "chat_inwestor",
  "sms",
  "whatsapp",
  "voicebot_call",
] as const;

const CHANNEL_LABEL: Record<string, string> = {
  email: "e-mail",
  messenger: "Messenger",
  instagram: "Instagram",
  chat: "czat na stronie",
  chat_inwestor: "czat inwestora",
  sms: "SMS",
  whatsapp: "WhatsApp",
  voicebot_call: "telefon",
};

export const DEFAULT_SECTION_LIMIT = 20;
export const MAX_SECTION_LIMIT = 50;

/** Minimalny podzbiór klienta Supabase, którego używamy — łatwy do podstawienia w testach. */
export type ActivityDb = {
  from: (table: string) => any;
};

type Range = { since: string; until: string };

function snippet(s: string | null | undefined, len = 200): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, len);
}

function personLabel(p: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_raw?: string | null;
}): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || p.email || p.phone_raw || "(bez nazwy)";
}

function toIso(v: Date | string): string {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Nieprawidłowa data: ${String(v)}`);
  return d.toISOString();
}

/** Zapytanie o wiersze z oknem czasowym po wskazanej kolumnie; +1 wiersz, żeby wykryć ucięcie. */
async function fetchWindow<T>(
  db: ActivityDb,
  table: string,
  columns: string,
  timeColumn: string,
  range: Range,
  limit: number,
  refine?: (q: any) => any,
): Promise<{ rows: T[]; count: number; truncated: boolean }> {
  let q = db
    .from(table)
    .select(columns, { count: "exact" })
    .gte(timeColumn, range.since)
    .lt(timeColumn, range.until);
  if (refine) q = refine(q);
  const { data, error, count } = await q.order(timeColumn, { ascending: false }).limit(limit + 1);
  if (error) throw new Error(`${table}: ${error.message}`);
  const all = (data ?? []) as T[];
  const truncated = all.length > limit;
  const rows = truncated ? all.slice(0, limit) : all;
  return { rows, count: typeof count === "number" ? count : all.length, truncated };
}

/**
 * Zbiera aktywność platformy w oknie [since, until). Każda sekcja jest
 * niezależna — błąd jednej tabeli nie wywraca całego raportu, trafia do
 * `errors`.
 */
export async function collectActivitySince(
  args: { since: Date | string; until?: Date | string; limitPerSection?: number },
  db?: ActivityDb,
): Promise<ActivityUpdates> {
  const client: ActivityDb =
    db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const range: Range = { since: toIso(args.since), until: toIso(args.until ?? new Date()) };
  if (range.since >= range.until) {
    throw new Error("`since` musi być wcześniejsze niż `until`.");
  }
  const limit = Math.max(
    1,
    Math.min(MAX_SECTION_LIMIT, args.limitPerSection ?? DEFAULT_SECTION_LIMIT),
  );

  const out: ActivityUpdates = {
    since: range.since,
    until: range.until,
    total: 0,
    counts: {
      leads: 0,
      applications: 0,
      inbound_messages: 0,
      investor_offers: 0,
      institution_replies: 0,
      payments: 0,
    },
    truncated: [],
    errors: [],
    leads: [],
    applications: [],
    inbound_messages: [],
    investor_offers: [],
    institution_replies: [],
    payments: [],
  };

  const section = async (
    key: keyof ActivityCounts,
    run: () => Promise<{ count: number; truncated: boolean }>,
  ) => {
    try {
      const r = await run();
      out.counts[key] = r.count;
      if (r.truncated) out.truncated.push(key);
    } catch (e) {
      out.errors.push((e as Error).message);
    }
  };

  await Promise.all([
    section("leads", async () => {
      const r = await fetchWindow<any>(
        client,
        "leads",
        "id, first_name, last_name, email, phone_raw, type, status, source, created_at",
        "created_at",
        range,
        limit,
      );
      out.leads = r.rows.map((l) => ({
        id: l.id,
        who: personLabel(l),
        email: l.email ?? null,
        phone: l.phone_raw ?? null,
        type: l.type,
        status: l.status,
        source: l.source ?? null,
        created_at: l.created_at,
        url: `/operator/leady/${l.id}`,
      }));
      return r;
    }),
    section("applications", async () => {
      const r = await fetchWindow<any>(
        client,
        "loan_applications",
        "id, status, loan_amount, preferred_period_months, completeness_percent, source, created_at",
        "created_at",
        range,
        limit,
        (q) => q.is("deleted_at", null),
      );
      out.applications = r.rows.map((a) => ({
        id: a.id,
        status: a.status,
        loan_amount: a.loan_amount ?? null,
        preferred_period_months: a.preferred_period_months ?? null,
        completeness_percent: a.completeness_percent ?? 0,
        source: a.source ?? null,
        created_at: a.created_at,
        url: `/operator/wnioski/${a.id}`,
      }));
      return r;
    }),
    section("inbound_messages", async () => {
      const r = await fetchWindow<any>(
        client,
        "lead_communications",
        "id, lead_id, channel, subject, content, email, phone_normalized, created_at",
        "created_at",
        range,
        limit,
        (q) => q.eq("direction", "inbound").in("channel", [...INBOUND_CONVERSATION_CHANNELS]),
      );
      const leadIds = [...new Set(r.rows.map((m) => m.lead_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (leadIds.length) {
        const { data } = await client
          .from("leads")
          .select("id, first_name, last_name, email, phone_raw")
          .in("id", leadIds);
        for (const l of (data ?? []) as any[]) names.set(l.id, personLabel(l));
      }
      out.inbound_messages = r.rows.map((m) => ({
        id: m.id,
        lead_id: m.lead_id ?? null,
        who:
          (m.lead_id && names.get(m.lead_id)) ||
          m.email ||
          m.phone_normalized ||
          "(nieznany nadawca)",
        channel: m.channel,
        subject: m.subject ?? null,
        snippet: snippet(m.content),
        created_at: m.created_at,
        url: inboundUrl(m.channel, m.lead_id ?? null),
      }));
      return r;
    }),
    section("investor_offers", async () => {
      const r = await fetchWindow<any>(
        client,
        "investor_offers",
        "id, loan_application_id, investor_id, offer_status, proposed_amount, period_months, created_at",
        "created_at",
        range,
        limit,
        // Szkic to jeszcze nie zdarzenie — inwestor dopiero pisze ofertę.
        (q) => q.neq("offer_status", "szkic"),
      );
      out.investor_offers = r.rows.map((o) => ({
        id: o.id,
        loan_application_id: o.loan_application_id,
        investor_id: o.investor_id,
        offer_status: o.offer_status,
        proposed_amount: o.proposed_amount ?? null,
        period_months: o.period_months ?? null,
        created_at: o.created_at,
        url: `/admin/wnioski/${o.loan_application_id}`,
      }));
      return r;
    }),
    section("institution_replies", async () => {
      const r = await fetchWindow<any>(
        client,
        "offer_distribution_messages",
        "id, loan_application_id, from_email, subject, content, created_at",
        "created_at",
        range,
        limit,
        (q) => q.eq("direction", "inbound"),
      );
      out.institution_replies = r.rows.map((m) => ({
        id: m.id,
        loan_application_id: m.loan_application_id ?? null,
        from_email: m.from_email ?? null,
        subject: m.subject ?? null,
        snippet: snippet(m.content),
        created_at: m.created_at,
        url: "/operator/oferty",
      }));
      return r;
    }),
    section("payments", async () => {
      const r = await fetchWindow<any>(
        client,
        "access_payments",
        "id, audience, product_id, buyer_email, paid_amount_grosz, currency, processed_at",
        "processed_at",
        range,
        limit,
        (q) => q.eq("status", "paid"),
      );
      out.payments = r.rows.map((p) => ({
        id: p.id,
        audience: p.audience,
        product_id: p.product_id,
        buyer_email: p.buyer_email ?? null,
        paid_amount_grosz: p.paid_amount_grosz ?? null,
        currency: p.currency ?? "PLN",
        processed_at: p.processed_at ?? null,
        url: "/admin/finanse",
      }));
      return r;
    }),
  ]);

  out.total = Object.values(out.counts).reduce((a, b) => a + b, 0);
  return out;
}

function inboundUrl(channel: string, leadId: string | null): string {
  switch (channel) {
    case "chat":
      return "/operator/czat";
    case "messenger":
    case "instagram":
      return "/operator/messenger";
    case "email":
      return "/operator/skrzynka";
    default:
      return leadId ? `/operator/leady/${leadId}` : "/operator/leady";
  }
}

function plural(n: number, forms: [string, string, string]): string {
  const [one, few, many] = forms;
  if (n === 1) return `${n} ${one}`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** Jednolinijkowe podsumowanie, np. „2 nowe leady, 1 wniosek, 3 wiadomości". */
export function summarizeActivity(u: ActivityUpdates): string {
  const parts: string[] = [];
  const c = u.counts;
  if (c.leads) parts.push(plural(c.leads, ["nowy lead", "nowe leady", "nowych leadów"]));
  if (c.applications)
    parts.push(plural(c.applications, ["nowy wniosek", "nowe wnioski", "nowych wniosków"]));
  if (c.inbound_messages)
    parts.push(
      plural(c.inbound_messages, [
        "wiadomość przychodząca",
        "wiadomości przychodzące",
        "wiadomości przychodzących",
      ]),
    );
  if (c.investor_offers)
    parts.push(
      plural(c.investor_offers, ["oferta inwestora", "oferty inwestorów", "ofert inwestorów"]),
    );
  if (c.institution_replies)
    parts.push(
      plural(c.institution_replies, [
        "odpowiedź instytucji",
        "odpowiedzi instytucji",
        "odpowiedzi instytucji",
      ]),
    );
  if (c.payments)
    parts.push(plural(c.payments, ["opłacony dostęp", "opłacone dostępy", "opłaconych dostępów"]));
  return parts.length ? parts.join(", ") : "brak nowych zdarzeń";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function fmtPln(v: number | null): string {
  if (v === null || v === undefined) return "";
  return `${new Intl.NumberFormat("pl-PL").format(v)} zł`;
}

/**
 * Raport tekstowy (do maila / podglądu w czacie). `baseUrl` dokleja się do
 * ścieżek panelu, żeby linki działały poza aplikacją.
 */
export function renderActivityDigestText(u: ActivityUpdates, baseUrl = ""): string {
  const link = (path: string) => `${baseUrl}${path}`;
  const lines: string[] = [];
  lines.push(`Co nowego na Finance You: ${summarizeActivity(u)}.`);
  lines.push(`Okno: ${fmtTime(u.since)} – ${fmtTime(u.until)} (czas warszawski).`);

  const more = (key: keyof ActivityCounts) =>
    u.truncated.includes(key) ? `  … i więcej — pełna lista w panelu.` : null;

  if (u.leads.length) {
    lines.push("", `Nowe leady (${u.counts.leads}):`);
    for (const l of u.leads) {
      const meta = [l.type, l.status, l.source ? `źródło: ${l.source}` : null]
        .filter(Boolean)
        .join(", ");
      lines.push(`  • ${fmtTime(l.created_at)} ${l.who} — ${meta} → ${link(l.url)}`);
    }
    const m = more("leads");
    if (m) lines.push(m);
  }
  if (u.applications.length) {
    lines.push("", `Nowe wnioski (${u.counts.applications}):`);
    for (const a of u.applications) {
      const meta = [
        a.loan_amount ? fmtPln(a.loan_amount) : null,
        a.preferred_period_months ? `${a.preferred_period_months} mies.` : null,
        `${a.completeness_percent}% kompletności`,
        a.status,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`  • ${fmtTime(a.created_at)} ${meta} → ${link(a.url)}`);
    }
    const m = more("applications");
    if (m) lines.push(m);
  }
  if (u.inbound_messages.length) {
    lines.push("", `Wiadomości przychodzące (${u.counts.inbound_messages}):`);
    for (const msg of u.inbound_messages) {
      const label = CHANNEL_LABEL[msg.channel] ?? msg.channel;
      const text = msg.subject ? `${msg.subject}: ${msg.snippet}` : msg.snippet;
      lines.push(
        `  • ${fmtTime(msg.created_at)} [${label}] ${msg.who}: ${snippet(text, 140)} → ${link(msg.url)}`,
      );
    }
    const m = more("inbound_messages");
    if (m) lines.push(m);
  }
  if (u.investor_offers.length) {
    lines.push("", `Oferty inwestorów (${u.counts.investor_offers}):`);
    for (const o of u.investor_offers) {
      const meta = [
        o.proposed_amount ? fmtPln(o.proposed_amount) : null,
        o.period_months ? `${o.period_months} mies.` : null,
        o.offer_status,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`  • ${fmtTime(o.created_at)} ${meta} → ${link(o.url)}`);
    }
    const m = more("investor_offers");
    if (m) lines.push(m);
  }
  if (u.institution_replies.length) {
    lines.push("", `Odpowiedzi instytucji finansujących (${u.counts.institution_replies}):`);
    for (const r of u.institution_replies) {
      const text = r.subject ? `${r.subject}: ${r.snippet}` : r.snippet;
      lines.push(
        `  • ${fmtTime(r.created_at)} ${r.from_email ?? "(brak nadawcy)"}: ${snippet(text, 140)} → ${link(r.url)}`,
      );
    }
    const m = more("institution_replies");
    if (m) lines.push(m);
  }
  if (u.payments.length) {
    lines.push("", `Opłacone dostępy (${u.counts.payments}):`);
    for (const p of u.payments) {
      const amount =
        p.paid_amount_grosz !== null
          ? `${(p.paid_amount_grosz / 100).toFixed(2)} ${p.currency}`
          : "";
      lines.push(
        `  • ${fmtTime(p.processed_at)} ${p.audience} / ${p.product_id} ${amount} ${p.buyer_email ?? ""} → ${link(p.url)}`.replace(
          /\s+/g,
          " ",
        ),
      );
    }
    const m = more("payments");
    if (m) lines.push(m);
  }
  if (u.errors.length) {
    lines.push("", "Nie udało się odczytać:", ...u.errors.map((e) => `  • ${e}`));
  }
  return lines.join("\n");
}
