/** Kwalifikacja niezależna od kanałów. Nigdy nie jest zgodą na kontakt z dłużnikiem. */
import { assembleStartPackage, type SourceFacts, type SubmittedClaim } from "./core";

export type QualificationStatus = "qualified" | "needs_documents" | "rejected";
export interface QualificationResult {
  status: QualificationStatus;
  reasons: string[];
}
export interface QualificationInput {
  claim: SubmittedClaim;
  facts: SourceFacts;
  creditorKind: "person" | "business" | "company";
  identityVerified: boolean;
  identityMatchesCreditor: boolean;
  creditorRepresentationVerified: boolean;
  creditorDeclaredNoPayment: boolean;
  creditorDeclaredNoDispute: boolean;
  today: string;
}
export function qualifyWindykatorCase(i: QualificationInput): QualificationResult {
  const rejected: string[] = [];
  const missing: string[] = [];
  if (!i.identityVerified || !i.identityMatchesCreditor) {
    rejected.push("Nie potwierdzono tożsamości wierzyciela.");
  }
  if (!i.creditorRepresentationVerified) {
    missing.push("Brak zweryfikowanego umocowania wierzyciela lub reprezentanta.");
  }
  if (i.claim.dueDate > i.today) rejected.push("Termin wymagalności jeszcze nie nastąpił.");
  if (!i.creditorDeclaredNoPayment) missing.push("Nie ma aktualnego oświadczenia o niezapłaceniu należności.");
  if (!i.creditorDeclaredNoDispute) missing.push("Należność jest sporna albo status sporu pozostaje nieustalony.");
  const parsed = assembleStartPackage(i.claim, i.facts, i.today);
  if (!parsed.ready) missing.push(...parsed.warnings.filter(x =>
    /Nie potwierdzono|Nieprawidłowa|Niepotwierdzona wymagalność|Nie rozpoznano|Rodzaj dokumentu nie odpowiada|Termin z dokumentu różni|Wskazane braki/.test(x)
  ));
  // W modelu bez ręcznej akceptacji nie akceptujemy pożyczki bez dowodu wypłaty.
  if (i.claim.claimKind === "loan" &&
      !i.facts.evidence.some(x => /przelew|wypłat|przekazan|potwierdzenie zapłaty/i.test(x))) {
    missing.push("Wymagany dowód przekazania kwoty pożyczki.");
  }
  // Spółki i JDG nie mogą ominąć weryfikacji reprezentacji zwykłym checkboxem.
  if (i.creditorKind !== "person" && !i.creditorRepresentationVerified) {
    missing.push("Weryfikacja danych firmy oraz reprezentacji jest niedostępna w tym etapie.");
  }
  if (rejected.length) return { status: "rejected", reasons: [...new Set(rejected)] };
  if (missing.length) return { status: "needs_documents", reasons: [...new Set(missing)] };
  return { status: "qualified", reasons: [] };
}

/** Checkout nie może polegać na ustawionym przez przeglądarkę statusie. */
export function mayPurchaseQualifiedCase(input: {
  status: string;
  qualifiedAt: string | null;
  now: string;
  identityValid: boolean;
}): boolean {
  if (input.status !== "qualified" || !input.identityValid || !input.qualifiedAt) return false;
  const age = Date.parse(input.now) - Date.parse(input.qualifiedAt);
  return Number.isFinite(age) && age >= 0 && age <= 7 * 86400000;
}
