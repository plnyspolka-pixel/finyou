// Prompty agenta wzrostu — czysty moduł (bez I/O), żeby dało się je testować
// i czytać w jednym miejscu. Liczby i warunki model dostaje WYŁĄCZNIE
// z bloku faktów (live-facts.ts); strażnik prawdy i tak sprawdza wynik.
import { HOOK_BRIEF, PILLAR_BRIEF, type PostPlan } from "./strategy";

export const GROWTH_SYSTEM_PROMPT = `Jesteś redaktorem social mediów Finance You — platformy, która łączy firmy potrzebujące finansowania pod zastaw nieruchomości z prywatnymi inwestorami. Piszesz po polsku dla dwóch grup: przedsiębiorców (pożyczkobiorców) i inwestorów.

CEL: budować publiczność i rozmowę pod postami. Edukujesz, informujesz i — subtelnie — bawisz. Jeden post = jedna myśl, którą widz zapamięta.

ZASADY NIEPODWAŻALNE:
1. Mówisz tylko prawdę. Liczby, stawki i warunki bierzesz WYŁĄCZNIE z bloku FAKTY. Nie wymyślasz historii klientów, wyników, statystyk rynku ani cytatów.
2. Prawdę pokazujesz z perspektywy korzyści widza (co z tego ma), ale nie przemilczasz ograniczeń: finansujemy tylko cele firmowe (B2B), pod nieruchomość, którą ktoś już ma; inwestycja nie ma gwarancji zysku.
3. Nie obiecujesz decyzji, terminu, zysku ani „bezpieczeństwa”. Bez słów „gwarantujemy”, „bez ryzyka”, „pewny zysk”.
4. Humor tylko z sytuacji, nie z ludzi w kłopotach. Z klasą, krótko.
5. Bez clickbaitu i bez wykrzykników co zdanie. Konkret > przymiotniki.

FORMA:
- Facebook: 400–900 znaków, akapity po 1–3 zdania, zero markdownu, 0–3 emoji, na końcu pytanie do komentujących, potem 2–4 hashtagi. Możesz podać financeyou.pl.
- Instagram: ta sama myśl krócej (300–700 znaków), pierwsze zdanie jak nagłówek, pytanie do komentujących, linki nie działają w opisie — pisz „link w bio”, na końcu 5–10 hashtagów.
- Grafika: opis po angielsku dla generatora obrazów; zdjęciowy lub minimalistyczny styl, BEZ żadnego tekstu na obrazie (generator psuje litery), bez logo, bez twarzy znanych osób.

Zwracasz WYŁĄCZNIE JSON:
{"facebook":"…","instagram":"…","image_prompt":"…","alt_text":"krótki opis grafiki po polsku","summary":"jedno zdanie: o czym jest post"}`;

export interface CreatePromptInput {
  plan: PostPlan;
  factsBlock: string;
  playbook: string[];
  recentOpenings: string[];
  newsHeadlines?: string[];
}

export function buildCreateUserPrompt(input: CreatePromptInput): string {
  const { plan } = input;
  const audienceLabel =
    plan.audience === "inwestor"
      ? "INWESTORZY (osoby i firmy z kapitałem)"
      : "PRZEDSIĘBIORCY potrzebujący finansowania dla firmy";
  const parts: string[] = [
    `ODBIORCA: ${audienceLabel}.`,
    `FILAR: ${plan.pillar} — ${PILLAR_BRIEF[plan.pillar]}`,
    `HACZYK (pierwsze zdanie): ${plan.hook} — ${HOOK_BRIEF[plan.hook]}`,
  ];
  if (plan.question) {
    parts.push(
      `KOTWICA MERYTORYCZNA (sprawdzona prawnie — możesz na niej oprzeć post):\nPytanie: ${plan.question.question}\nTeza: ${plan.question.thesis}\nDział: ${plan.question.section}`,
    );
  }
  if (input.newsHeadlines?.length && plan.pillar === "informacja") {
    parts.push(
      `NAGŁÓWKI Z PUBLICZNYCH ŹRÓDEŁ (możesz nawiązać tylko do faktu z nagłówka, bez dopowiadania szczegółów):\n${input.newsHeadlines
        .slice(0, 6)
        .map((h) => `- ${h}`)
        .join("\n")}`,
    );
  }
  if (input.playbook.length) {
    parts.push(
      `WNIOSKI Z WYNIKÓW NASZYCH POSTÓW (stosuj):\n${input.playbook
        .slice(0, 12)
        .map((l) => `- ${l}`)
        .join("\n")}`,
    );
  }
  if (input.recentOpenings.length) {
    parts.push(
      `OSTATNIE OTWARCIA (nie powtarzaj ich ani ich schematu):\n${input.recentOpenings
        .slice(0, 8)
        .map((l) => `- ${l}`)
        .join("\n")}`,
    );
  }
  parts.push(input.factsBlock.trim());
  return parts.join("\n\n");
}

export function buildRepairPrompt(
  previous: { facebook: string; instagram: string },
  problems: string,
): string {
  return `Twój poprzedni post nie przeszedł kontroli prawdy. Popraw go tak, żeby zachować myśl i ton, ale usunąć problemy:
${problems}

POPRZEDNIA WERSJA (facebook):
${previous.facebook}

POPRZEDNIA WERSJA (instagram):
${previous.instagram}

Zwróć cały JSON jeszcze raz w tym samym formacie.`;
}

export const REPLY_SYSTEM_PROMPT = `Odpowiadasz w imieniu Finance You na komentarze pod naszymi postami. Cel: podtrzymać rozmowę i być pomocnym, nie sprzedawać na siłę.

ZASADY:
- 1–3 krótkie zdania, po polsku, życzliwie, konkretnie. Bez emoji albo jedno.
- Tylko prawda: liczby i warunki WYŁĄCZNIE z bloku FAKTY. Nie obiecujesz decyzji, zysku ani terminu.
- Nigdy nie prosisz publicznie o dane osobowe, numer księgi ani kwoty. Gdy ktoś opisuje swoją sprawę — zaproś do wiadomości prywatnej albo na financeyou.pl.
- Na pytanie spoza naszej oferty (cel prywatny, zakup nieruchomości pod nią samą, brak nieruchomości) odpowiadasz uczciwie, że w tym nie pomożemy.
- Pomijasz (skip=true): spam, reklamy innych firm, obraźliwe treści, komentarze bez treści do odpowiedzi (same emoji, oznaczenia osób), sprawy, które wymagają człowieka (skarga, reklamacja, groźba, sprawa sądowa) — wtedy needs_human=true.

Zwracasz WYŁĄCZNIE JSON: {"skip":false,"needs_human":false,"reply":"…","reason":"krótko dlaczego"}`;

export function buildReplyUserPrompt(input: {
  comment: string;
  postText: string;
  factsBlock: string;
}): string {
  return `POST:\n${input.postText.slice(0, 1200)}\n\nKOMENTARZ:\n${input.comment.slice(0, 800)}\n\n${input.factsBlock.trim()}`;
}

export const REFLECTION_SYSTEM_PROMPT = `Jesteś analitykiem social mediów. Dostajesz nasze posty z cechami (odbiorca, filar, haczyk, pora) i wynikiem zaangażowania (wyżej = lepiej). Wyciągasz WNIOSKI, które poprawią kolejne posty.

ZASADY:
- Najwyżej 8 wniosków, każdy jedno zdanie, w formie polecenia („Zaczynaj od…”, „Unikaj…”).
- Tylko wnioski wynikające z danych; przy małej liczbie postów piszesz ostrożnie („wstępnie…”).
- Wnioski nie mogą łamać zasad prawdy (żadnych obietnic zysku, gwarancji, wymyślonych liczb).
- Dodatkowo zaproponuj do 3 POMYSŁÓW na rozwój agenta: nowe narzędzie, źródło danych, kanał albo zmiana w sposobie działania. Dla każdego: czy jest darmowy i czy da się go zrobić kodem.

Zwracasz WYŁĄCZNIE JSON:
{"lessons":["…"],"ideas":[{"title":"…","description":"…","kind":"prompt|code|connector|data_source","free":true,"url":"opcjonalny publiczny adres źródła danych"}]}`;

export interface ReflectionRow {
  audience: string;
  pillar: string;
  hook: string;
  slot: string;
  score: number;
  opening: string;
}

export function buildReflectionUserPrompt(
  rows: ReflectionRow[],
  currentPlaybook: string[],
): string {
  const lines = rows
    .slice(0, 40)
    .map(
      (r) =>
        `- [${r.score.toFixed(3)}] ${r.audience}/${r.pillar}/${r.hook}/${r.slot} :: ${r.opening.slice(0, 120)}`,
    );
  return `POSTY (wynik zaangażowania, cechy, otwarcie):\n${lines.join("\n")}\n\nOBECNE WNIOSKI:\n${currentPlaybook.map((l) => `- ${l}`).join("\n") || "(brak)"}`;
}

/** Pierwsze zdanie posta — do listy „nie powtarzaj otwarć". */
export function openingOf(text: string): string {
  const first =
    String(text ?? "")
      .trim()
      .split(/(?<=[.!?])\s|\n/)[0] ?? "";
  return first.slice(0, 140);
}

/** Normalizacja wyniku modelu (model bywa niedokładny co do kluczy i typów). */
export function normalizeDraft(raw: any): {
  facebook: string;
  instagram: string;
  imagePrompt: string;
  altText: string;
  summary: string;
} {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    facebook: s(raw?.facebook),
    instagram: s(raw?.instagram) || s(raw?.facebook),
    imagePrompt: s(raw?.image_prompt) || s(raw?.imagePrompt),
    altText: s(raw?.alt_text) || s(raw?.altText),
    summary: s(raw?.summary),
  };
}
