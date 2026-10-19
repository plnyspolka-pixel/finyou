# Etap −1 — inwentaryzacja agenta publikującego (stan kodu na 19.10.2026)

Mapa tego, co już działa w repo i w bazie, co rozbudowujemy, a czego brakuje.
Sprawdzone w kodzie (`main` @ d138ff0a) i odczytem z bazy przez konektor MCP
Finance You (wyłącznie odczyt). Zgodnie z briefem (3a): **rozbudowa, nie
równoległy system** — nowe moduły wpinają się w istniejące tabele, kolejki,
log `ai_growth_action_log` i narzędzia MCP.

## 1. Co istnieje

| Obszar | Kod / tabele | Uwagi z inwentaryzacji |
|---|---|---|
| Ustawienia silnika wzrostu | `ai_growth_settings` (singleton), `src/lib/ai-growth*.ts`, MCP `get/update_growth_settings` | Tryby `off/manual_review/semi_auto/full_autopilot` istnieją tylko jako kolumna — **żaden kod nie czytał trybu** przed publikacją. Brak wyłącznika awaryjnego, limitów per kanał, profili odbiorców. |
| Dziennik decyzji | `ai_growth_action_log` (moduły w bazie: `seo_content_engine`, `landing_generator`, `growth_agent`, `agent_owner`) | `growth_agent` i `agent_owner` to wpisy z sesji MCP, nie moduły w kodzie. **Błąd:** check constraint statusu (`ok/blocked/error`) odrzucał `status: "warning"` z bloga — ostrzeżenia compliance po cichu ginęły. |
| Studio publikacji | `studio_video_jobs`, `studio_settings`, `studio_default_avatars`, `studio_broll_assets`, `studio_images`; `src/lib/studio-*.ts`, `studio-video-queue.server.ts`, `caption-burner`, `services/remotion`, `motion-catalog.ts` | Pipeline HeyGen + ElevenLabs + caption-burner/Remotion kompletny; auto-publikacja po renderze (`maybeAutoPublishJob`) bez żadnej kontroli treści. |
| Bank treści | `src/lib/shorts-question-bank.ts` (253 pytania wygenerowane z `docs/shorts/pozyczki-prywatne-250-pytan.md`), `shorts-series.ts` (10 odcinków inwestorskich), `training_videos`, `avatar_faqs` | Bank jest statycznym kodem z kategorią `klient/inwestor`, bez wersjonowania, scoringu, serii i powiązań z lead magnetami. |
| Dystrybucja | `social_publish_queue` (FB post / FB Reels / IG Reels / TikTok / X), `youtube_publish_queue`, `studio-publishing.server.ts`, `tiktok.server.ts`, `x.server.ts`, `youtube-shorts.server.ts`, tick `social-publish-tick` (co 10 min) | Kompresja pod limity już jest (`video-rendition.ts`, profil `social-v1`: H.264, ≤ 60 MB — poniżej limitu X 64/67 MB i FB 60 MB). Naprawa endpointu FB Reels jest w kodzie od 2.10 (`#224`); 2 nieudane wpisy FB Reels są sprzed poprawki. Tor X ma odbijanie zawieszonych wpisów, **tor Meta nie miał** — stąd wpis FB Reels wiszący w `publishing` od 6.10. |
| Blog / SEO | `blog-autopilot.server.ts` (codzienny tick 04:00), `ai-seo-engine.server.ts`, `ai_seo_articles` | **Rok 2024 w tytułach**: prompt nie zawierał bieżącej daty, a przegląd tygodnia sam wymyślał ramkę dat („13-19.05.2024”). **Niezgodność z briefem:** przewodnik stylu kazał komunikować stopy zwrotu „od kilkunastu do kilkudziesięciu procent rocznie”; filtr zakazanych fraz tylko ostrzegał (i to nieskutecznie, patrz wyżej). |
| Lead magnety | `lead_magnets`, `lead_magnet_triggers`, `lead_magnet_posts`, `lead_magnet_signups`, `src/lib/lead-magnets/*`, strona `/pobierz/<slug>`, tick `lead-magnet-tick` | Mechanizm „komentarz z hasłem → link / e-mail w DM” działa (IG w trybie bez linku — konto ma zablokowane linki od 29.09). Zgody RODO i subskrybent w `email_subscribers` są w istniejącym przepływie. 1 rekord, nieopublikowany, bez pliku. |
| Atrybucja | `short_links`, `campaign_clicks`, `lead_attributions`, `tracking_settings`, `marketing-tracking.server.ts` | Gotowe do użycia przy UTM per publikacja. |
| Kalkulatory | `src/lib/contract-engine/{fees,loan-schedule}.ts`, `loan-math.ts`, MCP `calculate_ltv`, `calculate_loan_installment`, `calculate_repayment_schedule`, `get_location_score` | Zweryfikowane funkcje — baza silnika kalkulatorów-lead-magnetów. |
| Dokumenty | `document_templates`, `generated_documents`, generator DOCX | Wzory umów jako lead magnety wyłącznie stąd. |
| E-mail | `email_campaigns`, `email_segments`, `email_subscribers`, `email_templates`, `email-marketing.server.ts`, `email-branding.server.ts`, tick `dispatch-campaigns` | Sekwencje per tor do zbudowania na istniejących kampaniach i segmentach. |
| Landingi | `landing_pages`, `ai_landings`, `ai_landing_variants`, `ai_landing_optimizations` | A/B już jest w `ai_landings`; link-hub w bio i strony narzędzi mogą korzystać z tego samego mechanizmu. |
| Reklamy | `meta_campaigns`, `meta_ad_drafts`, `meta_capi_events`, `google_ad_drafts`, `meta-ads-creator.server.ts` | Publikacja kampanii istnieje; podbicia outlierów mają w niej tylko dostać limit i kategorię specjalną. |
| Analityka | `ai_funnel_events`, `ai_funnel_insights`, `getIgMediaInsights`, `getPostInsights` (`meta-api.server.ts`), `listVideos` (`youtube-api.server.ts`), GA4 | Brak tabeli metryk **per publikacja** — insighty były tylko na żądanie. |
| Konkurencja | `ai_competitors`, `ai_competitor_snapshots`, `scan_competitor` | Strony www; kont social brak. |
| Komentarze / DM | `meta-comments.server.ts`, `meta-messaging.server.ts`, odpowiedzi YT | Hasła obsługuje lead magnet; reszta trafia do agenta tekstowego. |
| SMS do właściciela | `sendSmsInternal` (`voicebot.functions.ts`, hamulec `sms-guard`) | Brak zapisanego numeru alarmowego właściciela w konfiguracji. |
| Marka | `src/styles.css` („Finance You Design System”: granat `#070b22`, niebieski `#2a6fdb`, złoto `oklch(0.82 0.14 88)`, Montserrat), `company.ts` (`COMPANY_DATA`, KRS 0000635207) | Tokeny tylko w CSS; brak jednego pliku tokenów dla PDF / maili / grafik. |

## 2. Co rozbudowujemy w tym PR

| Etap | Rozbudowa | Gdzie |
|---|---|---|
| 0 | Odbijanie zawieszonych wpisów Meta (`publishing` > 60 min → `failed` z opisem, bez ryzyka dubla); X wyłączany przełącznikiem kanału (domyślnie wyłączony); bieżąca data i ramka tygodnia w prompcie bloga + strażnik nieaktualnego roku; blog bez komunikowania stóp zwrotu i z bramką compliance zamiast ostrzeżenia; poprawka constraintu logu. | `studio-publishing.server.ts`, `x.server.ts`, `blog-autopilot.server.ts`, migracja |
| 1 | Profile dwóch torów (`ai_audience_profiles`), wyłącznik awaryjny i tryb modułu wideo w `ai_growth_settings`, limity (posty/dobę, budżet AI, budżet reklam per tor — 0 zł), bramka compliance (reguły twarde w kodzie, wersjonowane + recenzent LLM + pętla naprawcza ≤ 3) z audytem w `ai_compliance_checks`, bramka przed **każdą** publikacją z kolejek, autopauza przy anomaliach, MCP `get_autopilot_status` / `set_autopilot_kill_switch`. | `src/lib/autopilot/*`, migracja, tick `autopilot-tick` |
| 2 | Tabela `social_post_metrics` (snapshoty), import IG / FB / YouTube, mediany i outliery per tor, raport dzienny (SMS) i tygodniowy. | `src/lib/autopilot/metrics*.ts` |
| 3 (fundament) | `brand.json` (tokeny z design systemu strony), silnik kalkulatorów z konfiguracji JSON na zweryfikowanych funkcjach. | `src/lib/brand/`, `src/lib/autopilot/calculators.ts` |
| 5 (fundament) | Scoring pomysłu 0–100 i wybór hooka (czyste funkcje). | `src/lib/autopilot/planner.ts` |

## 3. Czego brakuje (kolejne PR-y)

- Etap 3: szablony PDF/strony/maila wypełniane z `brand.json`, kontrola wizualna (zrzuty + model z widzeniem), strony narzędzi renderowane jednym komponentem z konfiguracji, link-hub w bio, sekwencje powitalne per tor.
- Etap 4: warianty wykonania hooka (ElevenLabs), segment hooka wizualnego, etykieta AI w 1. sekundzie w Remotion, pętla, QA po renderze (Scribe vs scenariusz, czarne klatki) — wymaga pełnego dostępu ElevenLabs (wideo/obraz/muzyka; p. 8.1 briefu).
- Etap 5: przebudowa banku 253 pytań do tabeli z wersjonowaniem, serie, testy A/B hooków, dynamiczny podział kadencji.
- Etapy 6–8: odcinki tygodniowe cięte na Shorts, monitor inspiracji i kont, podbicia płatne (dziś budżet reklam = 0 zł).
