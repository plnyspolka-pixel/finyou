/**
 * Formatuje strukturę z renderer.ts do czytelnego tekstu (podgląd/diff).
 * Port z `formatter.py`, z odwzorowaniem textwrap.fill i str.center.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Dokument, Strona } from "./renderer";

/** Odpowiednik textwrap.fill: zwijanie zachłanne na spacjach. */
function fill(text: string, width: number, subsequentIndent = ""): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if ((line + " " + w).length <= width) line += " " + w;
    else {
      lines.push(line);
      line = subsequentIndent + w;
    }
  }
  lines.push(line);
  return lines.join("\n");
}

/** Odpowiednik str.center(width): pad spacjami, nadmiar po prawej. */
function center(s: string, width: number): string {
  if (s.length >= width) return s;
  const marg = width - s.length;
  const left = Math.floor(marg / 2);
  const right = marg - left;
  return " ".repeat(left) + s + " ".repeat(right);
}

const MIANOWNIK: Record<string, string> = {
  Pożyczkobiorcą: "Pożyczkobiorca",
  Poręczycielem: "Poręczyciel",
  "Właścicielem nieruchomości": "Właściciel nieruchomości",
  Pożyczkodawcą: "Pożyczkodawca",
};

function etykietaPodpisu(strona: Strona): string {
  let rola = MIANOWNIK[strona.rola] ?? strona.rola;
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
  for (const z of doc.zalaczniki) A(`  Załącznik nr ${z.nr} — ${z.tytul}`);

  A("");
  A("");
  A("PODPISY");
  A("");
  const role = doc.komparycja.strony.map(etykietaPodpisu);
  const szer = Math.max(...role.map((r) => r.length)) + 2;
  A("   " + role.map(() => ".".repeat(szer)).join("   "));
  A("   " + role.map((r) => center(r, szer)).join("   "));

  return L.join("\n");
}
