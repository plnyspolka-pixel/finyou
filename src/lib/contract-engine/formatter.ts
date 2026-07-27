/**
 * Podgląd tekstowy struktury dokumentu — port `formatter.py`.
 * Służy do diffów, przeglądu i testów regresyjnych treści.
 */

import type { Dokument, Strona } from "./renderer";

// Wierny port `textwrap.fill` (initial_indent="", drop_whitespace=True,
// break_long_words=True, break_on_hyphens=True). Odwzorowuje regułę
// zachowywania białych znaków na początku akapitu (pierwszy wiersz zachowuje
// wcięcie prefiksu, np. „   a) ...”) oraz łamanie po myślnikach
// („Lublin-” / „Wschód”), żeby podgląd był bajt w bajt zgodny z silnikiem.
const WS = "[\\t\\n\\x0b\\x0c\\r ]";
const NWS = "[^\\t\\n\\x0b\\x0c\\r ]";
const LT = "[\\p{L}_]";
const WP = "[\\p{L}\\p{N}_!\"'&.,?]";
const W = "[\\p{L}\\p{N}_]";
const WORDSEP_RE = new RegExp(
  "(" +
    WS +
    "+" +
    "|(?<=" +
    WP +
    ")-{2,}(?=" +
    W +
    ")" +
    "|" +
    NWS +
    "+?(?:" +
    "-(?:(?<=" +
    LT +
    "{2}-)|(?<=" +
    LT +
    "-" +
    LT +
    "-))(?=" +
    LT +
    "-?" +
    LT +
    ")" +
    "|(?=" +
    WS +
    "|$)" +
    "|(?<=" +
    WP +
    ")(?=-{2,}" +
    W +
    ")" +
    ")" +
    ")",
  "u",
);

function splitChunks(text: string): string[] {
  return text.split(WORDSEP_RE).filter((c) => c !== undefined && c !== "");
}

function handleLongWord(rev: string[], curLine: string[], curLen: number, width: number): void {
  const spaceLeft = width < 1 ? 1 : width - curLen;
  const chunk = rev[rev.length - 1];
  let end = spaceLeft;
  if (chunk.length > spaceLeft) {
    const hyphen = chunk.lastIndexOf("-", spaceLeft - 1);
    if (hyphen > 0 && [...chunk.slice(0, hyphen)].some((c) => c !== "-")) end = hyphen + 1;
  }
  curLine.push(chunk.slice(0, end));
  rev[rev.length - 1] = chunk.slice(end);
}

function fill(text: string, width: number, subsequentIndent = ""): string {
  const rev = splitChunks(text).reverse();
  const lines: string[] = [];
  while (rev.length) {
    const curLine: string[] = [];
    let curLen = 0;
    const indent = lines.length ? subsequentIndent : "";
    const w = width - indent.length;

    if (rev[rev.length - 1].trim() === "" && lines.length) rev.pop();

    while (rev.length) {
      const l = rev[rev.length - 1].length;
      if (curLen + l <= w) {
        curLine.push(rev.pop() as string);
        curLen += l;
      } else {
        break;
      }
    }

    if (rev.length && rev[rev.length - 1].length > w) {
      handleLongWord(rev, curLine, curLen, w);
      curLen = curLine.reduce((a, c) => a + c.length, 0);
    }

    if (curLine.length && curLine[curLine.length - 1].trim() === "") {
      curLen -= curLine[curLine.length - 1].length;
      curLine.pop();
    }

    if (curLine.length) lines.push(indent + curLine.join(""));
  }
  return lines.join("\n");
}

// odpowiednik str.center (formuła CPythona co do rozkładu marginesu)
function center(s: string, width: number): string {
  const marg = width - s.length;
  if (marg <= 0) return s;
  const left = Math.floor(marg / 2) + (marg & width & 1);
  return " ".repeat(left) + s + " ".repeat(marg - left);
}

function etykietaPodpisu(strona: Strona, mianownik: Record<string, string>): string {
  let rola = mianownik[strona.rola] ?? strona.rola;
  if (strona.grupa === "pozyczkobiorca" && rola.endsWith("ami")) rola = "Pożyczkobiorca";
  const nazwa = strona.opis.split(",")[0].trim();
  if (strona.grupa) return `${rola}\n${nazwa}`;
  return rola;
}

export function formatuj(doc: Dokument, szerokosc = 96): string {
  const L: string[] = [];
  const A = (s: string) => L.push(s);

  A("UMOWA POŻYCZKI");
  if (doc.meta.numer_umowy) A(`nr ${doc.meta.numer_umowy}`);
  A("");
  const k = doc.komparycja;
  A(`zawarta dnia ${k.data} w ${k.miejscowosc} pomiędzy:`);
  A("");
  k.strony.forEach((s, i) => {
    let tekst = `${s.opis}, zwanym/ą dalej „${s.rola}"`;
    tekst += i < k.strony.length - 1 ? "," : ".";
    A(fill(tekst, szerokosc));
    A("");
  });

  for (const sek of doc.sekcje) {
    A("");
    A(`§ ${sek.numer} – ${sek.tytul}`);
    A("");
    for (const u of sek.ustepy) {
      if (u.poziom === "ustep") {
        const prefix = `${u.numer}. `;
        A(fill(prefix + u.tekst, szerokosc, "   "));
      } else {
        const prefix = `   ${u.litera ?? "-"} `;
        A(fill(prefix + u.tekst, szerokosc, "      "));
      }
      A("");
    }
  }

  A("");
  A("ZAŁĄCZNIKI");
  A("");
  for (const z of doc.zalaczniki) {
    A(`  Załącznik nr ${z.nr} — ${z.tytul}`);
  }

  A("");
  A("");
  A("PODPISY");
  A("");
  const MIANOWNIK: Record<string, string> = {
    Pożyczkobiorcą: "Pożyczkobiorca",
    Poręczycielem: "Poręczyciel",
    "Właścicielem nieruchomości": "Właściciel nieruchomości",
    Pożyczkodawcą: "Pożyczkodawca",
  };
  const role = doc.komparycja.strony.map((s) => etykietaPodpisu(s, MIANOWNIK));
  const szer = Math.max(...role.map((r) => r.length)) + 2;
  A("   " + role.map(() => ".".repeat(szer)).join("   "));
  A("   " + role.map((r) => center(r, szer)).join("   "));

  return L.join("\n");
}
