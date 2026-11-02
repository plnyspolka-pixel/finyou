// Wynik dodatkowego wywiadu gospodarczego. Bez pełnych identyfikatorów PESEL.
// Trafienia giełd długów są niezweryfikowanymi ogłoszeniami, nie ustaleniem sądowym.
export type OwnerIntelligenceSubjectKind = "person" | "company";
export type OwnerIntelligenceSourceStatus = "checked" | "unavailable" | "partial";
export type OwnerIntelligenceMatch = "identifier" | "name_only";

export interface OwnerIntelligenceHit {
  source: string;
  category: "court_notice" | "debt_exchange";
  title: string;
  detail: string | null;
  publicationDate: string | null;
  caseSignature: string | null;
  url: string;
  match: OwnerIntelligenceMatch;
}

export interface OwnerIntelligenceSubject {
  name: string;
  kind: OwnerIntelligenceSubjectKind;
  courtStatus: OwnerIntelligenceSourceStatus;
  courtNote: string;
  exchangesStatus: OwnerIntelligenceSourceStatus;
  exchangesNote: string;
  hits: OwnerIntelligenceHit[];
}

export interface OwnerIntelligenceReport {
  checkedAt: string;
  subjects: OwnerIntelligenceSubject[];
  note: string;
}
