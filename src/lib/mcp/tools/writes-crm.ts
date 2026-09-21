// ZAPIS — CRM i wnioski: leady, klienci, wnioski, nieruchomości, follow-upy,
// kolejka telefonów, follow-up braków, pytania instytucji, kreator pożyczki.
// Wszystko dla zespołu (administrator / operator); klient MCP pyta o
// potwierdzenie przed każdym wywołaniem.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  insertOne,
  isoDate,
  ok,
  oneOf,
  patchOf,
  requireTeamAdmin,
  stamp,
  updateOne,
} from "../_helpers";

const LEAD_RETURN =
  "id, first_name, last_name, email, phone_raw, type, status, source, assigned_to, quality_tier, marked_bad_lead, marked_bad_reason, notes, updated_at";
const APP_RETURN =
  "id, client_id, status, loan_amount, preferred_period_months, max_monthly_payment, completeness_percent, assigned_operator, admin_decision, decision_reason, available_to_investors, visibility_level, automation_paused, reminder_paused, next_contact_at, risk_level, archived_at, updated_at";
const PROPERTY_TYPES = [
  "mieszkanie",
  "dom",
  "lokal_uslugowy",
  "dzialka_budowlana",
  "grunt_rolny",
  "udzial_w_nieruchomosci",
  "inna",
] as const;
const LOAN_STATUSES =
  "nowy_lead, w_trakcie_uzupelniania, braki_w_dokumentach, do_kontaktu, w_follow_upie, wniosek_kompletny, do_analizy, rokuje, nie_rokuje, wyslany_do_inwestorow, oferta_od_inwestora, oferta_przekazana_klientowi, zaakceptowany_przez_klienta, do_umowy i dalsze (patrz enum loan_status)";

function appendNote(existing: string | null | undefined, ctx: ToolContext, note: string) {
  const line = `${stamp(ctx)} ${note.trim()}`;
  return existing ? `${existing}\n${line}` : line;
}

export const updateLead = defineTool({
  name: "update_lead",
  title: "Update lead",
  description:
    "Edycja leada: dane kontaktowe, status (nowy, w_kontakcie, rozmowa, wniosek_wyslany, wniosek_zlozony, zakwalifikowany, odrzucony, zamkniety, bad_lead), typ, źródło, jakość, przypisanie do operatora, oznaczenie jako zły lead z powodem, dopisanie notatki. Zmienia tylko podane pola. Tylko administrator/operator.",
  inputSchema: {
    lead_id: z.string().uuid(),
    first_name: z.string().max(120).optional(),
    last_name: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone_raw: z.string().max(40).optional(),
    status: z.string().min(2).max(60).optional(),
    type: z.string().min(2).max(40).optional().describe("np. klient, inwestor, posrednik"),
    source: z.string().max(80).optional(),
    quality_tier: z.string().max(20).optional(),
    assigned_to: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe("Id operatora; null zdejmuje przypisanie."),
    marked_bad_lead: z.boolean().optional(),
    marked_bad_reason: z.string().max(500).optional(),
    notes_append: z
      .string()
      .max(4000)
      .optional()
      .describe("Notatka do dopisania (z datą i autorem)."),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, [
        "first_name",
        "last_name",
        "email",
        "phone_raw",
        "status",
        "type",
        "source",
        "quality_tier",
        "assigned_to",
        "marked_bad_lead",
        "marked_bad_reason",
      ]);
      if (a.marked_bad_lead !== undefined)
        patch.marked_by = a.marked_bad_lead ? actorId(ctx) : null;
      if (a.notes_append) {
        const cur = await oneOf(s.from("leads").select("notes").eq("id", a.lead_id), "leads");
        if (!cur) return fail("Nie znaleziono leada.");
        patch.notes = appendNote(cur.notes, ctx, a.notes_append);
      }
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(s, "leads", a.lead_id, patch, LEAD_RETURN);
      return ok({ ok: true, lead: row });
    }),
});

export const cancelFollowUps = defineTool({
  name: "cancel_follow_ups",
  title: "Cancel pending follow-ups",
  description:
    "Anuluje wszystkie oczekujące (pending) follow-upy zaplanowane dla leada — kolejne maile/SMS-y/telefony z kadencji nie wyjdą. Tylko administrator/operator.",
  inputSchema: { lead_id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ lead_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("lead_follow_up_schedule")
        .update({ status: "cancelled" })
        .eq("lead_id", lead_id)
        .eq("status", "pending")
        .select("id");
      if (error) throw new Error(`lead_follow_up_schedule: ${error.message}`);
      return ok({ ok: true, cancelled: (data ?? []).length });
    }),
});

export const queueCall = defineTool({
  name: "queue_call",
  title: "Queue voicebot call",
  description:
    "Dodaje połączenie do kolejki voicebota (Ania zadzwoni do klienta w oknie godzinowym). Podaj numer albo lead_id / loan_application_id — numer weźmie się z rekordu. To realny telefon do prawdziwej osoby. Tylko administrator/operator.",
  inputSchema: {
    phone: z.string().min(9).max(20).optional(),
    lead_id: z.string().uuid().optional(),
    loan_application_id: z.string().uuid().optional(),
    scheduled_at: z
      .string()
      .optional()
      .describe("Kiedy (ISO 8601); domyślnie od razu w najbliższym oknie."),
  },
  annotations: { ...WRITE, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { normalizePhoneForVoicebot } = await import("@/lib/voicebot.functions");
      let phone = a.phone ?? "";
      let clientId: string | null = null;
      let applicationId: string | null = a.loan_application_id ?? null;
      if (!phone && a.lead_id) {
        const lead = await oneOf(
          s
            .from("leads")
            .select("phone_normalized, phone_raw, client_id, loan_application_id")
            .eq("id", a.lead_id),
          "leads",
        );
        if (!lead) return fail("Nie znaleziono leada.");
        phone = lead.phone_normalized ?? lead.phone_raw ?? "";
        clientId = lead.client_id ?? null;
        applicationId = applicationId ?? lead.loan_application_id ?? null;
      }
      if (!phone && applicationId) {
        const app = await oneOf(
          s.from("loan_applications").select("client_id").eq("id", applicationId),
          "loan_applications",
        );
        if (!app) return fail("Nie znaleziono wniosku.");
        clientId = app.client_id;
        const client = await oneOf(
          s.from("clients").select("phone_normalized, phone").eq("id", app.client_id),
          "clients",
        );
        phone = client?.phone_normalized ?? client?.phone ?? "";
      }
      const normalized = normalizePhoneForVoicebot(phone);
      if (!normalized || normalized.replace(/\D/g, "").length < 9)
        return fail("Brak poprawnego numeru telefonu.");
      const row = await insertOne(
        s,
        "call_queue",
        {
          phone_normalized: normalized,
          status: "oczekuje",
          scheduled_at: isoDate(a.scheduled_at, "scheduled_at") ?? new Date().toISOString(),
          client_id: clientId,
          loan_application_id: applicationId,
          source: "mcp",
          attempts: 0,
        },
        "id, phone_normalized, status, scheduled_at",
      );
      return ok({ ok: true, call: row });
    }),
});

export const createClient = defineTool({
  name: "create_client",
  title: "Create client",
  description:
    "Zakłada klienta (pożyczkobiorcę) w CRM: imię, nazwisko, kontakt, firma, adres, notatka. Nie tworzy wniosku (do tego `create_loan_application`). Tylko administrator/operator.",
  inputSchema: {
    first_name: z.string().min(1).max(120),
    last_name: z.string().min(1).max(120),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
    company_name: z.string().max(200).optional(),
    nip: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    street: z.string().max(200).optional(),
    postal_code: z.string().max(12).optional(),
    notes: z.string().max(4000).optional(),
    source: z.string().max(80).default("mcp"),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await insertOne(
        s,
        "clients",
        {
          first_name: a.first_name.trim(),
          last_name: a.last_name.trim(),
          email: a.email?.trim().toLowerCase() ?? null,
          phone: a.phone ?? null,
          phone_raw: a.phone ?? null,
          company_name: a.company_name ?? null,
          nip: a.nip ?? null,
          city: a.city ?? null,
          street: a.street ?? null,
          postal_code: a.postal_code ?? null,
          notes: a.notes ? appendNote(null, ctx, a.notes) : null,
          source: a.source,
        },
        "id, first_name, last_name, email, phone, company_name, city, created_at",
      );
      return ok({ ok: true, client: { ...row, url: `/admin/klienci/${row.id}` } });
    }),
});

export const updateClient = defineTool({
  name: "update_client",
  title: "Update client",
  description:
    "Edycja klienta: dane kontaktowe i firmowe, adres, przypisany opiekun, blokady kontaktu (nie dzwonić / nie mailować / nie SMS-ować z powodem), dopisanie notatki. Zmienia tylko podane pola. Tylko administrator/operator.",
  inputSchema: {
    client_id: z.string().uuid(),
    first_name: z.string().max(120).optional(),
    last_name: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(40).optional(),
    company_name: z.string().max(200).optional(),
    nip: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    street: z.string().max(200).optional(),
    postal_code: z.string().max(12).optional(),
    assigned_user_id: z.string().uuid().nullable().optional(),
    do_not_call: z.boolean().optional(),
    do_not_call_reason: z.string().max(300).optional(),
    do_not_email: z.boolean().optional(),
    do_not_sms: z.boolean().optional(),
    notes_append: z.string().max(4000).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, [
        "first_name",
        "last_name",
        "email",
        "phone",
        "company_name",
        "nip",
        "city",
        "street",
        "postal_code",
        "assigned_user_id",
        "do_not_call",
        "do_not_call_reason",
        "do_not_email",
        "do_not_sms",
      ]);
      if (a.phone !== undefined) patch.phone_raw = a.phone;
      if (a.do_not_call !== undefined) {
        patch.do_not_call_at = a.do_not_call ? new Date().toISOString() : null;
        patch.do_not_call_source = a.do_not_call ? "mcp" : null;
      }
      if (a.notes_append) {
        const cur = await oneOf(s.from("clients").select("notes").eq("id", a.client_id), "clients");
        if (!cur) return fail("Nie znaleziono klienta.");
        patch.notes = appendNote(cur.notes, ctx, a.notes_append);
      }
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "clients",
        a.client_id,
        patch,
        "id, first_name, last_name, email, phone, company_name, city, assigned_user_id, do_not_call, do_not_email, do_not_sms, notes, updated_at",
      );
      return ok({ ok: true, client: row });
    }),
});

const propertyShape = {
  property_type: z.enum(PROPERTY_TYPES),
  city: z.string().max(120).optional(),
  street: z.string().max(200).optional(),
  address: z.string().max(300).optional(),
  voivodeship: z.string().max(60).optional(),
  land_register_number: z.string().max(30).optional().describe("Numer KW, np. WA1M/00123456/7."),
  estimated_value: z.number().positive().optional(),
  area_sqm: z.number().positive().optional(),
  has_mortgage: z.boolean().optional(),
  has_co_owners: z.boolean().optional(),
  description: z.string().max(4000).optional(),
};

async function insertProperty(
  s: Awaited<ReturnType<typeof requireTeamAdmin>>,
  loanApplicationId: string,
  p: Record<string, any>,
) {
  return insertOne(
    s,
    "properties",
    {
      loan_application_id: loanApplicationId,
      property_type: p.property_type,
      city: p.city ?? null,
      street: p.street ?? null,
      address: p.address ?? null,
      voivodeship: p.voivodeship ?? null,
      land_register_number: p.land_register_number?.trim().toUpperCase() ?? null,
      estimated_value: p.estimated_value ?? null,
      area_sqm: p.area_sqm ?? null,
      has_mortgage: p.has_mortgage ?? null,
      has_co_owners: p.has_co_owners ?? null,
      description: p.description ?? null,
    },
    "id, loan_application_id, property_type, city, land_register_number, estimated_value, area_sqm, created_at",
  );
}

export const createLoanApplication = defineTool({
  name: "create_loan_application",
  title: "Create loan application",
  description:
    "Zakłada wniosek pożyczkowy dla istniejącego klienta (status nowy_lead) — opcjonalnie z nieruchomością pod zabezpieczenie. Uruchamia standardową obsługę wniosku w panelu (przypomnienia, analizy) tak samo jak wniosek z formularza. Tylko administrator/operator.",
  inputSchema: {
    client_id: z.string().uuid(),
    loan_amount: z.number().positive(),
    preferred_period_months: z.number().int().min(1).max(360).optional(),
    max_monthly_payment: z.number().positive().optional(),
    situation_description: z.string().max(4000).optional(),
    investor_purpose: z
      .string()
      .max(2000)
      .optional()
      .describe("Cel finansowania (opis dla inwestorów)."),
    assigned_operator: z.string().uuid().optional(),
    source: z.string().max(80).default("mcp"),
    property: z.object(propertyShape).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const client = await oneOf(s.from("clients").select("id").eq("id", a.client_id), "clients");
      if (!client) return fail("Nie znaleziono klienta.");
      const app = await insertOne(
        s,
        "loan_applications",
        {
          client_id: a.client_id,
          status: "nowy_lead",
          loan_amount: a.loan_amount,
          preferred_period_months: a.preferred_period_months ?? null,
          max_monthly_payment: a.max_monthly_payment ?? null,
          situation_description: a.situation_description ?? null,
          investor_purpose: a.investor_purpose ?? null,
          assigned_operator: a.assigned_operator ?? null,
          kw_status: a.property?.land_register_number ? "znam" : "nie_znam",
          source: a.source,
        },
        APP_RETURN,
      );
      const property = a.property ? await insertProperty(s, app.id, a.property) : null;
      return ok({
        ok: true,
        application: { ...app, url: `/operator/wnioski/${app.id}` },
        property,
      });
    }),
});

export const updateApplication = defineTool({
  name: "update_application",
  title: "Update loan application",
  description: `Edycja wniosku: status (${LOAN_STATUSES}), operator, decyzja administratora z uzasadnieniem, notatki, widoczność dla inwestorów, poziom anonimizacji, pauza automatyzacji / przypomnień, następny kontakt, ryzyko, kwota i okres, opis dla inwestorów. Zmiana statusu zapisuje się w historii i może wywołać standardowy e-mail statusowy do klienta (tak jak w panelu). Tylko administrator/operator.`,
  inputSchema: {
    application_id: z.string().uuid(),
    status: z.string().min(2).max(60).optional(),
    assigned_operator: z.string().uuid().nullable().optional(),
    admin_decision: z.string().max(60).optional(),
    decision_reason: z.string().max(2000).optional(),
    broker_notes_append: z.string().max(4000).optional(),
    available_to_investors: z.boolean().optional(),
    visibility_level: z.enum(["zanonimizowane", "czesciowe", "pelne"]).optional(),
    automation_paused: z.boolean().optional(),
    reminder_paused: z.boolean().optional(),
    next_contact_at: z.string().nullable().optional().describe("ISO 8601 albo null."),
    risk_level: z.string().max(40).optional(),
    loan_amount: z.number().positive().optional(),
    preferred_period_months: z.number().int().min(1).max(360).optional(),
    max_monthly_payment: z.number().positive().nullable().optional(),
    investor_description: z.string().max(4000).optional(),
    investor_purpose: z.string().max(2000).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, [
        "status",
        "assigned_operator",
        "admin_decision",
        "decision_reason",
        "available_to_investors",
        "visibility_level",
        "automation_paused",
        "reminder_paused",
        "risk_level",
        "loan_amount",
        "preferred_period_months",
        "max_monthly_payment",
        "investor_description",
        "investor_purpose",
      ]);
      if (a.next_contact_at !== undefined) {
        patch.next_contact_at =
          a.next_contact_at === null ? null : isoDate(a.next_contact_at, "next_contact_at");
      }
      if (a.admin_decision !== undefined) {
        patch.decision_at = new Date().toISOString();
        patch.decision_by = actorId(ctx);
      }
      if (a.broker_notes_append) {
        const cur = await oneOf(
          s.from("loan_applications").select("broker_notes").eq("id", a.application_id),
          "loan_applications",
        );
        if (!cur) return fail("Nie znaleziono wniosku.");
        patch.broker_notes = appendNote(cur.broker_notes, ctx, a.broker_notes_append);
      }
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(s, "loan_applications", a.application_id, patch, APP_RETURN);
      return ok({ ok: true, application: { ...row, url: `/operator/wnioski/${row.id}` } });
    }),
});

export const archiveApplication = defineTool({
  name: "archive_application",
  title: "Archive / restore application",
  description:
    "Archiwizuje wniosek (znika z list roboczych, zostaje w bazie) albo przywraca go z archiwum (`restore=true`). Tylko administrator/operator.",
  inputSchema: {
    application_id: z.string().uuid(),
    restore: z.boolean().default(false),
  },
  annotations: DESTRUCTIVE,
  handler: ({ application_id, restore }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await updateOne(
        s,
        "loan_applications",
        application_id,
        { archived_at: restore ? null : new Date().toISOString() },
        "id, status, archived_at",
      );
      return ok({ ok: true, application: row });
    }),
});

export const addProperty = defineTool({
  name: "add_property",
  title: "Add property to application",
  description:
    "Dodaje nieruchomość (zabezpieczenie) do wniosku: typ, lokalizacja, numer KW, szacowana wartość, powierzchnia, hipoteka, współwłaściciele. Tylko administrator/operator.",
  inputSchema: { loan_application_id: z.string().uuid(), ...propertyShape },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const app = await oneOf(
        s.from("loan_applications").select("id").eq("id", a.loan_application_id),
        "loan_applications",
      );
      if (!app) return fail("Nie znaleziono wniosku.");
      const property = await insertProperty(s, a.loan_application_id, a);
      if (a.land_register_number) {
        await s
          .from("loan_applications")
          .update({ kw_status: "znam" })
          .eq("id", a.loan_application_id);
      }
      return ok({ ok: true, property });
    }),
});

export const setMissingInfoFollowUp = defineTool({
  name: "set_missing_info_follow_up",
  title: "Pause / resume / stop missing-info follow-up",
  description:
    "Steruje kadencją „follow-up braków” dla wniosku: wstrzymaj (`paused=true`), wznów (`paused=false`), zakończ (`status=stopped`) albo przywróć (`status=active`). Tylko administrator/operator.",
  inputSchema: {
    loan_application_id: z.string().uuid(),
    paused: z.boolean().optional(),
    status: z.enum(["active", "stopped"]).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ loan_application_id, paused, status }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch: Record<string, unknown> = {};
      if (paused !== undefined) patch.paused = paused;
      if (status !== undefined) patch.status = status;
      if (Object.keys(patch).length === 0) return fail("Podaj paused albo status.");
      const { data, error } = await s
        .from("missing_info_follow_ups")
        .update(patch)
        .eq("loan_application_id", loan_application_id)
        .select("id, loan_application_id, status, paused, attempt_count, next_send_at")
        .maybeSingle();
      if (error) throw new Error(`missing_info_follow_ups: ${error.message}`);
      if (!data) return fail("Ten wniosek nie jest w kadencji follow-up braków.");
      return ok({ ok: true, follow_up: data });
    }),
});

export const answerInstitutionQuestion = defineTool({
  name: "answer_institution_question",
  title: "Record client's answer to institution question",
  description:
    "Zapisuje odpowiedź klienta na pytania instytucji finansującej (np. uzyskaną telefonicznie). Agent korespondencji przekaże ją instytucjom w najbliższym cyklu, jeśli pytania były już wysłane do klienta. Tylko administrator/operator.",
  inputSchema: {
    thread_id: z.string().uuid(),
    client_answer: z.string().min(2).max(8000),
  },
  annotations: WRITE,
  handler: ({ thread_id, client_answer }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await updateOne(
        s,
        "institution_qa_threads",
        thread_id,
        {
          client_answer: `${stamp(ctx)} ${client_answer.trim()}`,
          client_channel: "mcp",
          last_client_message_at: new Date().toISOString(),
        },
        "id, loan_application_id, status, client_answer, forwarded_at",
      );
      return ok({
        ok: true,
        thread: row,
        note: "Przekazanie do instytucji wykonuje agent korespondencji w kolejnym cyklu (co 15 min).",
      });
    }),
});

const round2 = (v: number) => Math.round(v * 100) / 100;

export const createLoanProposal = defineTool({
  name: "create_loan_proposal",
  title: "Create loan proposal (kreator)",
  description:
    "Tworzy propozycję pożyczki z kreatora: liczy ratę nominalną (annuitet), ratę ograniczoną do maks. raty klienta (reszta kapitału jako balon na końcu), odsetki, prowizję i koszt całkowity, zapisuje harmonogram jako szkic. Tylko administrator/operator.",
  inputSchema: {
    amount: z.number().positive(),
    months: z.number().int().min(1).max(360),
    annual_rate: z.number().min(0).max(100).describe("Roczne oprocentowanie w %."),
    max_payment: z
      .number()
      .positive()
      .optional()
      .describe("Maksymalna rata, jaką klient może płacić."),
    commission_pct: z.number().min(0).max(30).default(0),
    client_name: z.string().max(200).optional(),
    client_email: z.string().email().optional(),
    client_phone: z.string().max(40).optional(),
    note: z.string().max(2000).optional(),
    source_application_id: z.string().uuid().optional(),
    is_public: z.boolean().default(false),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const r = a.annual_rate / 100 / 12;
      const nominal =
        r === 0 ? a.amount / a.months : (a.amount * r) / (1 - Math.pow(1 + r, -a.months));
      const capped = a.max_payment && a.max_payment < nominal ? a.max_payment : nominal;
      let balance = a.amount;
      let totalInterest = 0;
      const schedule: Array<{
        month: number;
        payment: number;
        interest: number;
        principal: number;
        balance: number;
      }> = [];
      for (let m = 1; m <= a.months; m += 1) {
        const interest = balance * r;
        const principal = capped - interest;
        balance = balance - principal;
        totalInterest += interest;
        schedule.push({
          month: m,
          payment: round2(capped),
          interest: round2(interest),
          principal: round2(principal),
          balance: round2(Math.max(0, balance)),
        });
      }
      const balloon = Math.max(0, round2(balance));
      if (balloon > 0) {
        const last = schedule[schedule.length - 1];
        last.payment = round2(last.payment + balloon);
        last.principal = round2(last.principal + balloon);
        last.balance = 0;
      }
      const commissionPln = round2((a.amount * a.commission_pct) / 100);
      const row = await insertOne(
        s,
        "loan_proposals",
        {
          amount: a.amount,
          months: a.months,
          annual_rate: a.annual_rate,
          max_payment: a.max_payment ?? round2(nominal),
          nominal_rata: round2(nominal),
          capped_rata: round2(capped),
          balloon,
          commission_pct: a.commission_pct,
          commission_pln: commissionPln,
          total_interest: round2(totalInterest),
          total_cost: round2(totalInterest + commissionPln),
          total_to_repay: round2(a.amount + totalInterest),
          schedule,
          client_name: a.client_name ?? null,
          client_email: a.client_email ?? null,
          client_phone: a.client_phone ?? null,
          note: a.note ?? null,
          source_application_id: a.source_application_id ?? null,
          is_public: a.is_public,
          status: "szkic",
          created_by: actorId(ctx),
        },
        "id, amount, months, annual_rate, nominal_rata, capped_rata, balloon, commission_pln, total_interest, total_cost, total_to_repay, status, created_at",
      );
      return ok({ ok: true, proposal: row });
    }),
});

export const writesCrmTools = [
  updateLead,
  cancelFollowUps,
  queueCall,
  createClient,
  updateClient,
  createLoanApplication,
  updateApplication,
  archiveApplication,
  addProperty,
  setMissingInfoFollowUp,
  answerInstitutionQuestion,
  createLoanProposal,
];
