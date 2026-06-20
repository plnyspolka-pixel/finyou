// JEDYNE źródło prawdy dla cyklu życia wniosku pożyczkowego.
// Klucze są zsynchronizowane 1:1 z enumem `public.loan_status` w bazie
// (migracje 20260518124329 + 20260608082656).
//
// Dwie mapy o różnym przeznaczeniu:
//  - LOAN_STATUS_SHORT_LABELS — krótkie etykiety do badge'ów, list, dropdownów w UI.
//  - LOAN_STATUS_LABELS        — pełne, opisowe komunikaty dla klienta (voicebot, panel klienta).

/** Kolejność chronologiczna cyklu życia wniosku — używana do dropdownów i sortowania. */
export const LOAN_STATUS_ORDER = [
  "nowy_lead",
  "w_trakcie_uzupelniania",
  "braki_w_dokumentach",
  "do_kontaktu",
  "w_follow_upie",
  "wniosek_kompletny",
  "do_analizy",
  "rokuje",
  "nie_rokuje",
  "wyslany_do_inwestorow",
  "oferta_od_inwestora",
  "oferta_przekazana_klientowi",
  "zaakceptowany_przez_klienta",
  "do_umowy",
  "oczekuje_podpisania_umowy",
  "umowa_podpisana",
  "oczekuje_ustanowienia_zabezpieczen",
  "zabezpieczenia_ustanowione",
  "dokumenty_dostarczone_do_inwestora",
  "oczekuje_wyplaty",
  "wyplacony",
  "wniosek_odrzucony",
  "zamkniety",
  "archiwalny",
] as const;

export type LoanStatus = (typeof LOAN_STATUS_ORDER)[number];

/** Krótkie etykiety do UI (badge, lista, dropdown zmiany statusu). */
export const LOAN_STATUS_SHORT_LABELS: Record<string, string> = {
  nowy_lead: "Nowy lead",
  w_trakcie_uzupelniania: "W trakcie uzupełniania",
  braki_w_dokumentach: "Braki w dokumentach",
  do_kontaktu: "Do kontaktu",
  w_follow_upie: "W follow-upie",
  wniosek_kompletny: "Wniosek kompletny",
  do_analizy: "Do analizy",
  rokuje: "Rokuje",
  nie_rokuje: "Nie rokuje",
  wyslany_do_inwestorow: "Wysłany do inwestorów",
  oferta_od_inwestora: "Oferta od inwestora",
  oferta_przekazana_klientowi: "Oferta przekazana klientowi",
  zaakceptowany_przez_klienta: "Zaakceptowany przez klienta",
  do_umowy: "Do umowy",
  oczekuje_podpisania_umowy: "Oczekuje podpisania umowy",
  umowa_podpisana: "Umowa podpisana",
  oczekuje_ustanowienia_zabezpieczen: "Oczekuje ustanowienia zabezpieczeń",
  zabezpieczenia_ustanowione: "Zabezpieczenia ustanowione",
  dokumenty_dostarczone_do_inwestora: "Dokumenty dostarczone do inwestora",
  oczekuje_wyplaty: "Oczekuje wypłaty",
  wyplacony: "Wypłacony",
  wniosek_odrzucony: "Wniosek odrzucony",
  zamkniety: "Zamknięty",
  archiwalny: "Archiwalny",
};

/** Pełne, opisowe komunikaty (voicebot / panel klienta). */
export const LOAN_STATUS_LABELS: Record<string, string> = {
  // przed analizą
  nowy_lead: "Nowy lead",
  w_trakcie_uzupelniania: "W trakcie uzupełniania",
  braki_w_dokumentach: "Braki w dokumentach",
  do_kontaktu: "Do kontaktu",
  w_follow_upie: "W follow-upie",
  wniosek_kompletny: "Wniosek kompletny",
  do_analizy: "Wniosek złożony, czeka na analizę",
  rokuje: "W analizie — rokuje pozytywnie",
  nie_rokuje: "W analizie — nie rokuje",
  // u inwestorów
  wyslany_do_inwestorow: "Wniosek wysłany do inwestorów — oczekujemy na decyzję",
  oferta_od_inwestora: "Otrzymaliśmy decyzję od inwestora",
  oferta_przekazana_klientowi: "Decyzja inwestora dostępna w panelu klienta",
  // klient zaakceptował
  zaakceptowany_przez_klienta: "Klient zaakceptował ofertę inwestora",
  do_umowy: "Przygotowujemy dokumenty do umowy",
  oczekuje_podpisania_umowy: "Umowa oczekuje na podpisanie",
  umowa_podpisana: "Umowa podpisana",
  oczekuje_ustanowienia_zabezpieczen: "Oczekujemy na ustanowienie zabezpieczeń",
  zabezpieczenia_ustanowione: "Zabezpieczenia ustanowione",
  dokumenty_dostarczone_do_inwestora: "Dokumenty dostarczone do inwestora — czekamy na wypłatę",
  oczekuje_wyplaty: "Oczekujemy na wypłatę pożyczki od inwestora",
  wyplacony: "Pożyczka wypłacona",
  // końcowe
  wniosek_odrzucony: "Wniosek odrzucony",
  zamkniety: "Zamknięty",
  archiwalny: "Archiwalny — wniosek nie przeszedł",
};

/** Pełna wiadomość dla agenta voicebot — co powiedzieć klientowi przy zapytaniu o status. */
export function describeLoanStatusForAgent(status: string): {
  status_label: string;
  status_message: string;
  client_action: string;
  is_decision_available: boolean;
  is_completed: boolean;
  is_rejected: boolean;
} {
  const label = LOAN_STATUS_LABELS[status] ?? status;
  switch (status) {
    case "nowy_lead":
    case "w_trakcie_uzupelniania":
    case "braki_w_dokumentach":
    case "do_kontaktu":
    case "w_follow_upie":
      return {
        status_label: label,
        status_message:
          "Wniosek nie jest jeszcze kompletny. Aby ruszyć dalej, musisz uzupełnić brakujące dane i dokumenty w swoim panelu klienta.",
        client_action: "Uzupełnij brakujące dane w panelu klienta.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "wniosek_kompletny":
    case "do_analizy":
    case "rokuje":
      return {
        status_label: label,
        status_message:
          "Wniosek został złożony i jest w trakcie analizy. Niedługo wyślemy go do inwestorów.",
        client_action: "Czekaj — analiza zwykle trwa do kilku dni roboczych.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "wyslany_do_inwestorow":
      return {
        status_label: label,
        status_message:
          "Wniosek został wysłany do inwestorów. W dalszym ciągu oczekujemy na ich decyzję.",
        client_action:
          "Czekaj na decyzję inwestora — poinformujemy cię natychmiast, gdy ją dostaniemy.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "oferta_od_inwestora":
    case "oferta_przekazana_klientowi":
      return {
        status_label: label,
        status_message:
          "Dostaliśmy decyzję inwestora. Możesz ją zobaczyć i zaakceptować lub odrzucić w swoim panelu klienta.",
        client_action: "Zaloguj się do panelu klienta i zaakceptuj lub odrzuć ofertę inwestora.",
        is_decision_available: true,
        is_completed: false,
        is_rejected: false,
      };
    case "zaakceptowany_przez_klienta":
    case "do_umowy":
    case "oczekuje_podpisania_umowy":
      return {
        status_label: label,
        status_message:
          "Zaakceptowałeś ofertę inwestora. Umowa jest gotowa lub w przygotowaniu i oczekuje na podpisanie.",
        client_action:
          "Podpisz umowę — instrukcję znajdziesz w panelu klienta lub w wiadomości od nas.",
        is_decision_available: true,
        is_completed: false,
        is_rejected: false,
      };
    case "umowa_podpisana":
    case "oczekuje_ustanowienia_zabezpieczen":
      return {
        status_label: label,
        status_message: "Umowa została podpisana. Oczekujemy teraz na ustanowienie zabezpieczeń.",
        client_action: "Postępuj zgodnie z instrukcją ustanowienia zabezpieczeń.",
        is_decision_available: true,
        is_completed: false,
        is_rejected: false,
      };
    case "zabezpieczenia_ustanowione":
      return {
        status_label: label,
        status_message:
          "Zabezpieczenia zostały ustanowione. Teraz dostarczamy komplet dokumentów do inwestora.",
        client_action: "Nic nie musisz robić — pracujemy nad dostarczeniem dokumentów.",
        is_decision_available: true,
        is_completed: false,
        is_rejected: false,
      };
    case "dokumenty_dostarczone_do_inwestora":
    case "oczekuje_wyplaty":
      return {
        status_label: label,
        status_message:
          "Inwestor potwierdził otrzymanie dokumentów. Oczekujemy na wypłatę pożyczki.",
        client_action: "Czekaj na przelew od inwestora.",
        is_decision_available: true,
        is_completed: false,
        is_rejected: false,
      };
    case "wyplacony":
      return {
        status_label: label,
        status_message: "Pożyczka została wypłacona przez inwestora.",
        client_action: "Pożyczka wypłacona — gotowe.",
        is_decision_available: true,
        is_completed: true,
        is_rejected: false,
      };
    case "nie_rokuje":
    case "wniosek_odrzucony":
    case "archiwalny":
      return {
        status_label: label,
        status_message:
          "Niestety wniosek nie przeszedł — nie udało nam się znaleźć inwestora dla tego wniosku.",
        client_action: "Możesz złożyć nowy wniosek z dodatkowym/innym zabezpieczeniem.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: true,
      };
    case "zamkniety":
      return {
        status_label: label,
        status_message: "Sprawa została zamknięta.",
        client_action: "Skontaktuj się z nami, jeśli chcesz złożyć nowy wniosek.",
        is_decision_available: false,
        is_completed: true,
        is_rejected: false,
      };
    default:
      return {
        status_label: label,
        status_message: "Status wniosku: " + label + ". Skontaktujemy się z tobą wkrótce.",
        client_action: "Czekaj na kontakt z naszej strony.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
  }
}
