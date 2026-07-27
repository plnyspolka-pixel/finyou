// Wzbogacenie computeLoanProgress o akcjonowalne CTA dla klienta.
// Zwraca listę braków z deep-linkami do konkretnych sekcji panelu klienta
// oraz "next step" — jedyną rzecz, którą klient powinien zrobić teraz.

import { computeLoanProgress, type ProgressInput, type ProgressResult } from "./loan-progress";

export type MissingSection =
  | "kontakt"
  | "zabezpieczenie"
  | "nieruchomosc"
  | "dokumenty"
  | "opis"
  | "warunki";

export interface MissingItem {
  kind: string;
  label: string;
  section: MissingSection;
  ctaHref: string;
  ctaLabel: string;
  hint?: string;
}

export interface NextStep {
  section: MissingSection | "gotowe";
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}

export interface ProgressFlags {
  hasLoan: boolean;
  hasContact: boolean;
  hasPropertyType: boolean;
  hasLoanTerms: boolean;
  hasInvestorDescription: boolean;
}

export interface EnrichedProgress extends ProgressResult {
  missing: MissingItem[];
  next_step: NextStep;
  flags: ProgressFlags;
}

const DOCS_HREF = "/klient";

function docCta(label: string): { ctaHref: string; ctaLabel: string } {
  return { ctaHref: DOCS_HREF, ctaLabel: `Wgraj: ${label}` };
}

function kindToMissingItem(kind: string, label: string): MissingItem {
  switch (kind) {
    case "kw_number":
      return { kind, label, section: "dokumenty", ctaHref: DOCS_HREF, ctaLabel: "Dodaj numer KW" };
    case "usable_area":
      return {
        kind,
        label,
        section: "nieruchomosc",
        ctaHref: DOCS_HREF,
        ctaLabel: "Uzupełnij powierzchnię",
      };
    case "mpzp":
    case "land_registry":
    case "photos_exterior":
    case "photos_interior":
      return { kind, label, section: "dokumenty", ...docCta(label) };
    default:
      return { kind, label, section: "dokumenty", ...docCta(label) };
  }
}

export function enrichLoanProgress(base: ProgressResult, ctx: ProgressFlags): EnrichedProgress {
  // Lista braków dokumentowych z metadanymi
  const missing: MissingItem[] = base.required_documents
    .filter((r) => base.missing_documents_kinds.includes(r.kind))
    .map((r) => kindToMissingItem(r.kind, r.label));

  // Wyznaczamy „next step" — pierwsza rzecz do zrobienia
  const WNIOSEK_HREF = "/klient";
  let next_step: NextStep;
  if (!ctx.hasLoan) {
    next_step = {
      section: "zabezpieczenie",
      title: "Rozpocznij wniosek",
      description:
        "Wypełnij krótki wniosek krok po kroku — wybierzesz kwotę, okres i zabezpieczenie.",
      ctaHref: WNIOSEK_HREF,
      ctaLabel: "Rozpocznij wniosek",
    };
  } else if (!ctx.hasContact) {
    next_step = {
      section: "kontakt",
      title: "Uzupełnij dane kontaktowe",
      description:
        "Potrzebujemy Twojego imienia, telefonu i e-maila, żebyśmy mogli się z Tobą skontaktować.",
      ctaHref: "/klient/profil",
      ctaLabel: "Uzupełnij dane",
    };
  } else if (!ctx.hasPropertyType) {
    next_step = {
      section: "zabezpieczenie",
      title: "Wróć do wniosku",
      description: "Wskaż w wniosku, jaką nieruchomością chcesz zabezpieczyć pożyczkę.",
      ctaHref: WNIOSEK_HREF,
      ctaLabel: "Otwórz wniosek",
    };
  } else if (!ctx.hasLoanTerms) {
    next_step = {
      section: "warunki",
      title: "Dokończ warunki we wniosku",
      description: "Określ we wniosku kwotę, okres i maksymalną ratę miesięczną.",
      ctaHref: WNIOSEK_HREF,
      ctaLabel: "Otwórz wniosek",
    };
  } else if (missing.length > 0) {
    next_step = {
      section: "dokumenty",
      title:
        missing.length === 1
          ? `Wgraj: ${missing[0].label}`
          : `Brakuje ${missing.length} dokumentów`,
      description:
        missing.length === 1
          ? "To ostatni dokument, którego potrzebujemy do tego typu nieruchomości."
          : "Wgraj brakujące dokumenty we wniosku — to przyspieszy ocenę.",
      ctaHref: WNIOSEK_HREF,
      ctaLabel: "Otwórz wniosek",
    };
  } else if (!ctx.hasInvestorDescription) {
    next_step = {
      section: "opis",
      title: "Wróć do wniosku i wyślij",
      description: "Sprawdź całość i wyślij wniosek do analizy.",
      ctaHref: WNIOSEK_HREF,
      ctaLabel: "Otwórz wniosek",
    };
  } else {
    next_step = {
      section: "gotowe",
      title: "Wniosek kompletny",
      description:
        "Twój wniosek jest pełny i czeka na ocenę przez inwestorów. Powiadomimy Cię o postępach.",
      ctaHref: "/klient",
      ctaLabel: "Zobacz wniosek",
    };
  }

  return {
    ...base,
    missing,
    next_step,
    flags: ctx,
  };
}
