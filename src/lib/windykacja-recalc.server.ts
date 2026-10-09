// Przeliczenie migawki sprawy windykacyjnej z harmonogramu rat (zapis do
// bazy). Logika liczenia: windykacja-recalc.ts → windDebtSnapshot.
//
// Wołane po każdej zmianie, która wpływa na zaległość z rat: wpłata,
// edycja pożyczki (harmonogram, stopa), wypowiedzenie, generowanie pisma.
// Klient bazy to klient użytkownika (RLS: właściciel sprawy albo zespół).

import { normalizeHarmonogram } from "@/lib/windykacja-harmonogram";
import { warsawToday, windRecalcPlan, type WindRecalcPlan } from "@/lib/windykacja-recalc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabele wind_* przez luźnego klienta (jak w windykacja.functions.ts)
type LooseDb = { from: (t: string) => any };

/** Kolumny pożyczki potrzebne do windDebtSnapshot. */
const RECALC_LOAN_COLS =
  "id, kwota_pozyczki, kwota_calkowita, prowizja, data_umowy, termin_splaty, oprocentowanie_roczne, stopa_odsetek_max, data_wypowiedzenia, status, kwota_doplat, harmonogram";

export interface WindRecalcOutcome extends WindRecalcPlan {
  caseId: string;
  loanId: string;
  asOf: string;
}

/**
 * Przelicza i zapisuje migawkę sprawy (kwota_zalegla, opoznienie_dni)
 * oraz saldo i status pożyczki — tylko dla pożyczki z harmonogramem rat.
 * Pożyczka bez harmonogramu: nic nie zmienia, zwraca null.
 * Błąd odczytu lub zapisu → wyjątek (nie zapisujemy kwot policzonych
 * z niepełnych danych).
 */
export async function recalcWindCaseDetailed(
  db: LooseDb,
  caseId: string,
  opts: { asOf?: string } = {},
): Promise<WindRecalcOutcome | null> {
  const { data: kase, error: cErr } = await db
    .from("wind_collection_cases")
    .select("id, loan_id, kwota_zalegla")
    .eq("id", caseId)
    .maybeSingle();
  if (cErr) throw new Error(`Przeliczenie sprawy: ${cErr.message}`);
  if (!kase) throw new Error("Sprawa nie znaleziona");

  const { data: loan, error: lErr } = await db
    .from("wind_loans")
    .select(RECALC_LOAN_COLS)
    .eq("id", kase.loan_id)
    .maybeSingle();
  if (lErr) throw new Error(`Przeliczenie sprawy: ${lErr.message}`);
  if (!loan) throw new Error("Pożyczka sprawy nie znaleziona");
  // Model jednoterminowy — kwota zaległa zostaje taka, jaką wpisał użytkownik.
  if (!normalizeHarmonogram(loan.harmonogram)) return null;

  // Wszystkie zdarzenia sprawy: wpłaty (metadata.kwota) i opłaty (oplata).
  const { data: events, error: eErr } = await db
    .from("wind_events")
    .select("typ, data_zdarzenia, metadata, oplata")
    .eq("case_id", caseId);
  if (eErr) throw new Error(`Przeliczenie sprawy: ${eErr.message}`);

  const asOf = opts.asOf ?? warsawToday();
  const plan = windRecalcPlan({
    loan,
    kwotaZalegla: Number(kase.kwota_zalegla ?? 0),
    events: events ?? [],
    asOf,
  });
  if (!plan) return null;

  const { error: cuErr } = await db
    .from("wind_collection_cases")
    .update(plan.casePatch)
    .eq("id", caseId);
  if (cuErr) throw new Error(`Przeliczenie sprawy: ${cuErr.message}`);
  const { error: luErr } = await db.from("wind_loans").update(plan.loanPatch).eq("id", loan.id);
  if (luErr) throw new Error(`Przeliczenie sprawy: ${luErr.message}`);

  return { ...plan, caseId, loanId: loan.id as string, asOf };
}

/**
 * Przelicza migawkę sprawy z harmonogramu rat (patrz recalcWindCaseDetailed).
 * Dla pożyczki bez harmonogramu nic nie robi. Rzuca wyjątek przy błędzie bazy.
 */
export async function recalcWindCase(db: LooseDb, caseId: string): Promise<void> {
  await recalcWindCaseDetailed(db, caseId);
}
