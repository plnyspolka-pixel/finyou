/**
 * Walidacja odesłań wewnętrznych („§ 3 ust. 4”, „§ 5 ust. 1 lit. m”,
 * „Załącznik nr 2”) po numeracji — odesłanie do nieistniejącej jednostki
 * redakcyjnej to błąd blokujący generację.
 *
 * Cytaty przepisów („art. 777 § 1 pkt 5 k.p.c.”, „art. 6 ust. 1 lit. b RODO”)
 * nie są odesłaniami wewnętrznymi — są wycinane przed analizą.
 */

import type { Dokument } from "./renderer";

const SUP = "¹²³⁰-⁹";
/** Cytat przepisu: „art. N[a][¹] [§ N[¹]] [ust. N] [pkt N] [lit. x]”. */
const PRZEPIS_RE = new RegExp(
  `art\\.\\s*\\d+[a-z]?[${SUP}]*` +
    `(?:\\s*§\\s*\\d+[${SUP}]*)?` +
    `(?:\\s*ust\\.\\s*\\d+[a-z]?[${SUP}]*)?` +
    `(?:\\s*pkt\\s*\\d+[a-z]?)?` +
    `(?:\\s*lit\\.\\s*[a-z](?![a-ząćęłńóśźż]))?`,
  "g",
);
const PARAGRAF_RE = /§\s*(\d+)(?:\s*ust\.\s*(\d+))?(?:\s*lit\.\s*([a-z])(?![a-ząćęłńóśźż]))?/g;
const USTEP_RE = /\bust\.\s*(\d+)(?:\s*lit\.\s*([a-z])(?![a-ząćęłńóśźż]))?/g;
const LITERA_RE = /\blit\.\s*([a-z])(?![a-ząćęłńóśźż])/g;
const ZALACZNIK_RE = /Załącznik\p{L}*\s+nr\s+(\d+)/gu;

export interface Odeslanie {
  tekst: string;
  paragraf: number | null; // null = odesłanie względne (bieżący §)
  ustep: number | null;
  litera: string | null;
}

/** Tekst bez cytatów przepisów. */
export function bezPrzepisow(tekst: string): string {
  return tekst.replace(PRZEPIS_RE, " ");
}

/** Odesłania wewnętrzne w tekście (bezwzględne „§ N …” i względne „ust. N …”). */
export function znajdzOdeslania(tekst: string): Odeslanie[] {
  let t = bezPrzepisow(tekst);
  const out: Odeslanie[] = [];
  t = t.replace(PARAGRAF_RE, (m, p, u, l) => {
    out.push({ tekst: m, paragraf: Number(p), ustep: u ? Number(u) : null, litera: l ?? null });
    return " ";
  });
  t = t.replace(USTEP_RE, (m, u, l) => {
    out.push({ tekst: m, paragraf: null, ustep: Number(u), litera: l ?? null });
    return " ";
  });
  t.replace(LITERA_RE, (m, l) => {
    out.push({ tekst: m, paragraf: null, ustep: null, litera: l });
    return " ";
  });
  return out;
}

/** Numery załączników przywołanych w tekście („Załącznik nr 2”, „Załącznikiem nr 1”). */
export function znajdzZalaczniki(tekst: string): number[] {
  return [...tekst.matchAll(ZALACZNIK_RE)].map((m) => Number(m[1]));
}

function istnieje(doc: Dokument, o: Odeslanie, paragrafBiezacy: number | null): boolean {
  const nrPar = o.paragraf ?? paragrafBiezacy;
  const sek = doc.sekcje.find((s) => s.numer === nrPar);
  if (!sek) return false;
  if (o.ustep == null) return o.litera == null;
  const idx = sek.ustepy.findIndex((u) => u.poziom === "ustep" && u.numer === o.ustep);
  if (idx < 0) return false;
  if (o.litera == null) return true;
  for (let i = idx + 1; i < sek.ustepy.length && sek.ustepy[i].poziom === "podpunkt"; i++)
    if (sek.ustepy[i].litera === `${o.litera})`) return true;
  return false;
}

/**
 * Błędy odesłań w treści Umowy (po numeracji). Odesłania względne („ust. 1”)
 * są liczone w obrębie paragrafu, w którym stoją.
 */
export function bledyOdeslanUmowy(doc: Dokument): string[] {
  const bledy: string[] = [];
  const zal = new Set(doc.zalaczniki.map((z) => z.nr));
  for (const sek of doc.sekcje) {
    for (const u of sek.ustepy) {
      for (const o of znajdzOdeslania(u.tekst)) {
        // Sama litera bez ustępu (np. „lit. a”) — względna wobec bieżącego
        // ustępu; w bibliotece nie występuje, więc traktujemy ją jako błąd.
        if (o.paragraf == null && o.ustep == null) {
          bledy.push(`§ ${sek.numer} (${u.zrodlo}): odesłanie „${o.tekst}” bez wskazania ustępu`);
          continue;
        }
        if (!istnieje(doc, o, sek.numer ?? null))
          bledy.push(
            `§ ${sek.numer} (${u.zrodlo}): odesłanie „${o.tekst}” do nieistniejącej jednostki redakcyjnej`,
          );
      }
      for (const nr of znajdzZalaczniki(u.tekst))
        if (!zal.has(nr))
          bledy.push(
            `§ ${sek.numer} (${u.zrodlo}): odesłanie do nieistniejącego Załącznika nr ${nr}`,
          );
    }
  }
  return bledy;
}

/**
 * Błędy odesłań bezwzględnych („§ N ust. M lit. x”, „Załącznik nr N”)
 * w tekście całego kompletu — wniosku, umowy i załączników.
 */
export function bledyOdeslanKompletu(doc: Dokument, tekst: string): string[] {
  const bledy: string[] = [];
  const zal = new Set(doc.zalaczniki.map((z) => z.nr));
  for (const o of znajdzOdeslania(tekst)) {
    if (o.paragraf == null) continue; // względne sprawdza bledyOdeslanUmowy
    if (!istnieje(doc, o, null))
      bledy.push(`Odesłanie „${o.tekst}” do nieistniejącej jednostki redakcyjnej Umowy`);
  }
  for (const nr of new Set(znajdzZalaczniki(tekst)))
    if (!zal.has(nr)) bledy.push(`Odesłanie do nieistniejącego Załącznika nr ${nr}`);
  return bledy;
}
