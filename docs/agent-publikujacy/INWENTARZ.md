# Etap −1 – inwentaryzacja agenta publikującego (19.10.2026)

Mapa tego, co już jest w kodzie, co rozbudowujemy i czego brakuje. Podstawa: kod na `main`
(3841c1ce) + otwarty PR #276 (`claude/lucid-clarke-64wzxg`, agent wzrostu – jeszcze niezmergowany).

> **Ważne:** moduły `growth_agent` i `agent_owner` (SMS do właściciela) istnieją **tylko w PR #276**.
> Na `main` nie ma ich kodu; w `ai_growth_action_log` jest jeden wpis testowy z 11.10.
> Moduł autopilota z tego PR (`src/lib/autopilot/`) jest napisany tak, żeby działał bez #276
> i dał się z nim połączyć (ten sam dziennik `ai_growth_action_log`, ten sam wzorzec MCP).

## 1. Agent i silnik wzrostu

| Element | Gdzie | Stan / uwagi |
|---|---|---|
| `ai_growth_settings` (singleton) | migr. `20260602142307_…sql:7-29`; zapis `ai-growth.server.ts:236` `updateGrowthSettings`; schema `ai-growth-schema.ts:46` | `automation_mode` (off/manual_review/semi_auto/full_autopilot) **nie był czytany przez żaden silnik**; `daily_ai_budget_pln` nie był egzekwowany. |
| `ai_growth_action_log` | ta sama migracja, l.113 | CHECK status `ok/blocked/error`; `blog-autopilot.server.ts` wstawiał `warning` → wpis cicho odrzucany. `cost_pln` zawsze 0. |
| `seo_content_engine` | `ai-seo-engine.server.ts`, `blog-autopilot.server.ts` (`runDailyBlogTick`), `hooks/seed-blog.ts`, cron `daily-blog-6am-pl` | **Rok 2024**: żaden prompt nie podawał dzisiejszej daty – model brał rok z danych treningowych. Prompty bloga obiecywały też „stopy zwrotu od kilkunastu do kilkudziesięciu %” i celowały w konsumentów („zła historia w BIK”). |
| `growth_agent`, `agent_owner` | PR #276: `src/lib/growth-agent/*`, `src/lib/agent-toolkit/*`, `truth-guard.ts` | Do zmergowania osobno. `notifyOwner` → `OWNER_ALERT_PHONE` (fallback `COMPANY_DATA.phoneContracts`). |
| SMS | `voicebot.functions.ts:148` `sendSmsInternal` + `sms-guard.server.ts` | Kill switch SMS istnieje (`voicebot_settings.sms_outbound_paused`). |
| MCP | `src/lib/mcp/index.ts` + `tools/*.ts` (`defineTool`, `_helpers`) | Wzorzec do nowych narzędzi. |
| Cron | `cron-auth.server.ts` `requireCronSecret`; pg_cron `social-publish-tick` co 10 min | |

## 2. Produkcja (Studio publikacji)

| Element | Gdzie | Stan / uwagi |
|---|---|---|
| Kolejka i tick | `studio-video-queue.server.ts` (`processStudioVideoQueue`, `markReady` l.403, `maybeAutoPublishJob` l.943, `runStudioVideoTick`) | Brak timeoutu dla `generating_*`/`rendering`. |
| Scenariusz | `shorts-script.ts` (bank 250 pytań), `shorts-series.ts`, `studio-ai.server.ts` | Brak bramki compliance na scenariuszach i opisach. |
| Głos / awatar | `avatar-faq.server.ts` (`ttsElevenLabsWithTimestamps`, HeyGen `/v3/videos`), `studio-render.server.ts` | Jedno źródło czasów (SRT z ElevenLabs) już jest. |
| B-roll | `studio-broll.server.ts`, `studio-scenes.ts` | Hooki wizualne (`kind='hook'`) wycofane – do przywrócenia w Etapie 4. |
| Napisy / znaczek AI | `caption-style.ts` `AI_BADGE`, `studio-reel-plan.ts`, Remotion `StudioReel.tsx` (jedyny silnik od 24.10.2026) | Znaczek „AI” przez całość jest; etykieta „Treść wygenerowana przez AI” w 1. sekundzie **wycofana decyzją właściciela 23.10.2026** (nie dokładać), brak pętli, brak segmentu hooka. |
| Kompresja | — | **Usunięta 24.10.2026** razem z usługą FFmpeg (nigdy nie działała na produkcji); rolki z Remotion mają 10–16 MB i mieszczą się w limitach, materiały z biblioteki idą w oryginale. |
| Koszt per rolka | – | **Brak.** |

## 3. Dystrybucja

| Element | Gdzie | Stan / uwagi |
|---|---|---|
| `social_publish_queue` | `studio-publishing.server.ts` (Meta), `tiktok.server.ts`, `x.server.ts` | Brak klucza idempotencji przy wstawianiu. |
| FB Reels | `publishFacebookReel` l.177 | Błąd `/video-reels/v21.0` **naprawiony w kodzie 1.10** (merge 616cb1e4) – jeśli wraca, produkcja ma stary build. |
| Wiszące `publishing` (Meta) | – | **Brak odzyskiwania**; narzędzia retry/cancel nie przyjmowały `publishing`. |
| YouTube | `youtube-shorts.server.ts` `uploadShort` | **Brak `containsSyntheticMedia`.** |
| TikTok | `tiktok.server.ts` `uploadVideo` | Obsługa „unaudited” jest; **brak `is_aigc`**. |
| X | `x.server.ts` | 402 traktowany jak zwykły błąd (3 ponowienia). Brak wyłącznika kanału. |
| Opisy | `processClaimedJob` l.336 | Brak opisu-lejka (hasło, UTM, KRS, oznaczenie AI). |

## 4. Lejek, e-mail, landingi

| Element | Gdzie | Stan / uwagi |
|---|---|---|
| Lead magnety | `src/lib/lead-magnets/*`, `/pobierz/$slug`, `pobierz-plik.$token`, tick `lead-magnet-tick` | Pełny mechanizm hasło → link/DM → e-mail → plik. Zgoda RODO (jeden checkbox, tekst `consentTextFor`). **Brak double opt-in.** |
| E-mail | `email-marketing.server.ts`, `mailing.server.ts`, `resend-send.server.ts`, wypis `email-unsubscribe.server.ts` | **Brak sekwencji / maila powitalnego dla subskrybenta** (jest kadencja CRM dla leadów). |
| Landingi | `landing_pages` (`/l/$slug`), `ai_landings` + warianty A/B (`/embed/l/$slug`) | A/B po stronie klienta. |
| Śledzenie | `marketing_campaigns` + `/r/$code`, `short_links` + `/s/$code` | `lead_attributions` nikt nie zapisuje. |
| Kalkulatory | `mcp/tools/calculators.ts` `engineSummary`, `contract-engine/fees.ts` (`ltvPercent`, `maxLoanAtLtv`, `LTV_MAX=60`), `loan-math.ts` `monthlyPayment`, `location-scoring/scoring.ts` | Czyste funkcje – baza silnika kalkulatorów-lead-magnetów. |
| PDF | `src/lib/pdf/report-writer.ts` (`ReportWriter`, logo, polskie znaki) | Baza szablonu PDF lead magnetu. |
| Marka | `styles.css` (granat oklch, Montserrat), `src/assets/financeyou-*`, `company.ts` (KRS 0000635207) | **Brak jednego pliku tokenów marki.** |
| Cennik | `access_products` (aktywne 30 d 1 500 zł, 365 d 7 000 zł), `investor-plan/plans.ts` | Rozbieżność ze stroną `/dla-inwestora#cennik` – decyzja właściciela (p. 8 briefu). |

## 5. Co rozbudowujemy w tym PR (Etapy 0–5, część)

- `src/lib/autopilot/` – nowy moduł **w tym samym agencie i dzienniku** (`ai_growth_action_log`, moduły `autopilot`, `compliance_gate`):
  profile dwóch torów, bramka compliance (reguły twarde + recenzent LLM + pętla naprawcza), bezpieczniki i wyłącznik awaryjny,
  opis-lejek, metryki/outliery/raport, scoring pomysłów i hooków, silnik kalkulatorów z konfiguracji, tokeny marki.
- Migracja `20261019180000_autopilot_fundament.sql` – kolumny w `ai_growth_settings`, `warning` w logu, kolumny toru i idempotencji w kolejce, tabela metryk.
- Naprawy Etapu 0 w istniejących plikach (lista w PR).

## 6. Czego brakuje (kolejne PR-y)

Patrz sekcja „Co zostało” w opisie PR i `docs/agent-publikujacy/AUTOPILOT.md`.
