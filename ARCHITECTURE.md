# ARCHITECTURE.md — Finance You

> Pierwszy szkic **wygenerowany automatycznie z kodu** (migracje, trasy, `src/lib`) przez skill `system-review`.
> Sekcje oznaczone `⚠️ DO WERYFIKACJI` to moje domysły albo rzeczy, które zna tylko człowiek — popraw je.
> To ma być jedyny dokument, który jest **prawdziwy**. Aktualizuj przy każdej większej zmianie.

## Co to jest
Platforma do udzielania i obsługi **pożyczek zabezpieczonych nieruchomością**, finansowanych przez
inwestorów prywatnych/instytucjonalnych. Łączy pozyskanie leada, analizę nieruchomości (KW/RCN),
dopasowanie inwestora, generowanie umów, obsługę spłat oraz **windykację** — plus rozbudowany moduł
marketingu/AI-growth i program poleceń (pośrednicy/afiliacja).
⚠️ DO WERYFIKACJI: jedno zdanie własnymi słowami — to Twoja definicja, nie moja.

## Aktorzy
Role systemowe to enum `public.app_role` = `administrator | operator | klient | inwestor | ksiegowosc`.
Autoryzacja idzie przez tabelę `user_roles` + funkcję `public.has_role(uid, role)` używaną w politykach RLS.
"Pośrednik" istnieje jako **partner w programie poleceń** (`affiliate_partners`), niekoniecznie jako rola app_role.

| Rola | Co robi | Do czego ma dostęp |
|---|---|---|
| Klient (pożyczkobiorca) | składa wniosek, podpisuje umowę, widzi swój postęp/spłaty | własny profil, własny wniosek/pożyczka, dokumenty |
| Inwestor | finansuje pożyczki, składa oferty, prowadzi windykację swoich pożyczek | własne oferty (`investor_offers`), własne `wind_*` (RLS po `investor_user_id`) |
| Pośrednik / partner | poleca klientów, rozlicza prowizje (MLM przez `affiliate_network_closure`) | panel programu poleceń, własne prowizje/wypłaty |
| Operator | obsługa operacyjna (leady, klienci, oferty) | szeroki dostęp admin/operator w RLS |
| Księgowość (`ksiegowosc`) | faktury, KSeF, rejestr sprzedaży | moduł `admin.ksiegowosc.*`, `accounting_*`, `sales_invoices` |
| Admin (Filip) | pełna kontrola, integracje, AI-growth | wszystko (`administrator` w RLS) |
⚠️ DO WERYFIKACJI: kolumna "Do czego ma dostęp" — potwierdź, że to zgadza się z Twoim modelem uprawnień.

## Stack
- **Frontend:** TanStack Start + React 19 + TypeScript, Tailwind v4, shadcn/ui (`src/components/ui`), TanStack Router (`src/routes`) + React Query.
- **Backend / funkcje:** logika serwerowa w TanStack Start (`*.server.ts`, `*.functions.ts` w `src/lib`) + Supabase Edge Functions (`supabase/functions/`: `rcn-proxy`, `tpay-proxy`).
- **Baza:** Supabase Postgres (~130+ migracji w `supabase/migrations/`), RLS jako główna warstwa autoryzacji.
- **Auth:** Supabase Auth (`auth.users`, `auth.uid()`), role przez `user_roles` + `has_role()`.
- **Storage:** Supabase Storage (skany dokumentów, zdjęcia nieruchomości, wygenerowane umowy).
- **Hosting / deploy:** Cloudflare (`wrangler.jsonc`, `@cloudflare/vite-plugin`, `main: src/server.ts`, `nodejs_compat`). Środowisko dev/build przez Lovable.
- **AI:** Anthropic Claude (`claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-5`, modele 3.x) + Google Gemini (`gemini-2.5-flash`, `-image`) — najpewniej przez bramkę AI Lovable. ⚠️ DO WERYFIKACJI: czy jest Bedrock/region, czy bezpośrednie API? Szablon pytał o Bedrock — w kodzie tego nie widzę.

## Skala (liczby, nie przymiotniki)
⚠️ DO WERYFIKACJI — **tego nie da się wyczytać z kodu.** Uzupełnij realnymi liczbami:
- Użytkownicy aktywni: ?
- Pożyczki w systemie: ?
- Requestów / dzień: ?
- Największa tabela i jej rozmiar: ? (kandydaci: `email_send_log`, `external_api_logs`, `ai_funnel_events`, `campaign_clicks`)
- Najwolniejszy znany endpoint i jego czas: ?

Założenie skilla `system-review`: **low-traffic, high-stakes**. Jeśli to już nieprawda — zaktualizuj, bo zmienia rekomendacje.

## Główne encje domenowe
Dwa równoległe rdzenie danych (uwaga — patrz dług techniczny niżej):

**Rdzeń kredytowy (pozyskanie → umowa):**
`leads → loan_applications → properties` (zabezpieczenie), `investors → investor_offers` (finansowanie),
`clients / client_profiles`, `generated_documents / document_templates`.

**Rdzeń windykacyjny (`wind_*`, izolowany per inwestor po `investor_user_id`):**
`wind_borrowers → wind_loans → wind_collection_cases → wind_events`
- `wind_collection_cases.sciezka`: `miekka | standard | twarda | karna` (ścieżki windykacji),
- `wind_events` jest **append-only** (rejestr zdarzeń) — dokładnie wzorzec z `references/money-rules.md`.

**Moduły wspierające:** afiliacja (`affiliate_partners`, `affiliate_commissions`, `affiliate_payout_batches`,
`affiliate_network_closure`), księgowość/KSeF (`accounting_entities`, `accounting_documents`, `sales_invoices`,
`individual_sales_register`, `fakturowo_documents`), analiza nieruchomości (`properties`, `property_analyses`,
`kw_*` księgi wieczyste, cache: `rcn_cache`, `nbp_real_estate_cache`, `flood_risk_cache`, `gus_bdl_cache`),
marketing/AI-growth (`ai_*`, `meta_*`, `email_campaigns`).
⚠️ DO WERYFIKACJI: czy `wind_loans` i `loan_applications` to ten sam byt widziany z dwóch stron, czy dwa osobne światy? To kluczowe dla spójności danych.

## Przepływy krytyczne (te, które nie mogą się zepsuć)
Mapowanie na kod jest **wywnioskowane z nazw plików** — potwierdź granice.
1. **Lead → weryfikacja → oferta → umowa → wypłata**
   `leads` (`lead-quality`, `lead-enrichment`) → `loan_applications` (`kreator-pozyczki`) →
   `investor_offers` (`admin.oferty`) → `generated_documents` (`document-generator`, `loan-doc-wizard`, `contract-prep`).
2. **Spłata → zaksięgowanie → aktualizacja salda**
   `payments.functions.ts`, `tpay-proxy`, `stripe.server.ts` → postęp: `loan-progress`, `my-loan-progress`.
   ⚠️ DO WERYFIKACJI: gdzie dokładnie księguje się spłata i skąd liczone jest saldo (log zdarzeń vs kolumna)?
3. **Zaległość → windykacja (miękka / standard / twarda / karna)**
   `wind_collection_cases.sciezka` + `wind_events` (`windykacja.functions.ts`, `windykacja-procedure.ts`,
   `windykacja-documents.ts`, `debt-collection-math.ts`). Terminy/wezwania → dokumenty.
4. **Generowanie dokumentu (umowa, aneks, wezwanie)**
   `document-generator.functions.ts`, `loan-doc-wizard.functions.ts`, `windykacja-docfill.ts`, `schedule-table-docx.ts`
   (docxtemplater/PDF). Wzorce: `document_templates` → `generated_documents`.

## Integracje zewnętrzne
| System | Po co | Co się dzieje, gdy padnie |
|---|---|---|
| NBP API (`nbp-rates`) | stopa referencyjna → oprocentowanie | ⚠️ powinno degradować do cache 24h, nie blokować |
| RCN / WFS / Geoportal (`rcn-proxy`, `property-location-analysis`) | dane działki/lokalizacji | fallback wersji WFS 2.0.0→1.1.0→1.0.0→WMS (loguj która wersja) |
| EKW / Księgi wieczyste (`kw-content`, `kw-ocr`, `kw_*`) | analiza zabezpieczenia | ⚠️ DO WERYFIKACJI zachowania przy awarii |
| GUS BIR/BDL, KRS (`gus-bir`, `krs`) | dane firm/podmiotów | cache `gus_bdl_cache`, `krs_cache` |
| Meta / Facebook Lead Ads + CAPI (`meta-*`, `fb-capi`) | leady, reklamy, messaging | ⚠️ webhooki muszą weryfikować podpis + idempotencja |
| Google Ads / Analytics / Maps | reklama, tracking, mapy | degradacja UI |
| E-mail: Resend + Mailgun (`resend-send`, `mailgun-send`) | wezwania, komunikacja, kampanie | kolejka/`email_send_log`, retry |
| Płatności: Stripe + tpay (`stripe.server`, `tpay-proxy`) | opłaty/subskrypcje | ⚠️ podpis webhooka + kwoty liczone po stronie serwera |
| KSeF (`src/lib/ksef`) | e-faktury (compliance PL) | ⚠️ krytyczne dla księgowości |
| ElevenLabs / HeyGen / Voicebot (`elevenlabs`, `heygen-avatars`, `voicebot`) | agent głosowy, awatary | degradacja funkcji AI |
| Firecrawl | scraping (AI SEO/outreach) | degradacja funkcji marketingowych |

## Znane długi techniczne / rzeczy, które mnie boją
Obserwacje z kodu (⚠️ DO WERYFIKACJI + dopisz swoje — to najcenniejsza sekcja i tylko Ty ją naprawdę znasz):
- **Dwa lockfile'e naraz:** `bun.lock` **i** `package-lock.json` w repo (+ blok `pnpm.overrides` w `package.json`).
  Niejasna strategia menedżera pakietów → ryzyko rozjazdu wersji między środowiskami.
- **Skrypty `tmp-*.ts` w roocie** (`tmp-regen-cover.ts`, `tmp-restamp.ts`, `tmp-stamp.ts`) — jednorazowe? Do usunięcia/przeniesienia?
- **Dwa rdzenie pożyczki** (`loan_applications` vs `wind_loans`) — jeśli to osobne źródła prawdy, jest ryzyko niespójności sald/statusów.
- Bardzo dużo migracji z losowymi nazwami (Lovable) obok nazwanych ręcznie — trudno prześledzić historię schematu.
- ⚠️ DO WERYFIKACJI: RLS na **każdej** tabeli publicznej (sprawdź `SELECT relname FROM pg_class WHERE relrowsecurity = false AND relkind='r'`).

## Czego NIE robić w tym repo
- Nie proponuj Kafki, shardingu, mikroserwisów, replik czytających ani Redisa — to system low-traffic (patrz `references/perf.md`).
- Nie zmieniaj wzorów dokumentów (umowy, wezwania) bez konsultacji prawnej.
- Nie licz pieniędzy na `float` / `parseFloat` / `.toFixed` — `NUMERIC(14,2)` lub grosze (patrz `references/money-rules.md`).
- Nie `UPDATE`-uj zdarzeń finansowych ani `wind_events` — dopisuj korygujące zdarzenie (append-only).
- ⚠️ DO WERYFIKACJI: dopisz własne "nie ruszaj tego" (np. konkretne integracje/automatyzacje).
