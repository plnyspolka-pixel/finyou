# Agent publikujący — raport etapów (gałąź `feat/agent-publikujacy-autopilot`, 19.10.2026)

Zlecenie: `BRIEF_DLA_CLAUDE_CODE.md`. Inwentaryzacja: `MAPA_ISTNIEJACEGO_AGENTA.md`.
Tryb agenta po wdrożeniu: **`manual_review`** (bez zmian). Podbicia płatne: **wyłączone**
(budżet reklam torów 0 zł). Przełączenie na `full_autopilot` robi właściciel:
MCP `update_publishing_agent_settings { mode: "full_autopilot" }`.

## Co zrobione

| Etap      | Zakres                                                                                                                                                                                                                                                                                                                                                            | Gdzie                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| −1        | Mapa istniejącego agenta, różnice brief ↔ kod (m.in. `automation_mode` i budżet nigdy nieegzekwowane, `growth_agent`/`agent_owner` nie istnieją, ostrzeżenia bloga gubione przez CHECK)                                                                                                                                                                           | `MAPA_ISTNIEJACEGO_AGENTA.md`                                                                            |
| 0         | **SEO 2024**: modele dostają dzisiejszą datę; artykuł z przestarzałym rokiem albo naruszeniem reguł zostaje szkicem. Prompt bloga bez stóp zwrotu i cen, tor pożyczkobiorcy B2B                                                                                                                                                                                   | `ai-date-context.ts`, `blog-autopilot.server.ts`, `ai-seo-engine.server.ts`                              |
| 0         | **Zawieszone publikacje Meta**: IG bez kontenera wraca do kolejki; FB po 6 h → `failed` z instrukcją (wpis `050d65f2…` z 6.10 domknie się w pierwszym ticku po wdrożeniu)                                                                                                                                                                                         | `studio-publishing.server.ts` `reclaimStalledMetaItems`                                                  |
| 0         | **X wyłączony** (`disabled_platforms = {x}`), wpisy czekają                                                                                                                                                                                                                                                                                                       | `x.server.ts`, migracja                                                                                  |
| 0         | FB Reels endpoint — już poprawiony wcześniej w kodzie; kompresja 60 MB — już działa                                                                                                                                                                                                                                                                               | (bez zmian)                                                                                              |
| 1         | Moduł `publishing_agent`: ustawienia (tryb, **wyłącznik awaryjny**, budżet AI, limity publikacji/maili, progi anomalii, kanały właściciela), **profile dwóch torów** (pożyczkobiorca z obecnych ustawień silnika, inwestor), dziennik w `ai_growth_action_log`                                                                                                    | migracja `20261019190000_…`, `publishing-agent/agent-settings.server.ts`, `safeguards.ts`                |
| 1         | **Bramka compliance**: reguły twarde w kodzie (wersjonowane), elementy obowiązkowe, recenzent LLM niezależny od autora (inny model, osobny prompt), pętla naprawcza 3 iteracje, audyt `ai_compliance_checks`. Wpięta w **każdy** publikator (Meta, TikTok, X, YouTube) + flagi AI platform (YouTube `containsSyntheticMedia`, TikTok `is_aigc`)                   | `compliance-rules.ts`, `publication-gate.ts`, `compliance-gate.server.ts`, `publish-guard.server.ts`     |
| 1         | Wyłącznik: panel `/admin/ai-growth-engine` → „Agent publikujący”, MCP `set_publishing_agent_kill_switch`                                                                                                                                                                                                                                                          | `publishing-agent-panel.tsx`, `mcp/tools/publishing-agent.ts`                                            |
| 2         | Tick agenta co godzinę: anomalie (seria błędów, skok kosztu, sygnały platform, spadek jakości bramki) → **automatyczna pauza + SMS**; import metryk IG/YouTube do `content_publication_metrics`; mediany per platforma i tor, outliery ≥3×, raport dzienny (19:00) i tygodniowy (pon.) e-mailem                                                                   | `agent-tick.server.ts`, `publication-metrics.ts`, `/api/public/hooks/publishing-agent-tick`              |
| 3 (część) | System marki `brand.json` (z kodu: granat + złoto, Montserrat/Inter, dane firmy, dozwolone liczby); **silnik kalkulatorów z konfiguracji** (biała lista formuł na `fees.ts`/`loan-math.ts`, walidacja z przypadkami testowymi) + 3 narzędzia: ILE, RATA, LTV; strona `/narzedzie/<slug>` (część wyniku od razu, pełny po zapisie na listę); **link-hub `/start`** | `src/lib/brand/`, `src/lib/lead-magnet-tools/`, `src/routes/narzedzie.$slug.tsx`, `src/routes/start.tsx` |
| 5 (część) | Serie obu torów jako dane, klasyfikacja banku 250 pytań (130 pożyczkobiorca / 120 inwestor; 4 pytania do przepisania: #3, #8, #21, #60 — cel konsumencki), scoring pomysłu 0–100, wybór hooka + wariant A/B, podział kadencji (maks. ±10 p.p./tydz.)                                                                                                              | `content-planner.ts`                                                                                     |

Testy: 2 070+ (vitest), `tsc --noEmit` i eslint czyste dla zmienionych plików.

## Co zostało (kolejne PR-y)

- **Etap 3 (reszta):** generator PDF lead magnetów na `src/lib/pdf/report-writer.ts` + tokeny marki; szablony strony/maila/karuzeli; automatyczna kontrola wizualna (zrzuty mobile/desktop + model z widzeniem); sekwencje powitalne per tor i per lead magnet (`email_segments`/`email_campaigns`); mini-kursy wideo i kursy e-mail; utworzenie rekordów `lead_magnets` dla ILE / RATA / LTV (wtedy `/narzedzie/*` włączy bramkę zapisu); wzory umów wyłącznie z `document_templates`; double opt-in (przełącznik już jest w ustawieniach).
- **Etap 4:** etykieta „Treść wygenerowana przez AI” w 1. sekundzie (dziś znaczek „AI” przez całość), segment hooka wizualnego, pętla, linia ryzyka w Remotion; QA po renderze (Scribe vs scenariusz, czarne klatki, długość, etykieta); koszt per rolka; warianty wykonania hooka (ElevenLabs).
- **Etap 5 (reszta):** przepisanie banku na format rolki z wersjonowaniem (LLM + pętla compliance), generator 3–5 hooków, testy A/B z decyzją po 72 h, planer slotów i automatyczne kolejkowanie wpisów `origin = 'agent'`.
- **Etap 6–8:** cotygodniowe dłuższe odcinki cięte na Shorts, monitor inspiracji i śledzenie kont, podbicia płatne (kategoria specjalna reklam finansowych w `meta-ad-targeting.ts` — dziś zawsze `[]`).
- **Etap 2b:** YouTube Analytics API (średni czas, % obejrzenia, subskrypcje), FB Reels insights, przypisanie leadów do publikacji (hasło + UTM per publikacja), monitoring sygnałów platform (`platform_signal`).
- YouTube: wpisy zawieszone w `uploading` nadal nie są odzyskiwane (świadomie — ryzyko dubla przy wznowieniu uploadu); raport je pokazuje.

## Migracja — do wdrożenia przez właściciela (nie wdrożona na produkcję)

`supabase/migrations/20261019190000_agent_publikujacy_fundament.sql` — addytywna:
nowe tabele `publishing_agent_settings`, `ai_audience_profiles`, `ai_compliance_checks`,
`content_publication_metrics`; kolumny `origin`, `audience_track`, `compliance_check_id`,
`compliance_rules_version` w obu kolejkach (z wartościami domyślnymi); CHECK
`ai_growth_action_log.status` += `warning`, `info`; cron `publishing-agent-tick`
(`7 * * * *`). Kod działa też przed migracją (wartości domyślne, zapisy audytu best-effort).

## Zmiany zachowania po wdrożeniu (do świadomej akceptacji)

1. Treść łamiąca reguły twarde **nie wyjdzie** na żadną platformę — także wpisy dodane ręcznie z panelu. Wpis dostaje `failed` z powodem.
2. Opisy rolek AI dostają dopisek: oznaczenie AI + KRS + linia ryzyka (jeśli ich brakuje).
3. X nie publikuje (wpisy czekają w kolejce).
4. Autopilot bloga nie podaje stóp zwrotu, a artykuł z błędnym rokiem zostaje szkicem.
5. Już opublikowane artykuły z „2024” w tytule (m.in. 19.10 „W co inwestować pieniądze w 2024?”, 1.10 i 27.09 „Przegląd tygodnia … 2024”, 28.09 „Porównanie klas aktywów 2024”) — **nie zmieniałem danych produkcyjnych**; do decyzji: zdjąć do szkicu (`set_seo_article_status`) albo poprawić tytuły.

## Jednorazowe dane wejściowe od właściciela (brief, sekcja 8)

1. **ElevenLabs pełny dostęp** (wideo/obraz/muzyka — Recast, hooki wizualne, B-roll): w tej sesji dostępny jest tylko konektor ograniczony. Potrzebny klucz API z dostępem do ElevenCreative albo pełny konektor `https://api.elevenlabs.io/v1/mcp`. Do tego czasu B-roll z obecnego banku.
2. **Limity budżetu**: obowiązują domyślne — AI 50 zł/dzień, reklamy 0 zł/mies. na tor (podbicia wyłączone), maks. 3 publikacje/dobę/platformę, 3 maile/tydz./odbiorcę.
3. **Cennik**: kod `main` pokazuje na `/dla-inwestora#cennik` abonament 1 500 zł / 30 dni i 7 000 zł / 365 dni (stałe z `src/lib/investor-plan/plans.ts`, zgodne z aktywnymi `access_products`); PRO 3 000 zł i „okazja” 1 500 zł są wyłączone. Brief opisuje stronę z Pakietem Podstawowym i PRO 3 000 zł + 5% — proszę potwierdzić, która wersja obowiązuje, i podać kwotę opłaty za okazję w Pakiecie Podstawowym. W treściach agenta cen nie ma (reguła twarda).
4. **X**: kanał wyłączony do decyzji o kredytach API. **TikTok**: audyt aplikacji wg `docs/tiktok-audyt-nagranie.md` (nagranie po stronie właściciela).
5. **Przegląd prawny reguł** z `src/lib/publishing-agent/compliance-rules.ts` (działają od razu; przegląd może je zaostrzyć).
6. **Kanały alarmów i raportów**: telefon i e-mail właściciela — `update_publishing_agent_settings { owner_phone, owner_email }` albo sekrety `AGENT_OWNER_PHONE` / `AGENT_OWNER_EMAIL`. Bez nich raporty i alarmy trafiają tylko do dziennika.
7. **Instagram — bio/nazwa/zdjęcie** (Graph API tego nie zmienia): link w bio → `https://financeyou.pl/start`; proponowane bio: „Finansowanie firm pod zastaw nieruchomości · edukacja dla inwestorów · ok. 15 lat na rynku · treści z awatarem AI 👉 wybierz swoją ścieżkę”; nazwa: „Filip Bielak | Finance You”.
