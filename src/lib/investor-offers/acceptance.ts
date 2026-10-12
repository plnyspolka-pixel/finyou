// Model indywidualnego dopasowania 1:1: inwestor składa NIEWIĄŻĄCĄ propozycję
// warunków finansowania („Zaproponuj indywidualne warunki finansowania").
// Dopiero akceptacja uprawnionej strony (administrator, operator,
// pożyczkobiorca albo pośrednik wniosku) odblokowuje dalszy etap: weryfikację,
// kompletowanie danych i przygotowanie dokumentów umowy. Do tego momentu
// propozycja nie jest umową ani przyjęciem oferty.
//
// Propozycje składane z konta, które ma jednocześnie profil inwestora i rolę
// administratora, są akceptowane automatycznie (trigger w bazie:
// investor_offers_guard_status — tu tylko lustrzana reguła dla UI i testów).

/**
 * Statusy, w których propozycja została zaakceptowana przez uprawnioną stronę.
 * Tylko te odblokowują pobranie danych klienta i KW do umowy oraz tworzenie
 * umowy — nie ma ścieżki obejścia (także „Ujawnienie" w „Moich zleceniach").
 */
export const OFFER_ACCEPTED_STATUSES = [
  "zatwierdzona_przez_administratora",
  "zaakceptowana_przez_klienta",
] as const;

/** Statusy złożonej propozycji, która czeka na decyzję. */
export const OFFER_PENDING_STATUSES = ["zlozona", "w_trakcie_weryfikacji"] as const;

export function isOfferAccepted(status: string | null | undefined): boolean {
  return (OFFER_ACCEPTED_STATUSES as readonly string[]).includes(status ?? "");
}

export function isOfferPending(status: string | null | undefined): boolean {
  return (OFFER_PENDING_STATUSES as readonly string[]).includes(status ?? "");
}

/** Strona uprawniona do decyzji o propozycji. */
export type OfferDecider = "administrator" | "operator" | "pozyczkobiorca" | "posrednik";

export type OfferDecision = "accept" | "reject";

/** Z jakich statusów dana strona może podjąć decyzję. */
export function decidableFrom(decider: OfferDecider): string[] {
  if (decider === "administrator" || decider === "operator") return [...OFFER_PENDING_STATUSES];
  // Pożyczkobiorca / pośrednik: także po zatwierdzeniu przez administratora
  // i przekazaniu klientowi.
  return [...OFFER_PENDING_STATUSES, "zatwierdzona_przez_administratora", "wyslana_do_klienta"];
}

/** Status docelowy po decyzji danej strony. */
export function statusAfterDecision(decider: OfferDecider, decision: OfferDecision): string {
  const staff = decider === "administrator" || decider === "operator";
  if (decision === "accept") {
    return staff ? "zatwierdzona_przez_administratora" : "zaakceptowana_przez_klienta";
  }
  return staff ? "odrzucona_przez_administratora" : "odrzucona_przez_klienta";
}

/**
 * Auto-akceptacja: konto z uprawnieniami inwestora i administratora.
 * Lustro reguły z triggera bazy (tam decyduje has_role(..., 'administrator')).
 */
export function shouldAutoAccept(roles: readonly string[], hasInvestorProfile: boolean): boolean {
  return hasInvestorProfile && roles.includes("administrator");
}
