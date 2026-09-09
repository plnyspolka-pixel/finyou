// Czyste funkcje wątków pytań instytucja ↔ klient: normalizacja i klucze
// deduplikacji (to samo pytanie od dwóch instytucji = jedno pytanie do
// klienta), rozdział pytań na te dla klienta i te dla biura oraz wyliczanie
// realnego stanu wątku (status w bazie nie mówi, czy pytania w ogóle wyszły).

export type QuestionAudience = "klient" | "biuro";

export interface ThreadQuestion {
  text: string;
  /** Klucz tematu — deduplikacja między instytucjami (parafrazy tego samego). */
  key: string;
  from: string[];
  distribution_ids: string[];
  asked_client_at: string | null;
  answered_at?: string | null;
}

export interface OfficeQuestion {
  text: string;
  key: string;
  from: string[];
  distribution_ids: string[];
  created_at: string;
  handled_at?: string | null;
}

/** Pytanie wyciągnięte z maila, jeszcze bez kontekstu wątku. */
export interface ExtractedQuestion {
  text: string;
  key: string;
  audience: QuestionAudience;
}

export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tekst bez znaków diakrytycznych — reguły tematów piszemy w ASCII. */
function asciiNorm(s: string): string {
  return normalizeQuestion(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0142/g, "l");
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0142/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * Tematy, które instytucje zadają w kółko w różnych sformułowaniach
 * („Czy Klient jest przedsiębiorcą? Proszę o NIP" vs „NIP Pożyczkobiorcy").
 * Bez tego klient dostaje to samo pytanie dwa razy w jednej wiadomości.
 * Kolejność ma znaczenie — reguła bardziej szczegółowa musi być wyżej.
 */
const TOPIC_RULES: Array<{ key: string; test: RegExp }> = [
  { key: "wzmianka_kw", test: /wzmiank|rep ?c |dz kw/ },
  { key: "kw_aktualnosc", test: /(\bkw\b|ksieg\w* wieczyst\w*).*(aktualn|poprawn|prawidlow)/ },
  { key: "status_wniosku", test: /decyzj\w* w sprawie|czy jest decyzj|status wniosku/ },
  { key: "nip_dzialalnosc", test: /\bnip\b|przedsiebiorc|dzialalnosc gospodarcz/ },
  { key: "wyniki_finansowe", test: /wynik\w* finansow|sprawozdan|pit |bilans/ },
  { key: "start_up", test: /start ?up|istniejaca firma/ },
  { key: "dochod", test: /dochod|zarobk|z czego (sie )?utrzym|przychod/ },
  {
    key: "cel_pozyczki",
    test: /cel (pozyczki|kredytu)|na co .*(przeznacz|srodki)|przeznaczenie srodkow/,
  },
  {
    key: "plan_splaty",
    test: /plan\w* .*splat|z czego .*splat|zrodlo splaty|obsluga pozyczki|z czego bedzie obsluga/,
  },
  { key: "wiek", test: /\bwiek\b|ile lat ma|w jakim wieku/ },
  { key: "zaleglosci_zus_us", test: /\bzus\b|urzed\w* skarbow|zaleglosc/ },
  { key: "kto_mieszka", test: /kto (mieszka|zamieszkuje)|zamieszkuje wskazana/ },
  { key: "powierzchnia", test: /powierzchni/ },
  { key: "wlasciciel", test: /wlascicie/ },
  { key: "prowizja_kwota", test: /prowizj|brutto|koszt\w* notariusz/ },
  { key: "zdjecia_nieruchomosci", test: /zdjec|fotografi/ },
  { key: "dostep_do_drogi", test: /drog\w* publiczn|dostep do drogi/ },
];

/**
 * Pytania, na które odpowiada biuro (mamy dane w KW / w systemie), a nie
 * klient. Wysyłanie ich klientowi to strata czasu i wiarygodności.
 */
const OFFICE_TOPICS = new Set(["kw_aktualnosc", "wzmianka_kw", "status_wniosku"]);

/** Klucz tematu: reguła słownikowa, podpowiedź modelu albo znormalizowany tekst. */
export function questionKey(text: string, hint?: string | null): string {
  const ascii = asciiNorm(text);
  const rule = TOPIC_RULES.find((r) => r.test.test(ascii));
  if (rule) return rule.key;
  const hinted = hint ? slug(hint) : "";
  if (hinted) return hinted;
  return normalizeQuestion(text);
}

export function audienceFor(text: string, key: string, hint?: string | null): QuestionAudience {
  if (OFFICE_TOPICS.has(key)) return "biuro";
  return hint === "biuro" ? "biuro" : "klient";
}

/**
 * Wejście z modelu: tablica stringów (stary format) albo obiektów
 * `{text, key, audience}`. Zwraca listę bez duplikatów w obrębie jednego maila.
 */
export function parseExtractedQuestions(raw: unknown): ExtractedQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtractedQuestion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text =
      typeof item === "string"
        ? item.trim()
        : String((item as { text?: unknown } | null)?.text ?? "").trim();
    if (!text) continue;
    const hintKey =
      typeof item === "object" && item
        ? ((item as { key?: unknown }).key as string | undefined)
        : undefined;
    const hintAudience =
      typeof item === "object" && item
        ? ((item as { audience?: unknown }).audience as string | undefined)
        : undefined;
    const key = questionKey(text, hintKey ?? null);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, key, audience: audienceFor(text, key, hintAudience ?? null) });
  }
  return out;
}

/** Stan wątku widziany oczami operatora (a nie kolumna `status` w bazie). */
export type QaThreadStateKey =
  | "zablokowane"
  | "do_wyslania"
  | "czeka"
  | "czesciowo"
  | "przekazane"
  | "zamkniete";

export interface QaThreadStateInput {
  status: string;
  questions?: ThreadQuestion[] | null;
  blocked_reason?: string | null;
  last_sent_to_client_at?: string | null;
  forwarded_at?: string | null;
}

export interface QaThreadState {
  key: QaThreadStateKey;
  label: string;
  /** Wymaga reakcji człowieka — sortowanie i badge w nawigacji. */
  needsAttention: boolean;
}

const STATE_LABELS: Record<QaThreadStateKey, string> = {
  zablokowane: "Nie da się wysłać — wymaga reakcji",
  do_wyslania: "Pytania zebrane — jeszcze nie wysłane",
  czeka: "Wysłane — czekamy na odpowiedź",
  czesciowo: "Część odpowiedzi przekazana — brakuje reszty",
  przekazane: "Odpowiedź przekazana instytucjom",
  zamkniete: "Zamknięte",
};

export function deriveQaThreadState(t: QaThreadStateInput): QaThreadState {
  const state = (key: QaThreadStateKey): QaThreadState => ({
    key,
    label: STATE_LABELS[key],
    needsAttention: key === "zablokowane",
  });
  if (t.status === "zamkniete") return state("zamkniete");
  if (t.status === "przekazane") return state("przekazane");
  if (t.blocked_reason) return state("zablokowane");
  const questions = t.questions ?? [];
  const unasked = questions.filter((q) => !q.asked_client_at);
  if (!t.last_sent_to_client_at) return state("do_wyslania");
  if (t.forwarded_at) return state("czesciowo");
  if (unasked.length > 0) return state("do_wyslania");
  return state("czeka");
}

/** Pytania nadal czekające na odpowiedź klienta (wysłane, bez odpowiedzi). */
export function outstandingQuestions(questions: ThreadQuestion[]): ThreadQuestion[] {
  return questions.filter((q) => q.asked_client_at && !q.answered_at);
}

export function buildClientMessage(
  questions: ThreadQuestion[],
  opts: { reminder?: boolean } = {},
): string {
  const lines = questions.map((q, i) => `${i + 1}. ${q.text}`);
  const intro = opts.reminder
    ? `wracamy do pytań, które przesłaliśmy w sprawie Twojego wniosku — bez tych informacji ` +
      `instytucja nie dokończy oceny:`
    : `instytucja finansująca analizująca Twój wniosek prosi o dodatkowe informacje:`;
  return (
    `Dzień dobry,\n\n` +
    `${intro}\n\n` +
    `${lines.join("\n")}\n\n` +
    `Odpowiedz po prostu na tę wiadomość — przekażemy odpowiedzi dalej. ` +
    `Jeśli wniosek spotka się z zainteresowaniem, otrzymasz konkretną ofertę finansową.\n\n` +
    `Zespół Finance You`
  );
}
