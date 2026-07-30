// Moduł „Follow-up braków" — budowa briefu, czyli listy KONKRETNYCH rzeczy,
// o które trzeba dopytać klienta z niekompletnym wnioskiem / wnioskiem do
// korekty. Moduł CZYSTY (bez zależności serwerowych) — używany w silniku
// (engine.server.ts), w server functions panelu i w testach.
//
// Źródła braków (w kolejności priorytetu):
//   1. Podstawowe dane wniosku — evaluateApplicationCore (application-completeness.ts).
//   2. Pytania z analizy KW — nierozwiązane znaleziska (kw_land_register_analyses),
//      w tym wysokość długu na hipotece (dział IV) i zgody współwłaścicieli (dział II).
//   3. Fallback współwłaścicieli — coowner_registry_checks, gdy analiza KW nie
//      była jeszcze uruchomiona, a w dziale II jest więcej niż jeden podmiot.
//   4. Brakujące dokumenty wg typu nieruchomości — computeLoanProgress (loan-progress.ts).

import type { CompletenessResult, MissingKey } from "@/lib/application-completeness";
import type { ProgressResult } from "@/lib/loan-progress";
import type { FindingStatus, ResolutionState } from "@/lib/kw-analysis/types";
import { STATUS_SEVERITY } from "@/lib/kw-analysis/types";

export type BriefItemKind = "core" | "kw" | "coowners" | "document";

export interface BriefItem {
  /** Stabilny klucz braku — po nim liczony jest hash briefu. */
  key: string;
  kind: BriefItemKind;
  /** Krótka etykieta (badge w panelu, skrót w SMS). */
  label: string;
  /** Pełne pytanie/prośba do klienta (mail, Messenger). */
  question: string;
  /** Dokumenty do dosłania w ramach tego punktu. */
  documents: string[];
}

export interface MissingInfoBrief {
  items: BriefItem[];
  /** Stabilny hash zestawu braków — do wykrywania zmian między tickami. */
  hash: string;
}

/** Statusy znalezisk KW, które wymagają reakcji klienta. */
const KW_ACTIONABLE_STATUSES: ReadonlySet<FindingStatus> = new Set([
  "STOP",
  "WSTRZYMANE",
  "WARUNKOWO_DOPUSZCZALNE",
]);

/** Stany rozwiązania, w których pytanie do klienta jest nadal otwarte. */
const KW_OPEN_RESOLUTIONS: ReadonlySet<ResolutionState> = new Set([
  "UNRESOLVED",
  "DOCUMENTS_REQUESTED",
]);

/** Pytania do klienta dla braków podstawowych. */
const CORE_QUESTIONS: Record<MissingKey, { label: string; question: string }> = {
  name: {
    label: "imię i nazwisko",
    question: "Potwierdź proszę swoje pełne imię i nazwisko — potrzebujemy ich do wniosku.",
  },
  contact: {
    label: "telefon lub e-mail",
    question: "Podaj proszę numer telefonu lub adres e-mail, pod którym możemy się kontaktować.",
  },
  amount: {
    label: "kwota pożyczki",
    question: "Jakiej kwoty pożyczki potrzebujesz? Bez kwoty nie możemy przygotować oferty.",
  },
  kw: {
    label: "numer księgi wieczystej",
    question:
      "Prześlij proszę poprawny numer księgi wieczystej nieruchomości (format XX0X/00000000/0). Znajdziesz go w akcie notarialnym lub na odpisie KW.",
  },
  media: {
    label: "zdjęcia lub dokumenty",
    question:
      "Prześlij proszę kilka zdjęć nieruchomości (z zewnątrz i w środku) albo podstawowe dokumenty — to przyspieszy wycenę.",
  },
};

/** Minimalny kształt znaleziska KW potrzebny do briefu (podzbiór KwFinding). */
export interface BriefKwFinding {
  id: string;
  ruleId: string;
  status: FindingStatus;
  title: string;
  /** Gotowy komunikat dla klienta z silnika reguł. */
  clientMessage?: string | null;
  /** Czego oczekujemy od klienta. */
  expectedFromClient?: string | null;
  requestedDocuments?: Array<{ code: string; label: string }> | null;
}

export interface BuildBriefInput {
  core: CompletenessResult;
  /** null, gdy nie da się policzyć postępu (brak nieruchomości). */
  progress: Pick<ProgressResult, "missing_documents"> | null;
  /** Znaleziska z NAJNOWSZEJ analizy KW dla wniosku (result_json.findings). */
  kwFindings: BriefKwFinding[];
  /** Najświeższy stan rozwiązania per finding_id (kw_finding_resolutions). */
  kwResolutionByFindingId: Record<string, ResolutionState>;
  /** Liczba podmiotów w dziale II KW (coowner_registry_checks) — fallback. */
  coownersTotalInKw?: number | null;
}

/** Prosty, stabilny hash (djb2) — bez zależności od crypto. */
export function briefHash(keys: string[]): string {
  const joined = [...keys].sort().join("|");
  let h = 5381;
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/** Czy analiza KW wykryła współwłasność (reguła R-COOWNERS)? */
function hasCoownersFinding(findings: BriefKwFinding[]): boolean {
  return findings.some((f) => f.ruleId === "R-COOWNERS");
}

export function buildMissingInfoBrief(input: BuildBriefInput): MissingInfoBrief {
  const items: BriefItem[] = [];

  // 1) Braki podstawowe — w kanonicznej kolejności uzupełniania.
  for (const key of input.core.missing) {
    const q = CORE_QUESTIONS[key];
    items.push({
      key: `core:${key}`,
      kind: "core",
      label: q.label,
      question: q.question,
      documents: [],
    });
  }

  // 2) Pytania z analizy KW — tylko znaleziska wymagające reakcji klienta,
  //    z nadal otwartym stanem rozwiązania; najpoważniejsze najpierw.
  const openFindings = input.kwFindings
    .filter((f) => KW_ACTIONABLE_STATUSES.has(f.status))
    .filter((f) => KW_OPEN_RESOLUTIONS.has(input.kwResolutionByFindingId[f.id] ?? "UNRESOLVED"))
    .sort((a, b) => (STATUS_SEVERITY[b.status] ?? 0) - (STATUS_SEVERITY[a.status] ?? 0));
  for (const f of openFindings) {
    const question = (f.clientMessage ?? "").trim() || (f.expectedFromClient ?? "").trim();
    if (!question) continue;
    items.push({
      key: `kw:${f.ruleId}:${f.id}`,
      kind: "kw",
      label: f.title,
      question,
      documents: (f.requestedDocuments ?? []).map((d) => d.label),
    });
  }

  // 3) Fallback współwłaścicieli — tylko gdy analiza KW nie pokryła tematu
  //    (brak reguły R-COOWNERS wśród znalezisk), a rejestr wykrył >1 podmiot.
  if ((input.coownersTotalInKw ?? 0) > 1 && !hasCoownersFinding(input.kwFindings)) {
    items.push({
      key: "coowners:consent",
      kind: "coowners",
      label: "zgoda współwłaścicieli",
      question:
        "W księdze wieczystej nieruchomości wpisanych jest kilku współwłaścicieli. Do ustanowienia hipoteki potrzebna będzie zgoda WSZYSTKICH współwłaścicieli — potwierdź proszę, że pozostali współwłaściciele wiedzą o pożyczce i podpiszą oświadczenie o ustanowieniu hipoteki.",
      documents: [],
    });
  }

  // 4) Brakujące dokumenty wg typu nieruchomości.
  for (const label of input.progress?.missing_documents ?? []) {
    items.push({
      key: `doc:${label}`,
      kind: "document",
      label,
      question: `Prześlij proszę: ${label}.`,
      documents: [label],
    });
  }

  return { items, hash: briefHash(items.map((i) => i.key)) };
}
