// Eksport pełnej historii komunikacji (voicebot, SMS, e-mail, Messenger) w jednej
// paczce ZIP, zestawionej z wnioskami klientów — także uzupełnionymi częściowo.
// Czyta service_role'em, bo wpisy w lead_communications często nie mają lead_id
// i trzeba je dopasowywać po telefonie/e-mailu w całej bazie.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zipSync, strToU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff } from "@/lib/affiliate/db";
import { loanStatusLabels, contactChannelLabels, contactDirectionLabels } from "@/lib/labels";

const db = supabaseAdmin as unknown as SupabaseClient;

const MAX_ZIP_BYTES = 60 * 1024 * 1024; // 60 MB — limit jak w eksporcie KSeF
const PAGE = 1000;
const MAX_PAGES = 100; // 100k wierszy na tabelę — bezpiecznik pamięci Workera

const commChannelLabels: Record<string, string> = {
  voicebot_call: "Voicebot",
  call: "Telefon (ręczny)",
  telefon: "Telefon (ręczny)",
  sms: "SMS",
  email: "E-mail",
  messenger: "Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  chat: "Czat na stronie",
  chat_inwestor: "Czat inwestora",
  manual_note: "Notatka",
  reveal: "Odsłonięcie danych",
};
const commDirectionLabels: Record<string, string> = {
  inbound: "Przychodzący",
  outbound: "Wychodzący",
};

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (headers: string[], rows: unknown[][]) =>
  "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.map(cell).join(";"))].join("\r\n");

/** Czas lokalny PL w formacie YYYY-MM-DD HH:mm:ss (czytelny w Excelu). */
const fmtPl = (v: string | null | undefined) => {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString("sv-SE", { timeZone: "Europe/Warsaw" });
  } catch {
    return String(v).slice(0, 19).replace("T", " ");
  }
};

const safeName = (s: string) => (s || "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);

/** Transkrypcja voicebota bywa tablicą tur, obiektem {text} albo stringiem. */
function transcriptToText(t: unknown): string {
  if (!t) return "";
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t
      .map((turn: any) =>
        `${turn?.role ?? turn?.speaker ?? "?"}: ${turn?.message ?? turn?.text ?? ""}`.trim(),
      )
      .filter((l) => l && l !== "?:")
      .join("\n");
  }
  if (typeof t === "object" && typeof (t as any).text === "string") return (t as any).text;
  try {
    return JSON.stringify(t);
  } catch {
    return "";
  }
}

async function fetchAll(
  table: string,
  select: string,
  opts: { dateCol?: string; from?: string; to?: string } = {},
): Promise<any[]> {
  const dateCol = opts.dateCol ?? "created_at";
  const rows: any[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    let q = db
      .from(table)
      .select(select)
      .order(dateCol, { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1);
    if (opts.from) q = q.gte(dateCol, opts.from);
    if (opts.to) q = q.lte(dateCol, `${opts.to}T23:59:59.999Z`);
    const { data, error } = await q;
    if (error) throw new Error(`Błąd odczytu ${table}: ${error.message}`);
    rows.push(...((data ?? []) as any[]));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

const exportInput = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Podgląd liczebności przed eksportem (nagłówki count, bez pobierania danych). */
export const getCommsExportStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(db, context.userId);
    const count = async (table: string, apply?: (q: any) => any) => {
      let q = db.from(table).select("id", { count: "exact", head: true });
      if (apply) q = apply(q);
      const { count: c } = await q;
      return c ?? 0;
    };
    const [voice, sms, email, messenger, other, legacy, applications, leads] = await Promise.all([
      count("lead_communications", (q) => q.eq("channel", "voicebot_call")),
      count("lead_communications", (q) => q.eq("channel", "sms")),
      count("lead_communications", (q) => q.eq("channel", "email")),
      count("lead_communications", (q) => q.in("channel", ["messenger", "instagram"])),
      count("lead_communications", (q) =>
        q.not("channel", "in", "(voicebot_call,sms,email,messenger,instagram)"),
      ),
      count("contact_events"),
      count("loan_applications"),
      count("leads"),
    ]);
    return { voice, sms, email, messenger, other, legacy, applications, leads };
  });

export const exportCommsHistoryZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => exportInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(db, context.userId);

    // --- 1. Dane źródłowe -------------------------------------------------
    const comms = await fetchAll(
      "lead_communications",
      "id, lead_id, phone_normalized, email, channel, direction, status, subject, content, transcript, duration_seconds, recording_url, external_id, metadata, created_at",
      { from: data.from, to: data.to },
    );
    const leads = await fetchAll(
      "leads",
      "id, type, status, source, first_name, last_name, email, phone_raw, phone_normalized, client_id, loan_application_id, current_form_step, created_at, updated_at",
    );
    const apps = await fetchAll(
      "loan_applications",
      "id, client_id, status, completeness_percent, current_form_step, loan_amount, missing_fields, contact_attempts_phone, contact_attempts_sms, contact_attempts_email, last_contact_at, created_at, updated_at",
    );
    const clients = await fetchAll(
      "clients",
      "id, first_name, last_name, email, phone, phone_normalized",
    );
    const legacyEvents = await fetchAll(
      "contact_events",
      "id, client_id, loan_application_id, channel, direction, status, subject, content, completed_at, created_at",
      { from: data.from, to: data.to },
    );
    const callQueue = await fetchAll(
      "call_queue",
      "id, phone_normalized, client_id, loan_application_id, conversation_id, status, transcript, result_summary, started_at, finished_at, created_at",
      { from: data.from, to: data.to },
    );

    // --- 2. Indeksy do zestawiania komunikacji z wnioskami ----------------
    const clientsById = new Map<string, any>(clients.map((c) => [c.id, c]));
    const appsById = new Map<string, any>(apps.map((a) => [a.id, a]));
    // Najnowszy wniosek klienta (apps są posortowane rosnąco po created_at).
    const appsByClientId = new Map<string, any>();
    for (const a of apps) if (a.client_id) appsByClientId.set(a.client_id, a);

    const leadsById = new Map<string, any>(leads.map((l) => [l.id, l]));
    const leadsByPhone = new Map<string, any>();
    const leadsByEmail = new Map<string, any>();
    for (const l of leads) {
      if (l.phone_normalized) leadsByPhone.set(l.phone_normalized, l);
      if (l.email) leadsByEmail.set(String(l.email).toLowerCase(), l);
    }
    const clientsByPhone = new Map<string, any>();
    const clientsByEmail = new Map<string, any>();
    for (const c of clients) {
      if (c.phone_normalized) clientsByPhone.set(c.phone_normalized, c);
      if (c.email) clientsByEmail.set(String(c.email).toLowerCase(), c);
    }

    type Resolved = {
      lead: any | null;
      client: any | null;
      app: any | null;
      name: string;
    };
    const resolve = (row: {
      lead_id?: string | null;
      client_id?: string | null;
      loan_application_id?: string | null;
      phone_normalized?: string | null;
      email?: string | null;
    }): Resolved => {
      const lead =
        (row.lead_id && leadsById.get(row.lead_id)) ||
        (row.phone_normalized && leadsByPhone.get(row.phone_normalized)) ||
        (row.email && leadsByEmail.get(String(row.email).toLowerCase())) ||
        null;
      const client =
        (row.client_id && clientsById.get(row.client_id)) ||
        (lead?.client_id && clientsById.get(lead.client_id)) ||
        (row.phone_normalized && clientsByPhone.get(row.phone_normalized)) ||
        (row.email && clientsByEmail.get(String(row.email).toLowerCase())) ||
        null;
      const app =
        (row.loan_application_id && appsById.get(row.loan_application_id)) ||
        (lead?.loan_application_id && appsById.get(lead.loan_application_id)) ||
        (client?.id && appsByClientId.get(client.id)) ||
        null;
      const name =
        [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") ||
        [client?.first_name, client?.last_name].filter(Boolean).join(" ") ||
        "";
      return { lead, client, app, name };
    };

    const appCols = (r: Resolved) => [
      r.app?.id ?? "",
      r.app ? (loanStatusLabels[r.app.status] ?? r.app.status) : "",
      r.app?.completeness_percent != null ? `${r.app.completeness_percent}%` : "",
    ];

    // --- 3. Podział na kanały + pliki transkrypcji ------------------------
    const files: Record<string, Uint8Array> = {};
    let zipBytes = 0;
    let skippedTranscripts = 0;
    const addFile = (path: string, content: string): string => {
      const bytes = strToU8(content);
      if (zipBytes + bytes.byteLength > MAX_ZIP_BYTES) {
        skippedTranscripts += 1;
        return "";
      }
      zipBytes += bytes.byteLength;
      files[path] = bytes;
      return path;
    };

    const voiceRows: unknown[][] = [];
    const smsRows: unknown[][] = [];
    const emailRows: unknown[][] = [];
    const messengerRows: unknown[][] = [];
    const otherRows: unknown[][] = [];

    type PerLead = {
      voice: number;
      sms: number;
      email: number;
      messenger: number;
      other: number;
      first: string;
      last: string;
    };
    const perLead = new Map<string, PerLead>();
    let unassigned = 0;
    const bump = (r: Resolved, kind: keyof Omit<PerLead, "first" | "last">, at: string) => {
      if (!r.lead) {
        unassigned += 1;
        return;
      }
      const cur =
        perLead.get(r.lead.id) ??
        ({ voice: 0, sms: 0, email: 0, messenger: 0, other: 0, first: at, last: at } as PerLead);
      cur[kind] += 1;
      if (at < cur.first) cur.first = at;
      if (at > cur.last) cur.last = at;
      perLead.set(r.lead.id, cur);
    };

    const seenConversationIds = new Set<string>();

    for (const cRow of comms) {
      const r = resolve(cRow);
      const meta = (cRow.metadata ?? {}) as any;
      const when = fmtPl(cRow.created_at);
      const dir = commDirectionLabels[cRow.direction] ?? cRow.direction;
      switch (cRow.channel) {
        case "voicebot_call": {
          if (cRow.external_id) seenConversationIds.add(cRow.external_id);
          const text = transcriptToText(cRow.transcript ?? meta.transcript_full);
          let txtPath = "";
          if (text) {
            const base = safeName(
              `${String(cRow.created_at).slice(0, 10)}_${cRow.external_id || cRow.id}`,
            );
            const header = [
              `Rozmowa voicebota — ${when}`,
              `Telefon: ${cRow.phone_normalized ?? ""}`,
              `Klient: ${r.name || "nieprzypisany"}`,
              `Wniosek: ${r.app?.id ?? "brak"}`,
              "",
            ].join("\n");
            txtPath = addFile(`transkrypcje/${base}.txt`, header + text);
          }
          voiceRows.push([
            when,
            dir,
            cRow.phone_normalized ?? "",
            r.name,
            ...appCols(r),
            cRow.duration_seconds ?? "",
            meta.call_outcome_label ?? meta.call_outcome ?? cRow.status ?? "",
            meta.summary ?? cRow.content ?? "",
            txtPath,
            cRow.external_id ?? "",
          ]);
          bump(r, "voice", cRow.created_at);
          break;
        }
        case "sms": {
          smsRows.push([
            when,
            dir,
            cRow.phone_normalized ?? "",
            r.name,
            ...appCols(r),
            cRow.status ?? "",
            cRow.content ?? "",
          ]);
          bump(r, "sms", cRow.created_at);
          break;
        }
        case "email": {
          emailRows.push([
            when,
            dir,
            cRow.email ?? "",
            r.name,
            ...appCols(r),
            cRow.subject ?? "",
            cRow.status ?? "",
            cRow.content ?? "",
          ]);
          bump(r, "email", cRow.created_at);
          break;
        }
        case "messenger":
        case "instagram": {
          const platform =
            meta.kind === "fb_comment"
              ? "Komentarz FB"
              : meta.platform === "instagram" || cRow.channel === "instagram"
                ? "Instagram"
                : "Messenger";
          messengerRows.push([
            when,
            dir,
            platform,
            r.name || (cRow.phone_normalized ?? cRow.email ?? ""),
            ...appCols(r),
            cRow.content ?? "",
          ]);
          bump(r, "messenger", cRow.created_at);
          break;
        }
        default: {
          otherRows.push([
            when,
            commChannelLabels[cRow.channel] ?? cRow.channel,
            dir,
            cRow.phone_normalized ?? cRow.email ?? "",
            r.name,
            ...appCols(r),
            cRow.status ?? "",
            cRow.subject ?? "",
            cRow.content ?? "",
          ]);
          bump(r, "other", cRow.created_at);
        }
      }
    }

    // Rozmowy z kolejki połączeń, których nie ma w lead_communications
    // (np. jeszcze niewzbogacone webhookiem ElevenLabs).
    for (const q of callQueue) {
      if (q.conversation_id && seenConversationIds.has(q.conversation_id)) continue;
      if (!q.transcript && !q.result_summary) continue;
      const r = resolve(q);
      const at = q.started_at ?? q.finished_at ?? q.created_at;
      let txtPath = "";
      if (q.transcript) {
        const base = safeName(`${String(at).slice(0, 10)}_${q.conversation_id || q.id}`);
        txtPath = addFile(
          `transkrypcje/${base}.txt`,
          `Rozmowa voicebota (kolejka połączeń) — ${fmtPl(at)}\nTelefon: ${q.phone_normalized ?? ""}\nKlient: ${r.name || "nieprzypisany"}\n\n${q.transcript}`,
        );
      }
      voiceRows.push([
        fmtPl(at),
        commDirectionLabels.outbound,
        q.phone_normalized ?? "",
        r.name,
        ...appCols(r),
        "",
        q.status ?? "",
        q.result_summary ?? "",
        txtPath,
        q.conversation_id ?? "",
      ]);
      bump(r, "voice", at);
    }

    // --- 4. Wnioski (także częściowe) i zestawienie klientów --------------
    const appRows = apps.map((a) => {
      const c = clientsById.get(a.client_id);
      const missing = Array.isArray(a.missing_fields) ? a.missing_fields.join(", ") : "";
      return [
        a.id,
        [c?.first_name, c?.last_name].filter(Boolean).join(" "),
        c?.phone ?? "",
        c?.email ?? "",
        loanStatusLabels[a.status] ?? a.status,
        a.completeness_percent != null ? `${a.completeness_percent}%` : "",
        a.current_form_step ?? "",
        a.loan_amount ?? "",
        missing,
        a.contact_attempts_phone ?? 0,
        a.contact_attempts_sms ?? 0,
        a.contact_attempts_email ?? 0,
        fmtPl(a.last_contact_at),
        fmtPl(a.created_at),
        fmtPl(a.updated_at),
      ];
    });

    const summaryRows = leads.map((l) => {
      const stats = perLead.get(l.id);
      const app =
        (l.loan_application_id && appsById.get(l.loan_application_id)) ||
        (l.client_id && appsByClientId.get(l.client_id)) ||
        null;
      return [
        l.id,
        [l.first_name, l.last_name].filter(Boolean).join(" "),
        l.phone_raw ?? l.phone_normalized ?? "",
        l.email ?? "",
        l.type ?? "",
        l.status ?? "",
        l.source ?? "",
        l.current_form_step ?? "",
        app?.id ?? "",
        app ? (loanStatusLabels[app.status] ?? app.status) : "",
        app?.completeness_percent != null ? `${app.completeness_percent}%` : "",
        stats?.voice ?? 0,
        stats?.sms ?? 0,
        stats?.email ?? 0,
        stats?.messenger ?? 0,
        stats?.other ?? 0,
        stats ? fmtPl(stats.first) : "",
        stats ? fmtPl(stats.last) : "",
        fmtPl(l.created_at),
      ];
    });

    const legacyRows = legacyEvents.map((e) => {
      const r = resolve(e);
      return [
        fmtPl(e.completed_at ?? e.created_at),
        contactChannelLabels[e.channel] ?? e.channel,
        contactDirectionLabels[e.direction] ?? e.direction,
        r.name,
        ...appCols({
          ...r,
          app: e.loan_application_id ? (appsById.get(e.loan_application_id) ?? r.app) : r.app,
        }),
        e.status ?? "",
        e.subject ?? "",
        e.content ?? "",
      ];
    });

    // --- 5. Budowa paczki -------------------------------------------------
    const appColHeaders = ["ID wniosku", "Status wniosku", "Kompletność"];
    addFile(
      "00-zestawienie-klientow.csv",
      csv(
        [
          "ID leada",
          "Klient",
          "Telefon",
          "E-mail",
          "Typ",
          "Status leada",
          "Źródło",
          "Krok formularza",
          "ID wniosku",
          "Status wniosku",
          "Kompletność",
          "Rozmowy voicebot",
          "SMS",
          "E-maile",
          "Messenger",
          "Inne kontakty",
          "Pierwszy kontakt",
          "Ostatni kontakt",
          "Lead utworzony",
        ],
        summaryRows,
      ),
    );
    addFile(
      "01-wnioski.csv",
      csv(
        [
          "ID wniosku",
          "Klient",
          "Telefon",
          "E-mail",
          "Status",
          "Kompletność",
          "Krok formularza",
          "Kwota pożyczki",
          "Brakujące pola",
          "Próby tel.",
          "Próby SMS",
          "Próby e-mail",
          "Ostatni kontakt",
          "Utworzony",
          "Zaktualizowany",
        ],
        appRows,
      ),
    );
    addFile(
      "02-voicebot-rozmowy.csv",
      csv(
        [
          "Data",
          "Kierunek",
          "Telefon",
          "Klient",
          ...appColHeaders,
          "Czas trwania (s)",
          "Wynik",
          "Podsumowanie",
          "Plik transkrypcji",
          "ID rozmowy",
        ],
        voiceRows,
      ),
    );
    addFile(
      "03-sms.csv",
      csv(["Data", "Kierunek", "Telefon", "Klient", ...appColHeaders, "Status", "Treść"], smsRows),
    );
    addFile(
      "04-email.csv",
      csv(
        [
          "Data",
          "Kierunek",
          "Adres e-mail",
          "Klient",
          ...appColHeaders,
          "Temat",
          "Status",
          "Treść",
        ],
        emailRows,
      ),
    );
    addFile(
      "05-messenger.csv",
      csv(["Data", "Kierunek", "Platforma", "Klient", ...appColHeaders, "Treść"], messengerRows),
    );
    addFile(
      "06-pozostale-kanaly.csv",
      csv(
        [
          "Data",
          "Kanał",
          "Kierunek",
          "Kontakt",
          "Klient",
          ...appColHeaders,
          "Status",
          "Temat",
          "Treść",
        ],
        otherRows,
      ),
    );
    addFile(
      "07-kontakty-archiwalne.csv",
      csv(
        ["Data", "Kanał", "Kierunek", "Klient", ...appColHeaders, "Status", "Temat", "Treść"],
        legacyRows,
      ),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    const rangeInfo =
      data.from || data.to
        ? `Zakres dat komunikacji: ${data.from ?? "początek"} — ${data.to ?? "dziś"}.`
        : "Zakres dat: pełna historia.";
    addFile(
      "README.txt",
      [
        `Paczka historii komunikacji finyou — wygenerowano ${fmtPl(new Date().toISOString())}.`,
        rangeInfo,
        "",
        "Zawartość:",
        "  00-zestawienie-klientow.csv  — każdy lead z przypisanym wnioskiem (także częściowym) i licznikami kontaktów per kanał",
        "  01-wnioski.csv               — wszystkie wnioski klientów, również uzupełnione częściowo (kolumna Kompletność)",
        `  02-voicebot-rozmowy.csv      — rozmowy telefoniczne voice agenta (${voiceRows.length}); pełne transkrypcje w katalogu transkrypcje/`,
        `  03-sms.csv                   — wysłane i odebrane SMS-y (${smsRows.length})`,
        `  04-email.csv                 — maile przychodzące i wychodzące (${emailRows.length})`,
        `  05-messenger.csv             — rozmowy z Messengera i Instagram Direct (${messengerRows.length})`,
        `  06-pozostale-kanaly.csv      — czat na stronie, WhatsApp, telefony ręczne, notatki (${otherRows.length})`,
        `  07-kontakty-archiwalne.csv   — starszy rejestr kontaktów zespołu (contact_events, ${legacyRows.length})`,
        "",
        "Uwagi:",
        "  - CSV rozdzielane średnikiem, kodowanie UTF-8 z BOM (otwierają się poprawnie w Excelu).",
        "  - Daty w czasie polskim (Europe/Warsaw).",
        `  - Wpisy bez dopasowanego leada/klienta: ${unassigned} (mają puste kolumny Klient/Wniosek).`,
        "  - Nagrania audio nie są dołączane — są dostępne pojedynczo w panelu /admin/voicebot.",
        skippedTranscripts
          ? `  - Pominięto ${skippedTranscripts} plików transkrypcji z powodu limitu rozmiaru paczki (60 MB).`
          : "",
      ]
        .filter(Boolean)
        .join("\r\n"),
    );

    const zipped = zipSync(files, { level: 6 });
    // Base64 (Worker-safe, bez alokacji dużego stringa naraz).
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < zipped.length; i += chunk) {
      bin += String.fromCharCode(...zipped.subarray(i, Math.min(i + chunk, zipped.length)));
    }
    const base64 =
      typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return {
      filename: `historia-komunikacji-${stamp}.zip`,
      base64,
      byteSize: zipped.length,
      counts: {
        voice: voiceRows.length,
        sms: smsRows.length,
        email: emailRows.length,
        messenger: messengerRows.length,
        other: otherRows.length,
        legacy: legacyRows.length,
        applications: appRows.length,
        leads: summaryRows.length,
        unassigned,
        skippedTranscripts,
      },
    };
  });
