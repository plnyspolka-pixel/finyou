// Centralne mapowanie wartości technicznych (z bazy) na polskie etykiety dla UI.

export const loanStatusLabels: Record<string, string> = {
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
  zamkniety: "Zamknięty",
  archiwalny: "Archiwalny",
};

export const propertyTypeLabels: Record<string, string> = {
  mieszkanie: "Mieszkanie",
  dom: "Dom",
  lokal_uslugowy: "Lokal usługowy",
  dzialka_budowlana: "Działka budowlana",
  grunt_rolny: "Grunt rolny",
  udzial_w_nieruchomosci: "Udział w nieruchomości",
  inna: "Inna nieruchomość",
};

export const contactChannelLabels: Record<string, string> = {
  telefon: "Telefon",
  sms: "SMS",
  email: "E-mail",
  voicebot: "Voicebot",
  notatka: "Notatka",
  system: "System",
};

export const contactDirectionLabels: Record<string, string> = {
  wychodzacy: "Wychodzący",
  przychodzacy: "Przychodzący",
  wewnetrzny: "Wewnętrzny",
};

export const investorTypeLabels: Record<string, string> = {
  indywidualny: "Indywidualny",
  instytucjonalny: "Instytucjonalny",
};

export const subscriptionPlanLabels: Record<string, string> = {
  podstawowy: "Podstawowy",
  rozszerzony: "Rozszerzony",
  profesjonalny: "Profesjonalny",
};

export const subscriptionStatusLabels: Record<string, string> = {
  aktywny: "Aktywny",
  nieaktywny: "Nieaktywny",
  wstrzymany: "Wstrzymany",
  probny: "Próbny",
};

export const distributionStatusLabels: Record<string, string> = {
  szkic: "Szkic",
  gotowe_do_wysylki: "Gotowe do wysyłki",
  wyslane: "Wysłane",
  otworzone: "Otworzone",
  odpowiedz_otrzymana: "Odpowiedź otrzymana",
  prosba_o_dodatkowe_informacje: "Prośba o dodatkowe informacje",
  oferta_otrzymana: "Oferta otrzymana",
  odrzucone: "Odrzucone",
  brak_odpowiedzi: "Brak odpowiedzi",
  zamkniete: "Zamknięte",
};

export const offerStatusLabels: Record<string, string> = {
  szkic: "Szkic",
  zlozona: "Złożona",
  w_trakcie_weryfikacji: "W trakcie weryfikacji",
  zatwierdzona_przez_administratora: "Zatwierdzona przez administratora",
  odrzucona_przez_administratora: "Odrzucona przez administratora",
  wyslana_do_klienta: "Wysłana do klienta",
  zaakceptowana_przez_klienta: "Zaakceptowana przez klienta",
  odrzucona_przez_klienta: "Odrzucona przez klienta",
  wygasla: "Wygasła",
};

export const repaymentTypeLabels: Record<string, string> = {
  miesieczna: "Spłata miesięczna",
  balonowa: "Spłata balonowa",
  mieszana: "Spłata mieszana",
};

export const visibilityLabels: Record<string, string> = {
  zanonimizowane: "Zanonimizowane",
  czesciowe: "Częściowe",
  pelne: "Pełne",
};

export const integrationStatusLabels: Record<string, string> = {
  niepolaczona: "Niepołączona",
  polaczona: "Połączona",
  blad: "Błąd",
  wymaga_konfiguracji: "Wymaga konfiguracji",
  wylaczona: "Wyłączona",
};

export const roleLabels: Record<string, string> = {
  administrator: "Administrator",
  operator: "Operator",
  klient: "Klient",
  inwestor: "Inwestor",
};

export function formatPLN(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
