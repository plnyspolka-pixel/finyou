/**
 * Dokumenty prawne Finance You — wersja 1.0 (decyzja właściciela 2026-10-19).
 *
 * Wszystkie dokumenty startują od wersji 1.0, bez wersji historycznych:
 *  - Regulamin klienta i Polityka prywatności (consent_documents, version = 1)
 *    — docs/legal/klient/regulamin-klienta.md, polityka-prywatnosci.md,
 *  - pakiet inwestora FY-LEGAL-1.0 (legal_documents, version = "1.0"):
 *    NDA, Ramowa umowa pośrednictwa, umowa RODO — docs/legal/pakiet-inwestora/,
 *  - Regulamin Abonamentu Inwestora (lib/legal/regulamin-abonamentu.ts).
 *
 * Pliki w docs/legal są źródłem treści: zmiana dokumentu = edycja pliku
 * (a dla pakietu także .docx) i ponowne `npx tsx scripts/legal/build-dokumenty.ts`,
 * które przepisuje migrację. Testy pilnują, że migracja, skróty SHA-256
 * i pliki są zgodne.
 *
 * Migracja usuwa wcześniejsze wersje i ich akceptacje — użytkownicy
 * akceptują wersję 1.0 przy następnym wejściu do panelu.
 */
import { createHash } from "node:crypto";

export const DOKUMENTY_DATA_PL = "19 października 2026 r.";
/** Wersja w treści dokumentów i w interfejsie. */
export const WERSJA_DOKUMENTOW = "1.0";

/** consent_documents.version — liczba całkowita; w interfejsie „1.0”. */
export const KLIENT_DOCS_VERSION = 1;

export const PAKIET_ID = "FY-LEGAL-1.0";
export const PAKIET_WERSJA = "1.0";

/** Kwoty Abonamentu w treści umowy — muszą zgadzać się z lib/investor-plan/plans.ts. */
export const ABONAMENT_UMOWA = "1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni";
/** Sprzedawca Abonamentu (i wystawca faktur za niego) — decyzja właściciela 2026-09-30. */
export const SPRZEDAWCA_ABONAMENTU =
  "Fundacja Krzewienia Edukacji Finansowej im. Pieczaka z siedzibą w Lublinie (KRS 0001140846, NIP 9462747637)";

export const PAKIET_PLIKI = {
  nda: "01_NDA_i_zakaz_obchodzenia_Finance_You_1.0",
  umowa_ramowa: "02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_1.0",
  rodo: "03_Umowa_udostepniania_i_powierzenia_danych_RODO_Finance_You_1.0",
} as const;

export type KodPakietu = keyof typeof PAKIET_PLIKI;

export interface DokumentPakietu {
  code: KodPakietu;
  content_text: string;
  docx: Uint8Array;
}

export const sha256Hex = (d: string | Uint8Array) =>
  createHash("sha256")
    .update(typeof d === "string" ? Buffer.from(d, "utf8") : d)
    .digest("hex");

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

export { wersjaDokumentu } from "./wersja";

export function migracjaDokumentow(
  regulamin: string,
  polityka: string,
  pakiet: DokumentPakietu[],
): string {
  const v = KLIENT_DOCS_VERSION;
  const zgody = (
    [
      ["terms", "Akceptuję regulamin klienta", regulamin],
      ["privacy", "Akceptuję politykę prywatności", polityka],
    ] as const
  )
    .map(
      ([kind, title, content]) => `
insert into public.consent_documents (kind, title, content, version, is_active)
values (${sqlStr(kind)}::public.consent_kind, ${sqlStr(title)},
${sqlStr(content)},
  ${v}, true);
`,
    )
    .join("");
  const umowy = pakiet
    .map(
      (d) => `
-- ${d.code} ${PAKIET_WERSJA}: content sha256 ${sha256Hex(d.content_text)}
--   docx sha256 ${sha256Hex(d.docx)}
update public.legal_documents
   set package_id = ${sqlStr(PAKIET_ID)},
       version = ${sqlStr(PAKIET_WERSJA)},
       sha256 = ${sqlStr(sha256Hex(d.content_text))},
       content_text = ${sqlStr(d.content_text)},
       docx_base64 = ${sqlStr(Buffer.from(d.docx).toString("base64"))},
       docx_filename = ${sqlStr(`${PAKIET_PLIKI[d.code]}.docx`)},
       updated_at = now()
 where code = ${sqlStr(d.code)};
`,
    )
    .join("");
  return `-- =====================================================================
-- DOKUMENTY PRAWNE — WERSJA 1.0 (${DOKUMENTY_DATA_PL})
--
-- Plik wygenerowany: npx tsx scripts/legal/build-dokumenty.ts
-- (nie edytować ręcznie — treść w docs/legal/klient i docs/legal/pakiet-inwestora).
--
-- Decyzja właściciela: wszystkie dokumenty startują od wersji 1.0, bez
-- wersji historycznych. Usuwamy wcześniejsze wersje regulaminu klienta
-- i polityki prywatności oraz akceptacje (klienci i inwestorzy akceptują
-- 1.0 przy następnym wejściu do panelu), a pakiet inwestora dostaje numer
-- FY-LEGAL-1.0. Zmiany treści: „Serwis” zamiast „Platformy”, prowizja
-- Finance You 5% Kwoty Udzielonej (min. 5 000 zł) także w regulaminie.
-- =====================================================================

-- 1. Regulamin klienta i Polityka prywatności 1.0 (consent_documents).
delete from public.consent_acceptances where kind in ('terms', 'privacy');
delete from public.consent_documents where kind in ('terms', 'privacy');
${zgody}
-- 2. Pakiet inwestora FY-LEGAL-1.0 (legal_documents) — akceptacje od nowa.
delete from public.investor_agreement_acceptances;
${umowy}`;
}
