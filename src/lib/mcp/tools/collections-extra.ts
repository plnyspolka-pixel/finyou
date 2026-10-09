// Windykacja: sprawa w całości, pożyczki inwestora, starszy moduł spraw.
//
// Zadłużenie (`zadluzenie`) liczymy na dziś (Europe/Warsaw) tym samym
// silnikiem co karta sprawy w panelu (windDebtSnapshot): pożyczka
// z harmonogramem rat — z rat, wpłat i opłat z akt; bez harmonogramu — model
// z jednym terminem spłaty i kwotą zaległą sprawy. Kolumny kwota_zalegla
// i opoznienie_dni w wierszu sprawy to zapisana migawka (może być nieaktualna).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { windDebtSnapshot, type WindDebtEvent, type WindDebtLoan } from "@/lib/windykacja-debt";
import { normalizeHarmonogram } from "@/lib/windykacja-harmonogram";
import { warsawToday } from "@/lib/windykacja-recalc";
import {
  attach,
  clampLimit,
  fail,
  handle,
  hasRole,
  ok,
  oneOf,
  requireUser,
  rowsOf,
  section,
} from "../_helpers";
import { defineListTool, text, uuid } from "../_list-tool";

/** Wiersz PostgREST (klient MCP jest bez typów bazy). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wiersze z bazy bez wygenerowanych typów
export type WindRow = Record<string, any>;

// ── Wspólne: zadłużenie, harmonogram, maskowanie rachunku ────────────

/** Kolumny pożyczki potrzebne do wyliczenia zadłużenia (windDebtSnapshot). */
export const WIND_DEBT_LOAN_COLS =
  "kwota_pozyczki, kwota_calkowita, prowizja, data_umowy, termin_splaty, oprocentowanie_roczne, stopa_odsetek_max, data_wypowiedzenia, status, kwota_doplat, harmonogram";

export type WindRataStatus = "zaplacona" | "zalegla" | "przyszla";

/** Stan zadłużenia na dziś — pola jak w windDebtSnapshot (karta sprawy). */
export interface WindZadluzenie {
  /** Dzień wyliczenia (RRRR-MM-DD, Europe/Warsaw). */
  asOf: string;
  /** Skąd liczona zaległość: z harmonogramu rat czy z jednego terminu spłaty. */
  zrodlo: "harmonogram" | "termin";
  wypowiedziana: boolean;
  /** Zaległe raty + odsetki za opóźnienie + koszty (po wypowiedzeniu: całe zadłużenie). */
  doZaplatyTeraz: number;
  /** Zaległe raty (bez odsetek za opóźnienie i kosztów). */
  zaleglosc: number;
  odsetkiZaOpoznienie: number;
  koszty: number;
  /** Wszystko, co pozostało do spłaty, łącznie z ratami przyszłymi. */
  calosc: number;
  dniOpoznienia: number;
  /** Najstarsza niezapłacona rata (harmonogram) albo termin spłaty (model jednoterminowy). */
  najstarszaZalegla: string | null;
  najblizszaRata: string | null;
  /** Raty jeszcze niewymagalne — tylko harmonogram. */
  pozostaleRatyPrzyszle: number | null;
  /** Wpłaty ponad wszystkie raty i należności — tylko harmonogram. */
  nadplata: number | null;
  /** Stan każdej raty — na żądanie (get_collection_case), tylko harmonogram. */
  raty?: Array<{
    nr: number;
    termin: string;
    kwota: number;
    zaplacono: number;
    pozostalo: number;
    dniOpoznienia: number;
    status: WindRataStatus;
  }>;
}

/**
 * Zadłużenie sprawy na dzień `asOf` — windDebtSnapshot w postaci do
 * odpowiedzi narzędzia. `events` = zdarzenia sprawy z wpłatami
 * (metadata.kwota) i opłatami (oplata).
 */
export function windZadluzenie(input: {
  loan: WindDebtLoan;
  kwotaZalegla: number | null | undefined;
  events: WindDebtEvent[];
  asOf: string;
  zRatami?: boolean;
}): WindZadluzenie {
  const s = windDebtSnapshot({
    loan: input.loan,
    kwotaZalegla: Number(input.kwotaZalegla ?? 0),
    events: input.events,
    asOf: input.asOf,
  });
  return {
    asOf: input.asOf,
    zrodlo: s.zrodlo,
    wypowiedziana: s.wypowiedziana,
    doZaplatyTeraz: s.doZaplatyTeraz,
    zaleglosc: s.zaleglosc,
    odsetkiZaOpoznienie: s.odsetkiZaOpoznienie,
    koszty: s.koszty,
    calosc: s.calosc,
    dniOpoznienia: s.dniOpoznienia,
    najstarszaZalegla: s.najstarszaZalegla,
    najblizszaRata: s.najblizszaRata,
    pozostaleRatyPrzyszle: s.raty?.pozostaleRatyPrzyszle ?? null,
    nadplata: s.raty?.nadplata ?? null,
    ...(input.zRatami && s.raty
      ? {
          raty: s.raty.raty.map((r) => ({
            nr: r.nr,
            termin: r.termin,
            kwota: r.kwota,
            zaplacono: r.zaplacono,
            pozostalo: r.pozostalo,
            dniOpoznienia: r.dniOpoznienia,
            status: (r.pozostalo <= 0
              ? "zaplacona"
              : r.wymagalna
                ? "zalegla"
                : "przyszla") as WindRataStatus,
          })),
        }
      : {}),
  };
}

/** Skrót harmonogramu do list (pełny harmonogram: get_collection_case). */
export function harmonogramSkrot(raw: unknown): {
  liczba_rat: number;
  suma_rat: number;
  pierwsza_rata: string;
  ostatnia_rata: string;
} | null {
  const h = normalizeHarmonogram(raw);
  if (!h) return null;
  return {
    liczba_rat: h.length,
    suma_rat: Math.round(h.reduce((s, r) => s + r.kwota, 0) * 100) / 100,
    pierwsza_rata: h[0].termin,
    ostatnia_rata: h[h.length - 1].termin,
  };
}

/**
 * Rachunek do spłaty widzi właściciel pożyczki (inwestor) i administrator;
 * pozostali członkowie zespołu dostają „(ukryte)" — jak w get_client_dossier.
 * Wiersz musi zawierać `investor_user_id`.
 */
export function maskWindAccount<T extends WindRow | null>(
  row: T,
  viewer: { userId: string | null | undefined; admin: boolean },
): T {
  if (!row || viewer.admin || !row.rachunek_splaty) return row;
  if (viewer.userId && row.investor_user_id === viewer.userId) return row;
  return { ...row, rachunek_splaty: "(ukryte)" };
}

/** maskWindAccount dla listy — rolę sprawdzamy tylko, gdy jest co maskować. */
export async function maskWindAccounts<T extends WindRow>(
  ctx: ToolContext,
  rows: T[],
): Promise<T[]> {
  const userId = ctx.getUserId();
  const needs = rows.some((r) => r.rachunek_splaty && r.investor_user_id !== userId);
  if (!needs) return rows;
  const admin = await hasRole(ctx, ["administrator"]);
  return rows.map((r) => maskWindAccount(r, { userId, admin }));
}

const EVENTS_PAGE = 1000;

/**
 * Zdarzenia potrzebne do wyliczenia zadłużenia (wpłaty i opłaty) dla spraw
 * — wszystkie, stronami (limit wierszy PostgREST nie może uciąć wpłat, bo
 * kwota byłaby błędna). Wynik pogrupowany po case_id.
 */
export async function loadWindDebtEvents(
  client: SupabaseClient,
  caseIds: string[],
): Promise<Map<string, WindDebtEvent[]>> {
  const out = new Map<string, WindDebtEvent[]>();
  const ids = [...new Set(caseIds)];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (let from = 0; ; from += EVENTS_PAGE) {
      const rows = await rowsOf<WindRow>(
        client
          .from("wind_events")
          .select("id, case_id, typ, data_zdarzenia, metadata, oplata")
          .in("case_id", chunk)
          .or("typ.eq.wplata,oplata.gt.0")
          .order("id", { ascending: true })
          .range(from, from + EVENTS_PAGE - 1),
        "wind_events",
      );
      for (const r of rows) {
        const list = out.get(r.case_id) ?? [];
        list.push({
          typ: r.typ,
          data_zdarzenia: r.data_zdarzenia,
          metadata: r.metadata ?? null,
          oplata: r.oplata ?? 0,
        });
        out.set(r.case_id, list);
      }
      if (rows.length < EVENTS_PAGE) break;
    }
  }
  return out;
}

/**
 * Sprawa, z której liczymy zadłużenie pożyczki: najnowsza otwarta, a gdy
 * wszystkie są zamknięte — najnowsza (wpłaty zapisuje się w aktach sprawy).
 */
export function mainCaseByLoan<
  T extends { loan_id: string; data_otwarcia?: string | null; data_zamkniecia?: string | null },
>(cases: T[]): Map<string, T> {
  const score = (c: T) => `${c.data_zamkniecia ? 0 : 1}|${c.data_otwarcia ?? ""}`;
  const out = new Map<string, T>();
  for (const c of cases) {
    const cur = out.get(c.loan_id);
    if (!cur || score(c) > score(cur)) out.set(c.loan_id, c);
  }
  return out;
}

// ── get_collection_case ──────────────────────────────────────────────

const CASE_LOAN_COLS = `id, numer_umowy, borrower_id, investor_user_id, pozyczkodawca, saldo_pozostale, data_ostatniej_wplaty, numer_kw, kwota_hipoteki, akt_notarialny_777, kwota_777, rachunek_splaty, oplaty_windykacyjne, ${WIND_DEBT_LOAN_COLS}`;

export const getCollectionCase = defineTool({
  name: "get_collection_case",
  title: "Get collection case",
  description:
    "Sprawa windykacyjna w całości: etap, ścieżka, priorytet, pożyczka (umowa, pożyczkodawca, kwoty, saldo, terminy, harmonogram rat, zabezpieczenia: KW, hipoteka, akt 777, rachunek do spłaty), dłużnik (bez PESEL i numeru dowodu) i chronologia zdarzeń z doręczeniami. `zadluzenie` = wyliczenie na dziś jak na karcie sprawy: doZaplatyTeraz (zaległe raty + odsetki za opóźnienie + koszty; po wypowiedzeniu całe zadłużenie), zaleglosc, odsetkiZaOpoznienie, koszty, calosc (z ratami przyszłymi), dniOpoznienia, najstarszaZalegla, zrodlo (harmonogram / termin) i stan każdej raty. kwota_zalegla i opoznienie_dni w sprawie to zapisana migawka. Rachunek do spłaty widzi właściciel i administrator. Inwestor widzi swoje (RLS), zespół — wszystkie.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const c = await oneOf(
        s.from("wind_collection_cases").select("*").eq("id", id),
        "wind_collection_cases",
      );
      if (!c) return fail("Nie znaleziono sprawy (albo brak uprawnień).");
      const errors: string[] = [];
      const loan = await section(errors, "wind_loans", () =>
        oneOf(s.from("wind_loans").select(CASE_LOAN_COLS).eq("id", c.loan_id), "wind_loans"),
      );
      const [borrower, events, debtEvents] = await Promise.all([
        section(errors, "wind_borrowers", async () =>
          loan?.borrower_id
            ? oneOf(
                s
                  .from("wind_borrowers")
                  .select(
                    "id, imie_nazwisko, typ, telefon, email, email_zgoda_doreczenia, adres_do_doreczen, nip, notatki",
                  )
                  .eq("id", loan.borrower_id),
                "wind_borrowers",
              )
            : null,
        ),
        section(errors, "wind_events", () =>
          rowsOf(
            s
              .from("wind_events")
              .select(
                "id, typ, kategoria, tytul, tresc, data_zdarzenia, status_doreczenia, data_doreczenia, autor, zalacznik_url, metadata, oplata, created_at",
              )
              .eq("case_id", id)
              .order("data_zdarzenia", { ascending: false })
              .limit(200),
            "wind_events",
          ),
        ),
        // Do wyliczenia zadłużenia — wszystkie wpłaty i opłaty, nie tylko 200 ostatnich zdarzeń.
        section(errors, "zadluzenie", () => loadWindDebtEvents(s, [id])),
      ]);

      const zadluzenie =
        loan && debtEvents
          ? windZadluzenie({
              loan: loan as WindDebtLoan,
              kwotaZalegla: c.kwota_zalegla,
              events: debtEvents.get(id) ?? [],
              asOf: warsawToday(),
              zRatami: true,
            })
          : null;
      const [loanOut] = loan
        ? await maskWindAccounts(ctx, [
            { ...loan, harmonogram: normalizeHarmonogram(loan.harmonogram) } as WindRow,
          ])
        : [null];
      return ok({ case: c, loan: loanOut, borrower, zadluzenie, events: events ?? [], errors });
    }),
});

// ── list_wind_loans ──────────────────────────────────────────────────

const LOAN_LIST_COLS = `id, numer_umowy, borrower_id, investor_user_id, pozyczkodawca, saldo_pozostale, data_ostatniej_wplaty, numer_kw, kwota_hipoteki, akt_notarialny_777, kwota_777, rachunek_splaty, created_at, ${WIND_DEBT_LOAN_COLS}`;

export const listWindLoans = defineTool({
  name: "list_wind_loans",
  title: "List investor loans (collections module)",
  description:
    "Pożyczki w module windykacji: numer umowy, pożyczkodawca, kwoty (kwota_pozyczki = wypłacona na rękę, prowizja = prowizja Finance You potrącona z wypłaty, kwota_calkowita = kwota pożyczki + prowizja pożyczkodawcy bez odsetek umownych), saldo, oprocentowanie, stopa odsetek za opóźnienie, status (aktywna, w zwłoce, wypowiedziana, spłacona…), terminy, zabezpieczenia (KW, hipoteka, akt 777), skrót harmonogramu rat (pełny — get_collection_case) i `zadluzenie` na dziś z bieżącej sprawy (doZaplatyTeraz, zaleglosc, odsetkiZaOpoznienie, koszty, calosc, dniOpoznienia, najstarszaZalegla, zrodlo) — z danymi pożyczkobiorcy (bez PESEL). Rachunek do spłaty widzi właściciel i administrator. Inwestor widzi swoje (RLS), zespół — wszystkie.",
  inputSchema: {
    status: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Status pożyczki (aktywna, w_zwloce, wypowiedziana, windykacja_komornicza, splacona, windykacja_karna).",
      ),
    investor_user_id: z.string().uuid().optional().describe("Tylko pożyczki tego inwestora."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Ile wierszy (domyślnie 20, maks. 100)."),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Przesunięcie do stronicowania (domyślnie 0)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const limit = clampLimit(args.limit, 20, 100);
      const offset = Math.max(0, Number(args.offset ?? 0) || 0);
      let q = s.from("wind_loans").select(LOAN_LIST_COLS, { count: "exact" });
      if (args.status) q = q.eq("status", args.status);
      if (args.investor_user_id) q = q.eq("investor_user_id", args.investor_user_id);
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(`wind_loans: ${error.message}`);
      const rows = await attach(s, (data ?? []) as WindRow[], {
        key: "borrower_id",
        table: "wind_borrowers",
        columns: "id, imie_nazwisko, typ, telefon, email",
        as: "borrower",
      });

      // Zadłużenie z bieżącej sprawy pożyczki (wpłaty są w jej aktach).
      const errors: string[] = [];
      const loanIds = rows.map((r) => r.id as string);
      const cases = loanIds.length
        ? await section(errors, "wind_collection_cases", () =>
            rowsOf<WindRow>(
              s
                .from("wind_collection_cases")
                .select(
                  "id, loan_id, sciezka, etap, kwota_zalegla, opoznienie_dni, data_otwarcia, data_zamkniecia",
                )
                .in("loan_id", loanIds),
              "wind_collection_cases",
            ),
          )
        : [];
      const mainCase = mainCaseByLoan((cases ?? []) as Array<WindRow & { loan_id: string }>);
      const debtEvents = cases
        ? await section(errors, "zadluzenie", () =>
            loadWindDebtEvents(
              s,
              [...mainCase.values()].map((c) => c.id as string),
            ),
          )
        : null;
      const asOf = warsawToday();

      const loans = (await maskWindAccounts(ctx, rows)).map(({ harmonogram, ...loan }) => {
        const kase = mainCase.get(loan.id as string) ?? null;
        return {
          ...loan,
          harmonogram_skrot: harmonogramSkrot(harmonogram),
          sprawa: kase
            ? {
                id: kase.id,
                sciezka: kase.sciezka,
                etap: kase.etap,
                data_otwarcia: kase.data_otwarcia,
                data_zamkniecia: kase.data_zamkniecia,
              }
            : null,
          zadluzenie:
            kase && debtEvents
              ? windZadluzenie({
                  loan: { ...loan, harmonogram } as WindDebtLoan,
                  kwotaZalegla: kase.kwota_zalegla,
                  events: debtEvents.get(kase.id as string) ?? [],
                  asOf,
                })
              : null,
        };
      });
      return ok({
        loans,
        total: typeof count === "number" ? count : loans.length,
        limit,
        offset,
        ...(errors.length ? { errors } : {}),
      });
    }),
});

export const listDebtCollectionCases = defineListTool({
  name: "list_debt_collection_cases",
  title: "List debt collection cases (legacy)",
  description:
    "Starszy moduł spraw windykacyjnych (kalkulator kosztów działań): dłużnik, umowa, kapitał, stopy odsetek, status. Widoczność wg RLS.",
  table: "debt_collection_cases",
  columns:
    "id, investor_user_id, status, debtor_name, contract_number, principal_amount, payout_date, contractual_annual_rate, penalty_annual_rate, max_statutory_rate, notes, created_at, updated_at",
  resultKey: "cases",
  filters: {
    status: text("status", "Status sprawy."),
    investor_user_id: uuid("investor_user_id", "Tylko sprawy tego inwestora."),
  },
});

export const collectionsExtraTools = [getCollectionCase, listWindLoans, listDebtCollectionCases];
