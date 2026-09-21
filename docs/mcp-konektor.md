# Konektor MCP — Finance You w Claude.ai, ChatGPT i Claude Code

Aplikacja wystawia własny serwer MCP (Model Context Protocol) pod
`https://financeyou.pl/mcp`. Po dodaniu go jako konektora w Claude.ai, ChatGPT
albo Claude Code agent w czacie widzi leady, wnioski, oferty, korespondencję
(e-mail, Messenger, czat, SMS), analizy, finanse, marketing i stan systemu —
logując się **własnym kontem Finance You**. W torze między czatem a danymi
jest wyłącznie financeyou.pl i baza; Lovable dostarcza tylko bibliotekę
(`@lovable.dev/mcp-js`), która obsługuje protokół.

Nic nie dzieje się automatycznie: konektor odpowiada wyłącznie na pytania
zadane w czacie. Żadnych cyklicznych maili ani pushy z tego modułu.

## Co jest w repo

| Element                                            | Plik                                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definicja serwera MCP (lista narzędzi)             | `src/lib/mcp/index.ts`                                                                                                                                                  |
| Narzędzia z szablonu Lovable (jedno na plik)       | `src/lib/mcp/tools/<nazwa>.ts`                                                                                                                                          |
| Narzędzia domenowe (kilka na plik)                 | `src/lib/mcp/tools/{crm-extra,applications-extra,analysis,clients-aml,investors-extra,projects,finance,affiliate-extra,collections-extra,marketing,ops,calculators}.ts` |
| Fabryka narzędzi „lista z filtrami"                | `src/lib/mcp/_list-tool.ts`                                                                                                                                             |
| Helpery: role, klient z tokenem, dołączanie danych | `src/lib/mcp/_helpers.ts`                                                                                                                                               |
| Rdzeń raportu „co nowego"                          | `src/lib/activity-digest.server.ts` (+ test)                                                                                                                            |
| Trasy protokołu (generowane przez plugin)          | `src/routes/[.mcp]/*`, `src/routes/[.well-known]/*`, `src/routes/mcp.ts`                                                                                                |
| Strona zgody OAuth                                 | `src/routes/[.]lovable.oauth.consent.tsx` (`/.lovable/oauth/consent`)                                                                                                   |
| Manifest narzędzi (generowany)                     | `.lovable/mcp/manifest.json`                                                                                                                                            |
| Skrypt weryfikacji produkcji                       | `scripts/check-mcp.ts`                                                                                                                                                  |

Uwierzytelnienie: OAuth 2.1 z serwerem autoryzacji **Auth bazy** (issuer
`https://<projekt>.supabase.co/auth/v1`). Klient (Claude.ai / ChatGPT) rejestruje
się dynamicznie, użytkownik loguje się na stronie zgody, a każde wywołanie
narzędzia niesie token użytkownika — zapytania idą przez RLS, więc pośrednik
widzi swoje leady, inwestor swoje oferty, a administrator wszystko. Narzędzia
zespołowe dodatkowo sprawdzają rolę (`administrator` / `operator`, w finansach
także `ksiegowosc`, w AML i audycie tylko `administrator`).

## Podłączenie konektora

Adres serwera wszędzie ten sam: **`https://financeyou.pl/mcp`**. Logowanie
kontem administratora Finance You. Ścieżki w ustawieniach aplikacji zmieniają
się z czasem — szukaj „Connectors / Konektory".

**Claude.ai (web, desktop, aplikacja mobilna)** — plan Pro, Max, Team lub
Enterprise. Ustawienia → Konektory → „Dodaj własny konektor" → nazwa
„Finance You", adres jak wyżej → „Połącz" → logowanie i zgoda. W czacie włącz
konektor w menu „+" / narzędzia. Na planach Team/Enterprise konektor dodaje
administrator organizacji.

**Claude Code (terminal / web)** — `claude mcp add --transport http finance-you
https://financeyou.pl/mcp`, potem `/mcp` i logowanie. Na claude.ai/code konektor
dodany w Claude.ai jest widoczny od razu.

**ChatGPT** — plan Plus, Pro, Business lub Enterprise. Ustawienia → Konektory →
Zaawansowane → włącz „Tryb dewelopera" → „Utwórz" → nazwa, adres, autoryzacja
OAuth. Konektor włącza się w rozmowie w menu narzędzi (Developer mode).

Po dodaniu zacznij od „Pokaż mój profil Finance You" (`get_my_profile`) —
potwierdza, że logowanie i role działają.

**Koszt kontekstu.** Serwer wystawia ponad 120 narzędzi; opisy wszystkich
trafiają do kontekstu każdej rozmowy, w której konektor jest włączony (rzędu
kilkunastu–kilkudziesięciu tysięcy tokenów). Claude.ai i ChatGPT radzą sobie z
tym, ale w rozmowach niezwiązanych z Finance You warto konektor wyłączyć.
Jeśli zestaw ma być mniejszy, wystarczy usunąć grupę z listy w
`src/lib/mcp/index.ts`.

## Katalog narzędzi

Wszystkie narzędzia poza siedmioma wymienionymi w „Zapis" są **tylko do
odczytu**. Listy przyjmują `limit` / `offset` i zwracają `total`. Filtry dat
przyjmują ISO 8601 albo `YYYY-MM-DD`. Wrażliwe pola (PESEL, numery kont, hashe
OTP, dane bankowe partnerów) nie są zwracane.

**Start / konto**

| Narzędzie             | Co daje                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `get_my_profile`      | Kim jestem: id, e-mail, role.                                                                                |
| `get_my_access`       | Role, aktywne dostępy, subskrypcja inwestora, ostatnie płatności.                                            |
| `get_platform_stats`  | Liczby: leady, wnioski, klienci, inwestorzy, artykuły.                                                       |
| `get_updates_since`   | „Co nowego" od chwili X: leady, wnioski, wiadomości, oferty, odpowiedzi instytucji, płatności; `next_since`. |
| `get_kpi_report`      | KPI za okres vs poprzedni okres (z przychodem).                                                              |
| `get_platform_health` | Stan operacyjny: automatyzacje, błędy API, zaległe follow-upy, skrzynka, analizy, wnioski niekompletne.      |

**Skrzynka i korespondencja**

| Narzędzie                                 | Co daje                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `list_inbox_threads`                      | Wątki z klientami/inwestorami, jeden na osobę, `only_awaiting_reply`. |
| `read_inbox_thread`                       | Cała korespondencja z jedną osobą.                                    |
| `search_communications`                   | Szukanie po treści we wszystkich kanałach.                            |
| `get_call_transcript`                     | Transkrypcja i nagranie rozmowy telefonicznej.                        |
| `list_lead_communications`                | Historia komunikacji konkretnego leada.                               |
| `list_institution_threads`                | Wątki mailowe z instytucjami finansującymi (dystrybucja ofert).       |
| `read_institution_thread`                 | Wszystkie wiadomości z instytucjami w sprawie wniosku.                |
| `list_institution_questions`              | Pytania instytucji do klientów i odpowiedzi.                          |
| `list_chat_threads`, `list_chat_messages` | Czat klient ↔ inwestor.                                               |

**CRM (leady)**

| Narzędzie           | Co daje                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `list_leads`        | Leady z filtrami: status, typ, źródło, operator, jakość, fraza, daty. |
| `list_my_leads`     | Leady zalogowanego pośrednika/operatora.                              |
| `search_leads`      | Szukanie po imieniu, e-mailu, telefonie.                              |
| `get_lead`          | Surowy rekord leada.                                                  |
| `get_lead_timeline` | Lead + komunikacja + follow-upy + atrybucja + wniosek + linki.        |
| `get_lead_stats`    | Rozkłady po statusie, źródle, typie, jakości, dniach.                 |
| `list_follow_ups`   | Zaplanowane / wysłane follow-upy.                                     |
| `list_call_queue`   | Kolejka połączeń voicebota.                                           |
| `list_team_members` | Zespół (administratorzy, operatorzy, księgowość) z rolami.            |

**Wnioski**

| Narzędzie                                  | Co daje                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `search_applications`                      | Wnioski po kliencie, statusie, kwocie, kompletności, operatorze, dacie.                                           |
| `list_applications`, `get_application`     | Proste listowanie i rekord z ofertami.                                                                            |
| `get_application_details`                  | Pełna karta: klient, nieruchomości, dokumenty, historia statusów, oferty, dystrybucja, analizy, follow-up braków. |
| `list_incomplete_applications`             | Niekompletne z listą braków i kontaktami.                                                                         |
| `list_application_documents`               | Dokumenty wniosku / nieruchomości.                                                                                |
| `get_application_status_history`           | Historia zmian statusu.                                                                                           |
| `list_missing_info_follow_ups`             | Stan modułu „follow-up braków".                                                                                   |
| `list_auto_distribution_proposals`         | Propozycje auto-dystrybucji do instytucji.                                                                        |
| `list_loan_proposals`                      | Propozycje z kreatora pożyczki.                                                                                   |
| `list_properties`, `get_property_analysis` | Nieruchomości i wycena.                                                                                           |

**Analizy**

| Narzędzie             | Co daje                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `get_kw_analysis`     | Analiza KW: właściciele, nieruchomość, flagi ryzyka, podsumowanie. |
| `get_kw_findings`     | Wynik silnika reguł na KW (ustalenia, status).                     |
| `get_risk_assessment` | Ocena ryzyka inwestycyjnego wniosku.                               |
| `get_location_score`  | Potencjał lokalizacji (model po prefiksie KW).                     |
| `list_analysis_runs`  | Biegi pipeline'u analitycznego.                                    |
| `list_kw_documents`   | Pobrane odpisy KW.                                                 |

**Klienci, KYC, AML**

| Narzędzie                        | Co daje                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `list_clients`, `get_client`     | Lista i karta 360 (zgody, blokady, wnioski, KYC, AML).         |
| `list_kyc_verifications`         | Weryfikacje Didit.                                             |
| `list_aml_customers`             | Rejestr AML (ryzyko, screening, PEP, sankcje) — administrator. |
| `list_aml_cases`, `get_aml_case` | Sprawy AML ze screeningami i raportami GIIF — administrator.   |
| `list_aml_screenings`            | Screeningi sankcyjne/PEP — administrator.                      |

**Inwestorzy i oferty**

| Narzędzie                                                                         | Co daje                                                                 |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `list_investors`, `get_investor`                                                  | Lista i karta 360 (subskrypcja, kryteria, oferty, zlecenia, dokumenty). |
| `list_investor_offers`                                                            | Oferty inwestorów (po wniosku / statusie).                              |
| `list_investor_criteria`                                                          | Kryteria auto-dystrybucji instytucji.                                   |
| `list_criteria_change_proposals`                                                  | Propozycje zmian kryteriów z maili instytucji.                          |
| `list_investor_orders`, `list_investor_order_matches`                             | Zlecenia i dopasowania (moduł Zlecenie–Projekt).                        |
| `list_investor_screenings`                                                        | Screeningi inwestorów — administrator.                                  |
| `list_investor_success_fees`                                                      | Success fee — administrator.                                            |
| `list_agreement_acceptances`, `list_consumer_withdrawals`, `list_legal_documents` | Dokumenty prawne i ich akceptacje / odstąpienia.                        |

**Projekty inwestycyjne**

| Narzędzie                    | Co daje                                               |
| ---------------------------- | ----------------------------------------------------- |
| `list_investment_projects`   | Pula projektów z filtrami.                            |
| `get_investment_project`     | Projekt + przydziały + propozycje + pytania + wersje. |
| `list_project_proposals`     | Propozycje inwestorów.                                |
| `list_project_info_requests` | Pytania inwestorów do projektów.                      |

**Finanse**

| Narzędzie                   | Co daje                                              |
| --------------------------- | ---------------------------------------------------- |
| `list_access_payments`      | Płatności za dostęp (Tpay/Stripe).                   |
| `list_access_entitlements`  | Kto ma dostęp i do kiedy.                            |
| `list_access_products`      | Cennik.                                              |
| `get_revenue_report`        | Przychody po produkcie, grupie, miesiącu.            |
| `list_sales_invoices`       | Faktury sprzedaży (KSeF) — administrator/księgowość. |
| `list_accounting_documents` | Dokumenty księgowe — administrator/księgowość.       |
| `list_broker_settlements`   | Rozliczenia pośredników.                             |

**Program pośredników**

| Narzędzie                                          | Co daje                                               |
| -------------------------------------------------- | ----------------------------------------------------- |
| `list_affiliate_partners`, `get_affiliate_partner` | Partnerzy i karta partnera ze strukturą i prowizjami. |
| `list_affiliate_commissions`                       | Prowizje.                                             |
| `list_affiliate_payout_batches`                    | Paczki wypłat — administrator.                        |

**Windykacja**

| Narzędzie                                      | Co daje                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `list_collection_cases`, `get_collection_case` | Sprawy windykacyjne, pełna sprawa z pożyczką, dłużnikiem i zdarzeniami. |
| `list_wind_loans`                              | Pożyczki w module windykacji.                                           |
| `list_debt_collection_cases`                   | Starszy moduł spraw.                                                    |

**Marketing i treści**

| Narzędzie                                                                  | Co daje                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `search_blog`, `get_blog_article`, `list_blog_topics`, `list_seo_articles` | Blog: publiczne treści, kolejka tematów, wszystkie stany artykułów. |
| `list_serp_keywords`                                                       | Śledzone frazy z pozycjami w Google.                                |
| `list_email_campaigns`, `get_email_campaign`, `list_email_subscribers`     | Mailing i subskrybenci.                                             |
| `list_social_posts`, `list_publish_queue`                                  | Social media i kolejka publikacji.                                  |
| `list_meta_campaigns`, `list_meta_leads`                                   | Meta Ads i leady z formularzy.                                      |
| `list_landing_pages`, `list_landing_leads`                                 | Landing page'e i zgłoszenia.                                        |
| `list_tracking_links`, `list_short_links`                                  | Linki UTM z klikami, linki skrócone.                                |
| `list_pr_opportunities`, `list_growth_actions`, `get_funnel_insights`      | PR, silnik wzrostu, lejek.                                          |
| `list_seo_location_pages`                                                  | Strony lokalizacyjne SEO.                                           |
| `list_studio_jobs`, `list_youtube_queue`                                   | Studio wideo i kolejka YouTube.                                     |
| `list_marketing_materials`, `list_training_videos`, `list_faqs`            | Materiały, szkolenia, FAQ.                                          |

**Operacje i system**

| Narzędzie                                             | Co daje                                             |
| ----------------------------------------------------- | --------------------------------------------------- |
| `list_automation_events`                              | Zdarzenia automatyzacji i błędy.                    |
| `list_external_api_calls`                             | Wywołania zewnętrznych API (domyślnie nieudane).    |
| `list_audit_logs`                                     | Dziennik audytu — administrator.                    |
| `search_admin_assistant_history`, `list_admin_memory` | Historia i pamięć asystenta panelu — administrator. |
| `list_generated_documents`, `list_document_templates` | Wygenerowane dokumenty i szablony.                  |
| `list_loan_reminder_sends`                            | Maile przypominające (otwarcia, kliknięcia).        |

**Kalkulatory**

| Narzędzie                      | Co daje                                              |
| ------------------------------ | ---------------------------------------------------- |
| `calculate_loan_installment`   | Rata równa i koszt.                                  |
| `calculate_repayment_schedule` | Pełny harmonogram: równe, malejące, balon; prowizja. |
| `calculate_ltv`                | LTV, przedział, maks. kwota przy limicie.            |

**Zapis** (klient MCP pyta o potwierdzenie przed każdym wywołaniem)

| Narzędzie                | Co robi                                              |
| ------------------------ | ---------------------------------------------------- |
| `create_lead`            | Nowy lead.                                           |
| `update_lead_status`     | Zmiana statusu leada (+ notatka).                    |
| `log_lead_communication` | Wpis w historii komunikacji (np. notatka z rozmowy). |
| `add_lead_note`          | Dopisanie notatki do leada.                          |
| `assign_lead`            | Przypisanie leada do operatora.                      |
| `send_chat_message`      | Wiadomość w czacie klient ↔ inwestor.                |
| `add_blog_topic`         | Temat do kolejki bloga (nic nie publikuje od razu).  |

Wysyłki maili, SMS-ów i Messengera przez konektor celowo **nie ma** — te
kanały obsługuje panel i asystent panelu, który pokazuje treść przed wysłaniem.

Przykładowe pytania w czacie:

- „Co nowego na Finance You od 9:00?" → `get_updates_since`
- „Kto czeka na odpowiedź w skrzynce?" → `list_inbox_threads` z `only_awaiting_reply`
- „Pokaż całą rozmowę z Janem Kowalskim i zaproponuj odpowiedź" → `search_leads` + `read_inbox_thread`
- „Które wnioski powyżej 300 tys. są niekompletne i od kiedy nikt się nie kontaktował?" → `list_incomplete_applications`
- „Jak wypadł ten tydzień vs poprzedni?" → `get_kpi_report`
- „Czy coś się wysypało w nocy?" → `get_platform_health`, `list_external_api_calls`
- „Jaka jest nasza pozycja na 'pożyczka pod zastaw nieruchomości'?" → `list_serp_keywords`

## Jak dodać kolejne narzędzie

Prosta lista z filtrami — `defineListTool` w `_list-tool.ts`:

```ts
export const listX = defineListTool({
  name: "list_x",
  title: "List X",
  description: "…",
  table: "x",
  columns: "id, name, status, created_at",
  resultKey: "items",
  access: "team", // albo ["administrator"], albo brak = RLS
  filters: { status: text("status", "Status."), since: since("created_at") },
  attach: [{ key: "lead_id", table: "leads", columns: "id, first_name", as: "lead" }],
});
```

Złożone narzędzie — `defineTool` z `handle(async () => …)` i `requireTeam(ctx)`
/ `requireUser(ctx)` z `_helpers.ts`. Po dodaniu: dopisać do listy w
`index.ts`, odświeżyć manifest (`node
node_modules/@lovable.dev/mcp-js/dist/cli/extract-manifest.cjs .` albo
`bun run build`), nie edytować ręcznie tras `[.mcp]` / `[.well-known]`.

## Weryfikacja produkcji

Z dowolnego komputera z dostępem do internetu:

```
bun run scripts/check-mcp.ts
```

Skrypt sprawdza bez logowania dokładnie to, co robi Claude.ai / ChatGPT przy
dodawaniu konektora i przy każdym ❌ podpowiada, co włączyć:

1. `GET /.well-known/oauth-protected-resource` → JSON z `authorization_servers`
   (jeśli HTML/404 — na produkcji nie ma wersji z MCP; opublikuj aplikację).
2. Metadane serwera autoryzacji bazy → muszą zawierać `authorization_endpoint`,
   `token_endpoint` i **`registration_endpoint`** (dynamiczna rejestracja
   klientów). Jeśli brak: w panelu bazy Authentication → OAuth Server włącz
   serwer OAuth, ustaw adres zgody na
   `https://financeyou.pl/.lovable/oauth/consent` i włącz dynamiczną
   rejestrację klientów.
3. `POST /mcp` bez tokenu → `401` z nagłówkiem `WWW-Authenticate:
Bearer resource_metadata="…"`.
4. `/.lovable/oauth/consent` otwiera się (przekierowanie do logowania jest OK).

Ten sam skrypt przyjmuje inny adres jako argument (np. podgląd Lovable).

## Wdrożenie

1. Merge → publikacja aplikacji (trasy MCP są w kodzie; brak nowych migracji i
   sekretów).
2. `bun run scripts/check-mcp.ts` → wszystkie ✅.
3. Dodać konektor w Claude.ai / ChatGPT i zadać „Pokaż mój profil Finance You".

## Dane osobowe i bezpieczeństwo

- Przez konektor do dostawcy modelu (Anthropic / OpenAI) trafiają dane
  klientów: imiona, telefony, treści rozmów, kwoty, dane z KW. Na planach
  Team/Enterprise obu dostawców jest umowa powierzenia (DPA) i dane nie służą
  do treningu; na planach indywidualnych trzeba wyłączyć uczenie na rozmowach
  w ustawieniach prywatności. Traktować jak każde inne powierzenie
  przetwarzania (rejestr, informacja w polityce prywatności).
- Konektor działa z uprawnieniami zalogowanej osoby (RLS + role). Konto
  administratora w czacie = pełny wgląd; do testów można użyć konta operatora.
- PESEL, numery kont, dane bankowe partnerów i hashe OTP nie są zwracane przez
  żadne narzędzie.
- Narzędzia zapisujące wymagają logowania i roli zespołu; klienci MCP proszą o
  potwierdzenie przed zapisem. Żadne narzędzie nie wysyła maili, SMS-ów ani
  wiadomości Messenger.
