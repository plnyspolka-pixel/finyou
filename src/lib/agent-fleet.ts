// Flota agentów ElevenLabs na wspólnej linii — JEDNO źródło prawdy dla:
// jakie agenty istnieją, jakim promptem, jakimi narzędziami, dokąd przełącza
// recepcja i jak wygląda dokładna konfiguracja wysyłana do API ElevenLabs.
// Czysty moduł (bez importów serwerowych): korzysta z niego synchronizacja
// floty (agent-fleet.server.ts), testy i skrypt wdrożeniowy.
//
// Bezpieczeństwo narzędzi: każde narzędzie ElevenLabs wysyła do
// /api/public/agent-tools STAŁE `tool` i STAŁE `agent_key` (constant_value —
// model ani klient widgetu nie może ich podmienić) oraz `conversation_id`
// z systemowej zmiennej rozmowy. Dlatego to samo narzędzie serwerowe ma
// osobną definicję ElevenLabs dla każdego klucza agenta.
import type { AgentKey } from "@/lib/agent-tools/types";
import {
  TRIAGE_AGENT_NAME_TEXT,
  TRIAGE_AGENT_NAME_VOICE,
  TRIAGE_DATA_COLLECTION,
  TRIAGE_DYNAMIC_VARIABLE_DEFAULTS,
  TRIAGE_EVALUATION,
  TRIAGE_FIRST_MESSAGE_TEXT,
  TRIAGE_FIRST_MESSAGE_VOICE,
  buildTriagePrompt,
} from "@/lib/triage-agent-prompt";
import {
  INVESTOR_PRESALE_AGENT_NAME_TEXT,
  INVESTOR_PRESALE_AGENT_NAME_VOICE,
  INVESTOR_PRESALE_DATA_COLLECTION,
  INVESTOR_PRESALE_DYNAMIC_VARIABLE_DEFAULTS,
  INVESTOR_PRESALE_EVALUATION,
  INVESTOR_PRESALE_FIRST_MESSAGE_TEXT,
  INVESTOR_PRESALE_FIRST_MESSAGE_VOICE,
  buildInvestorPresalePrompt,
} from "@/lib/investor-presale-prompt";
import {
  WIND_INBOUND_APPENDIX,
  WIND_TEXT_AGENT_NAME,
  WIND_TEXT_DATA_COLLECTION,
  WIND_TEXT_EVALUATION,
  WIND_TEXT_FIRST_MESSAGE,
  WIND_TEXT_PLACEHOLDERS,
  WIND_VOICE_FLEET_AGENT_NAME,
  buildWindTextPrompt,
} from "@/lib/windykacja-text-agent-prompt";
import {
  WIND_AGENT_DATA_COLLECTION,
  WIND_AGENT_PLACEHOLDERS,
  WIND_AGENT_PROMPT,
} from "@/lib/windykacja-agent-prompt";

export const AGENT_TOOLS_URL = "https://app.financeyou.pl/api/public/agent-tools";

/** Istniejące agenty, do których recepcja przełącza (nie tworzymy ich od nowa). */
export const EXISTING_AGENTS = {
  /** A1 — przyjęcie wniosku (klient pożyczkowy), obsługuje głos i tekst. */
  intake: "agent_7701m1kr4mmrfdja1x5h79w5ktwz",
  /** A3 — panel inwestora (zalogowany inwestor). */
  inwestor_panel: "agent_7601m1kr4vbrefqa34c62e52b2sf",
} as const;

export const FLEET_AGENT_KEYS = [
  "recepcja_glos",
  "recepcja_tekst",
  "inwestor_presale_glos",
  "inwestor_presale_tekst",
  "windykacja_glos",
  "windykacja_tekst",
] as const;
export type FleetAgentKey = (typeof FLEET_AGENT_KEYS)[number];

export type TransferTarget = FleetAgentKey | keyof typeof EXISTING_AGENTS;

// ── Narzędzia ────────────────────────────────────────────────────────────────

/** Pole argumentu w stylu ElevenLabs (LLM podaje wartość wg opisu). */
export interface ArgField {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  /** Dla tablic: typ elementu. */
  items?: "string" | "number";
  /** Dla obiektów: pola zagnieżdżone. */
  properties?: Record<string, ArgField>;
  required?: readonly string[];
  enum?: readonly string[];
}

export interface FleetToolSpec {
  /** Nazwa narzędzia serwerowego (registry). */
  tool: string;
  description: string;
  args: Record<string, ArgField>;
  requiredArgs?: readonly string[];
  /** Które klucze agenta (AgentKey) dostają to narzędzie. */
  agentKeys: readonly AgentKey[];
  /** Czy model ma coś powiedzieć przed wywołaniem (dłuższe zapytania). */
  preToolSpeech?: "auto" | "force" | "off";
}

const S = (description: string, extra: Partial<ArgField> = {}): ArgField => ({ type: "string", description, ...extra });
const N = (description: string): ArgField => ({ type: "number", description });
const B = (description: string): ArgField => ({ type: "boolean", description });
const A = (description: string, items: "string" | "number" = "string"): ArgField => ({ type: "array", description, items });

const NEEDS_FIELDS: Record<string, ArgField> = {
  intent: S("Klucz potrzeby: nowe_finansowanie, inwestowanie, trwajacy_wniosek, splata_umowy, inwestor_z_kontem, inne."),
  product: S("Czego dotyczy rozmowa, np. pożyczka pod mieszkanie, abonament inwestora."),
  amount_pln: N("Kwota, o której mówi rozmówca (zł)."),
  timeline: S("Na kiedy rozmówca tego potrzebuje (jego słowami)."),
  property_type: S("Rodzaj nieruchomości, jeśli padł."),
  property_city: S("Miejscowość nieruchomości, jeśli padła."),
  investor_ticket_pln: N("Kwota, którą inwestor może przeznaczyć na sprawę (zł)."),
  investor_horizon_months: N("Horyzont inwestora w miesiącach."),
  decision_role: S("Rola decyzyjna rozmówcy: decydent, rekomenduje, szuka_info."),
  objections: A("Wątpliwości, które padły (krótko)."),
  next_step: S("Uzgodniony następny krok."),
  free_text: S("Jedno–dwa zdania o sprawie, tak żeby kolejny asystent nie pytał drugi raz."),
};

const ALL_FLEET_KEYS: readonly AgentKey[] = ["recepcja", "inwestor_presale", "windykacja", "windykacja_tekst"];
const WIND_KEYS: readonly AgentKey[] = ["windykacja", "windykacja_tekst"];

export const FLEET_TOOLS: readonly FleetToolSpec[] = [
  {
    tool: "identify_caller",
    description:
      "Rozpoznaje, kto jest po drugiej stronie (po numerze z rozmowy albo podanym telefonie / e-mailu) i proponuje trasę. Wołaj na początku rozmowy, bez zapowiadania. Wynik to podpowiedź, nie pewnik — nie mów rozmówcy, co widzisz w systemie.",
    args: {
      phone: S("Telefon podany przez rozmówcę w rozmowie (jeśli inny niż numer połączenia)."),
      email: S("E-mail podany przez rozmówcę w rozmowie."),
      intent: S("Potrzeba, o której mówi rozmówca, jeśli już padła (klucz z listy potrzeb)."),
    },
    agentKeys: ALL_FLEET_KEYS,
    preToolSpeech: "off",
  },
  {
    tool: "verify_identity",
    description:
      "Potwierdza tożsamość dowodem sprawdzanym na serwerze: numer umowy ALBO imię i nazwisko (firma: nazwa) zgodne z numerem / e-mailem rozmowy. Maks. 3 próby. Nigdy nie przekazuj PESEL. Wynik `say` możesz powiedzieć rozmówcy.",
    args: {
      numer_umowy: S("Numer umowy pożyczki podany przez rozmówcę."),
      full_name: S("Imię i nazwisko (albo nazwa firmy) podane przez rozmówcę."),
      recording_consent: B("Czy rozmówca zgodził się na nagrywanie (tylko rozmowa głosowa)."),
    },
    agentKeys: ["inwestor_presale", "windykacja", "windykacja_tekst"],
  },
  {
    tool: "save_needs",
    description:
      "Zapisuje rozpoznane potrzeby rozmówcy, żeby kolejny asystent nie pytał drugi raz. Wołaj przed przełączeniem rozmowy i po każdej ważnej informacji.",
    args: { needs: { type: "object", description: "Rozpoznane potrzeby (pola pomijaj, jeśli nie padły).", properties: NEEDS_FIELDS } },
    requiredArgs: ["needs"],
    agentKeys: ["recepcja", "inwestor_presale"],
    preToolSpeech: "off",
  },
  {
    tool: "lookup",
    description:
      "Bezpieczny odczyt danych rozmówcy z dozwolonych tabel (np. wind_events — historia sprawy, wind_documents — pisma). Serwer sam zawęża wiersze do rozmówcy; dane sprawy dopiero po verify_identity. Nie czytaj rozmówcy surowych pól.",
    args: {
      table: S("Nazwa tabeli z listy dozwolonych (describe_data)."),
      columns: A("Opcjonalnie: podzbiór kolumn."),
      where: { type: "object", description: "Opcjonalnie: filtr równości, np. {\"typ\":\"wplata\"}.", properties: {} },
      limit: N("Opcjonalnie: maksymalna liczba wierszy."),
    },
    requiredArgs: ["table"],
    agentKeys: WIND_KEYS,
  },
  {
    tool: "describe_data",
    description: "Lista tabel i kolumn, które możesz czytać narzędziem lookup. Wołaj tylko, gdy nie wiesz, gdzie szukać informacji.",
    args: {},
    agentKeys: WIND_KEYS,
  },
  {
    tool: "get_collection_case",
    description:
      "Akta sprawy po potwierdzeniu tożsamości: umowa, pożyczkodawca, kwota do zapłaty teraz (słownie w polu `slownie`), etap, najpóźniejszy termin wpłaty, zabezpieczenia, opłaty z umowy, poprzednie ustalenie, najbliższe raty, historia i pisma. Bez argumentów.",
    args: {},
    agentKeys: WIND_KEYS,
    preToolSpeech: "force",
  },
  {
    tool: "record_payment_promise",
    description:
      "Zapisuje w aktach potwierdzoną przez rozmówcę deklarację wpłaty. Jeśli termin jest późniejszy niż dopuszczalny, narzędzie odmówi i poda najpóźniejszy termin. Po zapisie przeczytaj rozmówcy `podsumowanie`.",
    args: {
      kwota_pln: N("Kwota deklarowanej wpłaty w złotych."),
      data: S("Dzień wpłaty: RRRR-MM-DD albo słowami (dziś, jutro, w piątek)."),
      sposob: S("Sposób wpłaty, np. przelew z aplikacji banku."),
      przeszkody: S("Co może przeszkodzić w wpłacie (jeśli padło)."),
      propozycja_reszty: {
        type: "object",
        description: "Propozycja spłaty reszty do decyzji pożyczkodawcy (jeśli wpłata częściowa).",
        properties: {
          kwota_miesiecznie: N("Kwota miesięczna (zł)."),
          od_kiedy: S("Od kiedy (RRRR-MM-DD albo słowami)."),
          ile_rat: N("Liczba rat."),
        },
      },
    },
    requiredArgs: ["kwota_pln", "data", "sposob"],
    agentKeys: WIND_KEYS,
  },
  {
    tool: "record_call_note",
    description:
      "Zapisuje w aktach ważną informację z rozmowy: osoba trzecia, poczta głosowa, brak zgody na nagrywanie, prośba o kontakt, już zapłacił, spór o kwotę, upadłość / restrukturyzacja, zgon, prośba o zaprzestanie kontaktu (STOP), odmowa.",
    args: {
      rodzaj: S("Rodzaj notatki.", {
        enum: [
          "osoba_trzecia",
          "poczta_glosowa",
          "brak_zgody_na_nagrywanie",
          "prosba_o_kontakt",
          "juz_zaplacil",
          "spor_o_kwote",
          "upadlosc_restrukturyzacja",
          "zgon",
          "prosba_nie_dzwonic",
          "odmowa",
          "inne",
        ],
      }),
      tresc: S("Jedno–dwa zdania: co dokładnie powiedział rozmówca (bez danych wrażliwych)."),
    },
    requiredArgs: ["rodzaj", "tresc"],
    agentKeys: WIND_KEYS,
    preToolSpeech: "off",
  },
  {
    tool: "get_payment_instructions",
    description:
      "Rachunek z umowy (pogrupowany do dyktowania), odbiorca i tytuł przelewu. Wołaj tylko, gdy rozmówca prosi o numer rachunku. Innego rachunku nigdy nie podawaj.",
    args: {},
    agentKeys: WIND_KEYS,
  },
  {
    tool: "get_pricing",
    description:
      "Aktualny cennik abonamentu inwestora z bazy (kwoty, okresy, płatność, sprzedawca, co obejmuje, kolejność startu). JEDYNE źródło cen — wołaj zawsze, zanim powiesz cokolwiek o cenie.",
    args: {},
    agentKeys: ["inwestor_presale"],
  },
  {
    tool: "get_offer_teasers",
    description:
      "Kilka przykładowych, zanonimizowanych kart spraw (kwota, okres, rodzaj nieruchomości, miasto, LTV). Mów, że to przykłady — realne projekty są dobierane do przyjętego zlecenia.",
    args: {},
    agentKeys: ["inwestor_presale"],
  },
  {
    tool: "get_investor_state",
    description:
      "Stan konta inwestora po potwierdzeniu tożsamości: abonament, pakiet umów, kryteria, otwarte zlecenia i następny krok.",
    args: {},
    agentKeys: ["inwestor_presale"],
  },
  {
    tool: "save_investor_needs",
    description:
      "Zapisuje rozpoznane potrzeby inwestora i zwraca ocenę dopasowania A / B / C (nie mów jej rozmówcy). Wołaj po każdej istotnej informacji — pomijaj pola, które nie padły.",
    args: {
      ticket_pln: N("Kwota na jedną sprawę (zł)."),
      horizon_months: N("Horyzont w miesiącach."),
      min_yield_pct: N("Oczekiwany zwrot roczny wypowiedziany przez rozmówcę (%), jeśli padł."),
      property_types: A("Preferowane rodzaje nieruchomości."),
      regions: A("Preferowane regiony lub miasta."),
      decision_role: S("Rola decyzyjna.", { enum: ["decydent", "rekomenduje", "szuka_info"] }),
      experience: S("Doświadczenie.", { enum: ["pierwszy_raz", "kilka", "portfel"] }),
      objections: A("Klucze obiekcji, które padły."),
      timeline: S("Kiedy chce zacząć.", { enum: ["teraz", "kwartal", "kiedys"] }),
      wants_callback: B("Czy prosi o kontakt opiekuna."),
      callback_phone: S("Telefon do kontaktu, jeśli podał."),
      callback_email: S("E-mail do kontaktu, jeśli podał."),
      summary: S("Dwa–trzy zdania podsumowania dla zespołu."),
    },
    agentKeys: ["inwestor_presale"],
    preToolSpeech: "off",
  },
  {
    tool: "request_investor_callback",
    description:
      "Zapisuje prośbę o kontakt opiekuna inwestorów (telefon albo e-mail). Nie obiecuj terminu ani tego, że ktoś się odezwie — powiedz to, co zwróci `say`.",
    args: {
      phone: S("Telefon do kontaktu."),
      email: S("E-mail do kontaktu."),
      reason: S("Czego dotyczy prośba (skala, pytania)."),
    },
    agentKeys: ["inwestor_presale"],
  },
  {
    tool: "send_investor_registration_link",
    description:
      "Wysyła SMS z linkiem do rejestracji inwestora (rozmowa telefoniczna, po zgodzie rozmówcy) albo zwraca link do wklejenia w czacie.",
    args: {},
    agentKeys: ["inwestor_presale"],
  },
  {
    tool: "search_knowledge",
    description:
      "Szuka odpowiedzi w materiałach Finance You. Wołaj, gdy pytanie wykracza poza Twoją instrukcję. Brak wyniku = mów, że nie wiesz; nie zgaduj.",
    args: {
      query: S("Pytanie rozmówcy własnymi słowami (3–300 znaków)."),
      audience: S("Dla kogo: klient albo inwestor.", { enum: ["klient", "inwestor"] }),
    },
    requiredArgs: ["query"],
    agentKeys: ["recepcja", "inwestor_presale"],
  },
  {
    tool: "get_process_overview",
    description: "Krótki, pewny opis procesu dla klienta, inwestora albo pożyczkobiorcy wraz z listą rzeczy, których nie wolno mówić.",
    args: { audience: S("Dla kogo.", { enum: ["klient", "inwestor", "pozyczkobiorca_windykacja"] }) },
    requiredArgs: ["audience"],
    agentKeys: ["inwestor_presale", "windykacja", "windykacja_tekst"],
  },
];

/** Nazwa narzędzia ElevenLabs: fy2_<narzędzie>__<klucz agenta>. */
export function elevenToolName(tool: string, agentKey: AgentKey): string {
  return `fy2_${tool}__${agentKey}`.slice(0, 64);
}

// ── Agenty ───────────────────────────────────────────────────────────────────

export interface FleetTransfer {
  to: TransferTarget;
  condition: string;
  transferMessage: string;
}

export interface FleetAgentSpec {
  key: FleetAgentKey;
  agentKey: AgentKey;
  name: string;
  mode: "voice" | "text";
  llm: string;
  voiceId: string;
  ttsModelId: string;
  firstMessage: string;
  prompt: string;
  placeholders: Record<string, string>;
  transfers: readonly FleetTransfer[];
  dataCollection: Record<string, { type: "string" | "boolean" | "number"; description: string }>;
  evaluation: { id: string; name: string; prompt: string };
  maxDurationSeconds: number;
  tags: readonly string[];
}

/** Głosy PL z konta: Aleksandra (profesjonalny, kobiecy), Filip (dojrzały, męski). */
export const VOICES = {
  aleksandra: "NOWYzprzTwfZQqU76pBX",
  filip: "9STbwZjpEbcYG88ZekIQ",
} as const;

const TRANSFER_TO_INTAKE: FleetTransfer = {
  to: "intake",
  condition:
    "Rozmówca szuka finansowania dla firmy (nowa pożyczka pod nieruchomość) albo pyta o swój złożony wniosek: status, braki, dokumenty.",
  transferMessage: "Przełączam do asystenta, który prowadzi wnioski o finansowanie.",
};
const TRANSFER_TO_PANEL: FleetTransfer = {
  to: "inwestor_panel",
  condition:
    "Rozmówca jest inwestorem z kontem i pyta o panel, abonament, akceptację umów, zlecenia albo swoje sprawy jako pożyczkodawca.",
  transferMessage: "Przełączam do asystenta panelu inwestora.",
};

const evalOf = (e: { id: string; name: string; prompt: string }) => ({ id: e.id, name: e.name, prompt: e.prompt });

export const FLEET_AGENTS: readonly FleetAgentSpec[] = [
  {
    key: "recepcja_glos",
    agentKey: "recepcja",
    name: TRIAGE_AGENT_NAME_VOICE,
    mode: "voice",
    llm: "gemini-2.5-flash",
    voiceId: VOICES.aleksandra,
    ttsModelId: "eleven_flash_v2_5",
    firstMessage: TRIAGE_FIRST_MESSAGE_VOICE,
    prompt: buildTriagePrompt("voice"),
    placeholders: TRIAGE_DYNAMIC_VARIABLE_DEFAULTS,
    transfers: [
      TRANSFER_TO_INTAKE,
      {
        to: "inwestor_presale_glos",
        condition:
          "Rozmówca chce inwestować, finansować pożyczki, pyta o dostęp dla inwestora albo reprezentuje fundusz lub firmę inwestycyjną — i nie ma jeszcze konta.",
        transferMessage: "Przełączam do asystenta dla inwestorów.",
      },
      TRANSFER_TO_PANEL,
      {
        to: "windykacja_glos",
        condition:
          "Rozmówca dzwoni w sprawie spłaty, raty, zaległości, wezwania albo monitu z podpisanej umowy pożyczki (jako pożyczkobiorca lub w jego imieniu).",
        transferMessage: "Przełączam do asystenta od spłaty umów.",
      },
    ],
    dataCollection: TRIAGE_DATA_COLLECTION,
    evaluation: evalOf(TRIAGE_EVALUATION),
    maxDurationSeconds: 600,
    tags: ["finance-you", "flota", "recepcja", "glos"],
  },
  {
    key: "recepcja_tekst",
    agentKey: "recepcja",
    name: TRIAGE_AGENT_NAME_TEXT,
    mode: "text",
    llm: "gemini-2.5-flash",
    voiceId: VOICES.aleksandra,
    ttsModelId: "eleven_flash_v2_5",
    firstMessage: TRIAGE_FIRST_MESSAGE_TEXT,
    prompt: buildTriagePrompt("text"),
    placeholders: { ...TRIAGE_DYNAMIC_VARIABLE_DEFAULTS, channel: "chat", channel_label: "czat na stronie" },
    transfers: [
      TRANSFER_TO_INTAKE,
      {
        to: "inwestor_presale_tekst",
        condition:
          "Rozmówca chce inwestować, finansować pożyczki, pyta o dostęp dla inwestora albo reprezentuje fundusz lub firmę inwestycyjną — i nie ma jeszcze konta.",
        transferMessage: "Przekazuję rozmowę asystentowi dla inwestorów.",
      },
      TRANSFER_TO_PANEL,
      {
        to: "windykacja_tekst",
        condition:
          "Rozmówca pisze w sprawie spłaty, raty, zaległości, wezwania albo monitu z podpisanej umowy pożyczki.",
        transferMessage: "Przekazuję rozmowę asystentowi od spłaty umów.",
      },
    ],
    dataCollection: TRIAGE_DATA_COLLECTION,
    evaluation: evalOf(TRIAGE_EVALUATION),
    maxDurationSeconds: 3600,
    tags: ["finance-you", "flota", "recepcja", "tekst"],
  },
  {
    key: "inwestor_presale_glos",
    agentKey: "inwestor_presale",
    name: INVESTOR_PRESALE_AGENT_NAME_VOICE,
    mode: "voice",
    llm: "claude-sonnet-4-6",
    voiceId: VOICES.aleksandra,
    ttsModelId: "eleven_flash_v2_5",
    firstMessage: INVESTOR_PRESALE_FIRST_MESSAGE_VOICE,
    prompt: buildInvestorPresalePrompt("voice"),
    placeholders: INVESTOR_PRESALE_DYNAMIC_VARIABLE_DEFAULTS,
    transfers: [TRANSFER_TO_INTAKE, TRANSFER_TO_PANEL],
    dataCollection: INVESTOR_PRESALE_DATA_COLLECTION,
    evaluation: evalOf(INVESTOR_PRESALE_EVALUATION),
    maxDurationSeconds: 1500,
    tags: ["finance-you", "flota", "inwestor", "glos"],
  },
  {
    key: "inwestor_presale_tekst",
    agentKey: "inwestor_presale",
    name: INVESTOR_PRESALE_AGENT_NAME_TEXT,
    mode: "text",
    llm: "claude-sonnet-4-6",
    voiceId: VOICES.aleksandra,
    ttsModelId: "eleven_flash_v2_5",
    firstMessage: INVESTOR_PRESALE_FIRST_MESSAGE_TEXT,
    prompt: buildInvestorPresalePrompt("text"),
    placeholders: { ...INVESTOR_PRESALE_DYNAMIC_VARIABLE_DEFAULTS, channel: "chat", channel_label: "czat na stronie" },
    transfers: [TRANSFER_TO_INTAKE, TRANSFER_TO_PANEL],
    dataCollection: INVESTOR_PRESALE_DATA_COLLECTION,
    evaluation: evalOf(INVESTOR_PRESALE_EVALUATION),
    maxDurationSeconds: 3600,
    tags: ["finance-you", "flota", "inwestor", "tekst"],
  },
  {
    key: "windykacja_glos",
    agentKey: "windykacja",
    name: WIND_VOICE_FLEET_AGENT_NAME,
    mode: "voice",
    llm: "claude-sonnet-4-6",
    voiceId: VOICES.filip,
    ttsModelId: "eleven_flash_v2_5",
    // Rozmowa przychodząca: przedstawienie robi recepcja albo pierwsza
    // wypowiedź poniżej — bez „Czy to …?” (to formuła telefonu wychodzącego).
    firstMessage: "Dzień dobry, tu asystent AI Finance You, rozmowa jest nagrywana. W czym mogę pomóc w sprawie umowy?",
    prompt: WIND_AGENT_PROMPT + WIND_INBOUND_APPENDIX,
    // Narzędzia wysyłają {{channel}} — bez placeholdera start rozmowy by padł.
    placeholders: { ...WIND_AGENT_PLACEHOLDERS, channel: "voice_phone", channel_label: "telefon" },
    transfers: [],
    dataCollection: WIND_AGENT_DATA_COLLECTION,
    evaluation: {
      id: "konkretne_zobowiazanie",
      name: "Konkretne zobowiązanie do wpłaty",
      prompt:
        "Czy rozmowa zakończyła się wpłatą w trakcie rozmowy albo konkretnym, potwierdzonym przez rozmówcę zobowiązaniem do wpłaty (kwota i dzień), bez ujawnienia danych sprawy przed potwierdzeniem tożsamości?",
    },
    maxDurationSeconds: 900,
    tags: ["finance-you", "flota", "windykacja", "glos"],
  },
  {
    key: "windykacja_tekst",
    agentKey: "windykacja_tekst",
    name: WIND_TEXT_AGENT_NAME,
    mode: "text",
    llm: "claude-sonnet-4-6",
    voiceId: VOICES.filip,
    ttsModelId: "eleven_flash_v2_5",
    firstMessage: WIND_TEXT_FIRST_MESSAGE,
    prompt: buildWindTextPrompt(),
    placeholders: WIND_TEXT_PLACEHOLDERS,
    transfers: [],
    dataCollection: WIND_TEXT_DATA_COLLECTION,
    evaluation: evalOf(WIND_TEXT_EVALUATION),
    maxDurationSeconds: 3600,
    tags: ["finance-you", "flota", "windykacja", "tekst"],
  },
];

export function toolsForAgent(spec: FleetAgentSpec): FleetToolSpec[] {
  return FLEET_TOOLS.filter((t) => t.agentKeys.includes(spec.agentKey));
}

// ── Konfiguracja dla API ElevenLabs ─────────────────────────────────────────

type ElProp = Record<string, unknown>;

function argToEl(field: ArgField): ElProp {
  if (field.type === "object") {
    const props: Record<string, ElProp> = {};
    for (const [k, v] of Object.entries(field.properties ?? {})) props[k] = argToEl(v);
    return { type: "object", description: field.description, properties: props, required: [...(field.required ?? [])] };
  }
  if (field.type === "array") {
    return { type: "array", description: field.description, items: { type: field.items ?? "string", description: "element" } };
  }
  const out: ElProp = { type: field.type, description: field.description };
  if (field.enum) out.enum = [...field.enum];
  return out;
}

/**
 * Konfiguracja narzędzia webhook dla jednego klucza agenta. `tool`,
 * `agent_key` — stałe; `conversation_id` i `phone` — zmienne systemowe;
 * `channel` — zmienna rozmowy; reszta — od modelu.
 */
export function buildWebhookToolConfig(
  spec: FleetToolSpec,
  agentKey: AgentKey,
  opts: { url?: string; secretId: string },
): Record<string, unknown> {
  const args = argToEl({ type: "object", description: "Argumenty narzędzia.", properties: spec.args, required: spec.requiredArgs });
  const body: Record<string, unknown> = {
    type: "object",
    description: "Wywołanie narzędzia Finance You",
    required: ["tool", "agent_key"],
    properties: {
      tool: { type: "string", constant_value: spec.tool },
      agent_key: { type: "string", constant_value: agentKey },
      conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
      // Podpisany klucz wątku z routera wiadomości (kanały asynchroniczne);
      // w telefonie pusty — wtedy sesją jest id rozmowy.
      thread_key: { type: "string", dynamic_variable: "thread_key" },
      channel: { type: "string", dynamic_variable: "channel" },
      phone: { type: "string", dynamic_variable: "system__caller_id" },
      args,
    },
  };
  return {
    type: "webhook",
    name: elevenToolName(spec.tool, agentKey),
    description: spec.description,
    response_timeout_secs: 20,
    tool_error_handling_mode: "summarized",
    pre_tool_speech: spec.preToolSpeech ?? "auto",
    api_schema: {
      url: opts.url ?? AGENT_TOOLS_URL,
      method: "POST",
      content_type: "application/json",
      request_headers: {
        "X-Agent-Tools-Secret": { secret_id: opts.secretId },
        "Content-Type": "application/json",
      },
      request_body_schema: body,
    },
  };
}

/** Ciało POST /v1/convai/agents/create (i PATCH) dla agenta floty. */
export function buildAgentConfig(
  spec: FleetAgentSpec,
  resolved: { toolIds: string[]; agentIds: Partial<Record<TransferTarget, string>> },
): Record<string, unknown> {
  const transfers = spec.transfers
    .map((t) => ({
      agent_id: resolved.agentIds[t.to],
      condition: t.condition,
      transfer_message: t.transferMessage,
      enable_transferred_agent_first_message: false,
      preserve_voice_settings: false,
    }))
    .filter((t) => Boolean(t.agent_id));

  const builtIn: Record<string, unknown> = {
    end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } },
  };
  if (spec.mode === "voice") {
    builtIn.voicemail_detection = {
      type: "system",
      name: "voicemail_detection",
      description: "",
      params: { system_tool_type: "voicemail_detection" },
    };
    builtIn.skip_turn = { type: "system", name: "skip_turn", description: "", params: { system_tool_type: "skip_turn" } };
  }
  if (transfers.length) {
    builtIn.transfer_to_agent = {
      type: "system",
      name: "transfer_to_agent",
      description: "",
      params: { system_tool_type: "transfer_to_agent", transfers },
    };
  }

  const dataCollection: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec.dataCollection)) {
    dataCollection[k] = { type: v.type, description: v.description };
  }

  return {
    name: spec.name,
    tags: [...spec.tags],
    conversation_config: {
      agent: {
        first_message: spec.firstMessage,
        language: "pl",
        dynamic_variables: { dynamic_variable_placeholders: { thread_key: "", ...spec.placeholders } },
        prompt: {
          prompt: spec.prompt,
          llm: spec.llm,
          temperature: 0.3,
          timezone: "Europe/Warsaw",
          tool_ids: resolved.toolIds,
          built_in_tools: builtIn,
        },
      },
      tts: { voice_id: spec.voiceId, model_id: spec.ttsModelId },
      conversation: { text_only: spec.mode === "text", max_duration_seconds: spec.maxDurationSeconds },
    },
    platform_settings: {
      data_collection: dataCollection,
      evaluation: {
        criteria: [
          {
            id: spec.evaluation.id,
            name: spec.evaluation.name,
            type: "prompt",
            conversation_goal_prompt: spec.evaluation.prompt,
          },
        ],
      },
      // Rozmowa o wypowiedzeniu umowy i egzekucji uruchamiałaby filtr
      // „medical_and_legal” i przerywała połączenie (docs/windykacja-agent-glosowy.md).
      guardrails: {
        version: "1",
        prompt_injection: { is_enabled: true },
        content: { config: { medical_and_legal_information: { is_enabled: false } } },
      },
    },
  };
}
