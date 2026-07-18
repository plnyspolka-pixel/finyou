// Parser adresu nieruchomości z Działu I-O księgi wieczystej (surowy HTML z CMD).
// Struktura tabeli:
//   Położenie (nr / województwo, powiat, gmina, miejscowość) → "DOLNOŚLĄSKIE, OLEŚNICKI, BIERUTÓW, BIERUTÓW"
//   Ulica | Numer budynku | Numer lokalu → "ZIELONA" | "11" | "11"

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeKwNumber } from "@/lib/kw-normalize";

export type KwAddress = {
  street?: string | null;
  buildingNumber?: string | null;
  unitNumber?: string | null;
  city?: string | null;
  gmina?: string | null;
  powiat?: string | null;
  voivodeship?: string | null;
  fullAddress: string | null;
};

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();

/** Wyciąga treść komórek następujących po podanej etykiecie w danych tabeli KW. */
function cellsAfter(html: string, labelRegex: RegExp, count: number): string[] {
  const m = labelRegex.exec(html);
  if (!m) return [];
  const rest = html.slice(m.index);
  const cells: string[] = [];
  const re = /<td[^>]*class="cs(?:B?)Dane"[^>]*>([\s\S]*?)<\/td>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rest)) && cells.length < count) {
    cells.push(stripTags(match[1]));
  }
  return cells;
}

export function parseKwAddress(dzial1o: string | null | undefined): KwAddress {
  const empty: KwAddress = { fullAddress: null };
  if (!dzial1o) return empty;

  // "Położenie" — 4 komórki po Lp.: [Lp, Nr porz., "WOJ, POWIAT, GMINA, MIEJSC.", Nr podstawy]
  const posCells = cellsAfter(dzial1o, /Położenie/i, 4);
  let voivodeship: string | null = null;
  let powiat: string | null = null;
  let gmina: string | null = null;
  let city: string | null = null;
  const locCell = posCells.find((c) => /,/.test(c) && !/^Lp\.?/i.test(c) && !/^\d+$/.test(c));
  if (locCell) {
    const parts = locCell.split(",").map((p) => p.trim()).filter(Boolean);
    [voivodeship, powiat, gmina, city] = [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null, parts[3] ?? null];
  }

  // "Numer lokalu" (ostatnia z trzech etykiet w wierszu) — kolejne 3 komórki csBDane to Ulica, Nr bud., Nr lok.
  const addrCells = cellsAfter(dzial1o, /Numer lokalu/i, 3);
  const [street, buildingNumber, unitNumber] = [addrCells[0] ?? null, addrCells[1] ?? null, addrCells[2] ?? null];

  const streetPart = street
    ? `${toTitle(street)}${buildingNumber ? " " + buildingNumber : ""}${unitNumber ? "/" + unitNumber : ""}`
    : null;
  const cityPart = city ? toTitle(city) : null;
  const fullAddress = [streetPart, cityPart].filter(Boolean).join(", ") || null;

  return {
    street: street ? toTitle(street) : null,
    buildingNumber,
    unitNumber,
    city: cityPart,
    gmina: gmina ? toTitle(gmina) : null,
    powiat: powiat ? toTitle(powiat) : null,
    voivodeship: voivodeship ? toTitle(voivodeship) : null,
    fullAddress,
  };
}

function toTitle(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/** Hook: dla numeru KW ciągnie parsed adres z cache kw_documents (dzial_1o). */
export function useKwAddress(kwNumber?: string | null): KwAddress | null {
  const [addr, setAddr] = useState<KwAddress | null>(null);
  useEffect(() => {
    if (!kwNumber) { setAddr(null); return; }
    let cancelled = false;
    void (async () => {
      const normalized = normalizeKwNumber(kwNumber);
      if (!normalized) return;
      const { data } = await supabase
        .from("kw_documents")
        .select("dzial_1o")
        .eq("kw_number", normalized)
        .maybeSingle();
      if (cancelled) return;
      setAddr(data?.dzial_1o ? parseKwAddress(data.dzial_1o) : null);
    })();
    return () => { cancelled = true; };
  }, [kwNumber]);
  return addr;
}
