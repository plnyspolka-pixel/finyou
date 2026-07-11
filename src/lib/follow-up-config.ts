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
  "zamkniete", // kanoniczny status po unifikacji (loan-status.ts)
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
    key: "lead-nurture",
    name: "Sekwencja Ania (nurture leada bez wniosku)",
    purpose:
      "Dociska leada (np. z Meta), który NIE ma jeszcze wniosku — aż do złożenia wniosku lub statusu terminalnego. " +
      "Gdy lead dostaje wniosek, sekwencja jest anulowana, a kontakt przejmują silniki wnioskowe.",
    trigger: "Nowy lead z Meta (scheduleFollowUpsForLead)",
    cadence: "365 dni opadająco — codziennie w 1. m-cu, co 3 dni w 2.–3., tygodniowo w 4.–6., co 2 tyg. do końca roku",
    channels: ["email", "sms", "call"],
    window: `${LEAD_CONTACT_WINDOW.startHour}:00–${LEAD_CONTACT_WINDOW.endHour}:00, ${LEAD_CONTACT_WINDOW.days}`,
    table: "lead_follow_up_schedule",
    tickEndpoint: "/api/public/hooks/lead-follow-ups",
    manageHref: "/admin/klienci",
  },
  {
    key: "loan-reminder-emails",
    name: "Drip mailowy wniosku (120 szablonów, A/B)",
    purpose: "Przypomina klientowi z otwartym wnioskiem o dokończeniu — mail 2×/dzień w fazie 1, potem co ~2 dni bez końca.",
    trigger: "Wniosek w statusie aktywnym (nowy_lead / brak_kontaktu / kontakt / kompletowanie_danych)",
    cadence: "Faza 1: 2 maile/dzień (8:00 i 20:00); Faza 2 (od 61. maila): co ~2 dni o 8:00, treści cyklują",
    channels: ["email"],
    window: "8:00 i 20:00, pon–sob",
    table: "loan_reminder_email_sends",
    tickEndpoint: "/api/public/hooks/loan-reminder-emails-tick",
    manageHref: "/admin/przypomnienia",
  },
  {
    key: "loan-reminder-calls",
    name: "Telefony Ani (przypomnienia wnioskowe)",
    purpose: "Ania dzwoni do klientów z niedokończonym wnioskiem wg wygasającej kadencji (nigdy nie milknie sama).",
    trigger: "loan_applications.next_reminder_at <= teraz (zasiane automatycznie przy utworzeniu wniosku)",
    cadence: "+5h, +8h, +24h, +48h, potem 3 dni / tydzień / 2 tyg. / 3 tyg. (steady state)",
    channels: ["call"],
    window: "8:00–22:00, pon–sob",
    table: "call_queue",
    tickEndpoint: "/api/public/hooks/loan-reminders",
    manageHref: "/admin/przypomnienia",
  },
  {
    key: "ania-callbacks",
    name: "Oddzwonki Ani (nieodebrane)",
    purpose: "Dodzwania się 2×/dzień do klientów, którzy nie odebrali / poczta głosowa / zajęte, plus SMS.",
    trigger: "Ostatni telefon bez kontaktu",
    cadence: "2 okna dziennie: 9:00–9:30 i 16:00–16:30",
    channels: ["call", "sms"],
    window: "9:00–9:30 i 16:00–16:30, pon–sob",
    table: "call_queue",
    tickEndpoint: "/api/public/hooks/ania-callbacks",
    manageHref: "/admin/voicebot",
  },
  {
    key: "messenger-nudges",
    name: "Nudge Messenger/Instagram",
    purpose: "Ania pinguje w DM leady, które ucichły po naszej ostatniej wiadomości.",
    trigger: "Outbound bez odpowiedzi klienta",
    cadence: "+2h, +6h, +24h, +3d, +7d, +14d, +21d, +30d → stop",
    channels: ["messenger"],
    window: "całodobowo (kanał czatowy)",
    table: "lead_communications",
    tickEndpoint: "/api/public/hooks/follow-up-tick",
    manageHref: "/admin/messenger",
  },
  {
    key: "saturday-sms",
    name: "Sobotni SMS (miesięczny)",
    purpose: "Raz w miesiącu, w sobotni poranek, SMS przypominający o otwartym wniosku.",
    trigger: "Wniosek aktywny, ostatni SMS > ~28 dni temu",
    cadence: "1×/miesiąc",
    channels: ["sms"],
    window: "sobota 8:00–11:00",
    table: "loan_applications",
    tickEndpoint: "/api/public/hooks/saturday-sms-reminders",
    manageHref: "/admin/przypomnienia",
  },
];

