/**
 * UMOWA RAMOWA v8 (2026-10-06) — jedyna zmiana względem v7: Abonament
 * wyłącznie roczny (decyzja właściciela 2026-10-06, Regulamin Abonamentu
 * Inwestora v3). NDA v6 i RODO v5 bez zmian (ten sam package_id).
 *
 * Źródłem jest treść v7 z repozytorium (`transformUmowaV7`, Prowizja od
 * Pożyczkobiorcy 5%). Uwaga: w bazie produkcyjnej v7 zostało w brzmieniu
 * z 7% (migracja 20260930190000 była już wgrana, gdy 2026-10-01 zmieniono
 * w niej stawkę), więc v8 wgrywana osobną migracją wprowadza na produkcji
 * także 5%. v7 została zaakceptowana (2026-10-01), dlatego zmiana idzie jako
 * nowa wersja — akceptacja v7 nie pasuje do v8 i panel poprosi o ponowną.
 *
 * Każda podmiana jest asertywna (Transform.replaceOnce) — wynik jest
 * deterministyczny i sprawdzany testem.
 */
import { createHash } from "node:crypto";
import { blokiDoXml, spakujDocx } from "@/lib/contract-engine/umowa-docx";
import { blokiZTekstu } from "./docx-z-tekstu";
import {
  ABONAMENT_UMOWA,
  PACKAGE_DATE_PL,
  PACKAGE_ID_V7,
  Transform,
  transformUmowaV7,
} from "./pakiet-v7";
import { readLegalSources } from "./sources";

export const UMOWA_V8_VERSION = "v8";
export const UMOWA_V8_DATE_PL = "6 października 2026 r.";
/** Cena w brzmieniu umowy v8 — zgodna z Regulaminem Abonamentu Inwestora v3. */
export const ABONAMENT_UMOWA_V8 = "7 000,00 zł brutto za 365 dni";
export const UMOWA_V8_FILENAME = "02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_v8.docx";

/** SHA-256 treści umowy ramowej v7 w bazie produkcyjnej (zaakceptowanej 2026-10-01). */
export const V7_UMOWA_SHA256_PRODUKCJA =
  "887010c826b83f43c8aa0b9165bac05540305fd76d61f45deeccd2b9b943f065";

/** v7 → v8: nagłówek wersji i postanowienia o Abonamencie (tylko 365 dni). */
export function transformUmowaV8(v7: string): string {
  return new Transform(v7)
    .replaceOnce(
      `${PACKAGE_ID_V7}.v7 • ${PACKAGE_DATE_PL}`,
      `${PACKAGE_ID_V7}.${UMOWA_V8_VERSION} • ${UMOWA_V8_DATE_PL}`,
    )
    .replaceOnce(
      `(Regulamin Abonamentu Inwestora, obecnie ${ABONAMENT_UMOWA})`,
      `(Regulamin Abonamentu Inwestora, obecnie ${ABONAMENT_UMOWA_V8})`,
    )
    .replaceOnce(
      `(obecnie ${ABONAMENT_UMOWA}, według wyboru Inwestora)`,
      `(obecnie ${ABONAMENT_UMOWA_V8})`,
    )
    .replaceOnce(
      "opłacony okres Abonamentu (30 albo 365 dni)",
      "opłacony okres Abonamentu (365 dni)",
    )
    .replaceOnce(
      `(obecnie ${ABONAMENT_UMOWA}, płatne z góry za wybrany okres,`,
      `(obecnie ${ABONAMENT_UMOWA_V8}, płatne z góry,`,
    )
    .replaceOnce(
      `(obecnie ${ABONAMENT_UMOWA}, płatny z góry,`,
      `(obecnie ${ABONAMENT_UMOWA_V8}, płatny z góry,`,
    )
    .value();
}

export interface UmowaV8 {
  code: "umowa_ramowa";
  package_id: string;
  version: string;
  content_text: string;
  sha256: string;
  docx: Uint8Array;
  docx_sha256: string;
  docx_filename: string;
}

const sha256Hex = (d: string | Uint8Array) =>
  createHash("sha256")
    .update(typeof d === "string" ? Buffer.from(d, "utf8") : d)
    .digest("hex");

export async function buildUmowaV8(): Promise<UmowaV8> {
  const src = readLegalSources();
  const content_text = transformUmowaV8(transformUmowaV7(src.umowa_ramowa.content_text));
  const docx = await spakujDocx(blokiDoXml(blokiZTekstu(content_text)));
  return {
    code: "umowa_ramowa",
    package_id: PACKAGE_ID_V7,
    version: UMOWA_V8_VERSION,
    content_text,
    sha256: sha256Hex(content_text),
    docx,
    docx_sha256: sha256Hex(docx),
    docx_filename: UMOWA_V8_FILENAME,
  };
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Migracja: wiersz umowy ramowej przechodzi z v7 na v8 (jeden wiersz na kod). */
export function migracjaUmowyV8Sql(d: UmowaV8): string {
  return `-- =====================================================================
-- UMOWA RAMOWA v8 (${UMOWA_V8_DATE_PL.replace(" r.", "")})
--
-- Plik wygenerowany: npx tsx scripts/legal/build-umowa-v8.ts
-- (nie edytować ręcznie — zmiany w src/lib/legal/umowa-v8.ts).
--
-- Abonament wyłącznie roczny: „obecnie ${ABONAMENT_UMOWA_V8}”, Okres
-- Abonamentowy 365 dni (Regulamin Abonamentu Inwestora v3). Na produkcji v8
-- wprowadza także Prowizję od Pożyczkobiorcy 5% (v7 w bazie ma 7%).
-- v7 była zaakceptowana, więc to nowa wersja: akceptacje v7 zostają w
-- historii (investor_agreement_acceptances), a Inwestor akceptuje v8 w
-- panelu. NDA v6 i RODO v5 bez zmian. Warunek „version = 'v7'” czyni
-- migrację idempotentną.
--
-- umowa_ramowa ${d.version}: content sha256 ${d.sha256}
--   docx sha256 ${d.docx_sha256}
--   poprzednia treść (v7 na produkcji): ${V7_UMOWA_SHA256_PRODUKCJA}
-- =====================================================================

update public.legal_documents
   set version = ${sqlStr(d.version)},
       sha256 = ${sqlStr(d.sha256)},
       content_text = ${sqlStr(d.content_text)},
       docx_base64 = ${sqlStr(Buffer.from(d.docx).toString("base64"))},
       docx_filename = ${sqlStr(d.docx_filename)},
       allows_investor_fees = false,
       updated_at = now()
 where code = 'umowa_ramowa'
   and version = 'v7'
   and package_id = ${sqlStr(d.package_id)};
`;
}
