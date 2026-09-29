# Raport — sprzątanie spójności prawnej, cennika i kalkulatorów (2026-09-29)

Gałąź: `claude/loving-faraday-n5d4yo`. Zakres: etapy 0–7 z planu. Wszystkie
etapy wdrożone w kodzie i migracjach; testy, typecheck i lint zielone.

## Model docelowy (jeden w całym systemie)

- Finansowanie wyłącznie B2B (cel związany z działalnością gospodarczą).
  Inwestor może być konsumentem.
- Jedyna opłata: **Prowizja Finance You — 7% Kwoty Udzielonej, nie mniej niż
  5 000 zł, bez VAT**, potrącana z wypłaty. Inwestor przekazuje ją Finance You,
  resztę wypłaca Klientowi (100 000 zł → 7 000 zł / 93 000 zł).
- Inwestor nie płaci nic: brak Opłaty Sukcesu, PRO, opłaty 1 500 zł za Projekt.
  Infrastruktura `access_products` / uprawnień zostaje, produkty inwestora
  są nieaktywne. Prowizja inwestora (KWO_02) to osobne pole, rozłożone w ratach.
- Oprocentowanie ≤ odsetki maksymalne (14,5% od 2026-03-05). Jedna tabela stóp
  z datami: `src/lib/contract-engine/fees.ts`.
- LTV maksymalnie 60% wszędzie.
- Teasery tylko dla inwestora z PRZYJĘTYM Zleceniem. Strony publiczne pokazują
  wyłącznie wygenerowane „przykładowe projekty (ilustracja)”.
- Limity: 5 aktywnych Zleceń, 5 odrzuceń, rezerwacja 24 h + 12 h, maks.
  2 przedłużone, okres do 120 mies. Okres ochronny 5 lat.
- Statusy odrzucające (`nie_rokuje`, `wniosek_odrzucony`) nadaje tylko człowiek;
  automat zapisuje propozycję (`suggested_status`).
- Kontakt: `kontakt@financeyou.pl` (telefon 889 888 700 w umowach zostaje).

## Migracje (każda z lustrem w `drizzle/migrations`, bajt w bajt)

| Supabase | Drizzle | Zakres |
|---|---|---|
| `20260929120000_etap0_bezpieczenstwo_teaserow.sql` | `0009` | usunięty widok `public_loan_teasers`; `investor_offer_teasers()` tylko przyjęte Zlecenia, bez opisów i zdjęć; propozycje tylko dla inwestora/personelu; REVOKE anon |
| `20260929121000_etap1_inwestor_bez_oplat.sql` | `0010` | produkty inwestora nieaktywne; `investor_tier` = podstawowy; bez odblokowań |
| `20260929122000_etap2_ltv_60.sql` | `0011` | `max_ltv_percent` 60, progi 35/50/60, CHECK ≤ 60 |
| `20260929123000_etap3_zlecenia_limity.sql` | `0012` | limity Zleceń w ustawieniach; `increment_order_rejections` |
| `20260929124000_etap4_statusy_wniosku.sql` | `0013` | mapowanie statusów; `suggested_*`; trigger `loan_status_guard`; bramka B2B |
| `20260929125000_etap5_pakiet_inwestor_v7.sql` | `0014` | umowa ramowa v7, NDA v6, RODO v5 — aktywne (`active = true`) — plik generowany |
| `20260929126000_etap5_zgody_v2.sql` | `0015` | Regulamin klienta v2, Polityka prywatności v2 (v1 wyłączone, zostają w tabeli) — plik generowany |
| `20260929127000_etap5_akceptacje_zgod_i_boty.sql` | `0016` | `consent_acceptances`; prompty botów |

Test `src/lib/security/migrations-mirror.test.ts` pilnuje lustra i wpisów w
`_journal.json`.

## Dokumenty i skróty SHA-256

Pakiet inwestora `FY-LEGAL-2026-09-29` — `docs/legal/paczka-inwestor-v7/`
(generator: `npx tsx scripts/legal/build-pakiet-v7.ts`, deterministyczny).
`legal_documents.sha256` = SHA-256 z `content_text` (UTF-8) — ta wartość
trafia do akceptacji (code:version:sha256).

| Dokument | Wersja | SHA-256 treści (DB) | SHA-256 .docx |
|---|---|---|---|
| Umowa ramowa | v7 | `272d93b85cbac50822fab2f6ed984a94a67c65706177b999e7a444abe9020668` | `4a1068648a71f96cfbe4516e1cd999093c2daf143373021258a2ce7880250158` |
| NDA | v6 | `0730df56392cd49c28019fd98cb4b00237d811ee04355f7aed0baa046b73f581` | `94de39607660a0090b7a32afcd3f20b5fca10472ba2115e08eb2706aa2b6d9d8` |
| RODO | v5 | `7b6dbd5818ccee74dff0ab095229895c91aa1779a16baf5ad65e2019eb2a19fb` | `94bfad8421b9b231e29d72084aeae12e4b5000ce5d170707562127921d39ad62` |

Dokumenty klienta — `docs/legal/klient/` (generator:
`npx tsx scripts/legal/build-zgody-v2.ts`; v1 zachowane jako `*-v1.md`).

| Dokument | Wersja | SHA-256 pliku .md |
|---|---|---|
| Regulamin klienta | 2 | `b633e661f91899e394fee88c022a11e4114ef8e2d337d2b481a260985fcf50d1` |
| Polityka prywatności | 2 | `8c77e344ad8cd314b7c67b051f43b39d652383c0040221a43e38b0c3f6a598d3` |

Zalogowani klienci (regulamin + polityka) i inwestorzy (polityka) akceptują
wersję 2 przy następnym wejściu do panelu (`ConsentGate`, tabela
`consent_acceptances`). `/regulamin` i `/polityka-prywatnosci` renderują
aktywną wersję z bazy.

## Najważniejsze pliki

- `src/lib/contract-engine/fees.ts` — prowizja FY, tabela odsetek maksymalnych, LTV.
- `src/lib/contract-engine/loan-schedule.ts`, `src/lib/loan-math.ts`,
  `src/lib/mcp/tools/calculators.ts` — jeden silnik dla kalkulatorów UI, MCP i umów.
- `src/lib/contract-engine/clauses.json` (v1.4), `umowa-docx.ts` — Zał. 4 do
  umowy pożyczki: dyspozycja wypłaty i klauzula Prowizji Klientowskiej.
- `src/lib/loan-status.ts` — 25 statusów, mapowanie starych, `proposeAutoStatus`.
- `src/lib/investor-agreements/order-cycle-core.ts` — teasery z przyjętych Zleceń, limity.
- `src/lib/example-projects.ts` — przykładowe projekty (ilustracja).
- `src/lib/legal/` — transformacje v6 → v7 i v1 → v2, budowa .docx.
- `src/lib/consent/`, `src/components/consent/consent-gate.tsx` — akceptacja nowych wersji.
- `src/lib/company.ts` — dane firmy w jednym miejscu.
- `src/lib/labels.ts` (`TERMS`) — słownik nazw w UI.

## Testy

Pełny zestaw: 105 plików, 1289 testów — zielone. `tsc --noEmit` i
`eslint` bez błędów. Nowe testy: `fees`, `loan-math`, `example-projects`,
`calculators` (MCP), `order-cycle-core` (teasery, limity), `loan-status`,
`legal/pakiet-v7`, `legal/build-v7`, `legal/zgody-v2`, `consent-core`,
`document-fields.iod`, `labels.terms`, `security/anon-grants`,
`security/migrations-mirror`.

## Decyzje i działania po stronie człowieka

1. ✅ **Zwolnienie z VAT prowizji** — potwierdzone przez właściciela (2026-09-29).
2. ✅ **Aktywacja pakietu v7** — zatwierdzona. Migracja `0014` wstawia v7/v6/v5
   od razu z `active = true` (cały pakiet naraz). Akceptacje v5/v6 nie
   przechodzą na v7 — Inwestor akceptuje v7 w panelu.
3. ✅ **Jeden rachunek Finance You** — ten sam do spłat pożyczek FY i do
   Prowizji Klientowskiej (`COMPANY_DATA.bankAccount`). Kreator umowy (agent AI
   i MCP) przy Pożyczkodawcy innym niż Finance You sam wylicza prowizję FY
   (7%, min. 5 000 zł), jeśli jej nie podano, i zawsze wpisuje ten rachunek
   (nadpisuje inny). Kreator wzorów DOCX wpisuje go w pola rachunku Finance You
   / prowizji.
4. ✅ **Szablon u08** — pole „IMIĘ I NAZWISKO IOD” zostaje; kreator wpisuje w nie
   dane Inwestora (osoba albo reprezentant firmy + e-mail lub telefon).
   Plik w Storage nie wymaga zmian.
5. **Prompty botów w bazie** — migracja `0016` poprawia sekcję kosztów bota
   klienta (dotąd 1,79–4% miesięcznie, czyli ponad odsetki maksymalne) i
   dopisuje blok „ZASADY OPŁAT I B2B”. Po wdrożeniu przejrzeć prompt w
   `/admin/text-agent` i zsynchronizować agentów głosowych.
6. **Nazwy podmiotów przetwarzających** w Polityce prywatności v2 podano
   markami (Supabase, AWS Bedrock, Didit, Dilisense, ElevenLabs, Twilio, Tpay,
   Meta). Prawnik powinien uzupełnić pełne nazwy i siedziby oraz potwierdzić
   podstawy transferu poza EOG.
7. **Brak lustra drizzle dla `20260928120000_studio_napisy_wlasne.sql`** —
   migracja sprzed tej pracy nie ma odpowiednika w `drizzle/migrations`, więc
   nie trafi na produkcję ścieżką drizzle. Poza zakresem — do decyzji.
8. **Kontrola wizualna .docx** — LibreOffice w środowisku roboczym nie otwiera
   żadnych plików .docx (także oryginałów), więc render nie został obejrzany.
   Struktura XML jest poprawna, a tekst .docx umowy v7 jest równy `content_text`
   (test). Przed aktywacją otworzyć pliki w Wordzie.

## Granty dla `anon`, które zostały (świadomie)

Funkcje: `has_role`, `get_public_tracking_settings`, `get_operator_invite`.
Tabele marketingowe i publiczne: `tracking_settings`, `ai_landings`,
`ai_landing_variants`, `ai_landing_events` (INSERT), `ai_seo_articles`,
`ai_seo_topics`, `ai_funnel_events`, `marketing_campaigns`, `campaign_clicks`
(INSERT), `lead_attributions` (INSERT), `email_subscribers`, `landing_pages`,
`consent_documents` (tylko aktywne), `avatar_faqs`, `access_products`,
`seo_location_pages`, `seo_location_report_entries`; storage
`ad_creatives_public_read`, `studio_media_public_read`. Funkcje SECURITY
DEFINER bez jawnego REVOKE: `affiliate_current_partner_id`,
`investor_has_disclosed_match`, `investor_legal_pack_complete`,
`owns_debt_collection_case`, `get_team_*` — do przeglądu w osobnym zadaniu.

## Weryfikacja po wdrożeniu

- `/dla-inwestora` i `/embed/leady` bez logowania: tylko przykładowe projekty.
- `/propozycje` bez sesji: prośba o zalogowanie.
- Kalkulator na stronie: stopa > 14,5% zablokowana; 100 000 zł → 7 000 / 93 000.
- `list_access_products`: produkty inwestora `active = false`.
- `list_legal_documents`: v7 / v6 / v5, `active = true`.
- `project_module_settings`: LTV 60, 24/12 h, 5/2/5, 120 mies.
