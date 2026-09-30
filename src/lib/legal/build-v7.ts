/**
 * Budowa pakietu inwestora v7 (umowa ramowa v7, NDA v6, RODO v5):
 * treść (`content_text`), SHA-256 treści (wartość `legal_documents.sha256`,
 * porównywana przy akceptacji), plik .docx i jego SHA-256 (MANIFEST).
 * Tylko Node — używane przez `scripts/legal/build-pakiet-v7.ts` i testy.
 */
import { createHash } from "node:crypto";
import { blokiDoXml, spakujDocx } from "@/lib/contract-engine/umowa-docx";
import { blokiZTekstu, podmienWDocx } from "./docx-z-tekstu";
import {
  DOCX_PODMIANY_NDA,
  DOCX_PODMIANY_RODO,
  PACKAGE_ID_V7,
  V7_FILENAMES,
  V7_VERSIONS,
  transformNdaV6,
  transformRodoV5,
  transformUmowaV7,
} from "./pakiet-v7";
import { readLegalSources } from "./sources";

export interface DokumentV7 {
  code: "umowa_ramowa" | "nda" | "rodo";
  package_id: string;
  version: string;
  title: string;
  sort_order: number;
  content_text: string;
  sha256: string;
  docx: Uint8Array;
  docx_sha256: string;
  docx_filename: string;
}

export const sha256Hex = (d: string | Uint8Array) =>
  createHash("sha256")
    .update(typeof d === "string" ? Buffer.from(d, "utf8") : d)
    .digest("hex");

export async function buildPakietV7(): Promise<DokumentV7[]> {
  const src = readLegalSources();

  const umowaText = transformUmowaV7(src.umowa_ramowa.content_text);
  const umowaDocx = await spakujDocx(blokiDoXml(blokiZTekstu(umowaText)));

  const ndaText = transformNdaV6(src.nda.content_text);
  const ndaDocx = await podmienWDocx(Buffer.from(src.nda.docx_base64, "base64"), [
    ...DOCX_PODMIANY_NDA,
  ]);

  const rodoText = transformRodoV5(src.rodo.content_text);
  const rodoDocx = await podmienWDocx(Buffer.from(src.rodo.docx_base64, "base64"), [
    ...DOCX_PODMIANY_RODO,
  ]);

  const mk = (
    code: DokumentV7["code"],
    sort_order: number,
    title: string,
    content_text: string,
    docx: Uint8Array,
  ): DokumentV7 => ({
    code,
    package_id: PACKAGE_ID_V7,
    version: V7_VERSIONS[code],
    title,
    sort_order,
    content_text,
    sha256: sha256Hex(content_text),
    docx,
    docx_sha256: sha256Hex(docx),
    docx_filename: V7_FILENAMES[code],
  });

  return [
    mk("nda", 2, src.nda.title, ndaText, ndaDocx),
    mk("umowa_ramowa", 1, src.umowa_ramowa.title, umowaText, umowaDocx),
    mk("rodo", 3, src.rodo.title, rodoText, rodoDocx),
  ];
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** SHA-256 pierwotnej treści umowy ramowej v7 (model nieodpłatny) — wgranej
 *  migracją 20260929155000 i nieakceptowanej przez nikogo przed zmianą. */
export const V7_UMOWA_SHA256_PRZED_ABONAMENTEM =
  "272d93b85cbac50822fab2f6ed984a94a67c65706177b999e7a444abe9020668";

/** SHA-256 treści umowy ramowej v7 z Opłatą Abonamentową — wgranej migracją
 *  20260930140000 (drizzle 0023, na produkcji od 2026-09-30). */
export const V7_UMOWA_SHA256_ABONAMENT =
  "0d098f1b568f65eb31a4fe9b177e8bdfae417cf347e4e269ad699ed16a782aa0";

/** SHA-256 treści NDA v6 wgranej migracją 20260929155000. */
export const V6_NDA_SHA256_PRZED_ZMIANA_NAZWY =
  "0730df56392cd49c28019fd98cb4b00237d811ee04355f7aed0baa046b73f581";

/** SHA-256 pliku migracji 20260930140000 / drizzle 0023 — wgranej na
 *  produkcji (hash w drizzle.__drizzle_migrations). Plik nie może się zmienić. */
export const MIGRACJA_0023_SHA256 =
  "0b7f5fb0a58bb688635d39b0776e04950d62fb6ed97e1aebf3301797c5a88f55";

/** Znaczniki sekcji w migracji 20260930190000 (drizzle 0024) wypełnianej przez skrypt. */
export const PAKIET_SEKCJA_START =
  "-- >>> PAKIET v7 — Prowizja od Pożyczkobiorcy (generowane: npx tsx scripts/legal/build-pakiet-v7.ts)";
export const PAKIET_SEKCJA_KONIEC = "-- <<< PAKIET v7";

/**
 * Aktualizacja treści umowy ramowej v7 i NDA v6 w `legal_documents` (UPDATE
 * istniejących wierszy): nazwa „Prowizja od Pożyczkobiorcy” zamiast „Prowizja
 * Klientowska”. Oba dokumenty nie miały jeszcze akceptacji; migracji już
 * wgranych nie zmieniamy, więc zmiana idzie osobną migracją. Ewentualna
 * akceptacja starej treści przestaje pasować do skrótu, więc panel poprosi
 * o ponowną akceptację. RODO v5 się nie zmienia.
 */
export function aktualizacjaPakietuV7Sql(docs: DokumentV7[]): string {
  const poprzednie: Record<string, string> = {
    umowa_ramowa: V7_UMOWA_SHA256_ABONAMENT,
    nda: V6_NDA_SHA256_PRZED_ZMIANA_NAZWY,
  };
  const bloki = (["umowa_ramowa", "nda"] as const).map((code) => {
    const d = docs.find((x) => x.code === code);
    if (!d) throw new Error(`Brak dokumentu ${code} w pakiecie v7.`);
    return `-- ${d.code} ${d.version}: content sha256 ${d.sha256}
--   docx sha256 ${d.docx_sha256}
--   poprzednia treść: ${poprzednie[code]}
update public.legal_documents
   set sha256 = ${sqlStr(d.sha256)},
       content_text = ${sqlStr(d.content_text)},
       docx_base64 = ${sqlStr(Buffer.from(d.docx).toString("base64"))},
       docx_filename = ${sqlStr(d.docx_filename)},${code === "umowa_ramowa" ? "\n       allows_investor_fees = true," : ""}
       updated_at = now()
 where code = ${sqlStr(d.code)}
   and version = ${sqlStr(d.version)}
   and package_id = ${sqlStr(d.package_id)};`;
  });
  return `${PAKIET_SEKCJA_START}\n${bloki.join("\n\n")}\n${PAKIET_SEKCJA_KONIEC}`;
}

/** Podmienia sekcję między znacznikami w treści migracji. */
export function wstawSekcje(
  migracja: string,
  start: string,
  koniec: string,
  sekcja: string,
): string {
  const a = migracja.indexOf(start);
  const b = migracja.indexOf(koniec);
  if (a < 0 || b < 0 || b < a) throw new Error(`Brak znaczników sekcji: ${start.slice(0, 60)}…`);
  return migracja.slice(0, a) + sekcja + migracja.slice(b + koniec.length);
}
