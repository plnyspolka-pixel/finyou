// JEDNO źródło prawdy dla automatyzacji kontaktu z klientem („follow-upy").
//
// Moduł CZYSTY (bez zależności serwerowych) — można go importować zarówno w
// cronach/serwerze (np. follow-up-plan.server.ts), jak i w panelu admina (UI),
// żeby pokazać operatorowi, co dokładnie dzieje się w tle.
//
// Uwaga: w aplikacji są CZTERY niezależne silniki follow-up (różne domeny,
// różne tabele, różne okna kontaktu) — to NIE są duplikaty. Rejestr poniżej
// spina je w jedno czytelne miejsce.

/** Okno kontaktu telefon/SMS dla sekwencji nurture „Ani". */
export const LEAD_CONTACT_WINDOW = {
  startHour: 8,
  endHour: 21,
  days: "pon–pt",
  tz: "Europe/Warsaw",
} as const;

/** Statusy terminalne — natychmiast przerywają sekwencję follow-up leada. */
export const LEAD_TERMINAL_STATUSES = [
  "zamkniety",
  "closed",
  "won",
  "lost",
  "odrzucony",
  "rezygnacja",
  "wyplacony",
  "spłacony",
  "do_not_contact",
  "blacklist",
] as const;

export type FollowUpChannel = "email" | "sms" | "call" | "messenger";

export type FollowUpEngine = {
  key: string;
  /** Nazwa widoczna w panelu. */
  name: string;
  /** Po co to jest — jednozdaniowo. */
  purpose: string;
  /** Co uruchamia sekwencję. */
  trigger: string;
  /** Rytm/kadencja w skrócie. */
  cadence: string;
  channels: FollowUpChannel[];
  /** Okno kontaktu (godziny/dni). */
  window: string;
  /** Tabela w bazie, w której żyje kolejka/log. */
  table: string;
  /** Endpoint crona, który przetwarza kolejkę. */
  tickEndpoint: string;
  /** Dokąd w panelu iść, żeby tym zarządzać. */
  manageHref: string;
};

/** Rejestr wszystkich silników follow-up — to widzi admin na Pulpicie. */
export const FOLLOW_UP_ENGINES: FollowUpEngine[] = [
  {
    key: "missing-info",
    name: "Follow-up braków (wnioski niekompletne / do korekty)",
    purpose:
      "Dopytuje klienta o KONKRETNE braki wniosku: dane podstawowe, dokumenty wg typu nieruchomości i otwarte pytania z analizy KW (dług na hipotece, zgody współwłaścicieli).",
    trigger:
      "Wniosek po kontakcie z brakami danych/dokumentów albo z nierozwiązanymi znaleziskami analizy KW (statusy: brak_kwoty, brak_kw, brak_zdjec_dokumentow, kontakt, kompletowanie_danych, szukamy_inwestora „do korekty”)",
    cadence:
      "start od razu, potem +2/+3/+4/+7/+7/+14/+14/+30… dni, maks. 12 prób; pauza 24 h po odpowiedzi klienta",
    channels: ["email", "sms", "messenger"],
    window: "7:00–21:00 pon–sob (SMS 8:00–20:00), Europe/Warsaw; Messenger tylko w oknie 24 h Meta",
    table: "missing_info_follow_ups",
    tickEndpoint: "/api/public/hooks/missing-info-follow-up-tick",
    manageHref: "/admin/follow-up-braki",
  },
  {
    key: "lead-nurture",
    name: "Sekwencja Ania (nurture leada)",
    purpose: "Dociska leada z niedokończonym wnioskiem aż do złożenia lub statusu terminalnego.",
    trigger: "Nowy lead / niedokończony wniosek",
    cadence:
      "365 dni opadająco — codziennie w 1. m-cu, co 3 dni w 2.–3., tygodniowo w 4.–6., co 2 tyg. do końca roku",
    channels: ["email", "sms", "call"],
    window: `${LEAD_CONTACT_WINDOW.startHour}:00–${LEAD_CONTACT_WINDOW.endHour}:00, ${LEAD_CONTACT_WINDOW.days}`,
    table: "lead_follow_up_schedule",
    tickEndpoint: "/api/public/hooks/follow-up-tick",
    manageHref: "/admin/klienci",
  },
];
