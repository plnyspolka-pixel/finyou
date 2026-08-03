/**
 * Wybór klauzul przy generacji z silnika.
 *
 * Silnik domyślnie dobiera klauzule po warunkach (deterministycznie). Ten moduł
 * pozwala operatorowi WYŁĄCZYĆ wybrane klauzule z generowanej umowy — renderer
 * dostaje wtedy bibliotekę bez tych klauzul (`renderuj(dane, bibliotekaBez(...))`).
 * Klauzula „obowiązkowa" (warunek zawsze prawdziwy) też może zostać wyłączona,
 * ale UI ją oznacza, bo to nietypowa decyzja.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import biblioteka from "./clauses.json";

export interface KlauzulaMeta {
  id: string;
  sekcja: string;
  sekcjaTytul: string;
  order: number;
  /** Warunek zawsze prawdziwy → klauzula pojawia się w każdej umowie. */
  obowiazkowa: boolean;
  /** Skrót treści (bez pól {{...}}) do podglądu na liście. */
  snippet: string;
}

function snippetZKlauzuli(k: any): string {
  const raw: string =
    k.tekst ??
    k.tekst_pojedyncza ??
    k.tekst_pozycja ??
    k.tekst_wielokrotna_naglowek ??
    k.tekst_wielokrotna_pozycja ??
    "";
  const plain = raw.replace(/\{\{[^}]+\}\}/g, "…").replace(/\s+/g, " ").trim();
  return plain.length > 160 ? plain.slice(0, 159).trimEnd() + "…" : plain;
}

/** Lista klauzul silnika (metadane), posortowana po sekcji i kolejności. */
export function listaKlauzul(): KlauzulaMeta[] {
  const sekcje: Record<string, any> = (biblioteka as any).sekcje ?? {};
  const klauzule: any[] = (biblioteka as any).klauzule ?? [];
  return klauzule
    .map((k) => ({
      id: k.id as string,
      sekcja: k.sekcja as string,
      sekcjaTytul: (sekcje[k.sekcja]?.tytul as string) ?? k.sekcja,
      order: (k.order as number) ?? 0,
      obowiazkowa: k.warunek === true || k.warunek === undefined,
      snippet: snippetZKlauzuli(k),
    }))
    .sort((a, b) => {
      const sa = sekcje[a.sekcja]?.order ?? 0;
      const sb = sekcje[b.sekcja]?.order ?? 0;
      return sa - sb || a.order - b.order;
    });
}

/** Wszystkie ID klauzul (np. do zbudowania domyślnego zaznaczenia). */
export function wszystkieIdKlauzul(): string[] {
  return ((biblioteka as any).klauzule ?? []).map((k: any) => k.id as string);
}

/**
 * Biblioteka klauzul bez wskazanych ID — do przekazania do `renderuj`.
 * Sekcje zostają nietknięte; filtrujemy wyłącznie listę klauzul.
 */
export function bibliotekaBez(wykluczoneId: string[]): any {
  if (!wykluczoneId || wykluczoneId.length === 0) return biblioteka;
  const zbior = new Set(wykluczoneId);
  return {
    ...(biblioteka as any),
    klauzule: ((biblioteka as any).klauzule ?? []).filter((k: any) => !zbior.has(k.id)),
  };
}
