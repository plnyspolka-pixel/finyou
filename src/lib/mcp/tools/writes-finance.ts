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
  rowsOf,
  updateOne,
} from "../_helpers";
import { defaultDelayRate } from "@/lib/windykacja-debt";
import { normalizeWindFeeTable } from "@/lib/windykacja-fees";
import { normalizeHarmonogram, parseDataISO, type WindRata } from "@/lib/windykacja-harmonogram";
import {
  formatRachunekSplaty,
  harmonogramFromInput,
  opisHarmonogramu,
  warsawToday,
} from "@/lib/windykacja-recalc";
import { recalcWindCaseDetailed } from "@/lib/windykacja-recalc.server";
import { maskWindAccounts, type WindRow } from "./collections-extra";

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

// ── Windykacja: wpłata i dane pożyczki — te same zasady co panel ─────
// (windykacja.functions.ts: addWindWplata, updateWindLoan). Pożyczka
// z harmonogramem rat: po zmianie zaległość, opóźnienie, saldo i status
// przeliczane z rat (recalcWindCaseDetailed); bez harmonogramu — model
// z jednym terminem spłaty, wpłata pomniejsza saldo i kwotę zaległą.

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const dataPL = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
const zl = (n: number) =>
  `${round2(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

/**
 * Dzień wpłaty (RRRR-MM-DD): data kalendarzowa tak, jak podana (bez
 * przesunięcia przez strefę czasową), brak = dziś w Polsce. Wpłata
 * z przyszłości jest błędem — w aktach zapisujemy wpłaty otrzymane.
 */
export function windPaymentDay(
  raw: string | null | undefined,
  today: string,
): { day: string } | { error: string } {
  if (raw == null || raw.trim() === "") return { day: today };
  const day = parseDataISO(raw);
  if (!day) return { error: `Nieprawidłowa data wpłaty: ${raw} (RRRR-MM-DD).` };
  if (day > today) return { error: `Data wpłaty ${dataPL(day)} jest z przyszłości.` };
  return { day };
}

export const addCollectionEvent = defineTool({
  name: "add_collection_event",
  title: "Add collection case event",
  description:
    "Dopisuje zdarzenie do chronologii sprawy windykacyjnej (telefon, SMS, e-mail, pismo nadane/doręczone/awizo/zwrot, wpłata, notatka, czynność sądowa) z datą i treścią. Nie wysyła niczego — to zapis w aktach. Wpłata (typ = wplata) wymaga kwoty i rozlicza się jak wpłata wpisana w panelu: pożyczka z harmonogramem rat — zaległość, opóźnienie i saldo przeliczane z rat (kolejność zaliczania z umowy); bez harmonogramu — wpłata pomniejsza saldo pożyczki i kwotę zaległą sprawy. Inwestor — swoje sprawy (RLS), zespół — wszystkie.",
  inputSchema: {
    case_id: z.string().uuid(),
    typ: z.enum(WIND_EVENT_TYPES),
    tytul: z.string().min(1).max(200),
    tresc: z.string().max(8000).optional(),
    data_zdarzenia: z
      .string()
      .optional()
      .describe(
        "ISO 8601; domyślnie teraz. Przy wpłacie: dzień wpłaty (RRRR-MM-DD), domyślnie dziś.",
      ),
    zalacznik_url: z.string().url().optional(),
    kwota: z
      .number()
      .positive()
      .max(1_000_000_000)
      .optional()
      .describe("Kwota wpłaty w zł — wymagana dla typ = wplata (i tylko wtedy dozwolona)."),
    sposob: z
      .string()
      .max(120)
      .optional()
      .describe("Sposób wpłaty, np. przelew, gotówka — tylko dla typ = wplata."),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const wplata = a.typ === "wplata";
      if (wplata && !(Number(a.kwota) > 0)) {
        return fail(
          "Podaj kwotę wpłaty (kwota > 0) — bez kwoty wpłata nie zmniejszy zadłużenia w rozliczeniu.",
        );
      }
      if (!wplata && (a.kwota !== undefined || a.sposob !== undefined)) {
        return fail("Pola kwota i sposob dotyczą tylko wpłaty (typ = wplata).");
      }
      const kase = await oneOf(
        s
          .from("wind_collection_cases")
          .select("id, investor_user_id, loan_id, kwota_zalegla")
          .eq("id", a.case_id),
        "wind_collection_cases",
      );
      if (!kase) return fail("Nie znaleziono sprawy (albo brak uprawnień).");

      if (!wplata) {
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
      }

      // ── Wpłata ──
      const day = windPaymentDay(a.data_zdarzenia, warsawToday());
      if ("error" in day) return fail(day.error);
      const kwota = round2(a.kwota as number);
      const loan = await oneOf(
        s
          .from("wind_loans")
          .select("id, saldo_pozostale, status, data_ostatniej_wplaty, harmonogram")
          .eq("id", kase.loan_id),
        "wind_loans",
      );
      if (!loan) return fail("Nie znaleziono pożyczki tej sprawy (albo brak uprawnień).");

      // Kwota w metadata.kwota — z niej liczy rozliczenie (windPaymentsAndFees).
      // Południe UTC: dzień wpłaty nie zależy od strefy czasowej (jak w panelu).
      const row = await insertOne(
        s,
        "wind_events",
        {
          case_id: a.case_id,
          investor_user_id: kase.investor_user_id,
          typ: "wplata",
          kategoria: "manualne",
          tytul: a.tytul,
          tresc: a.tresc ?? (a.sposob ? `Sposób: ${a.sposob}` : null),
          data_zdarzenia: `${day.day}T12:00:00.000Z`,
          zalacznik_url: a.zalacznik_url ?? null,
          metadata: { kwota, sposob: a.sposob ?? null, zrodlo: "mcp" },
          autor: ctx.getUserEmail() ?? "MCP",
        },
        "id, case_id, typ, kategoria, tytul, data_zdarzenia, metadata",
      );

      // Data ostatniej wpłaty — najpóźniejsza (wpłata wpisana wstecz jej nie cofa).
      const poprzednia = loan.data_ostatniej_wplaty
        ? String(loan.data_ostatniej_wplaty).slice(0, 10)
        : null;
      const ostatnia = poprzednia && poprzednia > day.day ? poprzednia : day.day;
      const ostrzezenia: string[] = [];

      if (normalizeHarmonogram(loan.harmonogram)) {
        const { error: dErr } = await s
          .from("wind_loans")
          .update({ data_ostatniej_wplaty: ostatnia })
          .eq("id", loan.id);
        if (dErr) ostrzezenia.push(`Data ostatniej wpłaty nie została zapisana: ${dErr.message}`);
        try {
          const r = await recalcWindCaseDetailed(s, a.case_id);
          return ok({
            ok: true,
            event: row,
            rozliczenie: r
              ? {
                  model: "harmonogram",
                  na_dzien: r.asOf,
                  kwota_zalegla: r.casePatch.kwota_zalegla,
                  opoznienie_dni: r.casePatch.opoznienie_dni,
                  saldo_pozostale: r.loanPatch.saldo_pozostale,
                  do_zaplaty_teraz: r.snapshot.doZaplatyTeraz,
                  nadplata: r.snapshot.raty?.nadplata ?? 0,
                }
              : null,
            ostrzezenia,
          });
        } catch (e) {
          // Wpłata jest już w aktach (karta sprawy liczy zaległość ze zdarzeń)
          // — nie zgłaszamy błędu, żeby nie została wpisana drugi raz.
          ostrzezenia.push(
            `Wpłata zapisana, ale nie udało się przeliczyć zaległości: ${(e as Error).message}`,
          );
          return ok({ ok: true, event: row, rozliczenie: null, ostrzezenia });
        }
      }

      // Model jednoterminowy: wpłata pomniejsza saldo pożyczki i kwotę zaległą.
      const saldo = round2(Math.max(0, Number(loan.saldo_pozostale ?? 0) - kwota));
      const zalegla = round2(Math.max(0, Number(kase.kwota_zalegla ?? 0) - kwota));
      const { error: lErr } = await s
        .from("wind_loans")
        .update({
          saldo_pozostale: saldo,
          data_ostatniej_wplaty: ostatnia,
          status: saldo <= 0 ? "splacona" : loan.status,
        })
        .eq("id", loan.id);
      if (lErr) ostrzezenia.push(`Saldo pożyczki nie zostało zaktualizowane: ${lErr.message}`);
      const { error: cErr } = await s
        .from("wind_collection_cases")
        .update({ kwota_zalegla: zalegla })
        .eq("id", a.case_id);
      if (cErr)
        ostrzezenia.push(`Kwota zaległa sprawy nie została zaktualizowana: ${cErr.message}`);
      return ok({
        ok: true,
        event: row,
        rozliczenie: { model: "termin", saldo_pozostale: saldo, kwota_zalegla: zalegla },
        ostrzezenia,
      });
    }),
});

const WIND_LOAN_STATUSES = [
  "aktywna",
  "w_zwloce",
  "wypowiedziana",
  "windykacja_komornicza",
  "splacona",
  "windykacja_karna",
] as const;

/** Kwota w złotych z liczby albo tekstu („7 868,48"). */
const kwotaRaty = z.union([z.number(), z.string().max(40)]);

const updateWindLoanShape = {
  loan_id: z.string().uuid(),
  status: z.enum(WIND_LOAN_STATUSES).optional(),
  saldo_pozostale: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Tylko pożyczka bez harmonogramu rat — z harmonogramem saldo liczone jest z rat i wpłat.",
    ),
  data_ostatniej_wplaty: z.string().nullable().optional().describe("RRRR-MM-DD."),
  termin_splaty: z
    .string()
    .nullable()
    .optional()
    .describe("RRRR-MM-DD; przy harmonogramie — termin ostatniej raty."),
  data_wypowiedzenia: z.string().nullable().optional().describe("RRRR-MM-DD."),
  numer_umowy: z.string().max(100).nullable().optional(),
  data_umowy: z.string().nullable().optional().describe("RRRR-MM-DD."),
  kwota_pozyczki: z.number().min(0).optional().describe("Kwota wypłacona na rękę (zł)."),
  kwota_calkowita: z
    .number()
    .min(0)
    .optional()
    .describe("Kwota pożyczki + prowizja pożyczkodawcy, BEZ odsetek umownych (zł)."),
  prowizja: z
    .number()
    .min(0)
    .optional()
    .describe("Prowizja Finance You potrącona z wypłaty (zł) — nie prowizja pożyczkodawcy."),
  numer_kw: z.string().max(60).nullable().optional(),
  kwota_hipoteki: z.number().min(0).nullable().optional(),
  akt_notarialny_777: z
    .string()
    .max(300)
    .nullable()
    .optional()
    .describe(
      "Akt z poddaniem się egzekucji (art. 777 k.p.c.), np. „Rep. A nr 1234/2026, notariusz …”.",
    ),
  kwota_777: z.number().min(0).nullable().optional(),
  rachunek_splaty: z
    .string()
    .max(64)
    .nullable()
    .optional()
    .describe("Rachunek do spłaty: NRB (26 cyfr) albo IBAN PL — zapisywany w grupach cyfr."),
  oprocentowanie_roczne: z.number().min(0).max(100).optional().describe("% rocznie."),
  stopa_odsetek_max: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .describe(
      "Stopa odsetek za opóźnienie z umowy (% rocznie). null / 0 = odsetki maksymalne za opóźnienie z dnia umowy.",
    ),
  kwota_doplat: z.number().min(0).optional(),
  oplaty_windykacyjne: z
    .object({
      sms: z.number().min(0).nullable().optional(),
      email: z.number().min(0).nullable().optional(),
      telefon: z.number().min(0).nullable().optional(),
      pismo: z.number().min(0).nullable().optional(),
      brak_oplat: z.boolean().nullable().optional(),
      zrodlo: z.enum(["umowa", "recznie"]).nullable().optional(),
    })
    .nullable()
    .optional()
    .describe("Tabela opłat za czynności windykacyjne z umowy (zł)."),
  harmonogram: z
    .array(
      z.object({
        termin: z.string().max(40).describe("Termin płatności raty (RRRR-MM-DD)."),
        kwota: kwotaRaty.describe("Kwota raty łącznie (zł)."),
        odsetki: kwotaRaty
          .nullable()
          .optional()
          .describe("Część odsetkowa raty, jeśli umowa ją podaje."),
        prowizja: kwotaRaty
          .nullable()
          .optional()
          .describe("Część prowizyjna raty, jeśli umowa ją podaje."),
      }),
    )
    .max(600)
    .nullable()
    .optional()
    .describe(
      "Pełny harmonogram rat (Zał. 1 do umowy) — zastępuje dotychczasowy; null = usuń harmonogram (model z jednym terminem spłaty). Po zmianie zaległość, opóźnienie i saldo otwartych spraw są przeliczane z rat.",
    ),
  pozyczkodawca: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .describe("Nazwa pożyczkodawcy z umowy — w jego imieniu dzwoni agent AI."),
};

export type WindLoanEditInput = Partial<
  Omit<z.infer<z.ZodObject<typeof updateWindLoanShape>>, "loan_id">
>;

/** Nazwy pól pożyczki w komunikatach i w zdarzeniu „Zmieniono dane pożyczki" (jak w panelu). */
const POLE_POZYCZKI: Record<string, string> = {
  status: "Status",
  saldo_pozostale: "Saldo",
  data_ostatniej_wplaty: "Data ostatniej wpłaty",
  termin_splaty: "Termin spłaty",
  data_wypowiedzenia: "Data wypowiedzenia",
  numer_umowy: "Numer umowy",
  data_umowy: "Data umowy",
  kwota_pozyczki: "Kwota wypłacona (na rękę)",
  kwota_calkowita: "Kwota do zwrotu bez odsetek",
  prowizja: "Prowizja Finance You",
  numer_kw: "Numer KW",
  kwota_hipoteki: "Kwota hipoteki",
  akt_notarialny_777: "Akt notarialny (art. 777 k.p.c.)",
  kwota_777: "Kwota z aktu 777",
  rachunek_splaty: "Rachunek do spłaty",
  oprocentowanie_roczne: "Oprocentowanie roczne",
  stopa_odsetek_max: "Stopa odsetek za opóźnienie",
  kwota_doplat: "Dopłaty",
  oplaty_windykacyjne: "Opłaty windykacyjne",
  harmonogram: "Harmonogram rat",
  pozyczkodawca: "Pożyczkodawca",
};

/** Porównanie wartości przed i po edycji (obiekty — bez względu na kolejność kluczy). */
function sameValue(a: unknown, b: unknown): boolean {
  const stable = (v: unknown) =>
    JSON.stringify(v ?? null, (_k, x: unknown) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q)))
        : x,
    );
  return stable(a) === stable(b);
}

/**
 * Zmiana danych pożyczki z wejścia update_wind_loan — walidacja i postać
 * do zapisu jak w panelu (updateWindLoan): rachunek NRB / IBAN PL w grupach,
 * daty RRRR-MM-DD, kwoty do grosza, harmonogram z numerem błędnej raty,
 * pusta stopa odsetek za opóźnienie = odsetki maksymalne z dnia umowy.
 * `patch` zawiera tylko pola, które faktycznie się zmieniają.
 */
export function buildWindLoanPatch(
  input: WindLoanEditInput,
  before: WindRow,
): {
  patch: Record<string, unknown>;
  zmienione: string[];
  errors: string[];
  /** Harmonogram pożyczki po zmianie (null = model z jednym terminem). */
  harmonogram: WindRata[] | null;
} {
  const p: Record<string, unknown> = {};
  const errors: string[] = [];
  const has = <K extends keyof WindLoanEditInput>(k: K) => input[k] !== undefined;

  if (has("status")) p.status = input.status;
  for (const k of ["numer_umowy", "numer_kw", "akt_notarialny_777", "pozyczkodawca"] as const) {
    if (has(k)) p[k] = (input[k] ?? "").trim() || null;
  }
  for (const k of [
    "data_umowy",
    "termin_splaty",
    "data_ostatniej_wplaty",
    "data_wypowiedzenia",
  ] as const) {
    if (!has(k)) continue;
    const v = (input[k] ?? "").trim();
    const iso = v ? parseDataISO(v) : null;
    if (v && !iso) errors.push(`${POLE_POZYCZKI[k]}: nieprawidłowa data „${v}" (RRRR-MM-DD).`);
    else p[k] = iso;
  }
  for (const k of ["kwota_pozyczki", "kwota_calkowita", "prowizja", "kwota_doplat"] as const) {
    if (has(k)) p[k] = round2(input[k] as number);
  }
  for (const k of ["kwota_hipoteki", "kwota_777"] as const) {
    if (has(k)) p[k] = input[k] == null ? null : round2(input[k] as number);
  }
  if (has("oprocentowanie_roczne")) p.oprocentowanie_roczne = input.oprocentowanie_roczne;
  if (has("stopa_odsetek_max")) {
    const dataUmowy = ("data_umowy" in p ? p.data_umowy : (before.data_umowy ?? null)) as
      | string
      | null;
    p.stopa_odsetek_max =
      Number(input.stopa_odsetek_max) > 0 ? input.stopa_odsetek_max : defaultDelayRate(dataUmowy);
  }
  if (has("rachunek_splaty")) {
    const v = (input.rachunek_splaty ?? "").trim();
    const f = v ? formatRachunekSplaty(v) : null;
    if (v && !f) {
      errors.push(
        `${POLE_POZYCZKI.rachunek_splaty}: podaj 26 cyfr numeru rachunku (NRB) albo IBAN PL.`,
      );
    } else p.rachunek_splaty = f;
  }
  if (has("oplaty_windykacyjne")) {
    p.oplaty_windykacyjne = normalizeWindFeeTable(input.oplaty_windykacyjne) ?? null;
  }
  if (has("harmonogram")) {
    if (input.harmonogram === null) {
      p.harmonogram = null;
    } else {
      const { harmonogram, bledy } = harmonogramFromInput(input.harmonogram ?? []);
      if (bledy.length) {
        errors.push(...bledy.slice(0, 5));
        if (bledy.length > 5)
          errors.push(`…oraz ${bledy.length - 5} innych błędów w harmonogramie.`);
      } else if (!harmonogram) {
        errors.push("Harmonogram bez rat — podaj raty albo null, aby usunąć harmonogram.");
      } else p.harmonogram = harmonogram;
    }
  }

  const harmonogram = (
    "harmonogram" in p ? p.harmonogram : normalizeHarmonogram(before.harmonogram)
  ) as WindRata[] | null;
  if (has("saldo_pozostale")) {
    if (harmonogram) {
      errors.push(
        "Saldo pożyczki z harmonogramem rat liczone jest z rat i wpłat — zmień harmonogram albo dopisz wpłatę (add_collection_event, typ = wplata, z kwotą).",
      );
    } else p.saldo_pozostale = round2(input.saldo_pozostale as number);
  }

  const beforeValue = (k: string) =>
    k === "harmonogram" ? normalizeHarmonogram(before.harmonogram) : before[k];
  const zmienione = Object.keys(p).filter((k) => !sameValue(beforeValue(k), p[k]));
  const patch = Object.fromEntries(zmienione.map((k) => [k, p[k]]));
  return { patch, zmienione, errors, harmonogram };
}

const WIND_LOAN_EDIT_COLS =
  "id, investor_user_id, numer_umowy, data_umowy, kwota_pozyczki, kwota_calkowita, prowizja, termin_splaty, numer_kw, kwota_hipoteki, akt_notarialny_777, kwota_777, rachunek_splaty, oprocentowanie_roczne, stopa_odsetek_max, kwota_doplat, oplaty_windykacyjne, harmonogram, pozyczkodawca, status, saldo_pozostale, data_ostatniej_wplaty, data_wypowiedzenia, updated_at";

export const updateWindLoan = defineTool({
  name: "update_wind_loan",
  title: "Update loan (collections module)",
  description:
    "Aktualizuje pożyczkę w module windykacji — te same pola i zasady co edycja na karcie sprawy: numer i data umowy, pożyczkodawca, kwota wypłacona na rękę (kwota_pozyczki), prowizja Finance You potrącona z wypłaty (prowizja), kwota pożyczki + prowizja pożyczkodawcy bez odsetek umownych (kwota_calkowita), oprocentowanie, stopa odsetek za opóźnienie (pusta = odsetki maksymalne z dnia umowy), dopłaty, tabela opłat windykacyjnych, termin spłaty, harmonogram rat (pełna lista; null usuwa), zabezpieczenia (numer KW, kwota hipoteki, akt 777 i kwota z aktu), rachunek do spłaty (NRB / IBAN PL) oraz status, data ostatniej wpłaty, data wypowiedzenia i saldo (saldo tylko bez harmonogramu). Pożyczka z harmonogramem: po zmianie zaległość, opóźnienie, saldo i status otwartych spraw są przeliczane z rat; zmiana trafia do akt otwartych spraw. Inwestor — swoje (RLS), zespół — wszystkie.",
  inputSchema: updateWindLoanShape,
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const { loan_id, ...input } = a;
      if (!Object.values(input).some((v) => v !== undefined)) return fail("Brak pól do zmiany.");
      const before = await oneOf(
        s.from("wind_loans").select(WIND_LOAN_EDIT_COLS).eq("id", loan_id),
        "wind_loans",
      );
      if (!before) return fail("Nie znaleziono pożyczki (albo brak uprawnień).");

      const { patch, zmienione, errors, harmonogram } = buildWindLoanPatch(input, before);
      if (errors.length) return fail(errors.join(" "));
      const ostrzezenia: string[] = [];
      const przeliczenie: Array<{
        case_id: string;
        na_dzien: string;
        kwota_zalegla: number;
        opoznienie_dni: number;
        saldo_pozostale: number;
        do_zaplaty_teraz: number;
        status: string | null;
      }> = [];

      if (zmienione.length) {
        await updateOne(s, "wind_loans", loan_id, patch, "id");

        let openCases: string[] = [];
        try {
          openCases = (
            await rowsOf<{ id: string }>(
              s
                .from("wind_collection_cases")
                .select("id")
                .eq("loan_id", loan_id)
                .is("data_zamkniecia", null),
              "wind_collection_cases",
            )
          ).map((c) => c.id);
        } catch (e) {
          ostrzezenia.push(`Nie udało się odczytać spraw pożyczki: ${(e as Error).message}`);
        }

        // Pożyczka z harmonogramem: przeliczenie migawki otwartych spraw
        // (kwota zaległa, opóźnienie, saldo i status pożyczki) — jak w panelu.
        if (harmonogram) {
          for (const caseId of openCases) {
            try {
              const r = await recalcWindCaseDetailed(s, caseId);
              if (r) {
                przeliczenie.push({
                  case_id: caseId,
                  na_dzien: r.asOf,
                  kwota_zalegla: r.casePatch.kwota_zalegla,
                  opoznienie_dni: r.casePatch.opoznienie_dni,
                  saldo_pozostale: r.loanPatch.saldo_pozostale,
                  do_zaplaty_teraz: r.snapshot.doZaplatyTeraz,
                  status: r.loanPatch.status ?? null,
                });
              }
            } catch (e) {
              ostrzezenia.push(
                `Sprawa ${caseId}: dane zapisane, ale nie udało się przeliczyć zaległości — ${(e as Error).message}`,
              );
            }
          }
          // Status podany wprost ma pierwszeństwo przed automatem przeliczenia.
          if (
            a.status !== undefined &&
            przeliczenie.some((r) => r.status && r.status !== a.status)
          ) {
            try {
              await updateOne(s, "wind_loans", loan_id, { status: a.status }, "id");
              ostrzezenia.push(
                `Status „${a.status}" ustawiony zgodnie z poleceniem, choć według harmonogramu rat wynikałby inny — sprawdź zaległość.`,
              );
            } catch (e) {
              ostrzezenia.push(
                `Status po przeliczeniu z harmonogramu różni się od podanego „${a.status}" i nie udało się go przywrócić: ${(e as Error).message}`,
              );
            }
          }
        }

        // Ślad w aktach otwartych spraw: co zmieniono w danych pożyczki.
        const linie = [
          `Zmienione pola: ${zmienione.map((k) => POLE_POZYCZKI[k] ?? k).join(", ")}.`,
        ];
        if (zmienione.includes("harmonogram")) {
          linie.push(`Harmonogram: ${opisHarmonogramu(harmonogram)}.`);
        }
        for (const caseId of openCases) {
          const r = przeliczenie.find((x) => x.case_id === caseId);
          const tresc = [
            ...linie,
            ...(r
              ? [
                  `Zaległe raty na ${dataPL(r.na_dzien)}: ${zl(r.kwota_zalegla)}, opóźnienie ${r.opoznienie_dni} dni.`,
                ]
              : []),
          ].join("\n");
          const { error } = await s.from("wind_events").insert({
            case_id: caseId,
            investor_user_id: before.investor_user_id,
            typ: "notatka",
            kategoria: "systemowe",
            tytul: "Zmieniono dane pożyczki (MCP)",
            tresc,
            autor: ctx.getUserEmail() ?? "MCP",
            data_zdarzenia: new Date().toISOString(),
          });
          if (error) {
            ostrzezenia.push(
              `Sprawa ${caseId}: zmiana nie została zapisana w aktach — ${error.message}`,
            );
          }
        }
      } else {
        ostrzezenia.push("Podane wartości są takie same jak zapisane — bez zmian.");
      }

      const after = zmienione.length
        ? await oneOf(
            s.from("wind_loans").select(WIND_LOAN_EDIT_COLS).eq("id", loan_id),
            "wind_loans",
          )
        : before;
      const [loan] = after
        ? await maskWindAccounts(ctx, [
            { ...after, harmonogram: normalizeHarmonogram(after.harmonogram) },
          ])
        : [null];
      return ok({
        ok: true,
        zmienione: zmienione.map((k) => POLE_POZYCZKI[k] ?? k),
        loan,
        przeliczenie,
        ostrzezenia,
      });
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
