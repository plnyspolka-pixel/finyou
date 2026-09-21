// ZAPIS — finanse, program pośredników, windykacja.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
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
  requireRolesAdmin,
  requireTeamAdmin,
  requireUser,
  updateOne,
} from "../_helpers";

const ADMIN_ONLY = ["administrator"] as const;

export const grantAccess = defineTool({
  name: "grant_access",
  title: "Grant / extend platform access",
  description:
    "Nadaje lub przedłuża dostęp do platformy bez płatności (np. gest handlowy, test): użytkownik, grupa (investor / client / partner), liczba dni od dziś lub od końca obecnego dostępu, albo konkretna data końca. Tylko administrator.",
  inputSchema: {
    user_id: z.string().uuid(),
    audience: z.string().min(2).max(40).describe("np. investor, client, partner — jak w cenniku."),
    days: z.number().int().min(1).max(730).optional(),
    active_until: z.string().optional().describe("Alternatywnie: konkretna data końca (ISO 8601)."),
  },
  annotations: WRITE,
  handler: ({ user_id, audience, days, active_until }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      if (!days && !active_until) return fail("Podaj days albo active_until.");
      const now = new Date();
      const existing = await oneOf(
        s
          .from("access_entitlements")
          .select("id, active_from, active_until")
          .eq("user_id", user_id)
          .eq("audience", audience),
        "access_entitlements",
      );
      let until: string;
      if (active_until) until = isoDate(active_until, "active_until")!;
      else {
        const base =
          existing?.active_until && new Date(existing.active_until) > now
            ? new Date(existing.active_until)
            : now;
        until = new Date(base.getTime() + (days ?? 0) * 86_400_000).toISOString();
      }
      const row = existing
        ? await updateOne(
            s,
            "access_entitlements",
            existing.id,
            {
              active_from: existing.active_from ?? now.toISOString(),
              active_until: until,
              updated_at: now.toISOString(),
            },
            "id, user_id, audience, active_from, active_until",
          )
        : await insertOne(
            s,
            "access_entitlements",
            { user_id, audience, active_from: now.toISOString(), active_until: until },
            "id, user_id, audience, active_from, active_until",
          );
      return ok({ ok: true, entitlement: row, granted_by: actorId(ctx) });
    }),
});

export const updateAccessProduct = defineTool({
  name: "update_access_product",
  title: "Update access product (price list)",
  description:
    "Zmienia pozycję cennika: etykieta, cena w groszach, długość dostępu w dniach, aktywność, kolejność. Tylko administrator.",
  inputSchema: {
    product_id: z.string().uuid(),
    label: z.string().min(1).max(120).optional(),
    amount_grosz: z.number().int().min(0).optional(),
    duration_days: z.number().int().min(1).max(3650).optional(),
    active: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const patch = patchOf(a, ["label", "amount_grosz", "duration_days", "active", "sort_order"]);
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "access_products",
        a.product_id,
        patch,
        "id, code, label, audience, amount_grosz, currency, duration_days, active, sort_order",
      );
      return ok({ ok: true, product: row });
    }),
});

export const markPaymentReviewed = defineTool({
  name: "mark_payment_reviewed",
  title: "Mark payment as reviewed",
  description:
    "Zdejmuje flagę „wymaga przeglądu” z płatności za dostęp (po ręcznej weryfikacji). Tylko administrator/operator.",
  inputSchema: { payment_id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ payment_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await updateOne(
        s,
        "access_payments",
        payment_id,
        { needs_review: false },
        "id, status, needs_review, buyer_email",
      );
      return ok({ ok: true, payment: row });
    }),
});

export const updateBrokerSettlement = defineTool({
  name: "update_broker_settlement",
  title: "Update broker settlement",
  description:
    "Aktualizuje rozliczenie pośrednika: status, data wypłaty, notatki, kwota. Tylko administrator/operator.",
  inputSchema: {
    settlement_id: z.string().uuid(),
    status: z.string().max(40).optional(),
    paid_at: z.string().nullable().optional(),
    notes: z.string().max(2000).optional(),
    amount: z.number().min(0).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, ["status", "notes", "amount"]);
      if (a.paid_at !== undefined)
        patch.paid_at = a.paid_at === null ? null : isoDate(a.paid_at, "paid_at");
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "broker_settlements",
        a.settlement_id,
        patch,
        "id, broker_user_id, client_name, amount, status, paid_at, notes",
      );
      return ok({ ok: true, settlement: row });
    }),
});

export const updateAffiliatePartnerStatus = defineTool({
  name: "update_affiliate_partner_status",
  title: "Update affiliate partner status",
  description:
    "Zmienia status partnera programu pośredników (np. pending_approval → active, active → suspended / blocked) z zapisem, kto zatwierdził. Tylko administrator.",
  inputSchema: {
    partner_id: z.string().uuid(),
    status: z.enum(["pending_approval", "active", "suspended", "blocked", "rejected"]),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ partner_id, status }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const patch: Record<string, unknown> = { status };
      if (status === "active") {
        patch.approved_at = new Date().toISOString();
        patch.approved_by = actorId(ctx);
      }
      const row = await updateOne(
        s,
        "affiliate_partners",
        partner_id,
        patch,
        "id, first_name, last_name, company_name, status, approved_at",
      );
      return ok({ ok: true, partner: row });
    }),
});

export const decideAffiliateCommission = defineTool({
  name: "decide_affiliate_commission",
  title: "Approve / cancel affiliate commission",
  description:
    "Zatwierdza (`approve`) albo anuluje (`cancel`, z powodem) prowizję partnera. Tylko administrator.",
  inputSchema: {
    commission_id: z.string().uuid(),
    decision: z.enum(["approve", "cancel"]),
    reason: z.string().max(500).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ commission_id, decision, reason }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const now = new Date().toISOString();
      const patch =
        decision === "approve"
          ? { status: "approved", approved_at: now, approved_by: actorId(ctx) }
          : {
              status: "cancelled",
              cancelled_at: now,
              cancellation_reason: reason ?? "Anulowano przez MCP",
            };
      const row = await updateOne(
        s,
        "affiliate_commissions",
        commission_id,
        patch,
        "id, partner_id, status, gross_amount, currency, approved_at, cancelled_at, cancellation_reason",
      );
      return ok({ ok: true, commission: row });
    }),
});

const WIND_EVENT_TYPES = [
  "sms",
  "email",
  "telefon",
  "pismo_nadane",
  "pismo_doreczone",
  "pismo_awizo",
  "pismo_zwrot",
  "wplata",
  "dokument_wygenerowany",
  "zmiana_etapu",
  "notatka",
  "czynnosc_sadowa",
] as const;

export const updateCollectionCase = defineTool({
  name: "update_collection_case",
  title: "Update collection case",
  description:
    "Aktualizuje sprawę windykacyjną: etap, priorytet (niski/sredni/wysoki/krytyczny), ścieżka (miekka/standardowa/twarda/karna), osoba prowadząca, wynik (splacona/ugoda/egzekucja_w_toku/umorzona/przekazana_karna), data zamknięcia. Zmiana etapu dopisuje zdarzenie w chronologii. Inwestor — swoje sprawy (RLS), zespół — wszystkie.",
  inputSchema: {
    case_id: z.string().uuid(),
    etap: z.string().max(80).optional(),
    priorytet: z.enum(["niski", "sredni", "wysoki", "krytyczny"]).optional(),
    sciezka: z.enum(["miekka", "standardowa", "twarda", "karna"]).optional(),
    osoba_prowadzaca: z.string().max(120).nullable().optional(),
    wynik: z
      .enum(["splacona", "ugoda", "egzekucja_w_toku", "umorzona", "przekazana_karna"])
      .nullable()
      .optional(),
    data_zamkniecia: z.string().nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const current = await oneOf(
        s.from("wind_collection_cases").select("id, etap, investor_user_id").eq("id", a.case_id),
        "wind_collection_cases",
      );
      if (!current) return fail("Nie znaleziono sprawy (albo brak uprawnień).");
      const patch = patchOf(a, ["etap", "priorytet", "sciezka", "osoba_prowadzaca", "wynik"]);
      if (a.data_zamkniecia !== undefined)
        patch.data_zamkniecia =
          a.data_zamkniecia === null ? null : isoDate(a.data_zamkniecia, "data_zamkniecia");
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "wind_collection_cases",
        a.case_id,
        patch,
        "id, etap, priorytet, sciezka, osoba_prowadzaca, wynik, data_zamkniecia, updated_at",
      );
      if (a.etap && a.etap !== current.etap) {
        await s.from("wind_events").insert({
          case_id: a.case_id,
          investor_user_id: current.investor_user_id,
          typ: "zmiana_etapu",
          kategoria: "manualne",
          tytul: `Zmiana etapu: ${current.etap} → ${a.etap}`,
          tresc: null,
          autor: ctx.getUserEmail() ?? "MCP",
          data_zdarzenia: new Date().toISOString(),
        });
      }
      return ok({ ok: true, case: row });
    }),
});

export const addCollectionEvent = defineTool({
  name: "add_collection_event",
  title: "Add collection case event",
  description:
    "Dopisuje zdarzenie do chronologii sprawy windykacyjnej (telefon, SMS, e-mail, pismo nadane/doręczone/awizo/zwrot, wpłata, notatka, czynność sądowa) z datą i treścią. Nie wysyła niczego — to zapis w aktach. Inwestor — swoje sprawy (RLS), zespół — wszystkie.",
  inputSchema: {
    case_id: z.string().uuid(),
    typ: z.enum(WIND_EVENT_TYPES),
    tytul: z.string().min(1).max(200),
    tresc: z.string().max(8000).optional(),
    data_zdarzenia: z.string().optional().describe("ISO 8601; domyślnie teraz."),
    zalacznik_url: z.string().url().optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const kase = await oneOf(
        s.from("wind_collection_cases").select("id, investor_user_id").eq("id", a.case_id),
        "wind_collection_cases",
      );
      if (!kase) return fail("Nie znaleziono sprawy (albo brak uprawnień).");
      const row = await insertOne(
        s,
        "wind_events",
        {
          case_id: a.case_id,
          investor_user_id: kase.investor_user_id,
          typ: a.typ,
          kategoria: "manualne",
          tytul: a.tytul,
          tresc: a.tresc ?? null,
          data_zdarzenia: isoDate(a.data_zdarzenia, "data_zdarzenia") ?? new Date().toISOString(),
          zalacznik_url: a.zalacznik_url ?? null,
          autor: ctx.getUserEmail() ?? "MCP",
        },
        "id, case_id, typ, kategoria, tytul, data_zdarzenia",
      );
      return ok({ ok: true, event: row });
    }),
});

export const updateWindLoan = defineTool({
  name: "update_wind_loan",
  title: "Update loan (collections module)",
  description:
    "Aktualizuje pożyczkę w module windykacji: status (aktywna, w_zwloce, wypowiedziana, windykacja_komornicza, splacona, windykacja_karna), saldo pozostałe, data ostatniej wpłaty, termin spłaty, data wypowiedzenia. Inwestor — swoje (RLS), zespół — wszystkie.",
  inputSchema: {
    loan_id: z.string().uuid(),
    status: z
      .enum([
        "aktywna",
        "w_zwloce",
        "wypowiedziana",
        "windykacja_komornicza",
        "splacona",
        "windykacja_karna",
      ])
      .optional(),
    saldo_pozostale: z.number().min(0).optional(),
    data_ostatniej_wplaty: z.string().nullable().optional(),
    termin_splaty: z.string().nullable().optional(),
    data_wypowiedzenia: z.string().nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const patch = patchOf(a, ["status", "saldo_pozostale"]);
      for (const k of ["data_ostatniej_wplaty", "termin_splaty", "data_wypowiedzenia"] as const) {
        if (a[k] !== undefined)
          patch[k] = a[k] === null ? null : (isoDate(a[k] as string, k) ?? null)?.slice(0, 10);
      }
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "wind_loans",
        a.loan_id,
        patch,
        "id, numer_umowy, status, saldo_pozostale, data_ostatniej_wplaty, termin_splaty, data_wypowiedzenia, updated_at",
      );
      return ok({ ok: true, loan: row });
    }),
});

export const writesFinanceTools = [
  grantAccess,
  updateAccessProduct,
  markPaymentReviewed,
  updateBrokerSettlement,
  updateAffiliatePartnerStatus,
  decideAffiliateCommission,
  updateCollectionCase,
  addCollectionEvent,
  updateWindLoan,
];
