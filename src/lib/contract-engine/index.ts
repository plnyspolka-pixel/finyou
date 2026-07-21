/**
 * Silnik umów pożyczki — publiczne API (port z `umowa_engine`).
 *
 * Architektura (patrz README silnika): AI wypełnia WYŁĄCZNIE dane zgodne ze
 * schematem, a tekst umowy składa deterministyczny kod. Model nie dotyka treści
 * — nie może urwać zdania, pomylić numeracji ani zostawić klauzuli o poręczycielu
 * w umowie bez poręczyciela.
 *
 *   dane ──► validateSchema + walidujReguly ──► (stop, jeśli błędy)
 *        └─► renderuj(dane, klauzule) ──► struktura dokumentu ──► formatuj / DOCX
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import klauzuleRaw from "./clauses.json";
import { renderuj, type Dokument } from "./renderer";
import { formatuj } from "./formatter";
import { waliduj, walidujReguly, kodWyjscia, Problem } from "./validator";
import { validateSchema, type UmowaDane } from "./schema";

export const KLAUZULE: any = klauzuleRaw;

export { renderuj, formatuj, waliduj, walidujReguly, validateSchema, kodWyjscia, Problem };
export { walidujHarmonogram, TOLERANCJA_GROSZOWA } from "./harmonogram";
export { buildFacts } from "./facts";
export { evalCondition, ConditionError } from "./conditions";
export type { Dokument, Sekcja, Ustep, Komparycja, Strona as StronaKomparycji, Zalacznik } from "./renderer";
export type { UmowaDane, OsobaFizyczna, PodmiotGospodarczy, Strona, Nieruchomosc, Obciazenie, Reprezentant, Rata } from "./schema";
export { umowaSchema } from "./schema";

/** Renderuje umowę na domyślnej bibliotece klauzul. */
export function renderujUmowe(dane: UmowaDane | Record<string, any>): Dokument {
  return renderuj(dane as Record<string, any>, KLAUZULE);
}

/** Podgląd tekstowy umowy (do przeglądu/diffów). */
export function podglad(dane: UmowaDane | Record<string, any>): string {
  return formatuj(renderujUmowe(dane));
}
