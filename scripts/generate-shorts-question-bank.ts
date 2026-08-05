// Generuje src/lib/shorts-question-bank.ts z pliku
// docs/shorts/pozyczki-prywatne-250-pytan.md.
// Uruchomienie: bun run scripts/generate-shorts-question-bank.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SOURCE = join(ROOT, "docs/shorts/pozyczki-prywatne-250-pytan.md");
const TARGET = join(ROOT, "src/lib/shorts-question-bank.ts");

const md = readFileSync(SOURCE, "utf8");

type Entry = {
  id: number;
  category: "klient" | "inwestor";
  section: string;
  question: string;
  thesis: string;
};

let category: Entry["category"] = "klient";
let section = "";
let inPart = false;
const entries: Entry[] = [];

for (const line of md.split("\n")) {
  if (/^# Część I /.test(line)) inPart = true;
  if (/^# Część II/.test(line)) category = "inwestor";
  if (!inPart) continue;
  const sec = /^## ([A-K])\. (.+)$/.exec(line);
  if (sec) {
    section = `${sec[1]}. ${sec[2].trim()}`;
    continue;
  }
  const q = /^(\d+)\. \*\*(.+?)\*\* — (.+)$/.exec(line);
  if (q) {
    entries.push({
      id: Number(q[1]),
      category,
      section,
      question: q[2].trim(),
      thesis: q[3].trim(),
    });
  }
}

if (entries.length !== 250) {
  throw new Error(`Oczekiwano 250 pytań, sparsowano ${entries.length}`);
}

const sections = [...new Set(entries.map((e) => e.section))];

const out = `// WYGENEROWANE AUTOMATYCZNIE — nie edytuj ręcznie.
// Źródło: docs/shorts/pozyczki-prywatne-250-pytan.md
// Regeneracja: bun run scripts/generate-shorts-question-bank.ts

export type ShortsCategory = "klient" | "inwestor";

export type ShortsQuestion = {
  id: number;
  category: ShortsCategory;
  section: string;
  question: string;
  thesis: string;
};

// Obowiązkowe otwarcie każdej rolki (znacznik kategorii mówiony przez lektora).
export const SHORTS_OPENERS: Record<ShortsCategory, string> = {
  klient: "Prywatne pożyczki pod zastaw nieruchomości.",
  inwestor: "Inwestowanie w prywatne pożyczki pod zastaw nieruchomości.",
};

export const SHORTS_CATEGORY_LABELS: Record<ShortsCategory, string> = {
  klient: "Klient / pożyczkobiorca",
  inwestor: "Inwestor / pożyczkodawca",
};

export const SHORTS_SECTIONS: string[] = ${JSON.stringify(sections, null, 2)};

export const SHORTS_QUESTIONS: ShortsQuestion[] = ${JSON.stringify(entries, null, 2)};

export function findShortsQuestion(id: number): ShortsQuestion | undefined {
  return SHORTS_QUESTIONS.find((q) => q.id === id);
}

// Prefiks promptu, po którym rozpoznajemy w bibliotece wideo, że job powstał
// z konkretnego pytania z bazy (bez zmiany schematu bazy danych).
export function shortsPromptTag(id: number): string {
  return \`#\${id} · \`;
}

export function shortsPromptForQuestion(q: ShortsQuestion): string {
  return \`\${shortsPromptTag(q.id)}\${q.question}\`;
}

export function parseShortsPromptTag(prompt: string): number | null {
  const m = /^#(\\d{1,3}) · /.exec(prompt);
  return m ? Number(m[1]) : null;
}
`;

writeFileSync(TARGET, out);
console.log(`OK: ${entries.length} pytań → ${TARGET}`);
