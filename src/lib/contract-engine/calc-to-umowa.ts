/**
 * Most KALKULATOR → SZKIC UMOWY (agent umowy).
 *
 * Gdy inwestor klika w kalkulatorze „Wyślij do kreatora", harmonogram spłat
 * trafia do agenta umowy jako pierwsza wiadomość rozmowy, a warunki
 * finansowe wpisujemy do szkicu DETERMINISTYCZNIE (bez przepisywania liczb
 * przez model): kwota, prowizja, oprocentowanie, harmonogram rat z silnika
 * kalkulatora, kwota z art. 777 i data umowy. Strony, nieruchomość i resztę
 * zabezpieczeń agent dopyta w rozmowie.
 *
 * Funkcja jest CZYSTA (bez I/O) — działa po obu stronach i daje się testować.
 */
import type { LoanCalcPayload } from "../loan-calc-pdf";
import { formatKwotaPL, payloadDoRaty } from "./schedule";

/** "2026-07-25" → "25.07.2026"; "25.07.2026" przepuszcza; inne → "". */
function toDataPl(s: string | null | undefined): string {
  if (!s) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  return "";
}

/** Kwota jako obiekt schematu; „slownie" doliczy silnik (uzupelnijSlownie). */
function kwota(n: number | null | undefined): { cyframi: string; slownie: string } {
  return { cyframi: formatKwotaPL(Math.max(0, Number(n) || 0)), slownie: "" };
}

/** Oprocentowanie roczne → "12,5" (regex schematu: 1–2 cyfry, przecinek, 1 cyfra). */
function oprocentowanie(annual: number | null | undefined): string {
  const v = Math.min(99.9, Math.max(0, Number(annual) || 0));
  return v.toFixed(1).replace(".", ",");
}

/** Dzień miesiąca z daty PL, przycięty do zakresu schematu [1, 28]. */
function dzienMiesiaca(dataPl: string): number {
  const m = /^(\d{2})\./.exec(dataPl);
  const d = m ? Number(m[1]) : 1;
  return Math.min(28, Math.max(1, d || 1));
}

function usunPuste<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) {
    const v = (o as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === "") delete (o as Record<string, unknown>)[k];
  }
  return o;
}

/**
 * Fragment szkicu umowy (patch do scalPatch) wyprowadzony z kalkulacji.
 * Zwraca tylko to, co wynika z liczb — bez stron i nieruchomości.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- szkic umowy jest luźnym JSON-em (jak w agencie)
export function kalkulacjaDoSzkicu(payload: LoanCalcPayload): Record<string, any> {
  const sched = Array.isArray(payload.schedule) ? payload.schedule : [];
  const prowizjaCalk =
    (Number(payload.commissionPln) || 0) + (Number(payload.financeYouFeePln) || 0);
  const prowizjaRaty = sched.map((r) => Number(r.prow) || 0);
  const raty = sched.length ? payloadDoRaty(payload, prowizjaRaty) : [];

  const pierwszaData = toDataPl(sched[0]?.date);
  const ostatniaData = toDataPl(sched[sched.length - 1]?.date);
  const balon = Number(payload.balloon) || 0;
  const liczbaRat = sched.length || Math.max(0, Number(payload.months) || 0);

  const harmonogram = usunPuste({
    liczba_rat: liczbaRat > 0 ? liczbaRat : undefined,
    typ: balon > 0 ? "balonowy" : "rowne_raty",
    data_pierwszej_raty: pierwszaData || undefined,
    dzien_miesiaca: pierwszaData ? dzienMiesiaca(pierwszaData) : undefined,
    kwota_raty: Number(payload.monthlyPayment) > 0 ? kwota(payload.monthlyPayment) : undefined,
    kwota_raty_koncowej: balon > 0 ? kwota(balon) : undefined,
    raty: raty.length ? raty : undefined,
  });

  const warunki = usunPuste({
    kwota_pozyczki: kwota(payload.nominal),
    prowizja: { kwota: kwota(prowizjaCalk), model: "nie_potracana_raty" },
    oprocentowanie: oprocentowanie(payload.annualRate),
    harmonogram,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- patch szkicu
  const patch: Record<string, any> = { warunki };

  const dataUmowy = toDataPl(payload.agreementDate);
  if (dataUmowy) patch.meta = { data_umowy: dataUmowy };

  if (Number(payload.art777Amount) > 0) {
    patch.zabezpieczenia = {
      egzekucja_777: usunPuste({
        kwota: kwota(payload.art777Amount),
        poddaje_sie: ["pozyczkobiorca"],
        data_graniczna: ostatniaData || undefined,
        termin_wezwania_dni: 7,
      }),
    };
  }

  return patch;
}

/** Czy obiekt wygląda na payload kalkulatora (ma wiersze harmonogramu). */
export function wyglądaJakKalkulacja(v: unknown): v is LoanCalcPayload {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as { schedule?: unknown }).schedule) &&
    Number.isFinite(Number((v as { nominal?: unknown }).nominal))
  );
}
