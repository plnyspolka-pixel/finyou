// JEDYNE źródło prawdy dla cyklu życia wniosku pożyczkowego.
// Ujednolicony zestaw 9 statusów — używany w całym systemie (pośrednik/admin/klient/voicebot).
// Enum `public.loan_status` w bazie zawiera dodatkowo starsze wartości (dla wstecznej
// kompatybilności), ale wszystkie dane są zmapowane do nowych, a UI pokazuje tylko nowe.

/** Kanoniczna, chronologiczna kolejność statusów. */
export const LOAN_STATUS_ORDER = [
  "nowy_lead",
  "brak_kontaktu",
  "brak_kwoty",
  "brak_kw",
  "brak_zdjec_dokumentow",
  "kontakt",
  "kompletowanie_danych",
  "szukamy_inwestora",
  "warunki_zaakceptowane",
  "dokumenty_przygotowanie_umowy",
  "notariusz",
  "zamkniete",
] as const;

export type LoanStatus = (typeof LOAN_STATUS_ORDER)[number];

/** Krótkie etykiety do UI (badge, lista, dropdown). */
export const LOAN_STATUS_SHORT_LABELS: Record<string, string> = {
  nowy_lead: "Nowy lead",
  brak_kontaktu: "Brak kontaktu",
  brak_kwoty: "Brak kwoty pożyczki",
  brak_kw: "Brak numeru KW",
  brak_zdjec_dokumentow: "Brak zdjęć / dokumentów",
  kontakt: "Kontakt",
  kompletowanie_danych: "Kompletowanie danych",
  szukamy_inwestora: "Szukamy inwestora / oferta",
  warunki_zaakceptowane: "Warunki zaakceptowane",
  dokumenty_przygotowanie_umowy: "Dokumenty / przygotowanie umowy",
  notariusz: "Notariusz",
  zamkniete: "Zamknięte",
};

/** Mapowanie starszych wartości enuma na nowe (na wypadek gdyby jakieś się przecisnęły). */
export const LEGACY_STATUS_MAP: Record<string, LoanStatus> = {
  w_trakcie_uzupelniania: "kompletowanie_danych",
  braki_w_dokumentach: "kompletowanie_danych",
  do_kontaktu: "kontakt",
  w_follow_upie: "kontakt",
  wniosek_kompletny: "szukamy_inwestora",
  do_analizy: "szukamy_inwestora",
  rokuje: "szukamy_inwestora",
  wyslany_do_inwestorow: "szukamy_inwestora",
  oferta_od_inwestora: "szukamy_inwestora",
  oferta_przekazana_klientowi: "szukamy_inwestora",
  zaakceptowany_przez_klienta: "warunki_zaakceptowane",
  do_umowy: "dokumenty_przygotowanie_umowy",
  oczekuje_podpisania_umowy: "dokumenty_przygotowanie_umowy",
  umowa_podpisana: "notariusz",
  oczekuje_ustanowienia_zabezpieczen: "notariusz",
  zabezpieczenia_ustanowione: "zamkniete",
  dokumenty_dostarczone_do_inwestora: "zamkniete",
  oczekuje_wyplaty: "zamkniete",
  wyplacony: "zamkniete",
  wniosek_odrzucony: "zamkniete",
  nie_rokuje: "zamkniete",
  zamkniety: "zamkniete",
  archiwalny: "zamkniete",
};

/** Normalizacja dowolnego kodu statusu do jednego z 9 kanonicznych. */
export function normalizeLoanStatus(status: string | null | undefined): LoanStatus {
  if (!status) return "nowy_lead";
  if ((LOAN_STATUS_ORDER as readonly string[]).includes(status)) return status as LoanStatus;
  return LEGACY_STATUS_MAP[status] ?? "nowy_lead";
}

/** Etykieta gotowa do wyświetlenia (dowolny kod → tekst). */
export function loanStatusLabel(status: string | null | undefined): string {
  return LOAN_STATUS_SHORT_LABELS[normalizeLoanStatus(status)];
}

/** Pełne, opisowe komunikaty (voicebot / panel klienta). */
export const LOAN_STATUS_LABELS: Record<string, string> = {
  nowy_lead: "Nowy lead — czekamy na pierwszy kontakt",
  brak_kontaktu: "Brak kontaktu — brakuje imienia, nazwiska, telefonu lub e-maila",
  brak_kwoty: "Brak kwoty pożyczki — mamy dane kontaktowe, czekamy na wskazanie kwoty",
  brak_kw: "Brak numeru KW — mamy dane kontaktowe, czekamy na numer księgi wieczystej",
  brak_zdjec_dokumentow:
    "Brak zdjęć / dokumentów — potrzebujemy zdjęć nieruchomości lub innych dokumentów",
  kontakt: "W kontakcie — pośrednik prowadzi rozmowę",
  kompletowanie_danych: "Kompletowanie danych i dokumentów",
  szukamy_inwestora: "Szukamy inwestora — wniosek w dystrybucji / oczekujemy na ofertę",
  warunki_zaakceptowane: "Warunki zaakceptowane przez klienta",
  dokumenty_przygotowanie_umowy: "Przygotowujemy dokumenty i umowę",
  notariusz: "Umowa u notariusza — podpis i ustanowienie zabezpieczeń",
  zamkniete: "Sprawa zamknięta",
};

// ---------------------------------------------------------------------------
// Widok statusu dla KLIENTA (panel /klient, boty, maile) — język klienta,
// bez żargonu operacyjnego. Zasada komunikacji: NIE obiecujemy kontaktu
// analityka ani oddzwonienia — „konkretna oferta albo cisza".
// ---------------------------------------------------------------------------

/** Cztery etapy procesu widziane przez klienta (oś na karcie statusu). */
export const CLIENT_STAGES = [
  { key: "wniosek", label: "Wniosek" },
  { key: "kompletowanie", label: "Kompletowanie" },
  { key: "inwestor", label: "Szukamy inwestora" },
  { key: "umowa", label: "Umowa i wypłata" },
] as const;

export type ClientStageKey = (typeof CLIENT_STAGES)[number]["key"];

/** Status kanoniczny → etap kliencki. */
const STATUS_TO_CLIENT_STAGE: Record<LoanStatus, ClientStageKey> = {
  nowy_lead: "wniosek",
  brak_kontaktu: "wniosek",
  brak_kwoty: "kompletowanie",
  brak_kw: "kompletowanie",
  brak_zdjec_dokumentow: "kompletowanie",
  kontakt: "kompletowanie",
  kompletowanie_danych: "kompletowanie",
  szukamy_inwestora: "inwestor",
  warunki_zaakceptowane: "umowa",
  dokumenty_przygotowanie_umowy: "umowa",
  notariusz: "umowa",
  zamkniete: "umowa",
};

/** Etykiety statusów w języku klienta (statusy operacyjne braków zlane w jedno). */
export const CLIENT_STATUS_LABELS: Record<LoanStatus, string> = {
  nowy_lead: "Wniosek przyjęty",
  brak_kontaktu: "Uzupełnij dane kontaktowe",
  brak_kwoty: "Uzupełnij dane wniosku",
  brak_kw: "Uzupełnij dane wniosku",
  brak_zdjec_dokumentow: "Uzupełnij dane wniosku",
  kontakt: "Wniosek w przygotowaniu",
  kompletowanie_danych: "Uzupełnij dane wniosku",
  szukamy_inwestora: "Wniosek u inwestorów",
  warunki_zaakceptowane: "Warunki zaakceptowane",
  dokumenty_przygotowanie_umowy: "Przygotowujemy umowę",
  notariusz: "Umowa u notariusza",
  zamkniete: "Sprawa zakończona",
};

/** Opisy statusów dla klienta — bez obietnic kontaktu z naszej strony. */
export const CLIENT_STATUS_DESCRIPTIONS: Record<LoanStatus, string> = {
  nowy_lead:
    "Twój wniosek jest w naszym systemie. Uzupełnij dane i dokumenty, aby mógł trafić do inwestorów.",
  brak_kontaktu:
    "Do dalszych kroków potrzebujemy Twoich danych kontaktowych — uzupełnij je w profilu.",
  brak_kwoty:
    "Brakuje jeszcze części danych. Sprawdź listę poniżej i uzupełnij braki — kompletny wniosek trafia do inwestorów.",
  brak_kw:
    "Brakuje jeszcze części danych. Sprawdź listę poniżej i uzupełnij braki — kompletny wniosek trafia do inwestorów.",
  brak_zdjec_dokumentow:
    "Brakuje jeszcze części danych. Sprawdź listę poniżej i uzupełnij braki — kompletny wniosek trafia do inwestorów.",
  kontakt:
    "Doprecyzowujemy szczegóły Twojego wniosku. Uzupełnij ewentualne braki z listy poniżej.",
  kompletowanie_danych:
    "Brakuje jeszcze części danych. Sprawdź listę poniżej i uzupełnij braki — kompletny wniosek trafia do inwestorów.",
  szukamy_inwestora:
    "Twój wniosek jest przedstawiany inwestorom. Jeśli spotka się z zainteresowaniem, otrzymasz konkretną ofertę finansową. Brak oferty oznacza, że wniosek na razie nie wzbudził zainteresowania.",
  warunki_zaakceptowane:
    "Warunki oferty zostały zaakceptowane. Przygotowujemy dokumenty do kolejnego kroku.",
  dokumenty_przygotowanie_umowy:
    "Przygotowujemy dokumenty i treść umowy pożyczki.",
  notariusz:
    "Umowa jest u notariusza — trwa podpisanie i ustanowienie zabezpieczeń.",
  zamkniete: "Sprawa została zakończona.",
};

export interface ClientLoanStatusInfo {
  /** Znormalizowany status kanoniczny. */
  status: LoanStatus;
  label: string;
  description: string;
  stage: ClientStageKey;
  /** Indeks etapu na osi CLIENT_STAGES (0–3). */
  stage_index: number;
  /** Sprawa zamknięta — oś w pełni wypełniona. */
  is_closed: boolean;
}

/** Widok statusu dla klienta — jedyne źródło etykiet w panelu, botach i mailach. */
export function clientLoanStatusView(status: string | null | undefined): ClientLoanStatusInfo {
  const s = normalizeLoanStatus(status);
  const stage = STATUS_TO_CLIENT_STAGE[s];
  return {
    status: s,
    label: CLIENT_STATUS_LABELS[s],
    description: CLIENT_STATUS_DESCRIPTIONS[s],
    stage,
    stage_index: CLIENT_STAGES.findIndex((x) => x.key === stage),
    is_closed: s === "zamkniete",
  };
}

/** Wiadomość dla voicebota — co powiedzieć klientowi. */
export function describeLoanStatusForAgent(status: string): {
  status_label: string;
  status_message: string;
  client_action: string;
  is_decision_available: boolean;
  is_completed: boolean;
  is_rejected: boolean;
} {
  const s = normalizeLoanStatus(status);
  const label = LOAN_STATUS_SHORT_LABELS[s];
  switch (s) {
    case "nowy_lead":
    case "brak_kontaktu":
      return {
        status_label: label,
        status_message:
          "Twój wniosek jest u nas — pośrednik wkrótce się skontaktuje, aby omówić szczegóły.",
        client_action: "Odbierz telefon od naszego pośrednika.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "brak_kwoty":
      return {
        status_label: label,
        status_message: "Mamy Twoje dane kontaktowe. Czekamy jeszcze na wskazanie kwoty pożyczki.",
        client_action: "Wskaż kwotę pożyczki w panelu klienta.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "brak_kw":
      return {
        status_label: label,
        status_message:
          "Mamy Twoje dane kontaktowe. Czekamy na numer księgi wieczystej nieruchomości.",
        client_action: "Uzupełnij numer KW w panelu klienta.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "brak_zdjec_dokumentow":
      return {
        status_label: label,
        status_message: "Brakuje jeszcze zdjęć nieruchomości lub innych dokumentów.",
        client_action: "Dodaj zdjęcia nieruchomości lub dokumenty w panelu klienta.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "kontakt":
      return {
        status_label: label,
        status_message: "Jesteś w kontakcie z naszym pośrednikiem, który prowadzi Twój temat.",
        client_action: "Odpowiadaj na pytania pośrednika i przygotuj potrzebne dokumenty.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "kompletowanie_danych":
      return {
        status_label: label,
        status_message:
          "Kompletujemy dane i dokumenty do wniosku. Bez kompletu nie ruszymy dalej z inwestorami.",
        client_action: "Uzupełnij brakujące dane i dokumenty w panelu klienta.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "szukamy_inwestora":
      return {
        status_label: label,
        status_message:
          "Szukamy inwestora dla Twojego wniosku i oczekujemy na oferty finansowania.",
        client_action: "Czekaj na decyzję — poinformujemy Cię natychmiast, gdy ją otrzymamy.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
    case "warunki_zaakceptowane":
      return {
        status_label: label,
        status_message: "Zaakceptowałeś warunki oferty. Przystępujemy do dokumentów.",
        client_action: "Czekaj na kontakt w sprawie umowy.",
        is_decision_available: true,
        is_completed: false,
        is_rejected: false,
      };
    case "dokumenty_przygotowanie_umowy":
      return {
        status_label: label,
        status_message: "Przygotowujemy dokumenty i treść umowy.",
        client_action: "Bądź gotów na termin u notariusza — damy znać z wyprzedzeniem.",
        is_decision_available: true,
        is_completed: false,
        is_rejected: false,
      };
    case "notariusz":
      return {
        status_label: label,
        status_message: "Umowa jest u notariusza — trwa podpisanie i ustanowienie zabezpieczeń.",
        client_action: "Stawić się u notariusza w umówionym terminie.",
        is_decision_available: true,
        is_completed: false,
        is_rejected: false,
      };
    case "zamkniete":
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
        status_message: "Status wniosku: " + label + ".",
        client_action: "Czekaj na kontakt z naszej strony.",
        is_decision_available: false,
        is_completed: false,
        is_rejected: false,
      };
  }
}
