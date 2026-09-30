# Pakiet inwestora FY-LEGAL-2026-09-29

Wygenerowano skryptem `npx tsx scripts/legal/build-pakiet-v7.ts` z treści v6/v5/v4
(migracje SQL) przez podmiany w `src/lib/legal/pakiet-v7.ts`. Nie edytować ręcznie.

- `CONTENT.sha256` — SHA-256 treści (`content_text`, UTF-8) = `legal_documents.sha256`;
  ta wartość trafia do akceptacji Inwestora (code:version:sha256).
- `MANIFEST.sha256` — SHA-256 plików .docx (kontrola: `sha256sum -c MANIFEST.sha256`).
- Pakiet wgrała do bazy jako aktywny migracja `20260929155000` (aktywację
  zatwierdził właściciel 2026-09-29). 30 września 2026 r., przed pierwszą
  akceptacją, umowa ramowa v7 dostała Opłatę Abonamentową zamiast
  nieodpłatności — nową treść wgrywa migracja `20260930140000_abonament_inwestora`
  (UPDATE wiersza v7, `allows_investor_fees = true`). Wyłączenie: /admin/umowy-inwestorow.

| kod | wersja | plik | SHA-256 treści | SHA-256 .docx |
|---|---|---|---|---|
| umowa_ramowa | v7 | 02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_v7.docx | `0d098f1b568f65eb31a4fe9b177e8bdfae417cf347e4e269ad699ed16a782aa0` | `d3ef9138d069ee31e43ebfde0d63fda79aa71a2994c4642b3a52e20fdc70cf51` |
| nda | v6 | 01_NDA_i_zakaz_obchodzenia_Finance_You_v6.docx | `0730df56392cd49c28019fd98cb4b00237d811ee04355f7aed0baa046b73f581` | `94de39607660a0090b7a32afcd3f20b5fca10472ba2115e08eb2706aa2b6d9d8` |
| rodo | v5 | 03_Umowa_udostepniania_i_powierzenia_danych_RODO_Finance_You_v5.docx | `7b6dbd5818ccee74dff0ab095229895c91aa1779a16baf5ad65e2019eb2a19fb` | `94bfad8421b9b231e29d72084aeae12e4b5000ce5d170707562127921d39ad62` |
