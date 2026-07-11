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
