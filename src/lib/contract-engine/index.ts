/**
 * Silnik umów pożyczki — port silnika `umowa_engine` (Python) na TypeScript.
 *
 * Architektura: AI wypełnia WYŁĄCZNIE dane zgodne z `umowaSchema`; renderer
 * składa dokument deterministycznie z biblioteki klauzul. Model nie dotyka
 * tekstu umowy — nie może urwać zdania, pomylić numeracji ani zostawić klauzuli
 * o poręczycielu w umowie bez poręczyciela.
 */
export { ewaluujWarunek, BladWarunku, truthy, pobierzSciezke } from "./conditions";
export type { Ctx } from "./conditions";
export {
  zbudujFakty,
  oznaczenieStrony,
  odmienDopelniacz,
  odmienBiernik,
  odmienFunkcje,
  rodzajZenski,
  ROLA_NAZWA,
} from "./facts";
export { renderuj, wczytajBiblioteke, podstaw, BladPola } from "./renderer";
export type { Dokument, Sekcja, Ustep, Strona } from "./renderer";
export { formatuj } from "./formatter";
export { waliduj, walidujReguly, walidujSchemat } from "./validator";
export type { Problem, Poziom } from "./validator";
export {
  walidujHarmonogram,
  payloadDoRaty,
  formatujRaty,
  formatKwotaPL,
  parseKwota,
  TOLERANCJA_GROSZOWA,
} from "./schedule";
export type { RataLiczbowa, RataSchema } from "./schedule";
export { mapujKwDoNieruchomosci } from "./kw-mapper";
export type { KwMapContext, KwMapResult } from "./kw-mapper";
export { buildEngineSchedule } from "./loan-schedule";
export type { EngineScheduleInput, EngineSchedule, EngineScheduleRow } from "./loan-schedule";
export { umowaSchema } from "./schema";
export type { UmowaData } from "./schema";
export { buildUmowaData, profileToCalcPayload } from "./profile-to-umowa";
export type { BuildUmowaOptions } from "./profile-to-umowa";
export { buildUmowaDocx, buildUmowaDocumentXml, harmonogramZUmowy } from "./umowa-docx";
