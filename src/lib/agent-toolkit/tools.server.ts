// Nowe narzędzia agentów rozmów (ElevenLabs webhook → /api/public/agent-tools).
// Każde wywołanie przechodzi przez: politykę powierzchni → limit → handler →
// redakcję danych → dziennik (ai_growth_action_log, module "agent_tools").
import {
  decideToolCall,
  rateLimitExceeded,
  redactForAgent,
  argsForAudit,
  type ToolSurface,
} from "./policy";
import { estimateBorrowerCost, liveFacts, type FactsAudience } from "./live-facts";
import { detectSignals } from "./needs-discovery";
import { requestCapability } from "./capabilities.server";
import { agentDb, countAgentActions, hoursAgoIso, logAgentAction } from "./store.server";

export const NEW_AGENT_TOOLS = new Set([
  "get_offer_facts",
  "estimate_cost",
  "search_knowledge",
  "get_case_snapshot",
  "get_market_snapshot",
  "flag_urgent",
  "log_insight",
  "request_capability",
]);

export interface ToolCallContext {
  tool: string;
  surface: ToolSurface;
  leadId: string | null;
  args: Record<string, any>;
  channel?: string | null;
}

export type ToolResult = { ok: boolean; result?: unknown; error?: string };

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[\s\u00a0zł]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Ustal powierzchnię po identyfikatorze agenta (zmienna systemowa rozmowy). */
export async function surfaceForAgentId(agentId: string | null | undefined): Promise<ToolSurface> {
  if (!agentId) return "unknown";
  try {
    const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
    for (const s of ["intake", "investor_info", "investor_panel"] as const) {
      if ((await getAgentIdForSurface(s)) === agentId) return s;
    }
    const { data } = await (agentDb() as any)
      .from("voicebot_settings")
      .select("agent_id, document_reminder_agent_id")
      .eq("id", 1)
      .maybeSingle();
    if (data?.agent_id === agentId || data?.document_reminder_agent_id === agentId) return "phone";
  } catch (e) {
    console.error("[agent-tools] surfaceForAgentId", e);
  }
  return "unknown";
}

/** Bramka: polityka + limit. Zwraca błąd do oddania agentowi albo null. */
export async function gateToolCall(ctx: ToolCallContext): Promise<string | null> {
  const decision = decideToolCall(ctx.tool, ctx.surface);
  if (!decision.allowed) return decision.reason;
  const rateKey = ctx.leadId ?? `anon:${ctx.surface}`;
  const calls = await countAgentActions({
    module: "agent_tools",
    action: ctx.tool,
    sinceIso: hoursAgoIso(1),
    payloadEq: { rate_key: rateKey },
  });
  if (rateLimitExceeded(ctx.tool, calls)) {
    return `Limit wywołań narzędzia ${ctx.tool} na godzinę został osiągnięty — kontynuuj rozmowę bez niego.`;
  }
  return null;
}

export async function auditToolCall(
  ctx: ToolCallContext,
  res: ToolResult,
  ms: number,
): Promise<void> {
  await logAgentAction({
    module: "agent_tools",
    action: ctx.tool,
    status: res.ok ? "ok" : "error",
    summary: res.ok ? `${ctx.tool} (${ctx.surface})` : `${ctx.tool}: ${res.error ?? "błąd"}`,
    payload: {
      rate_key: ctx.leadId ?? `anon:${ctx.surface}`,
      lead_id: ctx.leadId,
      surface: ctx.surface,
      channel: ctx.channel ?? null,
      args: argsForAudit(ctx.args),
      ms,
    },
  });
}

// ── handlery ───────────────────────────────────────────────────────────────

async function getOfferFacts(ctx: ToolCallContext): Promise<ToolResult> {
  const f = liveFacts();
  const audience: FactsAudience =
    ctx.surface === "investor_info" || ctx.surface === "investor_panel" ? "inwestor" : "klient";
  return {
    ok: true,
    result:
      audience === "inwestor"
        ? { asOf: f.asOf, investor: f.investor, company: f.company }
        : { asOf: f.asOf, borrower: f.borrower, company: f.company },
  };
}

async function estimateCost(ctx: ToolCallContext): Promise<ToolResult> {
  const a = ctx.args ?? {};
  const est = estimateBorrowerCost({
    amount: num(a.amount ?? a.kwota) ?? NaN,
    months: num(a.months ?? a.okres_miesiecy),
    propertyValue: num(a.property_value ?? a.wartosc_nieruchomosci),
    existingDebt: num(a.existing_debt ?? a.obciazenia),
  });
  if (!est.ok) return { ok: false, error: est.error };
  return { ok: true, result: est };
}

async function searchKnowledge(ctx: ToolCallContext): Promise<ToolResult> {
  const query = String(ctx.args?.query ?? ctx.args?.pytanie ?? "")
    .trim()
    .slice(0, 300);
  if (query.length < 3) return { ok: false, error: "Podaj pytanie (query) — co najmniej 3 znaki." };
  const audience =
    ctx.surface === "investor_info" || ctx.surface === "investor_panel" ? "inwestor" : "klient";
  const out: Array<{ source: string; title: string; text: string; url?: string }> = [];
  try {
    const { retrieveKnowledge } = await import("@/lib/text-agent-knowledge.server");
    for (const k of await retrieveKnowledge(query, 3, audience)) {
      out.push({ source: "wiedza_botow", title: k.title, text: String(k.content).slice(0, 700) });
    }
  } catch (e) {
    console.error("[agent-tools] rag", e);
  }
  // Uzupełnienie bez embeddingów: proste dopasowanie słów (gdy RAG pusty albo niedostępny).
  if (out.length < 2) {
    const words = query
      .toLowerCase()
      .split(/[^\p{L}\d]+/u)
      .filter((w) => w.length >= 5)
      .slice(0, 3);
    if (words.length) {
      const or = words.map((w) => `title.ilike.%${w.replace(/[%,()]/g, "")}%`).join(",");
      const { data } = await (agentDb() as any)
        .from("ai_seo_articles")
        .select("title, excerpt, slug")
        .eq("status", "published")
        .or(or)
        .limit(3);
      for (const r of data ?? []) {
        out.push({
          source: "blog",
          title: r.title,
          text: String(r.excerpt ?? "").slice(0, 400),
          url: `https://financeyou.pl/blog/${r.slug}`,
        });
      }
    }
  }
  if (out.length === 0) {
    // Luka w wiedzy — zapisujemy, żeby agent wzrostu i zespół mogli ją domknąć.
    await logAgentAction({
      module: "agent_insights",
      action: "pytanie_bez_odpowiedzi",
      summary: query,
      payload: {
        text: query,
        surface: ctx.surface,
        channel: ctx.channel ?? null,
        source: "search_knowledge",
      },
    });
  }
  return { ok: true, result: { query, found: out.length, items: out } };
}

async function getCaseSnapshot(ctx: ToolCallContext): Promise<ToolResult> {
  if (!ctx.leadId) {
    return {
      ok: true,
      result: { known_contact: false, note: "Rozmówca nie jest jeszcze w systemie." },
    };
  }
  const s = agentDb() as any;
  const { data: lead } = await s
    .from("leads")
    .select(
      "id, status, type, first_name, email, phone_normalized, application_data, loan_application_id, return_link, created_at",
    )
    .eq("id", ctx.leadId)
    .maybeSingle();
  if (!lead) return { ok: true, result: { known_contact: false } };
  const ad = (lead.application_data ?? {}) as Record<string, any>;
  const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
  // Stan zamiast wartości — numer dzwoniącego można podrobić.
  const collected = {
    kwota_pozyczki: has(ad.loan_amount ?? ad.kwota_pozyczki),
    rodzaj_nieruchomosci: has(ad.typ_nieruchomosci),
    numer_kw: has(ad.numer_kw) || (Array.isArray(ad.kw_numbers) && ad.kw_numbers.length > 0),
    zdjecia_lub_dokumenty: has(ad.zdjecia_nieruchomosci) || has(ad.dokumenty_nieruchomosci),
    telefon: has(lead.phone_normalized),
    email: has(lead.email),
    imie: has(lead.first_name),
    cel_pozyczki: has(ad.purpose ?? ad.cel),
  };
  const missing = Object.entries(collected)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  let application: Record<string, unknown> | null = null;
  if (lead.loan_application_id) {
    const { data: app } = await s
      .from("loan_applications")
      .select("status, completeness_percent, investor_interest_count, created_at")
      .eq("id", lead.loan_application_id)
      .maybeSingle();
    if (app) {
      const { clientLoanStatusView } = await import("@/lib/loan-status");
      const view = clientLoanStatusView(app.status);
      const { count: offers } = await s
        .from("investor_offers")
        .select("id", { count: "exact", head: true })
        .eq("loan_application_id", lead.loan_application_id);
      application = {
        status_label: view.label,
        status_description: view.description,
        completeness_percent: app.completeness_percent ?? null,
        investors_interested: app.investor_interest_count ?? 0,
        offers_received: offers ?? 0,
        submitted_days_ago: Math.floor(
          (Date.now() - new Date(app.created_at).getTime()) / 86_400_000,
        ),
      };
    }
  }
  return {
    ok: true,
    result: redactForAgent({
      known_contact: true,
      first_name: lead.first_name ?? null,
      collected,
      missing,
      has_application: Boolean(application),
      application,
      urgent_flag: Boolean(ad.pilne),
      application_link_sent: Boolean(lead.return_link),
    }),
  };
}

async function getMarketSnapshot(): Promise<ToolResult> {
  const { data, error } = await (agentDb() as any)
    .from("investment_projects")
    .select(
      "status, amount, ltv_percent, property_type, voivodeship, period_months, interest_rate_percent, security_type",
    )
    .limit(500);
  if (error) return { ok: false, error: "Dane projektów chwilowo niedostępne." };
  const rows = (data ?? []) as Array<Record<string, any>>;
  const active = rows.filter(
    (r) =>
      !["withdrawn", "wycofany", "archived", "zarchiwizowany", "rejected", "closed"].includes(
        String(r.status),
      ),
  );
  if (active.length === 0) {
    return {
      ok: true,
      result: {
        active_projects: 0,
        note: "W tej chwili nie ma opublikowanych projektów. Nowe pojawiają się na bieżąco i trafiają do inwestorów ze złożonym Zleceniem — nie podawaj żadnych liczb projektów ani kwot.",
      },
    };
  }
  const nums = (k: string) =>
    active
      .map((r) => Number(r[k]))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
  const amounts = nums("amount");
  const ltv = nums("ltv_percent");
  const median = (a: number[]) => (a.length ? a[Math.floor(a.length / 2)] : null);
  const countBy = (k: string) =>
    active.reduce<Record<string, number>>((acc, r) => {
      const v = String(r[k] ?? "inne");
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
  return {
    ok: true,
    result: {
      active_projects: active.length,
      amount_min: amounts[0] ?? null,
      amount_median: median(amounts),
      amount_max: amounts[amounts.length - 1] ?? null,
      ltv_median_pct: median(ltv),
      property_types: countBy("property_type"),
      voivodeships: countBy("voivodeship"),
      note: "Dane zagregowane, bez identyfikacji klientów. Szczegóły projektów są w panelu inwestora po złożeniu Zlecenia.",
    },
  };
}

async function flagUrgent(ctx: ToolCallContext): Promise<ToolResult> {
  if (!ctx.leadId)
    return {
      ok: false,
      error: "Brak rozmówcy w systemie — najpierw zapisz kontakt (update_lead_data).",
    };
  const reason = String(ctx.args?.reason ?? ctx.args?.powod ?? "").slice(0, 300) || "pilna sprawa";
  const deadline = num(ctx.args?.deadline_days ?? ctx.args?.dni_do_terminu);
  const res = await flagLeadUrgent(ctx.leadId, {
    reason,
    deadlineDays: deadline,
    channel: ctx.channel ?? ctx.surface,
    source: "agent",
  });
  return {
    ok: true,
    result: {
      flagged: true,
      team_notified: res.notified,
      note: "Sprawa oznaczona jako pilna. Nie obiecuj rozmówcy kontaktu ani terminu.",
    },
  };
}

/** Wspólne oznaczanie pilnej sprawy — dla narzędzia agenta i automatu w runAgentTurn. */
export async function flagLeadUrgent(
  leadId: string,
  opts: {
    reason: string;
    deadlineDays?: number | null;
    channel?: string | null;
    source: "agent" | "auto";
  },
): Promise<{ notified: boolean; alreadyFlagged: boolean }> {
  const s = agentDb() as any;
  const { data: lead } = await s
    .from("leads")
    .select("application_data, first_name, last_name")
    .eq("id", leadId)
    .maybeSingle();
  const ad = (lead?.application_data ?? {}) as Record<string, any>;
  const prev = ad.pilne as { flagged_at?: string } | undefined;
  const alreadyFlagged = Boolean(
    prev?.flagged_at && Date.now() - new Date(prev.flagged_at).getTime() < 24 * 3600_000,
  );
  const pilne = {
    reason: opts.reason,
    deadline_days: opts.deadlineDays ?? null,
    channel: opts.channel ?? null,
    source: opts.source,
    flagged_at: alreadyFlagged ? prev?.flagged_at : new Date().toISOString(),
  };
  await s
    .from("leads")
    .update({ application_data: { ...ad, pilne } })
    .eq("id", leadId);
  let notified = false;
  if (!alreadyFlagged) {
    try {
      const { sendOperatorPush } = await import("@/lib/operator-push.server");
      const who = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Nowy rozmówca";
      const push = await sendOperatorPush({
        event: "lead:urgent",
        title: `PILNE: ${who}`,
        body: `${opts.reason}${opts.deadlineDays ? ` (termin za ${opts.deadlineDays} dni)` : ""}`.slice(
          0,
          180,
        ),
        url: `/operator/leady/${leadId}`,
        tag: `urgent-${leadId}`,
        urgency: "high",
      });
      notified = push.sent > 0;
    } catch (e) {
      console.error("[agent-tools] push pilne", e);
    }
    await logAgentAction({
      module: "agent_insights",
      action: "pilna_sprawa",
      summary: opts.reason,
      payload: {
        lead_id: leadId,
        deadline_days: opts.deadlineDays ?? null,
        source: opts.source,
        team_notified: notified,
      },
    });
  }
  return { notified, alreadyFlagged };
}

const INSIGHT_KINDS = new Set([
  "pytanie_bez_odpowiedzi",
  "obiekcja",
  "pomysl_na_tresc",
  "blad_procesu",
  "opinia_klienta",
  "konkurencja",
]);

async function logInsight(ctx: ToolCallContext): Promise<ToolResult> {
  const kind = String(ctx.args?.kind ?? ctx.args?.rodzaj ?? "opinia_klienta");
  const text = String(ctx.args?.text ?? ctx.args?.tresc ?? "")
    .trim()
    .slice(0, 1000);
  if (text.length < 5) return { ok: false, error: "Opisz obserwację (text)." };
  const action = INSIGHT_KINDS.has(kind) ? kind : "opinia_klienta";
  // Treść od rozmówcy może zawierać dane osobowe — maskujemy telefony/e-maile.
  const safe = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/(?:\+?48)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}/g, "[telefon]");
  await logAgentAction({
    module: "agent_insights",
    action,
    summary: safe.slice(0, 300),
    payload: { text: safe, surface: ctx.surface, channel: ctx.channel ?? null },
  });
  return { ok: true, result: { saved: true } };
}

async function requestCapabilityTool(ctx: ToolCallContext): Promise<ToolResult> {
  const description = String(ctx.args?.description ?? ctx.args?.opis ?? "").trim();
  if (description.length < 5)
    return { ok: false, error: "Opisz, jakiej możliwości potrzebujesz (description)." };
  const verdict = await requestCapability(
    {
      key: ctx.args?.key ?? null,
      description: description.slice(0, 500),
      why: String(ctx.args?.why ?? ctx.args?.po_co ?? "").slice(0, 500) || null,
      url: typeof ctx.args?.url === "string" ? ctx.args.url : null,
    },
    { requester: `agent:${ctx.surface}` },
  );
  return { ok: true, result: { decision: verdict.decision, reason: verdict.reason } };
}

const HANDLERS: Record<string, (ctx: ToolCallContext) => Promise<ToolResult>> = {
  get_offer_facts: getOfferFacts,
  estimate_cost: estimateCost,
  search_knowledge: searchKnowledge,
  get_case_snapshot: getCaseSnapshot,
  get_market_snapshot: () => getMarketSnapshot(),
  flag_urgent: flagUrgent,
  log_insight: logInsight,
  request_capability: requestCapabilityTool,
};

/** Wykonanie nowego narzędzia z pełną ścieżką bezpieczeństwa. */
export async function runNewAgentTool(ctx: ToolCallContext): Promise<ToolResult> {
  const started = Date.now();
  const denied = await gateToolCall(ctx);
  if (denied) {
    const res = { ok: false, error: denied };
    await auditToolCall(ctx, res, Date.now() - started);
    return res;
  }
  const handler = HANDLERS[ctx.tool];
  let res: ToolResult;
  try {
    res = handler ? await handler(ctx) : { ok: false, error: `nieznane narzędzie: ${ctx.tool}` };
  } catch (e: any) {
    console.error("[agent-tools] handler", ctx.tool, e);
    res = { ok: false, error: "Narzędzie chwilowo niedostępne — kontynuuj rozmowę bez niego." };
  }
  await auditToolCall(ctx, res, Date.now() - started);
  return res;
}

/** Sygnały z wiadomości dla narzędzi (np. czy auto-eskalować). */
export { detectSignals };
