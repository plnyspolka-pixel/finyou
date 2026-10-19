# Etap −1 — mapa istniejącego agenta publikującego (inwentaryzacja 19.10.2026)

Stan kodu na `main` (commit `d138ff0a`) + odczyt produkcji przez MCP Finance You
(tylko odczyt). Ten plik jest punktem wyjścia rozbudowy z
`BRIEF_DLA_CLAUDE_CODE.md` — zasada: **rozbudowujemy, nie budujemy obok**.

## 0. Najważniejsze ustalenia (różnice między briefem a kodem)

| #   | Ustalenie                                                                                                                                                                                                                                                                                                          | Skutek dla planu                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Modułów `growth_agent` i `agent_owner` **nie ma w kodzie**. W `ai_growth_action_log` kod zapisuje moduły: `seo_content_engine`, `landing_generator`, `outreach`, `link_building`, `ab_testing`, `micro_optimizer`.                                                                                                 | Nowy moduł agenta = `publishing_agent` w tym samym dzienniku. Alarmy SMS do właściciela budujemy na istniejącym `sendSmsInternal` (`src/lib/voicebot.functions.ts`) + `sms-guard`. |
| 2   | `automation_mode` i `daily_ai_budget_pln` z `ai_growth_settings` są **tylko zapisywane, nigdzie nie egzekwowane**; `cost_pln` w dzienniku nie jest sumowany.                                                                                                                                                       | Bezpieczniki (5.8) egzekwujemy w kodzie modułu: tryb, kill switch, budżet AI liczony z `ai_growth_action_log.cost_pln`.                                                            |
| 3   | `ai_growth_action_log.status` ma CHECK `ok/blocked/error`, a autopilot bloga zapisuje `warning` → **ostrzeżenia compliance bloga giną po cichu**.                                                                                                                                                                  | Migracja rozszerza CHECK o `warning` i `info`.                                                                                                                                     |
| 4   | Rok 2024 w tytułach SEO: w kodzie nie ma zaszytego roku — **model nie dostaje dzisiejszej daty** (`blog-autopilot.server.ts` `writeArticleFromNews`, `ai-seo-engine.server.ts`).                                                                                                                                   | Data w promptach + walidacja „przestarzałego roku” przed publikacją (artykuł z błędnym rokiem idzie do szkicu).                                                                    |
| 5   | Wpisy Meta zawieszone w `publishing` **nie są odzyskiwane** (X i TikTok mają `reclaimStalledItems`). Produkcja: 1 FB Reel `050d65f2…` w `publishing` od 6.10 z notą „Wideo w przygotowaniu”.                                                                                                                       | Reclaim w ticku Meta (tylko wpisy, przy których nic nie poszło do Meta).                                                                                                           |
| 6   | FB Reels: endpoint `/video-reels/` **już poprawiony** w kodzie (`studio-publishing.server.ts`, `upload_url` z `upload_phase=start`). Błędy z 30 dni to wpisy sprzed poprawki.                                                                                                                                      | Bez zmian w kodzie; ponowienie starych błędów po wdrożeniu.                                                                                                                        |
| 7   | Cennik `/dla-inwestora#cennik` renderuje **stałe z `src/lib/investor-plan/plans.ts`** (abonament 1 500 zł / 30 dni, 7 000 zł / 365 dni — zgodnie z aktywnymi `access_products`), a nie bazę. Brief opisuje stronę z „Pakiet PRO 3 000 zł + 5%” — kod `main` od 30.09 tego nie pokazuje (PRO i „okazja” wyłączone). | Rozbieżność do potwierdzenia przez właściciela (p. 8 briefu). W treściach agenta **nie ma cen** — reguła twarda.                                                                   |
| 8   | Brak double opt-in: zapis na lead magnet od razu daje `email_subscribers.status = active` (zgoda + snapshot treści zgody).                                                                                                                                                                                         | Zostawiamy mechanizm zgód; DOI jako opcja w ustawieniach modułu (domyślnie wył., zgodnie z obecną polityką).                                                                       |
| 9   | Reklamy Meta zawsze z `special_ad_categories: []` (`meta-ad-targeting.ts`).                                                                                                                                                                                                                                        | Etap 8: kategoria specjalna dla reklam finansowych. Podbicia domyślnie wyłączone (budżet 0 zł).                                                                                    |
| 10  | Prompt bloga (`STYLE_GUIDE`) **każe podawać stopy zwrotu** („od kilkunastu do nawet kilkudziesięciu procent rocznie”), a brief: „Nigdy: stopy zwrotu”. Tor pożyczkobiorcy w blogu celuje w konsumentów („zła historia w BIK”).                                                                                     | Prompt bloga dostosowany do briefu + bramka compliance na artykułach.                                                                                                              |
| 11  | Pożyczkobiorcy w banku 250 pytań = kategoria `klient` (130 szt.), inwestorzy `inwestor` (120).                                                                                                                                                                                                                     | Klasyfikacja na tory: `klient → pozyczkobiorca`, `inwestor → inwestor`, plus filtr „cel konsumencki” (5.1a).                                                                       |

## 1. Mapa obszarów (brief 3a): co jest → jak rozbudowujemy → czego brakuje

### Agent i silnik wzrostu

- **Jest:** `ai_growth_settings` (singleton, migracja `20260602142307_…`), `ai_growth_action_log`; `src/lib/ai-growth.server.ts`, `ai-seo-engine.server.ts`, `blog-autopilot.server.ts` (cron `daily-blog-tick` 04:00), `ai-outreach.server.ts`, `ai-linkbuilding.server.ts`, `ai-ab-testing.functions.ts`, `ai-optimizer.functions.ts`. MCP: `get/update_growth_settings`, `list_growth_actions`. Panel: `/admin/ai-growth-engine`.
- **Rozbudowa:** moduł `publishing_agent` (`src/lib/publishing-agent/`): ustawienia modułu z trybem i wyłącznikiem, dwa profile torów (obecne ustawienia = profil „pożyczkobiorca”), bezpieczniki, bramka compliance, log decyzji w `ai_growth_action_log`.
- **Brak:** egzekwowania trybu i budżetu, alarmów do właściciela, raportów.

### Produkcja (Studio)

- **Jest:** `studio_video_jobs`, `studio_settings`, `studio_default_avatars`, `studio_broll_assets`, `studio_images`, `video_renditions`, `video_pipeline`; `studio-video-queue.server.ts` (render, napisy, `maybeAutoPublishJob`), `studio-ai.server.ts`, `studio-broll.server.ts`, `studio-avatars.server.ts`, renderery `services/caption-burner`, `services/remotion` (`StudioReel`, komponenty motion). Znaczek „AI”, napisy z czasów ElevenLabs, kompresja do 60 MB. MCP: `create_studio_video_job` i reszta w `mcp/tools/heygen.ts`, `studio-motion.ts`.
- **Rozbudowa (Etap 4):** etykieta „Treść wygenerowana przez AI” w 1. sekundzie (dziś tylko znaczek), segment hooka wizualnego, pętla, linia ryzyka, QA po renderze (Scribe vs scenariusz), koszt per rolka.
- **Brak:** QA po renderze, kosztów per rolka, wariantów wykonania hooka.

### Bank treści

- **Jest:** `src/lib/shorts-question-bank.ts` (250 pytań `{id, category: klient|inwestor, section A–K, question, thesis}`, generowane z `docs/shorts/pozyczki-prywatne-250-pytan.md`), `src/lib/shorts-series.ts` (10 odcinków inwestorskich), `shorts-script.ts`, `avatar_faqs`, `training_videos`.
- **Rozbudowa (Etap 5):** klasyfikacja na tory, scoring, przepisanie na format rolki z wersjonowaniem.

### Publikacja

- **Jest:** `social_publish_queue` (Meta, TikTok, X), `youtube_publish_queue`; `studio-publishing.server.ts` (Meta), `tiktok.server.ts`, `x.server.ts`, `youtube-shorts.server.ts`, `studio-enqueue.server.ts`, `studio-platforms.ts`; cron `social-publish-tick` i `youtube-shorts-tick` co 10 min. MCP: `queue_social_publication`, `publish_studio_job`, `run_publish_tick`, `retry_social_queue_item` i in.
- **Rozbudowa:** bramka compliance przed KAŻDĄ publikacją (w publikatorach, więc obejmuje panel, MCP i automaty), dopisywanie elementów obowiązkowych (AI, KRS, ryzyko), wyłączanie platform (X), reclaim zawieszonych wpisów Meta, pochodzenie i tor wpisu (`origin`, `audience_track`).

### Lejek

- **Jest:** `lead_magnets`, `lead_magnet_posts`, `lead_magnet_signups`, `lead_magnet_triggers` (migracja `20261006150000_lead_magnety.sql`), `src/lib/lead-magnets/` (`core.ts` czysta logika, `lead-magnets.server.ts`: zapis, pobranie, komentarz/DM/reakcja → link, tick YouTube), strona `/pobierz/$slug`, `short_links`, `campaign_clicks`, `lead_attributions`, `tracking_settings`, mailing (`email_campaigns`, `email_segments`, `email_subscribers`, `email_templates`, `mailing.server.ts`, `email-unsubscribe.server.ts`). Webhook Meta (`meta-messenger-webhook.ts`) obsługuje hasła w komentarzach FB/IG i DM.
- **Rozbudowa (Etap 3):** fabryka lead magnetów z szablonów marki, silnik kalkulatorów z konfiguracji, link-hub, sekwencje per tor.

### Narzędzia obliczeniowe

- **Jest:** `src/lib/contract-engine/fees.ts` (`ltvPercent`, `maxLoanAtLtv`, `LTV_MAX` 60%), `contract-engine/loan-schedule.ts`, `src/lib/loan-math.ts` (`monthlyPayment`, `computeLoanFigures`), `src/lib/location-scoring/`. MCP: `calculate_loan_installment`, `calculate_ltv`, `calculate_repayment_schedule`, `get_location_score`.
- **Rozbudowa:** silnik kalkulatorów-lead-magnetów (konfiguracja JSON → formuły z tej biblioteki, bez kodu w runtime).

### Dokumenty

- **Jest:** `document_templates`, `generated_documents`, `document-generator.functions.ts` (docxtemplater), `contract-engine/*`, PDF: `src/lib/pdf/report-writer.ts` (pdf-lib, logo FY, czcionki Liberation).
- **Rozbudowa:** wzory umów jako lead magnety tylko z `document_templates`; PDF lead magnetów na `report-writer` + tokeny marki.

### Landingi, reklamy, analityka, konkurencja, komentarze

- **Landingi:** `landing_pages`, `ai_landings` (+ warianty, zdarzenia), `/l/$slug`.
- **Reklamy:** `meta_ad_drafts` + `publish_meta_ad_draft` (kampania tworzona jako PAUSED), `google_ad_drafts`, `meta_capi_events`.
- **Analityka:** `ai_funnel_events/insights`, `meta-api.server.ts` (`getIgMediaInsights`, `getPostInsights`), YouTube tylko Data API `statistics` (brak YouTube Analytics API), GA4 w `google-search.server.ts`.
- **Konkurencja:** `ai_competitors`, `ai_competitor_snapshots`, `ai-competitor.server.ts`.
- **Komentarze/DM:** `meta-comments.server.ts`, `meta-api.server.ts` (listy, odpowiedzi, ukrywanie), YouTube `listCommentThreads`/`replyToComment`.

### Marka

- `src/styles.css` (motyw marketingowy: granat `#070b22`, akcent `#2a6fdb`/`#4f8bf0`, złoto `oklch(0.82 0.14 88)`, Montserrat), Remotion `services/remotion/src/Motion.tsx` (navy `#0D1638`, gold `#EABE4A`…), napisy Inter. Brief wspomina brąz/złoto + Fraunces — **obecna marka w kodzie to granat + złoto**, więc system marki (`brand.json`) bierzemy z kodu.

## 2. Stan produkcji (odczyt MCP 19.10.2026)

- `ai_growth_settings`: `manual_review`, 50 zł/dzień, CTA wniosek — bez zmian (przełączenie trybu robi właściciel).
- `social_publish_queue`: 1 wpis `publishing` (FB Reels `050d65f2…`, od 6.10).
- `access_products` (inwestor): aktywne abonament 30 dni 1 500 zł i 365 dni 7 000 zł; nieaktywne PRO 180 dni 3 000 zł i „okazja” 1 500 zł.
- `ai_seo_articles`: 104 artykuły; autopilot publikuje codziennie, m.in. 19.10 „W co inwestować pieniądze w 2024?”, 1.10 „Przegląd tygodnia 13-19.05.2024…”, 27.09 „…16.09–22.09.2024…”, 28.09 „Porównanie klas aktywów 2024…”.

## 3. Co budujemy w tej gałęzi (kolejność z sekcji 6 briefu)

Szczegóły i status: opis PR oraz `RAPORT_ETAPOW.md`.
