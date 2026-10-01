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
  (UPDATE wiersza v7, `allows_investor_fees = true`). Tego samego dnia, nadal przed
  pierwszą akceptacją, „Prowizja Klientowska” w umowie ramowej v7 i NDA v6 dostała nazwę
  „Prowizja od Pożyczkobiorcy”, a Opłatę Abonamentową zastąpił Abonament sprzedawany przez
  Fundację Krzewienia Edukacji Finansowej im. Pieczaka na podstawie Regulaminu Abonamentu
  Inwestora (Finance You nie pobiera od Inwestora wynagrodzenia, `allows_investor_fees = false`)
  — migracja `20260930190000_prowizja_od_pozyczkobiorcy`.
  Wyłączenie: /admin/umowy-inwestorow.

| kod | wersja | plik | SHA-256 treści | SHA-256 .docx |
|---|---|---|---|---|
| umowa_ramowa | v7 | 02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_v7.docx | `e5b6d1a4e9245bc80d4818876c85c536ca024813d45dbf473514b0263d80f2b1` | `e6504ec8729a00add75eeb3729b486ac2a315ed3803e0a1584ca4799fdf6e894` |
| nda | v6 | 01_NDA_i_zakaz_obchodzenia_Finance_You_v6.docx | `822131729ad457da06c78c2b514126c50469a03f17944983c02d02969371326d` | `a9f3eea7ded46ab16470f87cdf6debd8e2869a63057e6b9f2f739b162c84eef3` |
| rodo | v5 | 03_Umowa_udostepniania_i_powierzenia_danych_RODO_Finance_You_v5.docx | `7b6dbd5818ccee74dff0ab095229895c91aa1779a16baf5ad65e2019eb2a19fb` | `94bfad8421b9b231e29d72084aeae12e4b5000ce5d170707562127921d39ad62` |
