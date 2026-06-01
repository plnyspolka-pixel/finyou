## Zakres

Trzy oddzielne moduły w panelu admina (`/admin/mailing`, `/admin/fb-ads/kreator`, `/admin/google-ads/kreator`).

---

## 1. Moduł Mailingowy — `/admin/mailing`

**Baza danych (3 nowe tabele):**
- `email_campaigns` — `name`, `subject`, `html_body`, `text_body`, `from_email`, `from_name`, `audience_type` (leady/klienci/inwestorzy/wszyscy), `audience_filter` (jsonb — np. status leada), `scheduled_at`, `status` (szkic/zaplanowana/wysylana/wyslana/anulowana/blad), `sent_count`, `failed_count`, `created_by`
- `email_campaign_recipients` — `campaign_id`, `recipient_email`, `recipient_name`, `user_id?`, `status` (oczekuje/wyslany/blad/odbity), `sent_at`, `error_message`
- `email_templates` — `name`, `subject`, `html_body`, `variables` (jsonb)

RLS: SELECT/INSERT/UPDATE/DELETE dla `administrator` + `operator`. GRANT do authenticated + service_role.

**UI:**
- Lista kampanii z filtrami statusu
- Kreator: wybór szablonu lub edytor HTML (textarea + podgląd live w iframe), wybór segmentu, podgląd liczby odbiorców, datepicker harmonogramu
- Dialog "Wyślij testowo" → pojedynczy adres
- Karta szczegółów kampanii: statystyki + tabela odbiorców
- Zakładka "Szablony" — CRUD

**Serwer (`src/lib/mailing.functions.ts`):**
- `listCampaigns`, `getCampaign`, `saveCampaign`, `deleteCampaign`
- `previewAudience({audience_type, filter})` → liczba + sample
- `sendTestEmail({campaignId, toEmail})`
- `scheduleCampaign({campaignId, when})` — materializuje odbiorców do `email_campaign_recipients`
- `dispatchScheduledCampaigns()` — wywoływana przez pg_cron co minutę; bierze kampanie ze `scheduled_at <= now()` i status `zaplanowana`, wysyła w batchach

**Wysyłka:** używamy istniejącego connectora **Gmail** (już skonfigurowany w projekcie — `GOOGLE_MAIL_API_KEY` jest w secretach) przez gateway. To pozwala wysyłać od razu, bez konfigurowania domeny.

**Cron:** route `/api/public/hooks/dispatch-campaigns` + `pg_cron` co 1 minutę z `apikey`.

---

## 2. Kreator Facebook Lead Ads — `/admin/fb-ads/kreator`

Wykorzystuje istniejący `META_ACCESS_TOKEN` (token musi mieć scope `ads_management` + `leads_retrieval` + `pages_manage_ads`).

**Baza:**
- `meta_ad_drafts` — `name`, `ad_account_id`, `page_id`, `objective` (LEAD_GENERATION), `daily_budget`, `targeting` (jsonb: kraje, wiek od/do, płeć, zainteresowania, lokalizacje), `creative` (jsonb: headline, primary_text, description, image_url, cta_type), `lead_form` (jsonb: nazwa, pytania), `status` (szkic/opublikowana/blad), `meta_campaign_id?`, `meta_adset_id?`, `meta_ad_id?`, `error_message?`

**UI — wieloetapowy kreator (Stepper):**
1. **Konto + strona FB** — wybór z `meta_ad_accounts` + dropdown stron (fetch `/me/accounts`)
2. **Cel + budżet** — daily budget (PLN), data startu/końca
3. **Grupa docelowa** — kraj (default Polska), wiek 18-65, płeć, miasta (autocomplete przez `/search?type=adgeolocation`), zainteresowania (autocomplete `/search?type=adinterest`)
4. **Kreacja** — upload zdjęcia (Supabase Storage `property-photos` lub nowy bucket `ad-creatives`), headline, primary text, opis, CTA (`SIGN_UP` / `LEARN_MORE` / `APPLY_NOW`)
5. **Formularz leadowy** — nazwa, intro headline + opis, pola (email, telefon, imię — preset; możliwość dodania pytań niestandardowych), privacy policy URL, thank-you message
6. **Podgląd + publikacja** — JSON preview, "Zapisz jako szkic" / "Publikuj na Facebooku"

**Serwer (`src/lib/meta-ads-creator.functions.ts`):**
- `listFbPages()` → `GET /me/accounts`
- `searchTargeting({type, q})` → `GET /search?type=adgeolocation|adinterest`
- `saveAdDraft`, `listAdDrafts`, `getAdDraft`, `deleteAdDraft`
- `publishAdDraft({draftId})` — sekwencja:
  1. `POST /act_{id}/campaigns` (objective=LEAD_GENERATION, status=PAUSED)
  2. `POST /act_{id}/adsets` (targeting, daily_budget, optimization_goal=LEAD_GENERATION)
  3. `POST /{page_id}/leadgen_forms` (formularz)
  4. `POST /act_{id}/adcreatives` (link do strony + form_id)
  5. `POST /act_{id}/ads` (adset_id + creative_id)
  6. Zapis zwróconych ID do `meta_ad_drafts`, status=`opublikowana` (PAUSED — wymaga ręcznej aktywacji)

**Storage:** bucket `ad-creatives` (publiczny) na zdjęcia kreacji.

---

## 3. Kreator Google Ads — `/admin/google-ads/kreator`

**Krytyczna informacja dla użytkownika:** Google Ads API wymaga **developer token** zatwierdzanego przez Google (proces 2-4 tygodnie + wymóg konta MCC + Terms of Service). Bez tego API nie działa.

**Podejście dwuetapowe:**

**Etap A (od razu — działa bez API):**
- Tabela `google_ad_drafts` — `name`, `campaign_type` (SEARCH/DISPLAY), `daily_budget_pln`, `keywords` (text[]), `negative_keywords` (text[]), `headlines` (text[] — Responsive Search Ads: 3-15 nagłówków po 30 zn.), `descriptions` (text[] — 2-4 opisy po 90 zn.), `final_url`, `target_locations` (text[]), `target_languages` (text[]), `status` (szkic/eksportowana), `notes`
- UI kreatora z walidacją limitów znaków, podgląd reklamy SERP-like
- Eksport do **Google Ads Editor CSV** (format do zaimportowania ręcznie w Google Ads Editor — to standardowy workflow agencji)
- Przycisk "Otwórz w Google Ads" → deep link do https://ads.google.com/aw/campaigns/new z prefilled query params (część pól)

**Etap B (opcjonalnie później):**
- Connector Google Ads + developer token → automatyczna publikacja
- Pole w UI integracji: "Status developer tokena: oczekuje/zatwierdzony"

**Serwer (`src/lib/google-ads.functions.ts`):**
- `saveGoogleAdDraft`, `listGoogleAdDrafts`, `getGoogleAdDraft`, `deleteGoogleAdDraft`
- `exportToCsv({draftId})` — zwraca CSV w formacie Google Ads Editor

---

## Nawigacja

W `src/routes/admin.tsx` dodać do grupy "Konfiguracja":
- Mailing (ikona Mail)
- Kreator FB Ads (pod Meta Ads)
- Kreator Google Ads (ikona Search/Globe)

---

## Czego NIE robię w tej iteracji (osobne zapytania)

- Tracking otwarć/kliknięć maili (wymaga własnego pixela + bramki) — pokażemy tylko `sent`/`failed`/`bounced` jeśli Gmail zwróci
- Statystyki kampanii FB po publikacji — już istnieje synchronizacja w `/admin/meta`
- A/B testing kreacji
- Pełna integracja Google Ads API (czeka na developer token)
- Edycja opublikowanych kampanii FB (pierwsze podejście: publikuj jako PAUSED, edycja w Ads Manager)

---

## Pytania kontrolne przed startem

1. **Wysyłka maili**: OK na Gmail connector (limit ~500/dzień na konto), czy wolisz Lovable Emails z własną domeną `notify.financeyou.pl`? Lovable Emails = lepsza dostarczalność i wyższe limity, ale wymaga konfiguracji DNS (~10 min).
2. **FB Lead Ads — uprawnienia tokena**: czy obecny `META_ACCESS_TOKEN` to System User Token z `ads_management` + `pages_manage_ads`? Jeśli nie, trzeba wygenerować nowy w Business Manager przed publikacją.
3. **Google Ads — developer token**: czy macie już zatwierdzony developer token, czy zaczynamy od eksportu CSV i deep linków?
