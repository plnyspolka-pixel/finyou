// Scenariusze testu end-to-end Ani — z prawdziwych rozmów na Messengerze
// (28–30.10.2026). Każda nowa skarga dopisuje tu scenariusz.
// Dane kontaktowe są fikcyjne (numery 100 200 3xx nie istnieją w PL, adresy
// @example.invalid) — test nie może zderzyć się z leadem prawdziwego klienta.

export type StepExpect = {
  /** Czy bot ma w ogóle odpisać. */
  reply: boolean;
  /** Odpowiedź z modelu (ElevenLabs) czy obsługa bez modelu (prośba o telefon). */
  source?: "agent" | "call_request_saved" | "call_request_ask_phone";
  /** Agent, który ma prowadzić rozmowę (sprawdzany w ElevenLabs). */
  agent?: "A2P" | "A0";
  leadType?: "inwestorski" | "pozyczkowy";
  leadStatus?: string;
  mustInclude?: string[];
  /** Kryterium dla oceniającego modelu — co znaczy „odpowiedź na temat”. */
  judge?: string;
};

export type DmStep = { text: string; expect: StepExpect };

export type Scenario =
  | { id: string; title: string; kind: "dm"; firstName?: string; steps: DmStep[] }
  | {
      id: string;
      title: string;
      kind: "comment";
      authorName: string;
      text: string;
      expect: { publicReply: boolean; privateReply: boolean; judge?: string };
    };

/** Wiadomość z formularza inwestorskiego Click-to-Messenger (jak u Pawła i Bogusława). */
export function investorFormText(firstName: string, phone: string, email: string): string {
  return (
    "Cześć! Wypełniłem(am) formularz i chcę dowiedzieć się więcej o Twojej firmie. " +
    "Jaki zwrot z inwestycji w skali roku uznasz za atrakcyjny ?: powyżej 50% " +
    `First name: ${firstName} Email: ${email} ` +
    "Inwesotwałeś/aś już w pożyczki pod zastaw nieruchomości ?: Nie " +
    `Phone number: ${phone} ` +
    "Jaką kwotę chcesz zainwestować w ciągu tego roku?: 300 000 zł do 500 000 zł"
  );
}

/** Znacznik podmieniany na wiadomość z formularza z danymi scenariusza. */
export const FORM = "{{FORMULARZ_INWESTORSKI}}";

export const SCENARIOS: Scenario[] = [
  {
    id: "formularz",
    title: "Formularz inwestorski z reklamy (Paweł, Bogusław)",
    kind: "dm",
    firstName: "Paweł",
    steps: [
      {
        text: FORM,
        expect: {
          reply: true,
          source: "agent",
          agent: "A2P",
          leadType: "inwestorski",
          judge:
            "Odpowiedź do osoby, która zostawiła formularz inwestorski: nawiązuje do inwestowania (formularza albo kwoty) i prowadzi rozmowę dalej, np. pytaniem. Nie jest samym powitaniem, nie mówi o pożyczce dla klienta.",
        },
      },
    ],
  },
  {
    id: "formularz-dzieki",
    title: "Formularz, potem „Dzięki” (Paweł)",
    kind: "dm",
    firstName: "Paweł",
    steps: [
      { text: FORM, expect: { reply: true, source: "agent", agent: "A2P" } },
      {
        text: "Dzięki",
        expect: {
          reply: true,
          source: "agent",
          agent: "A2P",
          judge:
            "Krótka, naturalna reakcja na „Dzięki” w trwającej rozmowie o inwestowaniu. Nie wita się od nowa i nie pyta „w czym mogę pomóc”.",
        },
      },
    ],
  },
  {
    id: "telefon-z-numerem",
    title: "„Proszę zadzwonić” z numerem (Bogusław)",
    kind: "dm",
    steps: [
      {
        text: "Proszę zadzwonić 100 200 301",
        expect: {
          reply: true,
          source: "call_request_saved",
          leadStatus: "wymaga_kontaktu",
          mustInclude: ["100 200 301"],
        },
      },
    ],
  },
  {
    id: "formularz-zdzwonic",
    title: "Formularz, potem „powinniśmy się zdzwonić” (Bogusław)",
    kind: "dm",
    firstName: "Bogusław",
    steps: [
      { text: FORM, expect: { reply: true, source: "agent", agent: "A2P" } },
      {
        text: "Tak, dotarła i jestem zainteresowany. Oczywiście pytań jest dużo i dlatego powinniśmy się zdzwonić i porozmawiać.",
        expect: {
          reply: true,
          source: "call_request_saved",
          leadStatus: "wymaga_kontaktu",
        },
      },
    ],
  },
  {
    id: "kontakt-bez-numeru",
    title: "„proszę o kontakt” bez numeru, potem numer (Tymecki)",
    kind: "dm",
    steps: [
      { text: "proszę o kontakt", expect: { reply: true, source: "call_request_ask_phone" } },
      {
        text: "100 200 302",
        expect: {
          reply: true,
          source: "call_request_saved",
          leadStatus: "wymaga_kontaktu",
          mustInclude: ["100 200 302"],
        },
      },
    ],
  },
  {
    id: "informacje-ogolne",
    title: "„informacje ogólne o inwestowaniu” od nieznanej osoby (Kaniecki)",
    kind: "dm",
    steps: [
      {
        text: "Na początek możliwość informacji ogólnych odnośnie inwestowania w nieruchomości",
        expect: {
          reply: true,
          source: "agent",
          judge:
            "Odpowiada na prośbę o ogólne informacje o inwestowaniu: podaje konkretną informację o tym, jak u Finance You inwestuje się w pożyczki pod zastaw nieruchomości, albo zadaje jedno sensowne pytanie doprecyzowujące. Nie myli inwestora z kimś, kto szuka pożyczki. Nie jest samym powitaniem.",
        },
      },
    ],
  },
  {
    id: "pytanie-pozyczka",
    title: "Pytanie o pożyczkę od nieznanej osoby",
    kind: "dm",
    steps: [
      {
        text: "Dzień dobry, ile kosztuje pożyczka pod mieszkanie?",
        expect: {
          reply: true,
          source: "agent",
          judge:
            "Odpowiada na pytanie o koszt pożyczki pod mieszkanie albo uczciwie mówi, od czego koszt zależy, i prowadzi rozmowę dalej. Nie jest samym powitaniem.",
        },
      },
    ],
  },
  {
    id: "komentarz-docinek",
    title: "Złośliwy komentarz „Kolejny szkoli konkurencję...” (Kochanowski)",
    kind: "comment",
    authorName: "Test Docinek",
    text: "Kolejny szkoli konkurencję...",
    expect: { publicReply: false, privateReply: false },
  },
  {
    id: "komentarz-pytanie",
    title: "Komentarz z pytaniem „Ile to kosztuje?”",
    kind: "comment",
    authorName: "Test Pytanie",
    text: "Ile to kosztuje?",
    expect: {
      publicReply: true,
      privateReply: true,
      judge:
        "Prywatna odpowiedź na komentarz „Ile to kosztuje?” pod postem Finance You: odnosi się do pytania o koszt i prowadzi rozmowę dalej. Nie jest samym powitaniem.",
    },
  },
];
