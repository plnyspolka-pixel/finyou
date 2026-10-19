# Sekrety aplikacji po odejściu od Lovable (stan 2026-10-19)

Lista zmiennych środowiskowych, które backend (Cloudflare Worker, `src/server.ts`) i funkcje Edge
czytają po przepisaniu kodu z bramek Lovable na API dostawców. Wartości wpisuje się jako sekrety
Workera (`wrangler secret put NAZWA` albo panel Cloudflare → Workers → Settings → Variables), nigdy
do repo. W `.env` (bundlowanym do frontendu) zostają tylko publiczne: `VITE_SUPABASE_*`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (nowy projekt już wpisany).

Źródło większości wartości: Lovable → projekt → Settings → Secrets (te same nazwy). Nowe zmienne
(nieistniejące w Lovable) oznaczone **NOWA**.

## Zmiany względem Lovable

| Było (Lovable) | Jest teraz |
|---|---|
| `LOVABLE_API_KEY` + bramka `ai.gateway.lovable.dev` | **NOWA** `ANTHROPIC_API_KEY` (czat/ekstrakcja: Claude), **NOWA** `OPENAI_API_KEY` (embeddingi `text-embedding-3-small`, transkrypcja nagrań), **NOWA** `GEMINI_API_KEY` (generowanie grafik). Opcjonalnie `AI_MODEL_FAST`, `AI_MODEL_PRO` (domyślnie `claude-opus-5-5`; tańszy wariant: `claude-haiku-5-5`), `AI_EFFORT` (`low`), `AI_IMAGE_MODEL` |
| bramka Resend (`LOVABLE_API_KEY` + `RESEND_API_KEY`) | tylko `RESEND_API_KEY` (klucz z pełnymi uprawnieniami — także odczyt maili przychodzących) |
| bramka Mailgun | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, opcjonalnie `MAILGUN_API_BASE` (domeny EU) |
| bramka Twilio (`TWILIO_API_KEY` = identyfikator połączenia Lovable) | **NOWA** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (albo `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET`); `TWILIO_WEBHOOK_TOKEN` bez zmian |
| bramka Google Sheets/Drive/Docs (`GOOGLE_*_API_KEY` = identyfikatory połączeń) | `GOOGLE_SERVICE_ACCOUNT_JSON` (konto usługi; arkusze i dokumenty trzeba udostępnić jego adresowi e-mail) |
| Lovable Payments (Stripe przez bramkę) | Stripe bezpośrednio: `STRIPE_LIVE_API_KEY` / `STRIPE_SANDBOX_API_KEY`, `PAYMENTS_LIVE_WEBHOOK_SECRET` / `PAYMENTS_SANDBOX_WEBHOOK_SECRET` — tylko jeśli ścieżka Stripe ma zostać; dostępy inwestorów idą przez Tpay/TubaPay |
| `@lovable.dev/cloud-auth-js` (Google/Apple przez Lovable) | Supabase Auth → Providers: Google (własny klient OAuth), Apple opcjonalnie |
| `@lovable.dev/email-js` (maile Auth i kolejka) | **NOWA** `SEND_EMAIL_HOOK_SECRET` — sekret hooka „Send Email” w Supabase Auth (adres hooka: `https://app.financeyou.pl/lovable/email/auth/webhook`); maile idą przez Resend |
| `LOVABLE_DB_MIGRATION_URL` (Drizzle) | `DATABASE_URL` (tylko dla `drizzle-kit`, poza Workerem) |

## Pełna lista (backend)

**Supabase:** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (anon), `SUPABASE_SERVICE_ROLE_KEY` (**sekret**), `SUPABASE_ANON_KEY` (alias)

**AI:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `AI_MODEL_FAST`, `AI_MODEL_PRO`, `AI_EFFORT`, `AI_IMAGE_MODEL`, `PR_DRAFT_MODEL`, `VIDEO_SCRIPT_MODEL`

**E-mail:** `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_FROM_DOMAIN`, `RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_API_BASE`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `SEND_EMAIL_HOOK_SECRET`, `OFFER_REPLY_DOMAIN`, `TEAM_NOTIFY_EMAIL`, `PROJECTS_ADMIN_EMAIL`, `FOLLOWUP_SAMPLE_RECIPIENT`

**SMS / głos:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (lub `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET`), `TWILIO_WEBHOOK_TOKEN`, `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_TEXT_AGENT_ID`, `ELEVENLABS_INTAKE_AGENT_ID`, `ELEVENLABS_INVESTOR_INFO_AGENT_ID`, `ELEVENLABS_INVESTOR_PANEL_AGENT_ID`, `ELEVENLABS_MISSING_INFO_AGENT_ID`, `ELEVENLABS_DEFAULT_VOICE_ID`, `ELEVENLABS_VIDEO_CREATE_PATH`, `ELEVENLABS_VIDEO_STATUS_PATH`, `ELEVENLABS_VIDEO_ID_FIELD`

**Meta / social / wideo:** `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`, `META_SYSTEM_USER_TOKEN`, `META_IG_USER_ID`, `META_IG_PAGE_ACCESS_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `META_IG_WEBHOOK_VERIFY_TOKEN`, `FB_PIXEL_ACCESS_TOKEN`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `X_CLIENT_ID`, `TWITTER_CLIENT_ID`, `HEYGEN_API_KEY`, `HEYGEN_CAPTION_STYLE`, `PEXELS_API_KEY`, `CAPTION_BURNER_URL`, `CAPTION_BURNER_SECRET`, `CAPTION_BURN_TIMEOUT_MINUTES`, `VIDEO_PIPELINE_*`, `VIDEO_RENDITION_TIMEOUT_MINUTES`, `STUDIO_*`

**Google / SEO / analityka:** `GOOGLE_SERVICE_ACCOUNT_JSON`, `GA4_PROPERTY_ID`, `GSC_SITE_URL`, `PAGESPEED_API_KEY`, `CLARITY_API_TOKEN`, `JINA_API_KEY`, `PR_MONITOR_FEEDS`, `SEO_LOCATION_DATA_VERSION`

**KYC / rejestry / ryzyko:** `DIDIT_API_KEY`, `DIDIT_API_KEY_NEW`, `DIDIT_API_BASE`, `DIDIT_APP_URL`, `DIDIT_WORKFLOW_ID`, `DIDIT_WORKFLOW_ID_KYC`, `DIDIT_WORKFLOW_ID_KYB`, `DILISENSE_API_KEY`, `EU_FSF_TOKEN`, `CEIDG_JWT_TOKEN`, `CEIDG_API_BASE_URL`, `GUS_BIR_API_KEY`, `GUS_BIR_API_URL`, `BIR_API_KEY`, `GUS_BDL_API_KEY`, `CMD_KW_USER`, `CMD_KW_PASSWORD`, `CMD_KW_BASE_URL`, `PROXY_SHARED_SECRET` (wspólny z funkcjami Edge `registry-proxy` / `tpay-proxy`), `LOCATION_SCORING_HMAC_SECRET`

**Płatności / księgowość:** `TUBAPAY_PARTNER_ID`, `TUBAPAY_API_KEY`, `TUBAPAY_API_BASE`, `TPAY_API_BASE`, `KSEF_TOKEN_FINANCE_YOU`, `KSEF_TOKEN_FUNDACJA_IM_PIECZAKA`, `KSEF_MOCK`, `FAKTUROWO_API_KEY`, `FAKTUROWO_API_ID`, `FAKTUROWO_API_ID_FINANCE_YOU`, `FAKTUROWO_API_ID_FUNDACJA_IM_PIECZAKA`, (Stripe — patrz tabela)

**Aplikacja:** `APP_URL`, `PUBLIC_APP_ORIGIN`, `PUBLIC_BASE_URL`, `SITE_URL` (wszystkie = `https://app.financeyou.pl` / `https://financeyou.pl`), `CRON_SECRET`, `AGENT_TOOLS_SECRET`, `FINANCEYOU_WEBHOOK_SECRET`, `AFFILIATE_ENCRYPTION_KEY`, `DISCOUNT_CODE_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

## Funkcje Edge (sekrety w Supabase → Edge Functions → Secrets)

`DIDIT_WEBHOOK_SECRET` (didit-webhook), `PROXY_SHARED_SECRET` (registry-proxy, tpay-proxy; ta sama
wartość co w Workerze). `rcn-proxy` bez sekretów. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
wstrzykiwane automatycznie.

## Frontend (`.env`, publiczne)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_ELEVENLABS_MISSING_INFO_AGENT_ID`, `VITE_PAYMENTS_CLIENT_TOKEN` (Lovable Payments — martwe),
`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`, `VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN`
(klucze przeglądarkowe z konektorów Lovable — mogą przestać działać po wyłączeniu Lovable; wtedy
własny klucz Google Maps JS API i token Mapbox pod tymi samymi nazwami).
