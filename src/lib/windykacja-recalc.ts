// ════════════════════════════════════════════════════════════════════
// PRZELICZENIE SPRAWY Z HARMONOGRAMU + WALIDACJA DANYCH POŻYCZKI
// (czyste funkcje, bez I/O — zapis do bazy w windykacja-recalc.server.ts).
//
// Sprawa trzyma w bazie migawkę: wind_collection_cases.kwota_zalegla
// i opoznienie_dni oraz wind_loans.saldo_pozostale. Dla pożyczki
// z harmonogramem rat migawkę liczymy tym samym silnikiem co karta sprawy
// (windDebtSnapshot): kwota zaległa = niezapłacone raty wymagalne,
// opóźnienie = dni od najstarszej zaległej raty, saldo = zaległe raty +
// raty przyszłe. Pożyczka bez harmonogramu (model jednoterminowy) — bez
// zmian: jej kwota zaległa jest podstawą odsetek i wpisuje ją użytkownik.
// ════════════════════════════════════════════════════════════════════

import {
  windDebtSnapshot,
  type WindDebtEvent,
  type WindDebtLoan,
  type WindDebtSnapshot,
} from "@/lib/windykacja-debt";
import {
  normalizeHarmonogram,
  parseDataISO,
  parseKwota,
  type WindRata,
} from "@/lib/windykacja-harmonogram";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Dzisiejsza data w Polsce (Europe/Warsaw) jako RRRR-MM-DD. */
export function warsawToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Dni od terminu do dziś (Europe/Warsaw); 0 przed terminem albo bez terminu. */
export function daysSinceDue(termin: string | null | undefined, asOf: string): number {
  const due = parseDataISO(termin);
  const today = parseDataISO(asOf);
  if (!due || !today) return 0;
  const ms = Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

// ── Migawka sprawy ───────────────────────────────────────────────────

export interface WindRecalcPlan {
  snapshot: WindDebtSnapshot;
  /** Zapis do wind_collection_cases. */
  casePatch: { kwota_zalegla: number; opoznienie_dni: number };
  /** Zapis do wind_loans (status tylko, gdy się zmienia). */
  loanPatch: { saldo_pozostale: number; status?: "splacona" | "w_zwloce" };
}

/**
 * Migawka sprawy z harmonogramu rat na dzień `asOf`. Dla pożyczki bez
 * harmonogramu zwraca null — model jednoterminowy zostaje bez zmian.
 *
 * Status pożyczki: „spłacona", gdy nic nie zostało do zapłaty (łącznie
 * z ratami przyszłymi, odsetkami i kosztami). Pożyczka oznaczona wcześniej
 * jako spłacona, a z należnością (np. po korekcie harmonogramu), wraca do
 * „w zwłoce". Pozostałe statusy (wypowiedziana, komornicza, karna) zostają.
 */
export function windRecalcPlan(input: {
  loan: WindDebtLoan;
  kwotaZalegla?: number | null;
  events: WindDebtEvent[];
  asOf: string;
}): WindRecalcPlan | null {
  const snapshot = windDebtSnapshot(input);
  if (snapshot.zrodlo !== "harmonogram" || !snapshot.raty) return null;
  const loanPatch: WindRecalcPlan["loanPatch"] = {
    saldo_pozostale: round2(snapshot.zaleglosc + snapshot.raty.pozostaleRatyPrzyszle),
  };
  if (snapshot.calosc <= 0.01) {
    if (input.loan.status !== "splacona") loanPatch.status = "splacona";
  } else if (input.loan.status === "splacona") {
    loanPatch.status = "w_zwloce";
  }
  return {
    snapshot,
    casePatch: { kwota_zalegla: snapshot.zaleglosc, opoznienie_dni: snapshot.dniOpoznienia },
    loanPatch,
  };
}

// ── Walidacja danych wejściowych pożyczki ────────────────────────────

/**
 * Numer rachunku do spłaty: NRB (26 cyfr) albo IBAN PL. Spacje i myślniki
 * pomijamy; wynik w zapisie grupowym „NN NNNN NNNN NNNN NNNN NNNN NNNN"
 * (z prefiksem „PL", gdy był podany). Null = numer nieprawidłowy.
 */
export function formatRachunekSplaty(raw: string): string | null {
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  const m = /^(PL)?(\d{26})$/.exec(s);
  if (!m) return null;
  const d = m[2];
  const groups = d.slice(2).match(/.{4}/g) ?? [];
  return `${m[1] ?? ""}${d.slice(0, 2)} ${groups.join(" ")}`;
}

const isBlank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

/**
 * Harmonogram z formularza / edycji: wiersze {termin, kwota, odsetki?,
 * prowizja?} (kwoty także jako tekst „7 868,48"). W odróżnieniu od
 * normalizeHarmonogram NIE pomija po cichu błędnych wierszy — zwraca
 * listę błędów z numerem wiersza. Puste wiersze (bez terminu i kwoty) są
 * pomijane. Brak rat → harmonogram null.
 */
export function harmonogramFromInput(rows: unknown[]): {
  harmonogram: WindRata[] | null;
  bledy: string[];
} {
  const ok: Array<Record<string, unknown>> = [];
  const bledy: string[] = [];
  rows.forEach((r, i) => {
    const nr = i + 1;
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      bledy.push(`Rata ${nr}: nieprawidłowy wiersz harmonogramu.`);
      return;
    }
    const o = r as Record<string, unknown>;
    const terminRaw = o.termin ?? o.data ?? o.termin_platnosci;
    const kwotaRaw = o.kwota ?? o.rata ?? o.rata_razem;
    if (isBlank(terminRaw) && isBlank(kwotaRaw) && isBlank(o.odsetki) && isBlank(o.prowizja)) {
      return;
    }
    const termin = parseDataISO(terminRaw);
    const kwota = parseKwota(kwotaRaw);
    const odsetki = isBlank(o.odsetki) ? null : parseKwota(o.odsetki);
    const prowizja = isBlank(o.prowizja) ? null : parseKwota(o.prowizja);
    const przed = bledy.length;
    if (!termin) bledy.push(`Rata ${nr}: nieprawidłowy termin płatności (RRRR-MM-DD).`);
    if (kwota == null || kwota <= 0) bledy.push(`Rata ${nr}: kwota raty musi być większa od 0.`);
    if (!isBlank(o.odsetki) && (odsetki == null || odsetki < 0)) {
      bledy.push(`Rata ${nr}: nieprawidłowa kwota odsetek.`);
    }
    if (!isBlank(o.prowizja) && (prowizja == null || prowizja < 0)) {
      bledy.push(`Rata ${nr}: nieprawidłowa kwota prowizji.`);
    }
    if (bledy.length > przed) return;
    if ((odsetki ?? 0) + (prowizja ?? 0) > (kwota as number) + 0.005) {
      bledy.push(`Rata ${nr}: odsetki i prowizja przekraczają kwotę raty.`);
      return;
    }
    ok.push({ termin, kwota, odsetki, prowizja });
  });
  return { harmonogram: bledy.length ? null : normalizeHarmonogram(ok), bledy };
}

/** Krótki opis harmonogramu do zdarzenia w aktach: „12 rat, 94 421,65 zł, 10.07.2026–10.06.2027". */
export function opisHarmonogramu(h: WindRata[] | null | undefined): string {
  if (!h || h.length === 0) return "brak harmonogramu";
  const suma = round2(h.reduce((s, r) => s + r.kwota, 0));
  const pl = (iso: string) => iso.split("-").reverse().join(".");
  const zl = suma.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${h.length} ${odmianaRat(h.length)}, ${zl} zł, ${pl(h[0].termin)}–${pl(h[h.length - 1].termin)}`;
}

/** 1 rata, 2–4 raty (poza 12–14), pozostałe: rat. */
function odmianaRat(n: number): string {
  if (n === 1) return "rata";
  const j = n % 10;
  const d = n % 100;
  return j >= 2 && j <= 4 && (d < 12 || d > 14) ? "raty" : "rat";
}
