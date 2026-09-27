// ════════════════════════════════════════════════════════════════════
// Przekazanie kalkulacji z KALKULATORA do KREATORA dokumentów W APLIKACJI
// (bez pobierania i wgrywania pliku). Kalkulator zapisuje payload, dowolny
// kreator go odczytuje. Trwałość w obrębie karty (sessionStorage), z eventem
// dla otwartych już widoków.
// ════════════════════════════════════════════════════════════════════

import type { LoanCalcPayload } from "@/lib/loan-calc-pdf";

const KEY = "finyou.calcHandoff.v1";
const EVT = "finyou:calc-handoff";

export interface CalcHandoff {
  payload: LoanCalcPayload;
  ts: number;
}

/** Zapisuje kalkulację do przekazania i powiadamia otwarte kreatory. */
export function saveCalcHandoff(payload: LoanCalcPayload): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ payload, ts: Date.now() }));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* brak dostępu do sessionStorage — pomiń */
  }
}

/** Odczytuje ostatnią przekazaną kalkulację (albo null). */
export function readCalcHandoff(): CalcHandoff | null {
  try {
    const s = sessionStorage.getItem(KEY);
    if (!s) return null;
    const o = JSON.parse(s);
    if (o?.payload && Array.isArray(o.payload.schedule)) return o as CalcHandoff;
  } catch {
    /* uszkodzony wpis */
  }
  return null;
}

/** Usuwa przekazaną kalkulację. */
export function clearCalcHandoff(): void {
  try {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* pomiń */
  }
}

/** Subskrypcja zmian (pojawienie się / wyczyszczenie kalkulacji). Zwraca funkcję odpinającą. */
export function onCalcHandoffChange(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVT, h);
    window.removeEventListener("storage", h);
  };
}

// ════════════════════════════════════════════════════════════════════
// PIERWSZA WIADOMOŚĆ DO AGENTA UMOWY — harmonogram spłat z kalkulatora.
// „Wyślij do kreatora" otwiera rozmowę z agentem umowy tą wiadomością;
// liczby trafiają do szkicu deterministycznie (calc-to-umowa), a tekst jest
// dla rozmówcy i agenta — czytelnym streszczeniem kalkulacji.
// ════════════════════════════════════════════════════════════════════

/** Limit długości wiadomości agenta (serwer odrzuca > 6000 znaków). */
const MAX_MESSAGE_CHARS = 5_600;

/** „12 345,67 zł" — zwykła spacja tysięcy (jak formatKwotaPL silnika umów), deterministycznie. */
const pln = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  const [int, dec] = Math.abs(v).toFixed(2).split(".");
  return `${v < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${dec} zł`;
};
const pct = (n: number | null | undefined) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${String(v).replace(".", ",")} %`;
};

/** Treść pierwszej wiadomości rozmowy z agentem umowy — harmonogram z kalkulatora. */
export function buildCalcHandoffMessage(p: LoanCalcPayload): string {
  const rows = Array.isArray(p.schedule) ? p.schedule : [];
  const head: string[] = [
    "Wysyłam harmonogram spłat z kalkulatora pożyczki — zacznijmy od niego nową umowę.",
    "",
    "Parametry:",
    `• Kwota pożyczki (nominalna): ${pln(p.nominal)}; na rękę dla pożyczkobiorcy: ${pln(p.onHand)}`,
    `• Okres: ${rows.length || p.months} rat miesięcznych; oprocentowanie roczne: ${pct(p.annualRate)}`,
    `• Prowizja inwestora: ${pln(p.commissionPln)} (${pct(p.commissionPct)}); prowizja Finance You: ${pln(p.financeYouFeePln)} (${pct(p.financeYouFeePct)})`,
    `• Rata miesięczna: ${pln(p.monthlyPayment)}${Number(p.balloon) > 0 ? `; rata końcowa (balonowa): ${pln(p.balloon)}` : ""}`,
    `• Odsetki łącznie: ${pln(p.totalInterest)}; łącznie do spłaty: ${pln(p.totalToRepay)}`,
    `• Proponowana hipoteka: ${pln(p.mortgageAmount)}; kwota z art. 777 k.p.c.: ${pln(p.art777Amount)}`,
  ];
  if (p.agreementDate) head.push(`• Data umowy: ${p.agreementDate}`);
  if (p.clientName) head.push(`• Pożyczkobiorca (z kalkulatora): ${p.clientName}`);

  const tail =
    "\nWarunki finansowe i harmonogram są już wpisane do szkicu umowy — nie przepisuj ich. " +
    "Poprowadź mnie przez resztę: strony umowy, nieruchomość z numerem KW i zabezpieczenia.";

  const lines: string[] = [];
  if (rows.length) {
    lines.push("", "Harmonogram rat (nr · termin · rata · kapitał · odsetki · prowizja · saldo):");
  }
  let text = head.join("\n");
  let shown = 0;
  for (const r of rows) {
    const line = `${r.idx}. ${r.date} · ${pln(r.rata)} · kap. ${pln(r.kap)} · ods. ${pln(r.ods)} · prow. ${pln(r.prow ?? 0)} · saldo ${pln(r.saldo)}`;
    const candidate = [text, ...lines, line].join("\n");
    // Zostaw miejsce na dopisek o pominiętych ratach i zakończenie.
    if (candidate.length + tail.length + 80 > MAX_MESSAGE_CHARS) break;
    lines.push(line);
    shown += 1;
  }
  if (rows.length && shown < rows.length) {
    lines.push(
      `… oraz ${rows.length - shown} kolejnych rat wg tego samego schematu (pełny harmonogram jest w szkicu umowy).`,
    );
  }
  text = [text, ...lines].join("\n") + "\n" + tail;
  return text;
}
