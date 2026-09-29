# Pakiet inwestora FY-LEGAL-2026-09-29

Wygenerowano skryptem `npx tsx scripts/legal/build-pakiet-v7.ts` z treści v6/v5/v4
(migracje SQL) przez podmiany w `src/lib/legal/pakiet-v7.ts`. Nie edytować ręcznie.

- `CONTENT.sha256` — SHA-256 treści (`content_text`, UTF-8) = `legal_documents.sha256`;
  ta wartość trafia do akceptacji Inwestora (code:version:sha256).
- `MANIFEST.sha256` — SHA-256 plików .docx (kontrola: `sha256sum -c MANIFEST.sha256`).
- Wersje trafiają do bazy z `active = false`. Aktywacja całego pakietu naraz:
  administrator w /admin/umowy-inwestorow po przeglądzie prawnym.

| kod | wersja | plik | SHA-256 treści | SHA-256 .docx |
|---|---|---|---|---|
| umowa_ramowa | v7 | 02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_v7.docx | `272d93b85cbac50822fab2f6ed984a94a67c65706177b999e7a444abe9020668` | `4a1068648a71f96cfbe4516e1cd999093c2daf143373021258a2ce7880250158` |
| nda | v6 | 01_NDA_i_zakaz_obchodzenia_Finance_You_v6.docx | `0730df56392cd49c28019fd98cb4b00237d811ee04355f7aed0baa046b73f581` | `94de39607660a0090b7a32afcd3f20b5fca10472ba2115e08eb2706aa2b6d9d8` |
| rodo | v5 | 03_Umowa_udostepniania_i_powierzenia_danych_RODO_Finance_You_v5.docx | `7b6dbd5818ccee74dff0ab095229895c91aa1779a16baf5ad65e2019eb2a19fb` | `94bfad8421b9b231e29d72084aeae12e4b5000ce5d170707562127921d39ad62` |
