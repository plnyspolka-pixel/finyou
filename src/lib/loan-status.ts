// JEDYNE źródło prawdy dla cyklu życia wniosku pożyczkowego.
// Jeden zestaw statusów (sprzątanie spójności 2026-09, Etap 4) — używany w
// całym systemie (pośrednik/admin/klient/voicebot/MCP/e-maile).
//
// Enum `public.loan_status` w bazie zawiera dodatkowo starsze wartości (dla
// wstecznej kompatybilności historii), ale dane zostały zmapowane migracją
// `20260929154000_etap4_statusy_wniosku.sql`, a UI pokazuje tylko nowe.
//
// Decyzja nadrzędna nr 11: statusy ODRZUCAJĄCE (`nie_rokuje`,
// `wniosek_odrzucony`) nigdy nie są nadawane automatycznie — automat może
// je tylko ZAPROPONOWAĆ (`suggested_status`), a operator zatwierdza.

/** Kanoniczna, chronologiczna kolejność statusów (ścieżka główna). */
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
  "zamkniety",
  "archiwalny",
  // statusy boczne
  "wniosek_odrzucony",
  "brak_kontaktu",
] as const;

export type LoanStatus = (typeof LOAN_STATUS_ORDER)[number];

/** Statusy odrzucające — wyłącznie decyzja operatora (kliknięcie), nigdy automat. */
export const REJECTING_STATUSES: readonly LoanStatus[] = ["nie_rokuje", "wniosek_odrzucony"];

/** Statusy końcowe (sprawa zamknięta / archiwum / odrzucona). */
export const TERMINAL_STATUSES: readonly LoanStatus[] = [
  "zamkniety",
  "archiwalny",
  "wniosek_odrzucony",
  "nie_rokuje",
];

/** Statusy, w których wniosek jest u inwestorów lub dalej (po dystrybucji). */
export const DISTRIBUTED_STATUSES: readonly LoanStatus[] = [
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
];

/** Statusy „w kompletowaniu" (braki po stronie klienta). */
export const INCOMPLETE_STATUSES: readonly LoanStatus[] = [
  "nowy_lead",
  "w_trakcie_uzupelniania",
  "braki_w_dokumentach",
  "do_kontaktu",
  "w_follow_upie",
  "brak_kontaktu",
];

export function isRejectingStatus(status: string | null | undefined): boolean {
  return (REJECTING_STATUSES as readonly string[]).includes(String(status ?? ""));
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(normalizeLoanStatus(status));
}

/** Krótkie etykiety do UI (badge, lista, dropdown). */
export const LOAN_STATUS_SHORT_LABELS: Record<LoanStatus, string> = {
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
  zamkniety: "Zamknięty",
  archiwalny: "Archiwalny",
  wniosek_odrzucony: "Wniosek odrzucony",
  brak_kontaktu: "Brak kontaktu",
};

/**
 * Mapowanie STARYCH wartości (sprzed Etapu 4 i jeszcze starszych) na nowy
 * zestaw — to samo, co w migracji SQL. Zostaje na zawsze: historia statusów
 * (`loan_status_history`) i stare linki mogą nieść stare kody.
 */
export const LEGACY_STATUS_MAP: Record<string, LoanStatus> = {
  kontakt: "do_kontaktu",
  kompletowanie_danych: "braki_w_dokumentach",
  brak_kw: "braki_w_dokumentach",
  brak_zdjec_dokumentow: "braki_w_dokumentach",
  brak_kwoty: "braki_w_dokumentach",
  szukamy_inwestora: "wyslany_do_inwestorow",
  warunki_zaakceptowane: "zaakceptowany_przez_klienta",
  dokumenty_przygotowanie_umowy: "do_umowy",
  notariusz: "oczekuje_ustanowienia_zabezpieczen",
  zamkniete: "zamkniety",
};

/** Normalizacja dowolnego kodu statusu do jednego z kanonicznych. */
export function normalizeLoanStatus(status: string | null | undefined): LoanStatus {
  if (!status) return "nowy_lead";
  if ((LOAN_STATUS_ORDER as readonly string[]).includes(status)) return status as LoanStatus;
  return LEGACY_STATUS_MAP[status] ?? "nowy_lead";
}

/** Etykieta gotowa do wyświetlenia (dowolny kod → tekst). */
export function loanStatusLabel(status: string | null | undefined): string {
  return LOAN_STATUS_SHORT_LABELS[normalizeLoanStatus(status)];
}

/** Pełne, opisowe komunikaty (voicebot / panel operatora). */
export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  nowy_lead: "Nowy lead — czekamy na pierwszy kontakt",
  w_trakcie_uzupelniania: "W trakcie uzupełniania — klient dopisuje dane wniosku",
  braki_w_dokumentach: "Braki w dokumentach — brakuje kwoty, numeru KW, zdjęć lub dokumentów",
  do_kontaktu: "Do kontaktu — pośrednik ma skontaktować się z klientem",
  w_follow_upie: "W follow-upie — trwa sekwencja przypomnień o brakach",
  wniosek_kompletny: "Wniosek kompletny — komplet danych i dokumentów",
  do_analizy: "Do analizy — wniosek czeka na ocenę operatora",
  rokuje: "Rokuje — pozytywna ocena operatora, wniosek idzie do inwestorów",
  nie_rokuje: "Nie rokuje — negatywna decyzja operatora",
  wyslany_do_inwestorow: "Wysłany do inwestorów — wniosek w dystrybucji, oczekujemy na ofertę",
  oferta_od_inwestora: "Oferta od inwestora — otrzymaliśmy propozycję finansowania",
  oferta_przekazana_klientowi: "Oferta przekazana klientowi — czekamy na decyzję klienta",
  zaakceptowany_przez_klienta: "Warunki zaakceptowane przez klienta",
  do_umowy: "Do umowy — przygotowujemy dokumenty i treść umowy",
  oczekuje_podpisania_umowy: "Oczekuje podpisania umowy",
  umowa_podpisana: "Umowa podpisana",
  oczekuje_ustanowienia_zabezpieczen: "Oczekuje ustanowienia zabezpieczeń (notariusz, hipoteka)",
  zabezpieczenia_ustanowione: "Zabezpieczenia ustanowione",
  dokumenty_dostarczone_do_inwestora: "Dokumenty dostarczone do inwestora",
  oczekuje_wyplaty: "Oczekuje wypłaty środków",
  wyplacony: "Wypłacony — środki przekazane (7% do Finance You, reszta klientowi)",
  zamkniety: "Sprawa zamknięta",
  archiwalny: "Archiwalny",
  wniosek_odrzucony: "Wniosek odrzucony — decyzja operatora",
  brak_kontaktu: "Brak kontaktu — brakuje imienia, nazwiska, telefonu lub e-maila",
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
  w_trakcie_uzupelniania: "kompletowanie",
  braki_w_dokumentach: "kompletowanie",
  do_kontaktu: "kompletowanie",
  w_follow_upie: "kompletowanie",
  wniosek_kompletny: "kompletowanie",
  do_analizy: "kompletowanie",
  rokuje: "inwestor",
  nie_rokuje: "kompletowanie",
  wyslany_do_inwestorow: "inwestor",
  oferta_od_inwestora: "inwestor",
  oferta_przekazana_klientowi: "inwestor",
  zaakceptowany_przez_klienta: "umowa",
  do_umowy: "umowa",
  oczekuje_podpisania_umowy: "umowa",
  umowa_podpisana: "umowa",
  oczekuje_ustanowienia_zabezpieczen: "umowa",
  zabezpieczenia_ustanowione: "umowa",
  dokumenty_dostarczone_do_inwestora: "umowa",
  oczekuje_wyplaty: "umowa",
  wyplacony: "umowa",
  zamkniety: "umowa",
  archiwalny: "umowa",
  wniosek_odrzucony: "kompletowanie",
};

const UZUPELNIJ = "Uzupełnij dane wniosku";
const UZUPELNIJ_OPIS =
  "Brakuje jeszcze części danych. Sprawdź listę poniżej i uzupełnij braki — kompletny wniosek trafia do inwestorów.";
const U_INWESTOROW = "Wniosek u inwestorów";
const U_INWESTOROW_OPIS =
  "Twój wniosek jest przedstawiany inwestorom. Jeśli spotka się z zainteresowaniem, otrzymasz konkretną ofertę finansową. Brak oferty oznacza, że wniosek na razie nie wzbudził zainteresowania.";

/** Etykiety statusów w języku klienta (statusy operacyjne zlane w jedno). */
export const CLIENT_STATUS_LABELS: Record<LoanStatus, string> = {
  nowy_lead: "Wniosek przyjęty",
  brak_kontaktu: "Uzupełnij dane kontaktowe",
  w_trakcie_uzupelniania: UZUPELNIJ,
  braki_w_dokumentach: UZUPELNIJ,
  do_kontaktu: "Wniosek w przygotowaniu",
  w_follow_upie: UZUPELNIJ,
  wniosek_kompletny: "Wniosek kompletny",
  do_analizy: "Wniosek w analizie",
  rokuje: U_INWESTOROW,
  nie_rokuje: "Wniosek bez oferty",
  wyslany_do_inwestorow: U_INWESTOROW,
  oferta_od_inwestora: U_INWESTOROW,
  oferta_przekazana_klientowi: "Masz ofertę do decyzji",
  zaakceptowany_przez_klienta: "Warunki zaakceptowane",
  do_umowy: "Przygotowujemy umowę",
  oczekuje_podpisania_umowy: "Umowa do podpisu",
  umowa_podpisana: "Umowa podpisana",
  oczekuje_ustanowienia_zabezpieczen: "Umowa u notariusza",
  zabezpieczenia_ustanowione: "Zabezpieczenia ustanowione",
  dokumenty_dostarczone_do_inwestora: "Dokumenty u inwestora",
  oczekuje_wyplaty: "Oczekujesz na wypłatę",
  wyplacony: "Środki wypłacone",
  zamkniety: "Sprawa zakończona",
  archiwalny: "Sprawa zarchiwizowana",
  wniosek_odrzucony: "Wniosek bez oferty",
};

/** Opisy statusów dla klienta — bez obietnic kontaktu z naszej strony. */
export const CLIENT_STATUS_DESCRIPTIONS: Record<LoanStatus, string> = {
  nowy_lead:
    "Twój wniosek jest w naszym systemie. Uzupełnij dane i dokumenty, aby mógł trafić do inwestorów.",
  brak_kontaktu:
    "Do dalszych kroków potrzebujemy Twoich danych kontaktowych — uzupełnij je w profilu.",
  w_trakcie_uzupelniania: UZUPELNIJ_OPIS,
  braki_w_dokumentach: UZUPELNIJ_OPIS,
  do_kontaktu:
    "Doprecyzowujemy szczegóły Twojego wniosku. Uzupełnij ewentualne braki z listy poniżej.",
  w_follow_upie: UZUPELNIJ_OPIS,
  wniosek_kompletny:
    "Mamy komplet danych i dokumentów. Wniosek czeka na ocenę przed przekazaniem inwestorom.",
  do_analizy: "Wniosek jest w analizie. Nie musisz nic robić — damy znać, gdy trafi do inwestorów.",
  rokuje: U_INWESTOROW_OPIS,
  nie_rokuje:
    "Na podstawie przekazanych danych wniosek nie został skierowany do inwestorów. Możesz złożyć nowy wniosek, jeśli zmienią się okoliczności.",
  wyslany_do_inwestorow: U_INWESTOROW_OPIS,
  oferta_od_inwestora:
    "Inwestor złożył propozycję finansowania. Przygotowujemy ją do przekazania Tobie.",
  oferta_przekazana_klientowi:
    "Masz ofertę finansowania do decyzji. Sprawdź warunki w panelu i zaakceptuj je albo odrzuć.",
  zaakceptowany_przez_klienta:
    "Warunki oferty zostały zaakceptowane. Przygotowujemy dokumenty do kolejnego kroku.",
  do_umowy: "Przygotowujemy dokumenty i treść umowy pożyczki.",
  oczekuje_podpisania_umowy: "Umowa jest gotowa do podpisu.",
  umowa_podpisana: "Umowa została podpisana. Kolejny krok to ustanowienie zabezpieczeń.",
  oczekuje_ustanowienia_zabezpieczen:
    "Umowa jest u notariusza — trwa ustanowienie zabezpieczeń (hipoteka, oświadczenia).",
  zabezpieczenia_ustanowione: "Zabezpieczenia zostały ustanowione.",
  dokumenty_dostarczone_do_inwestora:
    "Dokumenty trafiły do inwestora. Po ich weryfikacji nastąpi wypłata.",
  oczekuje_wyplaty:
    "Czekasz na wypłatę środków. Prowizja Finance You (7%, min 5 000 zł, bez VAT) jest potrącana z wypłaty — resztę otrzymasz na rachunek.",
  wyplacony: "Środki zostały wypłacone. Spłacasz raty zgodnie z harmonogramem.",
  zamkniety: "Sprawa została zakończona.",
  archiwalny: "Sprawa została zarchiwizowana.",
  wniosek_odrzucony:
    "Wniosek nie został przyjęty do dalszej obsługi. Możesz złożyć nowy wniosek, jeśli zmienią się okoliczności.",
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
  /** Decyzja odrzucająca (operator). */
  is_rejected: boolean;
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
    is_closed: s === "zamkniety" || s === "archiwalny" || s === "wyplacony",
    is_rejected: isRejectingStatus(s),
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
  const view = clientLoanStatusView(s);
  const base = {
    status_label: label,
    status_message: view.description,
    is_decision_available: false,
    is_completed: false,
    is_rejected: view.is_rejected,
  };
  switch (s) {
    case "nowy_lead":
    case "brak_kontaktu":
    case "w_trakcie_uzupelniania":
    case "braki_w_dokumentach":
    case "w_follow_upie":
      return {
        ...base,
        status_message:
          "Twój wniosek jest u nas. Uzupełnij dane i dokumenty w panelu klienta — kompletny wniosek trafia do inwestorów.",
        client_action: "Uzupełnij dane wniosku w panelu klienta.",
      };
    case "do_kontaktu":
      return {
        ...base,
        status_message: "Pośrednik doprecyzowuje szczegóły Twojego wniosku.",
        client_action: "Odpowiadaj na pytania pośrednika i przygotuj potrzebne dokumenty.",
      };
    case "wniosek_kompletny":
    case "do_analizy":
      return {
        ...base,
        status_message:
          "Mamy komplet danych. Wniosek jest w analizie przed przekazaniem inwestorom.",
        client_action: "Nie musisz nic robić — damy znać, gdy wniosek trafi do inwestorów.",
      };
    case "rokuje":
    case "wyslany_do_inwestorow":
    case "oferta_od_inwestora":
      return {
        ...base,
        status_message:
          "Szukamy inwestora dla Twojego wniosku i oczekujemy na oferty finansowania.",
        client_action:
          "Jeśli wniosek spotka się z zainteresowaniem inwestora, otrzymasz konkretną ofertę finansową.",
      };
    case "oferta_przekazana_klientowi":
      return {
        ...base,
        status_message: "Masz ofertę finansowania do decyzji.",
        client_action: "Sprawdź warunki w panelu klienta i podejmij decyzję.",
        is_decision_available: true,
      };
    case "zaakceptowany_przez_klienta":
      return {
        ...base,
        status_message: "Zaakceptowałeś warunki oferty. Przystępujemy do dokumentów.",
        client_action: "Czekaj na kontakt w sprawie umowy.",
        is_decision_available: true,
      };
    case "do_umowy":
    case "oczekuje_podpisania_umowy":
      return {
        ...base,
        status_message: "Przygotowujemy dokumenty i treść umowy.",
        client_action: "Bądź gotów na termin podpisania — damy znać z wyprzedzeniem.",
        is_decision_available: true,
      };
    case "umowa_podpisana":
    case "oczekuje_ustanowienia_zabezpieczen":
    case "zabezpieczenia_ustanowione":
    case "dokumenty_dostarczone_do_inwestora":
      return {
        ...base,
        status_message:
          "Umowa podpisana — trwa ustanowienie zabezpieczeń i przekazanie dokumentów.",
        client_action:
          "Stawić się u notariusza w umówionym terminie, jeśli jeszcze tego nie zrobiono.",
        is_decision_available: true,
      };
    case "oczekuje_wyplaty":
      return {
        ...base,
        status_message:
          "Czekasz na wypłatę. Prowizja Finance You jest potrącana z wypłaty, resztę otrzymasz na rachunek.",
        client_action: "Sprawdź, czy rachunek do wypłaty w panelu jest poprawny.",
        is_decision_available: true,
      };
    case "wyplacony":
      return {
        ...base,
        status_message: "Środki zostały wypłacone.",
        client_action: "Spłacaj raty zgodnie z harmonogramem.",
        is_completed: true,
      };
    case "zamkniety":
    case "archiwalny":
      return {
        ...base,
        status_message: "Sprawa została zamknięta.",
        client_action: "Skontaktuj się z nami, jeśli chcesz złożyć nowy wniosek.",
        is_completed: true,
      };
    case "nie_rokuje":
    case "wniosek_odrzucony":
      return {
        ...base,
        status_message:
          "Wniosek nie został skierowany do inwestorów. Możesz złożyć nowy wniosek, jeśli zmienią się okoliczności.",
        client_action: "Złóż nowy wniosek, gdy zmienią się okoliczności.",
        is_completed: true,
        is_rejected: true,
      };
    default:
      return {
        ...base,
        status_message: "Status wniosku: " + label + ".",
        client_action: "Czekaj na kontakt z naszej strony.",
      };
  }
}

// ---------------------------------------------------------------------------
// Propozycje statusu od automatu (decyzja nadrzędna nr 11)
// ---------------------------------------------------------------------------

export interface AutoStatusProposal {
  /** Status do zapisania automatycznie (null = nic nie zmieniaj). */
  apply: LoanStatus | null;
  /** Status do zaproponowania operatorowi (null = brak propozycji). */
  suggest: LoanStatus | null;
  /** Powód propozycji — do pola suggested_status_reason. */
  reason: string | null;
}

/**
 * Rozstrzyga, co automat może zrobić z wyliczonym statusem: statusy
 * odrzucające NIGDY nie są nadawane — trafiają do propozycji operatora.
 * Statusy końcowe bieżącego wniosku nie są nadpisywane.
 */
export function proposeAutoStatus(
  current: string | null | undefined,
  computed: string | null | undefined,
  reason?: string | null,
): AutoStatusProposal {
  if (!computed) return { apply: null, suggest: null, reason: null };
  const cur = normalizeLoanStatus(current);
  const next = normalizeLoanStatus(computed);
  if (isTerminalStatus(cur)) return { apply: null, suggest: null, reason: null };
  if (isRejectingStatus(next)) {
    return { apply: null, suggest: next, reason: reason ?? "Propozycja automatu" };
  }
  if (next === cur) return { apply: null, suggest: null, reason: null };
  return { apply: next, suggest: null, reason: null };
}
