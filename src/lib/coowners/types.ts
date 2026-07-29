// Typy modułu „Współwłaściciele (dział II KW) — CEIDG i KRS".
// Samodzielny moduł (osobna karta wniosku) — NIE jest częścią oceny ryzyka.
// Bezpieczne do importu po stronie klienta i serwera.
//
// Dla każdej osoby fizycznej wpisanej w dziale II KW (identyfikowanej po PESEL
// z księgi) sprawdzamy: (1) czy prowadzi działalność gospodarczą (CEIDG),
// (2) czy figuruje w KRS (zarząd, wspólnik, prokurent…). Obecność w KRS
// weryfikujemy twardo odpisem z API MS — odpis zawiera PESEL osób, więc
// dopasowanie po PESEL daje pewność. UWAGA (RODO): w wyniku zapisujemy
// wyłącznie zamaskowany PESEL (6 cyfr daty + gwiazdki).

import type { CeidgActivity } from "@/lib/risk-assessment/types";

export interface CoOwnerKrsHit {
  krs: string;
  companyName: string;
  legalForm: string | null;
  /** Funkcja osoby w podmiocie (np. „PREZES ZARZĄDU", „wspólnik"). */
  role: string | null;
  /** Status podmiotu (Aktywny / W likwidacji / W upadłości / Wykreślony z KRS). */
  companyStatus: string;
  /** PESEL osoby w odpisie KRS zgodny z PESEL z działu II KW — dopasowanie pewne. */
  peselMatched: boolean;
  /** Imię i nazwisko zgodne z odpisem (gdy PESEL w odpisie zamaskowany/nieobecny). */
  nameMatched: boolean;
  flags: { liquidation: boolean; bankruptcy: boolean; restructuring: boolean };
}

export interface CoOwnerKrsCheck {
  /** Czy sprawdzenie w ogóle mogło się odbyć (klucze API, dane osoby). */
  available: boolean;
  /** Znaleziono osobę w KRS (zweryfikowaną odpisem). */
  found: boolean;
  /** high = PESEL zgodny w odpisie KRS; medium = zgodność imienia i nazwiska w odpisie. */
  matchConfidence: "high" | "medium" | "none";
  hits: CoOwnerKrsHit[];
  note: string;
}

export interface CoOwnerRegistryCheck {
  fullName: string | null;
  /** Zamaskowany PESEL z działu II KW (RRMMDD*****) — pełny numer nie jest zapisywany. */
  peselMasked: string | null;
  peselValid: boolean;
  birthDate: string | null;
  age: number | null;
  sex: "M" | "K" | null;
  /** Osoba tożsama z głównym wnioskodawcą (klientem wniosku). */
  isPrimaryClient: boolean;
  /** Działalność gospodarcza (CEIDG). */
  ceidg: CeidgActivity;
  /** Obecność w KRS. */
  krs: CoOwnerKrsCheck;
  notes: string[];
}

export interface CoOwnersAnalysis {
  available: boolean;
  kwNumber: string | null;
  generatedAt: string;
  /** Liczba podmiotów rozpoznanych w dziale II KW (osoby fizyczne + prawne). */
  totalOwnersInKw: number;
  /** Sprawdzone osoby fizyczne z działu II. */
  checked: CoOwnerRegistryCheck[];
  warnings: string[];
  summary: string;
}
