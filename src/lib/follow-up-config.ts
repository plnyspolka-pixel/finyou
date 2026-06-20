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

export type FollowUpChannel = "email" | "sms" | "call";

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
    name: "Sekwencja Ania (nurture leada)",
    purpose: "Dociska leada z niedokończonym wnioskiem aż do złożenia lub statusu terminalnego.",
    trigger: "Nowy lead / niedokończony wniosek",
    cadence: "30 dni — mail ×30, telefon ×13, SMS ×4",
    channels: ["email", "sms", "call"],
    window: `${LEAD_CONTACT_WINDOW.startHour}:00–${LEAD_CONTACT_WINDOW.endHour}:00, ${LEAD_CONTACT_WINDOW.days}`,
    table: "lead_follow_up_schedule",
    tickEndpoint: "/api/public/hooks/follow-up-tick",
    manageHref: "/admin/klienci",
  },
  {
    key: "calculator-call",
    name: "Telefon po kalkulatorze",
    purpose: "Oddzwania do zalogowanego klienta tuż po wejściu na kalkulator warunków.",
    trigger: "Wejście na kalkulator (oprocentowanie + maks. rata)",
    cadence: "1 telefon ~60 s później (throttle 24 h na numer)",
    channels: ["call"],
    window: "8:00–22:00, pon–sob (okno voicebota)",
    table: "call_queue",
    tickEndpoint: "/api/public/hooks/process-scheduled-calls",
    manageHref: "/admin/voicebot",
  },
  {
    key: "loan-reminders",
    name: "Przypomnienia o ratach (mail)",
    purpose: "Maile do klientów ze spłacanymi pożyczkami wg konfigurowalnego harmonogramu.",
    trigger: "Cron z konfiguracji (reminder_email_schedule)",
    cadence: "Wg wyrażenia cron ustawionego w panelu",
    channels: ["email"],
    window: "Wg crona",
    table: "loan_reminder_email_sends",
    tickEndpoint: "/api/public/hooks/loan-reminder-emails-tick",
    manageHref: "/admin/przypomnienia",
  },
  {
    key: "saturday-sms",
    name: "Sobotnie SMS-y przypominające",
    purpose: "Cotygodniowy SMS do klientów z ratami kwalifikującymi się do przypomnienia.",
    trigger: "Cron sobotni",
    cadence: "Raz w tygodniu (sobota)",
    channels: ["sms"],
    window: "Sobota",
    table: "loan_reminder_email_sends",
    tickEndpoint: "/api/public/hooks/saturday-sms-reminders",
    manageHref: "/admin/przypomnienia",
  },
];
