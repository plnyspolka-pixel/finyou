// Średni kurs EUR wg tabeli A NBP obowiązujący w dniu transakcji —
// podstawa wyliczenia równowartości 15 000 EUR dla rejestru ponadprogowego.
// API: https://api.nbp.pl/api/exchangerates/rates/a/eur/{data}/
// Gdy w danym dniu nie było tabeli (weekend, święto), cofamy się do
// ostatniego dnia roboczego (maks. 10 dni).

export interface NbpEurRate {
  rate: number; // średni kurs EUR/PLN
  tableNo: string; // numer tabeli, np. 141/A/NBP/2026
  tableDate: string; // data tabeli (ISO)
}

const memCache = new Map<string, NbpEurRate>();

async function fetchForDate(iso: string): Promise<NbpEurRate | null> {
  const res = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/eur/${iso}/?format=json`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null; // brak tabeli tego dnia
  if (!res.ok) throw new Error(`NBP API HTTP ${res.status}`);
  const json = (await res.json()) as {
    rates?: { no: string; effectiveDate: string; mid: number }[];
  };
  const r = json.rates?.[0];
  if (!r || !Number.isFinite(r.mid)) return null;
  return { rate: r.mid, tableNo: r.no, tableDate: r.effectiveDate };
}

/** Kurs średni EUR obowiązujący w dniu `transactionDate` (ISO YYYY-MM-DD). */
export async function getEurRateForDate(transactionDate: string): Promise<NbpEurRate> {
  const cached = memCache.get(transactionDate);
  if (cached) return cached;

  const d = new Date(`${transactionDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Niepoprawna data transakcji: ${transactionDate}`);

  for (let back = 0; back <= 10; back++) {
    const probe = new Date(d.getTime() - back * 24 * 60 * 60 * 1000);
    const iso = probe.toISOString().slice(0, 10);
    const rate = await fetchForDate(iso);
    if (rate) {
      memCache.set(transactionDate, rate);
      return rate;
    }
  }
  throw new Error(`Nie znaleziono tabeli A NBP dla daty ${transactionDate} (cofnięto 10 dni).`);
}

/** Równowartość kwoty w EUR (dla PLN dzielimy przez kurs; EUR zwracamy 1:1). */
export function toEurEquivalent(amount: number, currency: string, eurRate: number): number {
  if (currency.toUpperCase() === "EUR") return Math.round(amount * 100) / 100;
  if (currency.toUpperCase() === "PLN") return Math.round((amount / eurRate) * 100) / 100;
  // Inne waluty: wymagałyby kursu krzyżowego — sygnalizujemy jawnie.
  throw new Error(`Nieobsługiwana waluta ${currency} — przelicz przez PLN albo EUR.`);
}
