// Serie i formaty jako DANE (brief 5.1). Planer wybiera serię, a seria
// niesie szkielet rolki, sugerowane komponenty motion i lead magnet.
// Czysty moduł – bez I/O.
import type { Track } from "./types";

export type MotionKind =
  | "stat"
  | "range"
  | "threshold"
  | "versus"
  | "checklist"
  | "steps"
  | "keyword"
  | "mythFact"
  | "alert"
  | "cta";

export interface SeriesDef {
  slug: string;
  track: Track;
  title: string;
  /** Znacznik serii pokazywany w 1. sekundzie (rozpoznawalność formatu). */
  badge: string;
  format: "fact" | "versus" | "list" | "dont_say" | "diary" | "myth" | "steps" | "case" | "audit";
  /** Szkielet rolki (beaty) – generator scenariusza wypełnia je treścią. */
  beats: string[];
  motion: MotionKind[];
  /** Hasło lead magnetu domyślnie podpinanego pod serię. */
  defaultKeyword?: string;
  /** Cotygodniowy dłuższy odcinek (silnik nr 1). */
  weekly?: boolean;
}

const LOOP_BEAT = "puenta zapętlająca do hooka + CTA: obserwuj i skomentuj HASŁO";

export const SERIES: SeriesDef[] = [
  // ── inwestor ───────────────────────────────────────────────────────────────
  {
    slug: "czy-wiesz-ze",
    track: "inwestor",
    title: "Czy wiesz, że…",
    badge: "CZY WIESZ, ŻE…",
    format: "fact",
    beats: [
      "hook-teza w formie pytania",
      "liczba/kontrast",
      "jedno wyjaśnienie bez żargonu",
      LOOP_BEAT,
    ],
    motion: ["stat", "keyword", "cta"],
    defaultKeyword: "START",
  },
  {
    slug: "bank-vs-ty",
    track: "inwestor",
    title: "Bank vs Ty",
    badge: "BANK vs TY",
    format: "versus",
    beats: [
      "hook: co robi bank, czego nie robisz Ty?",
      "porównanie mechanizmu",
      "co z tego wynika dla Ciebie",
      LOOP_BEAT,
    ],
    motion: ["versus", "cta"],
    defaultKeyword: "START",
  },
  {
    slug: "3-bledy-inwestora",
    track: "inwestor",
    title: "3 błędy inwestora",
    badge: "3 BŁĘDY",
    format: "list",
    beats: ["hook: który błąd kosztuje najwięcej?", "błąd 1", "błąd 2", "błąd 3", LOOP_BEAT],
    motion: ["checklist", "cta"],
    defaultKeyword: "BŁĘDY",
  },
  {
    slug: "nie-mow-powiedz-inwestor",
    track: "inwestor",
    title: "Nie mów / Powiedz",
    badge: "NIE MÓW / POWIEDZ",
    format: "dont_say",
    beats: [
      "hook: tego zdania nie mów przy pożyczce pod hipotekę",
      "nie mów…",
      "powiedz…",
      "dlaczego",
      LOOP_BEAT,
    ],
    motion: ["versus", "keyword", "cta"],
    defaultKeyword: "UMOWA",
  },
  {
    slug: "dzien-x-ze-100",
    track: "inwestor",
    title: "Dzień X ze 100",
    badge: "DZIEŃ X/100",
    format: "diary",
    beats: [
      "hook: numer dnia + jedna lekcja",
      "kontekst",
      "lekcja",
      "zaobserwuj, żeby zobaczyć dzień X+1",
    ],
    motion: ["keyword", "cta"],
  },
  {
    slug: "audyt-zabezpieczenia",
    track: "inwestor",
    title: "Audyt zabezpieczenia",
    badge: "AUDYT ZABEZPIECZENIA",
    format: "audit",
    beats: [
      "hook: czy to zabezpieczenie jest wystarczające?",
      "księga wieczysta",
      "LTV i bufor",
      "lokalizacja",
      "werdykt",
      LOOP_BEAT,
    ],
    motion: ["threshold", "range", "checklist", "cta"],
    defaultKeyword: "KSIĘGA",
    weekly: true,
  },
  // ── pożyczkobiorca ─────────────────────────────────────────────────────────
  {
    slug: "bank-odmowil",
    track: "pozyczkobiorca",
    title: "Bank odmówił – co dalej?",
    badge: "BANK ODMÓWIŁ",
    format: "steps",
    beats: ["hook: bank Ci odmówił?", "dlaczego banki odmawiają", "co możesz zrobić", LOOP_BEAT],
    motion: ["steps", "cta"],
    defaultKeyword: "ODMOWA",
  },
  {
    slug: "ile-pod-nieruchomosc",
    track: "pozyczkobiorca",
    title: "Ile naprawdę możesz dostać pod nieruchomość (LTV)",
    badge: "ILE DOSTANIESZ?",
    format: "fact",
    beats: [
      "hook: ile dostaniesz pod nieruchomość wartą X?",
      "LTV na przykładzie",
      "obciążenia",
      LOOP_BEAT,
    ],
    motion: ["threshold", "stat", "cta"],
    defaultKeyword: "ILE",
  },
  {
    slug: "3-bledy-finansowanie",
    track: "pozyczkobiorca",
    title: "3 błędy przy finansowaniu pod zastaw",
    badge: "3 BŁĘDY",
    format: "list",
    beats: [
      "hook: ten błąd wydłuża finansowanie o tygodnie",
      "błąd 1",
      "błąd 2",
      "błąd 3",
      LOOP_BEAT,
    ],
    motion: ["checklist", "cta"],
    defaultKeyword: "DOKUMENTY",
  },
  {
    slug: "mit-vs-fakt",
    track: "pozyczkobiorca",
    title: "Mit vs fakt o pożyczkach pozabankowych",
    badge: "MIT vs FAKT",
    format: "myth",
    beats: ["hook: mit w formie pytania", "fakt", "co to znaczy dla Ciebie", LOOP_BEAT],
    motion: ["mythFact", "cta"],
    defaultKeyword: "PROCES",
  },
  {
    slug: "od-wniosku-do-wyplaty",
    track: "pozyczkobiorca",
    title: "Krok po kroku: od wniosku do wypłaty",
    badge: "KROK PO KROKU",
    format: "steps",
    beats: ["hook: ile trwa droga od wniosku do wypłaty?", "kroki", "co przygotować", LOOP_BEAT],
    motion: ["steps", "cta"],
    defaultKeyword: "PROCES",
  },
  {
    slug: "studium-przypadku",
    track: "pozyczkobiorca",
    title: "Studium przypadku (zanonimizowane)",
    badge: "STUDIUM PRZYPADKU",
    format: "case",
    beats: [
      "hook: sytuacja klienta (bez danych osobowych)",
      "problem",
      "rozwiązanie",
      "wynik bez kwot klienta",
      LOOP_BEAT,
    ],
    motion: ["steps", "keyword", "cta"],
    defaultKeyword: "ILE",
    weekly: true,
  },
];

export function seriesForTrack(track: Track): SeriesDef[] {
  return SERIES.filter((s) => s.track === track);
}

export function seriesBySlug(slug: string): SeriesDef | undefined {
  return SERIES.find((s) => s.slug === slug);
}

/**
 * Rolki są sprzedażowe (decyzja właściciela 27.10.2026): szkielet serii NIE ma
 * beatu o ryzyku ani karty alert — scenariusz przedstawia fakty i mechanizm
 * bez oceniania ryzyka za widza. Linia o ryzyku jest w stopce opisu publikacji
 * (RISK_LINES w compliance-rules.ts), doklejanej automatycznie.
 */
export function seriesHasRiskBeat(s: SeriesDef): boolean {
  return s.motion.includes("alert") || s.beats.some((b) => /ryzyk|zastrzeż/iu.test(b));
}
