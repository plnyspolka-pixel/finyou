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

/** Migracja SQL: upsert trzech dokumentów, `active = false` (aktywuje człowiek). */
export function migracjaSqlV7(docs: DokumentV7[]): string {
  const naglowek = `-- =====================================================================
-- ETAP 5 — PAKIET INWESTORA v7 (${PACKAGE_ID_V7})
--
-- Plik wygenerowany: npx tsx scripts/legal/build-pakiet-v7.ts
-- (nie edytować ręcznie — zmiany w src/lib/legal/pakiet-v7.ts).
--
-- • Umowa ramowa v7: usługa dla Inwestora NIEODPŁATNA (bez Pakietów,
--   Cennika, Opłaty Sukcesu, Opłaty Abonamentowej, Opłaty za Udostępnienie
--   Okazji i Załącznika nr 8). Jedyna opłata w modelu: Prowizja Klientowska
--   7% Kwoty Udzielonej, min. 5 000,00 zł, bez VAT, potrącana z wypłaty
--   (Zał. 6). § 5: 5 Zleceń, 5 odrzuceń, rezerwacja 24 h + 12 h, maks. 2
--   przedłużone. Kara Obejściowa 5% Sumy Hipotecznej i 5-letni Okres
--   Ochronny bez zmian. Kontakt: kontakt@financeyou.pl.
-- • NDA v6, RODO v5: wspólny package_id, adres e-mail.
--
-- sha256 = SHA-256 z content_text (UTF-8) — ta wartość trafia do akceptacji
-- (code:version:sha256). Skróty plików .docx: docs/legal/paczka-inwestor-v7/
-- MANIFEST.sha256.
--
-- active = false: nowa wersja nie wypiera obowiązującej automatycznie.
-- Aktywacja całego pakietu naraz — administrator w /admin/umowy-inwestorow
-- po przeglądzie prawnym. Akceptacje poprzednich wersji zostają w historii
-- (legal_acceptances) i nie są dziedziczone przez v7.
-- allows_investor_fees = false: od v7 Inwestor nie płaci żadnych opłat.
-- =====================================================================
`;
  const inserty = docs
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (d) => `
-- ${d.code} ${d.version}: content sha256 ${d.sha256}
--   docx sha256 ${d.docx_sha256}
insert into public.legal_documents
  (code, package_id, version, title, sort_order, sha256, content_text, docx_base64, docx_filename, allows_investor_fees, active)
values (
  ${sqlStr(d.code)},
  ${sqlStr(d.package_id)},
  ${sqlStr(d.version)},
  ${sqlStr(d.title)},
  ${d.sort_order},
  ${sqlStr(d.sha256)},
  ${sqlStr(d.content_text)},
  ${sqlStr(Buffer.from(d.docx).toString("base64"))},
  ${sqlStr(d.docx_filename)},
  false,
  false
)
on conflict (code) do update set
  package_id = excluded.package_id,
  version = excluded.version,
  title = excluded.title,
  sort_order = excluded.sort_order,
  sha256 = excluded.sha256,
  content_text = excluded.content_text,
  docx_base64 = excluded.docx_base64,
  docx_filename = excluded.docx_filename,
  allows_investor_fees = excluded.allows_investor_fees,
  active = false,
  updated_at = now();
`,
    );
  return `${naglowek}${inserty.join("")}
comment on column public.legal_documents.sha256 is
  'SHA-256 (hex) z content_text w UTF-8 — od pakietu ${PACKAGE_ID_V7}. Wartość zapisywana w akceptacjach (code:version:sha256). Skróty plików .docx: docs/legal/paczka-inwestor-v7/MANIFEST.sha256.';

comment on table public.investor_success_fees is
  'Tabela historyczna (model v6). Od pakietu v7 (${PACKAGE_ID_V7}) Inwestor nie płaci Finance You żadnych opłat — nowe rekordy nie powstają.';
`;
}
