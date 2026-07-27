// Most: surowe działy KW (HTML z kw_documents) → `KwExtraction` (pkt 3.3.1).
//
// Domyka lukę „HTML działów → struktura", opierając się na sprawdzonych,
// czystych parserach z `risk-assessment/kw-parse-core`. Wynik zasila mapper
// `mapujKwDoNieruchomosci` (contract-engine) budujący `nieruchomosc` silnika.
// Moduł jest czysty (bez Supabase) i testowalny.

import {
  stripHtml,
  extractKwOwnerPersons,
  extractKwOwnerPesels,
  parseMortgages,
  parseKwPropertyParams,
  parseEncumbrances,
} from "./risk-assessment/kw-parse-core";
import { parseKwAddress } from "./kw-address-core";
import type { KwExtraction, KwExtractionHipoteka, KwExtractionOwner } from "./kw-render";

export interface KwDocumentSections {
  kwNumber?: string | null;
  okladka?: string | null;
  dzial_1o?: string | null;
  dzial_1s?: string | null;
  dzial_2?: string | null;
  dzial_3?: string | null;
  dzial_4?: string | null;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchSad(text: string): string | null {
  const m = text.match(
    /prowadzonej\s+przez\s+(S[ĄA]D\s+REJONOWY[^,.;]*?)(?=,|\.|;|\s+[IVX]+\s+WYDZIA|\s+WYDZIA|$)/i,
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function matchTyp(text: string): string | null {
  const m = text.match(
    /(LOKAL\s+STANOWI[ĄA]CY\s+ODR[ĘE]BN[ĄA]\s+NIERUCHOMO[ŚS][ĆC]|NIERUCHOMO[ŚS][ĆC]\s+GRUNTOWA|NIERUCHOMO[ŚS][ĆC]\s+BUDYNKOWA)/i,
  );
  return m ? m[1].replace(/\s+/g, " ").toUpperCase() : null;
}

function matchKwNumber(text: string): string | null {
  const m = text.match(/\b([A-Z]{2}\d[A-Z]\/\d{8}\/\d)\b/);
  return m ? m[1] : null;
}

// Numery działek ewidencyjnych z działu I-O (np. "145/2", "300/1").
function extractDzialki(dzial1o: string | null | undefined): string[] {
  const text = stripHtml(dzial1o);
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  // po etykiecie "Numer działki" albo w sekcji "Działki ewidencyjne"
  for (const m of text.matchAll(
    /(?:numer\s+dzia[łl]ki|dzia[łl]ki\s+ewidencyjne)[^0-9]{0,40}(\d{1,4}(?:\/\d{1,4})?)/gi,
  )) {
    const n = m[1];
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out.slice(0, 20);
}

function rodzajHipoteki(text: string): string {
  return /przymusowa/i.test(text) ? "HIPOTEKA PRZYMUSOWA" : "HIPOTEKA UMOWNA";
}

/**
 * Buduje `KwExtraction` z działów pobranych z EKW/CMD KW Engine.
 * Pola niepewne pozostają `null` (zasada braku zgadywania) — do przeglądu
 * operatora. `dzial3.wpisy[].rodzaj` zawiera oryginalny tekst; klasyfikacja na
 * enum następuje w mapperze silnika.
 */
export function kwDocumentToExtraction(doc: KwDocumentSections): KwExtraction {
  const naglowek = [doc.okladka, doc.dzial_1o, doc.dzial_2].map((s) => stripHtml(s)).join("  ");

  // --- właściciele (dział II) ---
  const persons = extractKwOwnerPersons(doc.dzial_2);
  const pesels = extractKwOwnerPesels(doc.dzial_2);
  const wlasciciele: KwExtractionOwner[] = persons.map((p) => {
    const match = pesels.find(
      (x) => x.ownerName && norm(x.ownerName) === norm(`${p.firstName} ${p.lastName}`),
    );
    return { imiePierwsze: p.firstName, nazwisko: p.lastName, pesel: match?.pesel ?? null };
  });
  // PESEL bez dopasowanego nazwiska z par imię-nazwisko — dołóż po PESEL-u
  for (const x of pesels) {
    if (wlasciciele.some((w) => w.pesel === x.pesel)) continue;
    const czesci = (x.ownerName ?? "").split(/\s+/).filter(Boolean);
    wlasciciele.push({
      imiePierwsze: czesci[0] ?? null,
      nazwisko: czesci.slice(1).join(" ") || null,
      pesel: x.pesel,
    });
  }

  // --- oznaczenie i lokalizacja (dział I-O) ---
  const pp = parseKwPropertyParams(doc.dzial_1o);
  const addr = parseKwAddress(doc.dzial_1o);
  const dzialki = extractDzialki(doc.dzial_1o).map((numer) => ({ numer }));

  // --- dział III (prawa/roszczenia/ograniczenia) ---
  const enc = parseEncumbrances(doc.dzial_3);
  const wpisy = enc.encumbrances.map((t) => ({ rodzaj: t, tresc: t }));

  // --- dział IV (hipoteki) ---
  const hipoteki: KwExtractionHipoteka[] = parseMortgages(doc.dzial_4).map((m) => ({
    rodzaj: rodzajHipoteki(m.text),
    sumaKwota: m.amount,
    walutaSumy: m.currency,
    wierzyciel: m.creditor,
    tresc: m.text,
  }));

  return {
    kwNumber: doc.kwNumber ?? matchKwNumber(naglowek),
    sadRejonowy: matchSad(naglowek),
    typKsiegi: matchTyp(naglowek),
    dzial1o: {
      wojewodztwo: addr.voivodeship ?? null,
      miejscowosc: addr.city ?? null,
      ulica: addr.street ?? null,
      przeznaczenie: pp.kind ?? null,
      obszar:
        pp.landAreaHa != null
          ? `${pp.landAreaHa} HA`
          : pp.usableAreaM2 != null
            ? `${pp.usableAreaM2} M2`
            : null,
      dzialki: dzialki.length ? dzialki : null,
    },
    dzial2: { wlasciciele },
    dzial3: { brakWpisu: wpisy.length === 0, wpisy },
    dzial4: { brakWpisu: hipoteki.length === 0, hipoteki },
  };
}
