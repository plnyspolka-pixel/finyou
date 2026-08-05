/**
 * Renderer wzoru umowy pożyczki (Handlebars-DOCX).
 *
 * Wzór (`wzor-umowy.docx`) używa składni:
 *   {{pole}}                     — podstawienie wartości,
 *   {{#if flaga}}…{{else}}…{{/if}} — klauzule opcjonalne (całe akapity),
 *   {{#each raty}}…{{/each}}      — wiersz tabeli harmonogramu powtarzany per rata,
 *   {{n}} / {{n:etykieta}}        — automatyczna numeracja ustępów (reset w każdym §),
 *   {{ref "etykieta"}}           — odwołanie do numeru ustępu spod {{n:etykieta}}.
 *
 * Renderer działa na `word/document.xml` — zachowuje pełne formatowanie wzoru
 * (czcionki, tabele, checkboxy). Kolejność przetwarzania jest istotna: pętle i
 * warunki NAJPIERW (bo zmieniają, które ustępy istnieją), potem numeracja, na
 * końcu odwołania i pola.
 */

import { xmlToPlainText } from "@/lib/document-fields";

export interface WzorData {
  /** Wartości pól {{pole}} (nazwa → wartość). */
  pola: Record<string, string>;
  /** Flagi klauzul opcjonalnych {{#if flaga}} (nazwa → bool). */
  flagi: Record<string, boolean>;
  /** Wiersze harmonogramu do {{#each raty}}. */
  raty: Array<Record<string, string>>;
}

const CTRL = new Set(["else"]); // tokeny sterujące pozostawiane do wycięcia

// ── pomocnicze na tekście XML ────────────────────────────────

/** Scala tagi rozbijające token `{{ … }}` w jeden ciągły token. */
function scalKlamry(xml: string): string {
  return xml.replace(/\{\{(?:<[^>]+>|[^{}])*?\}\}/g, (m) => m.replace(/<[^>]+>/g, ""));
}

/** Tekst akapitu/fragmentu — konkatenacja zawartości <w:t>. */
function tekstZFragmentu(frag: string): string {
  const t = frag.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
  return t
    .map((x) => x.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escXml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Usuwa pierwszy akapit <w:p>, którego tekst zawiera `substr`. */
function usunAkapitZ(xml: string, substr: string): string {
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (tekstZFragmentu(m[0]).includes(substr)) {
      return xml.slice(0, m.index) + xml.slice(m.index + m[0].length);
    }
  }
  return xml;
}

// ── granice akapitu wokół pozycji ────────────────────────────
function akapitWokol(xml: string, idx: number): { start: number; end: number } {
  // początek <w:p (pomijamy <w:pPr, <w:pStyle itd. — bierzemy "<w:p>" lub "<w:p ")
  let s = -1;
  for (let p = xml.lastIndexOf("<w:p", idx); p >= 0; p = xml.lastIndexOf("<w:p", p - 1)) {
    const after = xml[p + 4];
    if (after === ">" || after === " ") {
      s = p;
      break;
    }
  }
  if (s < 0) s = idx;
  const eClose = xml.indexOf("</w:p>", idx);
  const e = eClose >= 0 ? eClose + "</w:p>".length : xml.length;
  return { start: s, end: e };
}

// ── 1. pętla {{#each raty}} (wiersz tabeli) ──────────────────
function rozwinEach(xml: string, raty: Array<Record<string, string>>): string {
  const startTok = "{{#each raty}}";
  const endTok = "{{/each}}";
  const i = xml.indexOf(startTok);
  if (i < 0) return xml;
  const j = xml.indexOf(endTok, i);
  if (j < 0) return xml;
  // wiersz <w:tr> obejmujący oba znaczniki
  const rowStart = xml.lastIndexOf("<w:tr", i);
  const rowEndClose = xml.indexOf("</w:tr>", j);
  if (rowStart < 0 || rowEndClose < 0) return xml;
  const rowEnd = rowEndClose + "</w:tr>".length;
  const rowTpl = xml.slice(rowStart, rowEnd).split(startTok).join("").split(endTok).join("");

  const rows = (raty ?? [])
    .map((rata) =>
      rowTpl.replace(/\{\{([a-zA-Z_][\w.]*)\}\}/g, (whole, key: string) =>
        rata[key] != null ? escXml(String(rata[key])) : whole,
      ),
    )
    .join("");

  return xml.slice(0, rowStart) + rows + xml.slice(rowEnd);
}

// ── 2. warunki {{#if}}{{else}}{{/if}} (akapity) ──────────────
function dopasujIf(xml: string, ifStart: number): { elseIdx: number | null; endIdx: number } {
  const re = /\{\{#if\b[^}]*\}\}|\{\{else\}\}|\{\{\/if\}\}/g;
  re.lastIndex = ifStart + 2; // za pierwszym "{{"
  let depth = 0;
  let elseIdx: number | null = null;
  let m: RegExpExecArray | null;
  // policz pierwszy #if jako depth 0
  // ręcznie: zaczynamy scan od ifStart
  re.lastIndex = ifStart;
  let first = true;
  while ((m = re.exec(xml)) !== null) {
    const tok = m[0];
    if (tok.startsWith("{{#if")) {
      if (first) {
        first = false;
        depth = 1;
      } else {
        depth++;
      }
    } else if (tok === "{{else}}") {
      if (depth === 1 && elseIdx === null) elseIdx = m.index;
    } else if (tok === "{{/if}}") {
      depth--;
      if (depth === 0) return { elseIdx, endIdx: m.index };
    }
  }
  return { elseIdx, endIdx: -1 };
}

function rozwinIfy(xml: string, flagi: Record<string, boolean>): string {
  for (let guard = 0; guard < 200; guard++) {
    const ifm = /\{\{#if\s+([\w.]+)\s*\}\}/.exec(xml);
    if (!ifm) break;
    const ifStart = ifm.index;
    const cond = ifm[1];
    const { elseIdx, endIdx } = dopasujIf(xml, ifStart);
    if (endIdx < 0) {
      // niesparowany — wytnij sam znacznik, żeby nie zapętlić
      xml = xml.slice(0, ifStart) + xml.slice(ifStart + ifm[0].length);
      continue;
    }
    const ifPar = akapitWokol(xml, ifStart);
    const endPar = akapitWokol(xml, endIdx);
    const on = !!flagi[cond];

    let keep = "";
    if (elseIdx !== null) {
      const elsePar = akapitWokol(xml, elseIdx);
      const trueContent = xml.slice(ifPar.end, elsePar.start);
      const falseContent = xml.slice(elsePar.end, endPar.start);
      keep = on ? trueContent : falseContent;
    } else {
      const content = xml.slice(ifPar.end, endPar.start);
      keep = on ? content : "";
    }
    xml = xml.slice(0, ifPar.start) + keep + xml.slice(endPar.end);
  }
  return xml;
}

// ── 3. numeracja {{n}} / {{n:label}} + reset na § ────────────
const HEADING_RE = /^\s*§\s*\d+\s*[–—-]/;

function numeruj(xml: string): { xml: string; etykiety: Record<string, number> } {
  const etykiety: Record<string, number> = {};
  let licznik = 0;
  let ostatni = 0;
  const out = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para) => {
    const txt = tekstZFragmentu(para);
    if (HEADING_RE.test(txt)) licznik = 0;
    let p = para.replace(/\{\{n:([\w-]+)\}\}/g, (_m, label: string) => {
      licznik += 1;
      ostatni = licznik;
      etykiety[label] = licznik;
      return String(licznik);
    });
    p = p.replace(/\{\{n\}\}/g, () => {
      licznik += 1;
      ostatni = licznik;
      return String(licznik);
    });
    // {{ref "poprzedni"}} rozwiązujemy tu (numer bieżącego/ostatniego ustępu).
    // W XML cudzysłowy są jako &quot; — dopuszczamy oba warianty.
    p = p.replace(/\{\{ref\s+(?:&quot;|")poprzedni(?:&quot;|")\}\}/g, () => String(ostatni || 1));
    return p;
  });
  return { xml: out, etykiety };
}

// ── 4. odwołania {{ref "label"}} ─────────────────────────────
function rozwinRef(xml: string, etykiety: Record<string, number>): string {
  // Cudzysłowy w XML to &quot; (Word). Dopuszczamy też zwykłe ".
  return xml.replace(
    /\{\{ref\s+(?:&quot;|")([\w-]+)(?:&quot;|")\}\}/g,
    (whole, label: string) => (etykiety[label] != null ? String(etykiety[label]) : whole),
  );
}

// ── 5. pola {{pole}} ─────────────────────────────────────────
function podstawPola(xml: string, pola: Record<string, string>): string {
  return xml.replace(/\{\{([a-zA-Z_][\w.]*)\}\}/g, (whole, key: string) => {
    if (CTRL.has(key)) return ""; // resztki tokenów sterujących
    const v = pola[key];
    if (v == null || String(v).trim() === "") return whole; // brak → zostaw token
    return escXml(String(v));
  });
}

/** Renderuje treść `word/document.xml` wzoru na podstawie danych. */
export function renderujXml(xml: string, data: WzorData): string {
  let out = scalKlamry(xml);
  // usuń akapit-instrukcję dla generatora (zawiera przykładowe {{...}})
  out = usunAkapitZ(out, "Wzór do zasilenia przez generator");
  out = usunAkapitZ(out, "WZÓR — UMOWA POŻYCZKI");
  out = rozwinEach(out, data.raty ?? []);
  out = rozwinIfy(out, data.flagi ?? {});
  const { xml: numerowany, etykiety } = numeruj(out);
  out = rozwinRef(numerowany, etykiety);
  out = podstawPola(out, data.pola ?? {});
  return out;
}

/** Podgląd tekstowy wyrenderowanej umowy (do UI). */
export function renderujTekst(xml: string, data: WzorData): string {
  return xmlToPlainText(renderujXml(xml, data));
}

// ── katalog pól / flag / kolumn harmonogramu (dla formularza i AI) ──

export interface PoleWzoru {
  key: string;
  label: string;
  typ?: "text" | "amount" | "date" | "email" | "phone" | "long";
}
export interface GrupaPol {
  grupa: string;
  /** Flaga {{#if}} włączająca tę grupę (opcjonalnie). */
  flaga?: string;
  pola: PoleWzoru[];
}

export const FLAGI: { key: string; label: string }[] = [
  { key: "ma_poreczyciela", label: "Umowa z poręczycielem" },
  { key: "wyplata_gotowka", label: "Wypłata (części) w gotówce" },
  { key: "roszczenie_oproznione_miejsce", label: "Roszczenie o opróżnione miejsce hipoteczne" },
  { key: "ma_posrednika", label: "Transakcja z pośrednikiem" },
];

/** Kolumny wiersza harmonogramu ({{#each raty}}). */
export const KOLUMNY_RATY: PoleWzoru[] = [
  { key: "nr", label: "Nr" },
  { key: "data", label: "Termin", typ: "date" },
  { key: "kapital", label: "Kapitał", typ: "amount" },
  { key: "odsetki", label: "Odsetki", typ: "amount" },
  { key: "rata_prowizji", label: "Rata prowizji", typ: "amount" },
  { key: "rata_laczna", label: "Rata łączna", typ: "amount" },
  { key: "saldo", label: "Saldo", typ: "amount" },
];

export const GRUPY_POL: GrupaPol[] = [
  {
    grupa: "Wnioskodawca (wniosek)",
    pola: [
      { key: "wnioskodawca_nazwa", label: "Imię i nazwisko / Firma" },
      { key: "wnioskodawca_pesel", label: "PESEL" },
      { key: "wnioskodawca_nip", label: "NIP" },
      { key: "wnioskodawca_dowod", label: "Seria i nr dokumentu" },
      { key: "wnioskodawca_adres", label: "Adres" },
      { key: "wnioskodawca_telefon", label: "Telefon", typ: "phone" },
      { key: "wnioskodawca_email", label: "E-mail", typ: "email" },
    ],
  },
  {
    grupa: "Pożyczkobiorca (umowa)",
    pola: [
      { key: "pozyczkobiorca_nazwa", label: "Nazwa / imię i nazwisko" },
      { key: "pozyczkobiorca_opis", label: "Opis strony (np. forma prawna)" },
      { key: "pozyczkobiorca_adres", label: "Adres" },
      { key: "pozyczkobiorca_pesel", label: "PESEL" },
      { key: "pozyczkobiorca_nip", label: "NIP" },
      { key: "pozyczkobiorca_regon", label: "REGON" },
      { key: "pozyczkobiorca_dowod", label: "Dokument tożsamości" },
      { key: "pozyczkobiorca_telefon", label: "Telefon", typ: "phone" },
      { key: "pozyczkobiorca_email", label: "E-mail", typ: "email" },
    ],
  },
  {
    grupa: "Pożyczkodawca",
    pola: [
      { key: "pozyczkodawca_nazwa", label: "Nazwa" },
      { key: "pozyczkodawca_miasto", label: "Miasto siedziby" },
      { key: "pozyczkodawca_reprezentant", label: "Reprezentant" },
      { key: "pozyczkodawca_adres", label: "Adres" },
      { key: "pozyczkodawca_krs", label: "KRS" },
      { key: "pozyczkodawca_nip", label: "NIP" },
      { key: "pozyczkodawca_regon", label: "REGON" },
    ],
  },
  {
    grupa: "Poręczyciel",
    flaga: "ma_poreczyciela",
    pola: [
      { key: "poreczyciel_nazwa", label: "Nazwa / imię i nazwisko" },
      { key: "poreczyciel_adres", label: "Adres" },
      { key: "poreczyciel_pesel", label: "PESEL" },
      { key: "poreczenie_kwota", label: "Kwota poręczenia", typ: "amount" },
    ],
  },
  {
    grupa: "Pośrednik",
    flaga: "ma_posrednika",
    pola: [{ key: "posrednik_nazwa", label: "Nazwa pośrednika" }],
  },
  {
    grupa: "Warunki pożyczki",
    pola: [
      { key: "kwota_pozyczki", label: "Kwota pożyczki", typ: "amount" },
      { key: "kwota_pozyczki_slownie", label: "Kwota słownie" },
      { key: "okres_miesiace", label: "Okres (miesiące)" },
      { key: "cel_pozyczki", label: "Cel pożyczki", typ: "long" },
      { key: "oprocentowanie", label: "Oprocentowanie (%)" },
      { key: "prowizja_kwota", label: "Prowizja", typ: "amount" },
      { key: "prowizja_slownie", label: "Prowizja słownie" },
      { key: "data_umowy", label: "Data umowy", typ: "date" },
      { key: "miejscowosc", label: "Miejscowość" },
      { key: "data_pierwszej_raty", label: "Data pierwszej raty", typ: "date" },
      { key: "dzien_platnosci", label: "Dzień płatności" },
      { key: "liczba_rat_rownych", label: "Liczba rat równych" },
      { key: "rata_rowna", label: "Rata równa", typ: "amount" },
      { key: "rata_prowizji", label: "Rata prowizji", typ: "amount" },
      { key: "rata_balonowa", label: "Rata balonowa", typ: "amount" },
      { key: "rata_laczna", label: "Rata łączna", typ: "amount" },
    ],
  },
  {
    grupa: "Zabezpieczenie / KW",
    pola: [
      { key: "hipoteka_kwota", label: "Kwota hipoteki", typ: "amount" },
      { key: "hipoteka_kwota_slownie", label: "Kwota hipoteki słownie" },
      { key: "numer_kw", label: "Numer KW" },
      { key: "sad_wieczystoksiegowy", label: "Sąd wieczystoksięgowy" },
      { key: "data_klauzula_777", label: "Data (klauzula 777)", typ: "date" },
      { key: "negocjacje_od", label: "Negocjacje od (data)", typ: "date" },
    ],
  },
  {
    grupa: "Wypłata",
    pola: [
      { key: "kwota_gotowka", label: "Kwota gotówką", typ: "amount" },
      { key: "kwota_gotowka_slownie", label: "Gotówka słownie" },
      { key: "kwota_przelew", label: "Kwota przelewem", typ: "amount" },
      { key: "kwota_przelew_slownie", label: "Przelew słownie" },
      { key: "rachunek_pozyczkobiorcy", label: "Rachunek pożyczkobiorcy" },
      { key: "rachunek_pozyczkodawcy", label: "Rachunek pożyczkodawcy" },
    ],
  },
  {
    grupa: "Tabela opłat windykacyjnych",
    pola: [
      { key: "oplata_monit_sms", label: "Monit SMS", typ: "amount" },
      { key: "oplata_monit_tel", label: "Monit telefoniczny", typ: "amount" },
      { key: "oplata_monit_pisemny", label: "Monit pisemny", typ: "amount" },
      { key: "oplata_wizyta_50", label: "Wizyta (50)", typ: "amount" },
      { key: "oplata_wizyta_100", label: "Wizyta (100)", typ: "amount" },
      { key: "oplata_wizyta_150", label: "Wizyta (150)", typ: "amount" },
      { key: "oplata_wizyta_kolejne", label: "Wizyta kolejna", typ: "amount" },
      { key: "oplata_historia", label: "Historia spłat", typ: "amount" },
      { key: "oplata_dokument", label: "Wydanie dokumentu", typ: "amount" },
      { key: "oplata_aneks", label: "Aneks", typ: "amount" },
      { key: "oplata_zmiana_harmonogramu", label: "Zmiana harmonogramu", typ: "amount" },
      { key: "oplata_promesa", label: "Promesa", typ: "amount" },
      { key: "oplata_przystapienie", label: "Przystąpienie do długu", typ: "amount" },
      { key: "oplata_wznowienie", label: "Wznowienie", typ: "amount" },
    ],
  },
];

/** Wszystkie klucze pól (do promptu AI / walidacji kompletności). */
export function wszystkiePola(): PoleWzoru[] {
  return GRUPY_POL.flatMap((g) => g.pola);
}

