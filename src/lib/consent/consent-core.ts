/**
 * Które dokumenty z consent_documents użytkownik musi (ponownie)
 * zaakceptować. Czysta funkcja — testowana jednostkowo.
 *
 * Klient: regulamin klienta (terms) i polityka prywatności (privacy).
 * Inwestor: polityka prywatności (umowy inwestora obsługuje pakiet v7).
 */
export type ConsentKind = "terms" | "privacy";
export type ConsentAudience = "klient" | "inwestor";

export const REQUIRED_CONSENTS: Record<ConsentAudience, readonly ConsentKind[]> = {
  klient: ["terms", "privacy"],
  inwestor: ["privacy"],
};

export const CONSENT_LINKS: Record<ConsentKind, { href: string; label: string }> = {
  terms: { href: "/regulamin", label: "Regulamin klienta" },
  privacy: { href: "/polityka-prywatnosci", label: "Polityka prywatności" },
};

export interface ActiveConsentDoc {
  id: string;
  kind: string;
  version: number;
  title: string;
}
export interface ConsentAcceptanceRow {
  kind: string;
  version: number;
}

export interface PendingConsent {
  id: string;
  kind: ConsentKind;
  version: number;
  title: string;
}

export function pendingConsents(
  audience: ConsentAudience,
  activeDocs: readonly ActiveConsentDoc[],
  acceptances: readonly ConsentAcceptanceRow[],
): PendingConsent[] {
  const out: PendingConsent[] = [];
  for (const kind of REQUIRED_CONSENTS[audience]) {
    // Najnowsza aktywna wersja danego rodzaju.
    const doc = activeDocs.filter((d) => d.kind === kind).sort((a, b) => b.version - a.version)[0];
    if (!doc) continue;
    const accepted = acceptances.some((a) => a.kind === kind && a.version === doc.version);
    if (!accepted) out.push({ id: doc.id, kind, version: doc.version, title: doc.title });
  }
  return out;
}
