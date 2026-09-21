# Konektor MCP — Finance You w Claude.ai, ChatGPT i Claude Code

Aplikacja wystawia własny serwer MCP (Model Context Protocol) pod
`https://financeyou.pl/mcp`. Po dodaniu go jako konektora w Claude.ai, ChatGPT
albo Claude Code agent w czacie widzi leady, wnioski, oferty, korespondencję
(e-mail, Messenger, czat, SMS), analizy, finanse, marketing i stan systemu —
logując się **własnym kontem Finance You**. W torze między czatem a danymi
jest wyłącznie financeyou.pl i baza; Lovable dostarcza tylko bibliotekę
(`@lovable.dev/mcp-js`), która obsługuje protokół.

Konektor działa **w obie strony**: agent czyta dane i wykonuje akcje panelu
(edycja leadów, klientów i wniosków, decyzje o ofertach i propozycjach,
kryteria instytucji, dostępy, windykacja, treści) oraz wysyła wiadomości
(e-mail, SMS, Messenger, czat, odpowiedź instytucji), a także steruje botami
ElevenLabs (Ania, A1–A3), generuje głos, muzykę, dubbing i wideo, sięga do
Twilio (SMS-y, połączenia, nagrania), prowadzi Facebooka, Instagram, Messenger
i Meta Ads (posty, komentarze, statystyki, kampanie, formularze leadów, piksel)
oraz kanał YouTube (filmy, komentarze, kolejka Shorts), a przez HeyGen
produkuje filmy z awatarem (Studio publikacji, Awatar FAQ, szablony,
tłumaczenia), a z Google Search Console, GA4 i PageSpeed czyta, jak strona
się pozycjonuje i ile ma ruchu. Nic nie dzieje się
automatycznie: każdy zapis to wywołanie na polecenie użytkownika w czacie, a
klient MCP (Claude.ai / ChatGPT) prosi o potwierdzenie przed każdym narzędziem
zapisującym. Żadnych cyklicznych maili ani pushy z tego modułu.

## Co jest w repo

| Element                                            | Plik                                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definicja serwera MCP (lista narzędzi)             | `src/lib/mcp/index.ts`                                                                                                                                                  |
| Narzędzia z szablonu Lovable (jedno na plik)       | `src/lib/mcp/tools/<nazwa>.ts`                                                                                                                                          |
| Narzędzia domenowe (kilka na plik)                 | `src/lib/mcp/tools/{crm-extra,applications-extra,analysis,clients-aml,investors-extra,projects,finance,affiliate-extra,collections-extra,marketing,ops,calculators}.ts` |
| Fabryka narzędzi „lista z filtrami"                | `src/lib/mcp/_list-tool.ts`                                                                                                                                             |
| Helpery: role, klient z tokenem, dołączanie danych | `src/lib/mcp/_helpers.ts`                                                                                                                                               |
| Rdzeń raportu „co nowego"                          | `src/lib/activity-digest.server.ts` (+ test)                                                                                                                            |
| Klient API ElevenLabs (do panelu i MCP)            | `src/lib/elevenlabs-api.server.ts`                                                                                                                                      |
| Klient REST Twilio przez bramkę Lovable            | `src/lib/twilio-api.server.ts`                                                                                                                                          |
| Zapis mediów do Storage (link publiczny/podpisany) | `src/lib/media-storage.server.ts`                                                                                                                                       |
| Narzędzia ElevenLabs i Twilio                      | `src/lib/mcp/tools/elevenlabs.ts`, `src/lib/mcp/tools/twilio.ts`                                                                                                        |
| Klient Meta Graph API (strona, IG, Ads, CAPI)      | `src/lib/meta-api.server.ts`                                                                                                                                            |
| Klient YouTube Data API v3 (token kanału)          | `src/lib/youtube-api.server.ts`                                                                                                                                         |
| Narzędzia Meta i YouTube                           | `src/lib/mcp/tools/meta.ts`, `src/lib/mcp/tools/youtube.ts`                                                                                                             |
| Klient API HeyGen (awatary, filmy, szablony)       | `src/lib/heygen-api.server.ts` (render studyjny reużywa `src/lib/avatar-faq.server.ts`)                                                                                 |
| Narzędzia HeyGen, Studio publikacji i Awatar FAQ   | `src/lib/mcp/tools/heygen.ts`                                                                                                                                           |
| Uwierzytelnienie Google (konto usługi / OAuth)     | `src/lib/google-auth.server.ts`                                                                                                                                         |
| Klient Search Console, Indexing, GA4, PageSpeed    | `src/lib/google-search.server.ts`                                                                                                                                       |
| Narzędzia Google (pozycjonowanie, ruch)            | `src/lib/mcp/tools/google.ts`                                                                                                                                           |
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

Narzędzia z sekcji „Zapis” zmieniają dane albo wysyłają wiadomości; pozostałe
są **tylko do odczytu**. Listy przyjmują `limit` / `offset` i zwracają `total`. Filtry dat
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

**ElevenLabs — boty, głos, media, wideo** (administrator/operator; konfiguracja i
ogólne wywołanie — administrator)

| Narzędzie                                                                                                 | Co daje                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eleven_status`                                                                                           | Klucz, plan i zużycie znaków, agenty per powierzchnia, numer, ustawienia dzwonienia/SMS, okno godzinowe, konfiguracja wideo.                          |
| `eleven_list_agents`, `eleven_get_agent`, `eleven_update_agent`                                           | Agenty na koncie (z rolą A1/A2/A3/telefon), pełna konfiguracja, edycja dowolnego agenta.                                                              |
| `get_text_agent_prompt`, `update_text_agent_prompt`, `sync_voice_agent_prompts`, `provision_voice_agents` | Prompty botów jak w /admin/text-agent: odczyt, zapis z natychmiastową wysyłką do ElevenLabs, wymuszona synchronizacja, tworzenie brakujących agentów. |
| `eleven_list_conversations`, `eleven_get_conversation`, `eleven_get_conversation_audio`                   | Rozmowy z API (z dopiętym leadem), transkrypt tura po turze z analizą, nagranie jako podpisany link.                                                  |
| `get_voice_call_stats`, `get_voicebot_settings`\*, `update_voicebot_settings`                             | Statystyki telefonów, ustawienia voicebota i SMS (agent, numer, wyzwalacze, ponowienia).                                                              |
| `place_voice_call`, `ask_voice_agent`                                                                     | Telefon botem Anią TERAZ (limit 1/24 h na numer, okno godzinowe); tura testowa z agentem bez wysyłki.                                                 |
| `list_text_agent_knowledge`, `search_text_agent_knowledge`, `add_/update_/delete_text_agent_knowledge`    | Wiedza botów (silnik tekstowy, RAG) — przegląd, szukanie semantyczne, edycja z embeddingiem.                                                          |
| `eleven_list_knowledge_base`, `eleven_add_knowledge_text`, `eleven_add_knowledge_url`                     | Baza wiedzy w ElevenLabs, dodawanie dokumentów i dopinanie do agenta.                                                                                 |
| `eleven_list_voices`, `eleven_list_phone_numbers`                                                         | Głosy na koncie, numery podpięte do agentów.                                                                                                          |
| `text_to_speech`, `speech_to_text`                                                                        | Lektor z tekstu (link MP3 w Storage), transkrypcja nagrania (Scribe, polski, mówcy).                                                                  |
| `generate_sound_effect`, `compose_music`                                                                  | Efekt dźwiękowy z opisu, utwór muzyczny (podkład pod film/reklamę).                                                                                   |
| `create_dubbing`, `get_dubbing`, `get_dubbed_file`                                                        | Dubbing filmu/nagrania na inny język (link YouTube/Vimeo albo plik), status, gotowy plik jako link.                                                   |
| `generate_video`, `get_video_status`                                                                      | Generowanie wideo z opisu przez API ElevenLabs — endpoint konfigurowalny (patrz niżej).                                                               |
| `eleven_api_request`                                                                                      | Dowolne wywołanie API ElevenLabs (nowe funkcje bez zmiany kodu; binaria trafiają do Storage).                                                         |

\* `get_voicebot_settings` to część `eleven_status`; ustawienia zmienia
`update_voicebot_settings`.

**Wideo w ElevenLabs.** Ta wersja kodu powstała bez dostępu do dokumentacji API
wideo (sieć sesji), a ElevenLabs zmienia te ścieżki (modele partnerskie). Dlatego
ścieżki są konfiguracją, nie kodem: `ELEVENLABS_VIDEO_CREATE_PATH` (POST, body
z `generate_video` przekazywane 1:1), `ELEVENLABS_VIDEO_STATUS_PATH` (GET, `{id}`
w ścieżce) i opcjonalnie `ELEVENLABS_VIDEO_ID_FIELD`. Do czasu ustawienia zmiennych
narzędzia wideo zwracają instrukcję, a `eleven_api_request` pozwala wywołać dowolny
endpoint od ręki z parametrami z dokumentacji. Media (TTS, muzyka, dubbing, wideo)
lądują w buckecie `studio-media` (publiczny), nagrania rozmów w `documents`
(link podpisany na godzinę).

**Twilio — SMS, połączenia, nagrania** (administrator/operator; ogólne wywołanie —
administrator)

| Narzędzie                                        | Co daje                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `twilio_status`                                  | Klucze, saldo, numery, nadawca SMS.                                                          |
| `list_twilio_messages`, `get_twilio_message`     | Historia SMS (kierunek, status dostarczenia, błędy, cena), pojedyncza wiadomość.             |
| `list_twilio_calls`, `get_twilio_call`           | Połączenia (w tym rozmowy voicebota) ze statusem, czasem, ceną.                              |
| `list_twilio_recordings`, `get_twilio_recording` | Nagrania (np. wiadomości głosowe) i plik MP3 jako podpisany link.                            |
| `list_twilio_phone_numbers`, `get_twilio_usage`  | Numery z webhookami, zużycie i koszty po kategoriach.                                        |
| `twilio_place_call`                              | Telefon z odczytanym komunikatem (pl-PL) albo z TwiML — realne połączenie, po potwierdzeniu. |
| `twilio_api_request`                             | Dowolny zasób REST Twilio (GET/POST/DELETE).                                                 |

SMS do klienta wysyła `send_sms` (ze strażnikami „dość to dość", blokad i
limitów); narzędzia Twilio powyżej służą do historii, nagrań, kosztów i połączeń
z komunikatem.

**Meta — Facebook, Instagram, Messenger, reklamy, formularze** (administrator/
operator; usuwanie postów, status i budżet reklam, piksel i ogólne wywołanie —
administrator). Tokeny: `META_PAGE_ACCESS_TOKEN` (strona, Messenger,
formularze), `META_IG_PAGE_ACCESS_TOKEN` (Instagram; gdy pusty — token strony),
`META_ACCESS_TOKEN` (reklamy), `FB_PIXEL_ACCESS_TOKEN` (Conversions API) oraz
`META_PAGE_ID`, `META_IG_USER_ID`. `meta_status` pokazuje, które są ustawione.

| Narzędzie                                                                               | Co daje                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `meta_status`                                                                           | Tokeny, strona i konto IG (obserwujący), konta reklamowe, formularze, ostatnia synchronizacja leadów.                          |
| `list_facebook_posts`, `get_facebook_post`                                              | Posty strony (także zaplanowane) z reakcjami; jeden post ze statystykami (zasięg, zaangażowanie, kliknięcia).                  |
| `get_facebook_page_insights`                                                            | Statystyki strony za okres: zaangażowanie postów, obserwujący, nowi obserwujący.                                               |
| `list_facebook_comments`                                                                | Komentarze pod postem (z odpowiedziami, ukryte).                                                                               |
| `publish_facebook_post`                                                                 | Post tekstowy / z linkiem / zdjęciem / wideo, od razu albo zaplanowany (`scheduled_at`, 10 min – 29 dni).                      |
| `reply_facebook_comment`, `hide_facebook_comment`, `delete_facebook_post`               | Publiczna odpowiedź albo prywatna wiadomość do autora (`private`), ukrycie komentarza, usunięcie posta (admin).                |
| `list_instagram_media`, `get_instagram_media`                                           | Posty, rolki, karuzele; jeden wpis ze statystykami (zasięg, zapisania, udostępnienia).                                         |
| `get_instagram_account_insights`                                                        | Zasięg, obserwujący, wejścia na profil, interakcje w okresie.                                                                  |
| `list_instagram_comments`, `reply_instagram_comment`, `hide_instagram_comment`          | Komentarze pod wpisem, publiczna odpowiedź, ukrycie.                                                                           |
| `publish_instagram_post`, `publish_instagram_container`                                 | Zdjęcie (od razu), rolka lub story z wideo (kontener → gotowość → publikacja; przy dłuższym przetwarzaniu dokończ drugim).     |
| `list_messenger_conversations`, `get_messenger_conversation`                            | Rozmowy strony w Messengerze / Instagram Direct prosto z Graph (nieprzeczytane, okno 24 h); odpisuje `send_messenger_message`. |
| `list_meta_ad_accounts`, `get_meta_campaigns_live`, `list_meta_adsets`, `list_meta_ads` | Konta, kampanie, zestawy i reklamy z wynikami za okres prosto z API (`list_meta_campaigns` — dane z synchronizacji).           |
| `get_meta_ads_insights`                                                                 | Wyniki konta / kampanii / zestawu / reklamy z podziałem (wiek, płeć, platforma, region) i po dniach.                           |
| `update_meta_ad_status`, `update_meta_ad_budget`, `sync_meta_ads`                       | Wstrzymanie / wznowienie / archiwizacja, budżet dzienny lub całkowity, nazwa (admin); zapis kampanii do tabel panelu.          |
| `list_meta_lead_forms_live`, `get_meta_form_leads`, `sync_meta_leads`                   | Formularze Lead Ads i zgłoszenia prosto z API; pobranie nowych leadów do CRM (uwaga: nowe leady dostają SMS/voicebot).         |
| `send_meta_conversion_event`                                                            | Zdarzenie do piksela (Conversions API) — e-mail i telefon haszowane po stronie serwera (admin).                                |
| `meta_api_request`                                                                      | Dowolne wywołanie Graph API wybranym tokenem (GET/POST/DELETE).                                                                |

**Token Meta na stałe.** Tokeny strony i Instagrama wygenerowane „na
osobę” wygasają albo giną przy zmianie hasła tej osoby (tak wygasł token
Instagrama). Rozwiązanie: **użytkownik systemowy** w Business Managerze i jego
token z wygaśnięciem „nigdy”:

1. https://business.facebook.com/settings → Użytkownicy → Użytkownicy systemowi
   → Dodaj (rola: Administrator), np. „financeyou-serwer”.
2. Przypisz zasoby (Przypisz zasoby): stronę Finance You (pełna kontrola), konto
   Instagram, konto reklamowe, piksel i aplikację Finance You (pełna kontrola).
3. Wygeneruj token: wybierz aplikację, wygaśnięcie **Nigdy**, zaznacz
   uprawnienia: `pages_show_list`, `pages_read_engagement`,
   `pages_read_user_content`, `pages_manage_posts`, `pages_manage_engagement`,
   `pages_manage_metadata`, `pages_messaging`, `read_insights`,
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`,
   `instagram_manage_insights`, `instagram_manage_messages`,
   `business_management`, `leads_retrieval`, `ads_read`, `ads_management`.
4. Wklej token jako sekret `META_SYSTEM_USER_TOKEN` (Lovable → Ustawienia
   projektu → Secrets). Stare `META_PAGE_ACCESS_TOKEN`,
   `META_IG_PAGE_ACCESS_TOKEN` i `META_ACCESS_TOKEN` można zostawić — serwer
   sprawdza je raz na godzinę i gdy Graph je odrzuci, sam podstawia tokeny
   wyprowadzone z użytkownika systemowego (`src/lib/meta-tokens.server.ts`,
   wołane na każdej ścieżce do Graph: webhooki, ticki, panel, MCP). Można je też
   usunąć — wtedy wszystko idzie z tokena systemowego.
5. W czacie: `meta_refresh_tokens` (admin) wymusza wyprowadzenie od razu, a
   `meta_status` pokazuje `token_health`: ważność, datę wygaśnięcia („never”
   dla tokena systemowego), zakresy i ostrzeżenia. `META_APP_SECRET` w
   sekretach pozwala sprawdzać tokeny przez `/debug_token` bez ograniczeń.

Uprawnienia tokenów Meta potrzebne do pełnego zakresu: `pages_read_engagement`,
`pages_read_user_content`, `pages_manage_posts`, `pages_manage_engagement`,
`pages_messaging`, `read_insights`, `instagram_basic`,
`instagram_content_publish`, `instagram_manage_comments`,
`instagram_manage_insights`, `ads_read`, `ads_management`, `leads_retrieval`.
Bez danego uprawnienia narzędzie zwraca czytelny błąd Graph z kodem.

**YouTube** (administrator/operator; usuwanie filmu — administrator). Działa na
tokenie kanału połączonego w panelu (YouTube Shorts → Połącz), odświeżanym z
`refresh_token`. Edycja filmów, odpowiedzi na komentarze i usuwanie wymagają
zakresu `youtube.force-ssl` — dodany do zgody OAuth w tej wersji, więc kanał
trzeba **raz ponownie połączyć** w panelu; upload i odczyt działają na starej zgodzie.

| Narzędzie                                                                                  | Co daje                                                                                  |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `youtube_status`                                                                           | Konfiguracja OAuth, połączenie kanału, dane kanału, ostatni błąd, stan kolejki Shorts.   |
| `list_youtube_videos`, `search_youtube_videos`, `get_youtube_video`                        | Filmy ze statystykami (stronicowanie), szukanie po frazie, pełne dane jednego filmu.     |
| `list_youtube_comments`, `list_youtube_playlists`                                          | Wątki komentarzy z odpowiedziami; playlisty kanału.                                      |
| `update_youtube_video`                                                                     | Tytuł, opis, tagi, kategoria, prywatność, termin publikacji.                             |
| `reply_youtube_comment`                                                                    | Publiczna odpowiedź pod komentarzem — po potwierdzeniu treści.                           |
| `delete_youtube_video`                                                                     | Usuwa film — nieodwracalnie (admin).                                                     |
| `queue_youtube_publication`, `cancel_youtube_queue_item`, `publish_youtube_queue_item_now` | Kolejka Shorts z panelu: dodanie (MP4 https, pion 9:16), anulowanie, publikacja od ręki. |
| `youtube_api_request`                                                                      | Dowolne wywołanie YouTube Data API v3 tokenem kanału.                                    |

**HeyGen — filmy z awatarem, Studio publikacji, Awatar FAQ** (administrator/
operator; usuwanie, wpisy Awatara FAQ i ogólne wywołanie — administrator).
Klucz: `HEYGEN_API_KEY`; lektor domyślnie z ElevenLabs (głos Filipa), awatar
domyślnie digital twin Filipa. Generowanie zużywa kredyty HeyGen.

| Narzędzie                                                                             | Co daje                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heygen_status`                                                                       | Klucz, pozostałe kredyty, liczba awatarów, domyślny awatar i głos, zadania Studia po statusach (ostatni błąd), filmy Awatara FAQ.                    |
| `list_heygen_avatars`, `list_heygen_voices`, `search_heygen_stock`                    | Własne i publiczne awatary (podgląd), głosy wbudowane HeyGen (filtr języka), biblioteka stocku (grafiki, klipy).                                     |
| `list_heygen_videos`, `get_heygen_video`                                              | Filmy na koncie; status jednego filmu z linkami (czysty / z napisami / SRT); `store=true` kopiuje gotowy plik do Storage (linki HeyGen wygasają).    |
| `generate_avatar_video`                                                               | Film awatara poza kolejką: tekst (ElevenLabs albo głos HeyGen), gotowe audio (URL / asset); kadr 9:16 / 16:9 / 1:1, napisy wypalone lub SRT.         |
| `upload_heygen_asset`                                                                 | Plik spod https (audio, obraz, wideo) do biblioteki HeyGen → asset_id.                                                                               |
| `list_heygen_templates`, `get_heygen_template`, `generate_heygen_template_video`      | Szablony ze zmiennymi i generowanie filmu z szablonu.                                                                                                |
| `list_heygen_translate_languages`, `translate_heygen_video`, `get_heygen_translation` | Tłumaczenie filmu (dubbing z synchronizacją ust) i status z linkiem (`store=true`).                                                                  |
| `delete_heygen_video`                                                                 | Usuwa film z konta HeyGen (admin).                                                                                                                   |
| `generate_studio_script`, `generate_studio_prompts`, `generate_studio_image`          | Scenariusz mówiony + tytuł/opis/hashtagi (AI albo baza 250 pytań Shorts), pomysły na treści, grafika AI do galerii Studia (`list_studio_images`).    |
| `create_studio_video_job`, `get_studio_job`, `update_studio_job`                      | Zadanie Studia (prompt / scenariusz / pytanie z bazy, awatar, głos, napisy, przebitki, auto-publikacja); od razu (`start_now`) albo w kolejce ticka. |
| `retry_studio_job`, `delete_studio_job`, `poll_studio_jobs`, `run_studio_video_tick`  | Powtórka nieudanego, usunięcie (admin), domknięcie renderów, przebieg ticka od ręki (przetwarza 2 zadania z kolejki).                                |
| `publish_studio_job`                                                                  | Gotowy film ze Studia do kolejek YouTube / Facebook / Instagram — tick publikuje zaraz potem (realna publikacja, po potwierdzeniu).                  |
| `list_avatar_faqs`, `create_avatar_faq`, `update_avatar_faq`, `delete_avatar_faq`     | Wpisy Awatara FAQ (Filip na stronie): pytanie, odpowiedź czytana przez awatara, kolejność, publikacja (admin).                                       |
| `generate_avatar_faq_video`, `poll_avatar_faq_video`                                  | Film do wpisu FAQ (ElevenLabs → HeyGen) i zapis gotowego linku (admin).                                                                              |
| `heygen_api_request`                                                                  | Dowolne wywołanie API HeyGen v1/v2/v3 (Avatar IV, grupy awatarów, webhooki…); binaria do Storage.                                                    |

Typowy przebieg w czacie: `generate_studio_script` → poprawki → `create_studio_video_job`
(`start_now=true`) → `get_studio_job` / `poll_studio_jobs` → `publish_studio_job`
albo `queue_youtube_publication` / `queue_social_publication` z linkiem z
`get_heygen_video {store: true}`.

**Podgląd i akceptacja w czacie.** Protokół MCP przenosi w wyniku narzędzia
tekst, obrazy i linki do zasobów — nie odtwarza wideo ani audio. Dlatego
narzędzia zwracają do podglądu to, co da się pokazać w rozmowie:

- `get_studio_job` i `get_heygen_video` (domyślnie `preview=true`) dołączają
  miniaturę filmu, animowany GIF gotowego renderu (z API HeyGen v1, gdy jest
  dostępny) oraz link do pliku MP4 jako zasób; Claude.ai i Claude Code
  pokazują obrazy inline, film otwiera się po kliknięciu linku;
- `generate_studio_image` pokazuje wygenerowaną grafikę od razu;
- `list_heygen_avatars {preview: true}` i `search_heygen_stock {preview: true}`
  pokazują podglądy awatarów / grafik ze stocku (do 6 / 4 obrazów);
- to samo w Meta i YouTube: `get_instagram_media`, `get_facebook_post` i
  `get_youtube_video` pokazują obraz / kadr / miniaturę domyślnie, a listy
  (`list_instagram_media`, `list_facebook_posts`, `list_meta_ads`,
  `list_youtube_videos`, `get_messenger_conversation` — załączniki klienta)
  po podaniu `preview: true` (do 4 obrazów);
- listy z panelu z kolumną obrazu też mają `preview: true`:
  `list_studio_images`, `list_studio_jobs`, `list_avatar_faqs`,
  `list_social_posts`, `list_publish_queue`.

Akceptacja: agent pokazuje scenariusz, miniaturę i GIF, a publikacja rusza
dopiero po Twoim „publikuj” — klient MCP dodatkowo pyta o zgodę przed
`publish_studio_job`, więc nic nie wychodzi bez kliknięcia. ChatGPT może nie
renderować obrazów z konektorów — tam zostaje link do pliku.

**Google — pozycjonowanie i ruch** (administrator/operator; usuwanie map
witryny, Indexing API i ogólne wywołanie — administrator). Uwierzytelnienie:
konto usługi `GOOGLE_SERVICE_ACCOUNT_JSON` (zalecane) albo token kanału YouTube
połączonego w panelu (zgoda obejmuje teraz Search Console, GA4 i Indexing).
Witryna: `GSC_SITE_URL` (domyślnie `sc-domain:financeyou.pl`), GA4:
`GA4_PROPERTY_ID`, PageSpeed opcjonalnie `PAGESPEED_API_KEY`.

| Narzędzie                                                | Co daje                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `google_search_status`                                   | Sposób uwierzytelnienia, e-mail konta usługi (do dodania w GSC / GA4), witryny z uprawnieniami, mapy witryny, aktywni użytkownicy GA4.      |
| `get_search_performance`                                 | Kliknięcia, wyświetlenia, CTR, pozycja w dowolnym podziale (zapytanie, strona, kraj, urządzenie, data, wygląd) z filtrami.                  |
| `get_search_trend`                                       | Dzień po dniu i tygodniami + porównanie z poprzednim okresem (zmiany w %).                                                                  |
| `get_top_queries`, `get_top_pages`                       | Najważniejsze frazy i podstrony; rozkład pozycji (top 3 / top 10 / 11–20 / 21–50 / dalej).                                                  |
| `get_page_search_data`, `get_query_pages`                | Wszystko o jednej podstronie (frazy, urządzenia, kraje, trend) albo o jednej frazie (które strony rankują, warianty frazy).                 |
| `compare_search_periods`                                 | Co urosło, a co spadło: wzrosty, spadki, poprawa / pogorszenie pozycji, nowe i utracone frazy lub strony.                                   |
| `list_sitemaps`, `submit_sitemap`, `delete_sitemap`      | Mapy witryny: zgłoszone / zaindeksowane adresy, błędy; zgłoszenie sitemap.xml; usunięcie (admin).                                           |
| `inspect_url`                                            | Inspekcja adresu: czy w indeksie, werdykt, ostatnie skanowanie, kanoniczny, robots, mobile, wyniki rozszerzone (limit 2000 / dzień).        |
| `request_google_indexing`, `get_google_indexing_status`  | Indexing API: zgłoszenie adresu (admin; Google przewiduje to dla ofert pracy i transmisji, dla innych stron bywa ignorowane) i jego status. |
| `get_site_traffic`, `get_ga4_report`, `get_ga4_realtime` | GA4: sesje, użytkownicy, odsłony, zaangażowanie, konwersje, kanały, źródła, strony, wejścia; dowolny raport; kto jest teraz na stronie.     |
| `get_pagespeed`                                          | Lighthouse: wydajność, SEO, dostępność, dobre praktyki, Core Web Vitals (lab i realni użytkownicy), okazje do poprawy, oblane audyty SEO.   |
| `google_api_request`                                     | Dowolne uwierzytelnione wywołanie `https://*.googleapis.com/…` z wybranymi zakresami (admin).                                               |

Konfiguracja Google Cloud (raz): w projekcie z kluczem OAuth YouTube włącz
**Search Console API**, **Google Analytics Data API** i **Web Search Indexing
API**; utwórz konto usługi, pobierz klucz JSON i wklej go jako
`GOOGLE_SERVICE_ACCOUNT_JSON`; e-mail konta usługi dodaj w Search Console
(Ustawienia → Użytkownicy i uprawnienia → Pełny; dla Indexing API: Właściciel)
i w GA4 (Administracja → Dostęp do usługi → Wyświetlający). Bez konta usługi
wystarczy ponownie połączyć kanał YouTube w panelu kontem Google, które ma
dostęp do Search Console i GA4.

**Kalkulatory**

| Narzędzie                      | Co daje                                              |
| ------------------------------ | ---------------------------------------------------- |
| `calculate_loan_installment`   | Rata równa i koszt.                                  |
| `calculate_repayment_schedule` | Pełny harmonogram: równe, malejące, balon; prowizja. |
| `calculate_ltv`                | LTV, przedział, maks. kwota przy limicie.            |

**Zapis** (klient MCP pyta o potwierdzenie przed każdym wywołaniem; rola
administrator/operator, chyba że zaznaczono inaczej)

| Obszar                | Narzędzia                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leady                 | `create_lead`, `update_lead` (dane, status, typ, źródło, jakość, przypisanie, zły lead, notatka), `update_lead_status`, `add_lead_note`, `assign_lead`, `log_lead_communication`, `cancel_follow_ups`, `queue_call` (voicebot zadzwoni)                                                                                                                                                                                                 |
| Klienci i wnioski     | `create_client`, `update_client` (dane, opiekun, blokady kontaktu), `create_loan_application` (+ nieruchomość), `update_application` (status, operator, decyzja, widoczność, pauzy, ryzyko, kwoty), `archive_application`, `add_property`, `set_missing_info_follow_up`, `answer_institution_question`, `create_loan_proposal`                                                                                                          |
| Wysyłki               | `send_email`, `send_sms`, `send_messenger_message`, `send_chat_reply`, `reply_institution_thread`, `send_chat_message` — realne wiadomości do ludzi; agent ma pokazać treść i czekać na „wyślij”                                                                                                                                                                                                                                        |
| Inwestorzy i oferty   | `update_investor_criteria`, `decide_investor_offer` (zatwierdź / odrzuć / przekaż klientowi / wygasła), `decide_auto_distribution_proposal` (zatwierdzenie **wysyła** ofertę do instytucji), `decide_criteria_change_proposal`, `set_investor_active`                                                                                                                                                                                   |
| Projekty inwestycyjne | `set_project_proposal_status` (statusy jak w panelu, kontroferta), `answer_project_info_request`, `set_investment_project_status` (pula / pauza / wycofanie — z audytem i mailem do przypisanych inwestorów jak w panelu)                                                                                                                                                                                                               |
| Finanse i pośrednicy  | `grant_access` (administrator), `update_access_product` (administrator), `mark_payment_reviewed`, `update_broker_settlement`, `update_affiliate_partner_status` (administrator), `decide_affiliate_commission` (administrator)                                                                                                                                                                                                          |
| Windykacja            | `update_collection_case` (etap z wpisem w chronologii), `add_collection_event`, `update_wind_loan` — inwestor na swoich sprawach (RLS), zespół na wszystkich                                                                                                                                                                                                                                                                            |
| Treści i marketing    | `create_seo_article_draft`, `update_seo_article` (publikacja wymaga okładki), `add_blog_topic`, `update_blog_topic`, `delete_blog_topic`, `create_social_post`, `queue_social_publication` (auto-publikacja FB/IG), `create_email_campaign_draft` (bez wysyłki), `add_email_subscriber`, `unsubscribe_email`, `add_serp_keyword`, `set_serp_keyword_active`, `update_pr_opportunity`, `create_short_link`, `set_landing_page_published` |
| Pamięć asystenta      | `remember_admin_memory`, `archive_admin_memory` (administrator) — wspólna pamięć z asystentem panelu                                                                                                                                                                                                                                                                                                                                    |

Narzędzia zapisu zespołu działają tak jak server functions panelu: sprawdzają
rolę i piszą klientem serwisowym (polityki RLS nie obejmują wszystkich zapisów
administratora). Statusy, wpisy audytu i skutki uboczne (np. e-mail statusowy
do klienta po zmianie statusu wniosku, mail do inwestorów po wycofaniu
projektu) są te same co w panelu — narzędzia wołają ten sam kod
(`comms-agent`, `auto-distribution/engine`, `projects/audit`, `short-link`).

Przykładowe pytania w czacie:

- „Co nowego na Finance You od 9:00?" → `get_updates_since`
- „Kto czeka na odpowiedź w skrzynce?" → `list_inbox_threads` z `only_awaiting_reply`
- „Pokaż całą rozmowę z Janem Kowalskim i zaproponuj odpowiedź" → `search_leads` + `read_inbox_thread`
- „Które wnioski powyżej 300 tys. są niekompletne i od kiedy nikt się nie kontaktował?" → `list_incomplete_applications`
- „Jak wypadł ten tydzień vs poprzedni?" → `get_kpi_report`
- „Czy coś się wysypało w nocy?" → `get_platform_health`, `list_external_api_calls`
- „Jaka jest nasza pozycja na 'pożyczka pod zastaw nieruchomości'?" → `list_serp_keywords`
- „Odpisz Kowalskiemu, że rata przy 300 tys. na 24 miesiące wyniesie X i zaproponuj telefon jutro” → `read_inbox_thread` + `calculate_loan_installment` + `send_email` (po potwierdzeniu)
- „Przypisz wszystkie dzisiejsze leady z Meta do Ani i zmień status na w_kontakcie” → `list_leads` + `update_lead`
- „Zatwierdź ofertę inwestora X do wniosku Y i przekaż klientowi” → `decide_investor_offer`
- „Wstrzymaj przypomnienia dla wniosku Z na dwa tygodnie i dopisz notatkę” → `update_application`
- „Dodaj temat na blog o pożyczce pod działkę rolną i zaplanuj post na FB na piątek 10:00” → `add_blog_topic` + `queue_social_publication`

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

## Wdrożenie przez Lovable — gotowe polecenie

Repozytorium jest podpięte do projektu Lovable „Financeyou.pl”; Lovable
synchronizuje gałąź `main`. Kolejność: (1) merge tej gałęzi do `main` w
GitHubie, (2) w czacie Lovable wkleić polecenie poniżej, (3) po raporcie
Lovable dodać konektor w Claude.ai / ChatGPT.

```
Cel: uruchomić na produkcji (https://financeyou.pl) serwer MCP z repozytorium i potwierdzić, że
działa w obie strony (odczyt i zapis) dla Claude.ai / ChatGPT. Kod jest już w main — NIE pisz
narzędzi od nowa, NIE zmieniaj plików w src/lib/mcp ani .lovable/mcp/manifest.json, NIE dodawaj
cronów, digestów ani automatycznych maili/pushy. Twoja praca to wdrożenie, konfiguracja i testy.

1. Sprawdź, że po synchronizacji z GitHub masz: src/lib/mcp/index.ts (318 narzędzi wg
   .lovable/mcp/manifest.json), src/lib/mcp/_list-tool.ts, src/lib/mcp/tools/{writes-*,elevenlabs,
   twilio,meta,youtube,heygen,google}.ts, src/lib/{elevenlabs-api,twilio-api,meta-api,youtube-api,
   heygen-api,google-auth,google-search,media-storage}.server.ts, scripts/check-mcp.ts,
   docs/mcp-konektor.md. Build (bun run build) ma przechodzić. Nie formatuj ręcznie plików
   generowanych przez plugin (src/routes/[.mcp]/*, src/routes/[.well-known]/*, src/routes/mcp.ts).

2. Backend (Lovable Cloud / baza): w ustawieniach Auth włącz OAuth Server (OAuth 2.1) z:
   - adresem strony zgody: https://financeyou.pl/.lovable/oauth/consent
   - włączoną dynamiczną rejestracją klientów (Dynamic Client Registration) — Claude.ai i ChatGPT
     rejestrują się same;
   - jeśli panel wymaga listy dozwolonych redirect URI, dodaj:
     https://claude.ai/api/mcp/auth_callback i https://chatgpt.com/connector_platform_oauth_redirect.
   Upewnij się, że w środowisku serwera są: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
   SUPABASE_SERVICE_ROLE_KEY (narzędzia MCP czytają je z process.env), a do wysyłek:
   LOVABLE_API_KEY + RESEND_API_KEY (e-mail), TWILIO_API_KEY (SMS, połączenia, nagrania),
   META_SYSTEM_USER_TOKEN (token użytkownika systemowego „nigdy nie wygasa” — zastępuje tokeny
   strony / Instagrama / reklam, gdy te wygasną), META_PAGE_ID + META_PAGE_ACCESS_TOKEN (strona,
   Messenger, formularze), META_IG_USER_ID + META_IG_PAGE_ACCESS_TOKEN (Instagram),
   META_ACCESS_TOKEN (Meta Ads), FB_PIXEL_ACCESS_TOKEN
   (Conversions API), YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET (+ YOUTUBE_REDIRECT_URI, jeśli inny
   niż domyślny), ELEVENLABS_API_KEY (boty, głos, media), HEYGEN_API_KEY (filmy z awatarem),
   GOOGLE_SERVICE_ACCOUNT_JSON (Search Console / GA4 — jeśli go nie ma, napisz to w raporcie:
   dodam konto usługi albo połączę kanał YouTube ponownie), GA4_PROPERTY_ID (numer usługi GA4),
   opcjonalnie GSC_SITE_URL i PAGESPEED_API_KEY, oraz AGENT_TOOLS_SECRET. Nie pokazuj mi
   wartości sekretów, tylko czy są. Sprawdź w Meta (Business → Użytkownicy systemowi / token strony),
   czy token strony ma pages_manage_posts, pages_manage_engagement, pages_messaging,
   read_insights, leads_retrieval, a token IG instagram_content_publish,
   instagram_manage_comments, instagram_manage_insights — brakujące dopisz w raporcie.
   YouTube: w tej wersji zgoda OAuth prosi dodatkowo o zakres youtube.force-ssl (edycja filmów,
   komentarze); po publikacji przypomnij mi, że muszę raz ponownie połączyć kanał w panelu
   (YouTube Shorts → Połącz).
   Wideo ElevenLabs: sprawdź w aktualnej dokumentacji API ElevenLabs (docs → API reference), pod
   jakimi ścieżkami działa generowanie wideo (create + status/result) i jakie pola przyjmuje body;
   ustaw ELEVENLABS_VIDEO_CREATE_PATH (np. /v1/…), ELEVENLABS_VIDEO_STATUS_PATH (z {id}) oraz —
   jeśli identyfikator zadania nie nazywa się id/video_id/generation_id/job_id — ELEVENLABS_VIDEO_ID_FIELD.
   Jeśli API wideo nie jest jeszcze publicznie dostępne, napisz to wprost i zostaw zmienne puste.

3. Opublikuj aplikację (Publish / Update), tak żeby financeyou.pl serwował aktualny build.

4. Weryfikacja bez logowania — uruchom `bun run scripts/check-mcp.ts` (albo równoważne curl):
   - GET https://financeyou.pl/.well-known/oauth-protected-resource → 200, JSON z authorization_servers;
   - metadane serwera autoryzacji z tej listy → zawierają authorization_endpoint, token_endpoint
     i registration_endpoint;
   - POST https://financeyou.pl/mcp (JSON-RPC initialize, bez tokenu) → 401 z nagłówkiem
     WWW-Authenticate zawierającym resource_metadata;
   - GET https://financeyou.pl/.lovable/oauth/consent?authorization_id=test → 200 albo przekierowanie
     do logowania.
   Każde ❌ napraw w konfiguracji (nie w kodzie narzędzi) i uruchom ponownie.

5. Test w obie strony z tokenem użytkownika: zaloguj się kontem administratora testowego przez API
   auth bazy (grant hasłem), weź access_token i wołaj POST https://financeyou.pl/mcp z nagłówkiem
   Authorization: Bearer <token> (JSON-RPC 2.0: initialize, tools/list, tools/call):
   a) tools/list → lista ma get_updates_since, list_inbox_threads, list_leads, update_lead,
      send_email, decide_investor_offer, grant_access;
   b) tools/call get_my_profile → moje role zawierają administrator;
   c) tools/call list_leads {limit: 3} → wiersze + total;
   d) tools/call get_updates_since {} → liczniki z ostatniej godziny;
   e) ZAPIS: na leadzie testowym (załóż go przez create_lead z first_name "TEST MCP", source "mcp_test")
      wywołaj add_lead_note {note: "test MCP"} → w panelu /operator/leady/<id> notatka jest widoczna;
      potem update_lead {status: "w_kontakcie"} → status zmieniony; potem update_lead
      {marked_bad_lead: true, marked_bad_reason: "test"} → lead oznaczony jako zły;
   f) ZAPIS: create_short_link {target_url: "https://financeyou.pl", source: "mcp_test"} → zwraca kod
      i URL, a URL przekierowuje;
   g) WYSYŁKA: send_email tylko na adres testowy z naszej domeny (np. kontakt@financeyou.pl):
      {to, subject: "Test MCP", body: "Test wysyłki przez konektor"} → ok:true i wpis w skrzynce
      panelu; NIE wysyłaj nic do prawdziwych klientów ani instytucji;
   h) sprawdź odmowę: tym samym tokenem, ale kontem bez roli zespołu (np. testowy inwestor),
      tools/call list_leads → błąd "Wymagane uprawnienia administrator/operator";
   i) ELEVENLABS: tools/call eleven_status → api_key_configured:true, subscription z planem, agenty;
      eleven_list_agents → lista z rolami A1/A2/A3/telefon; eleven_list_conversations {limit: 3} →
      ostatnie rozmowy; text_to_speech {text: "Test lektora Finance You"} → publiczny link MP3, który
      da się odtworzyć; ask_voice_agent {surface: "intake", message: "Dzień dobry, chcę pożyczkę
      pod dom"} → odpowiedź agenta; NIE wołaj place_voice_call na prawdziwe numery (tylko numer
      testowy zespołu, jeśli go masz); generate_video → jeśli zmienne wideo są ustawione, zleć krótki
      test (5 s, 16:9) i sprawdź get_video_status, jeśli nie — potwierdź, że narzędzie zwraca
      instrukcję konfiguracji;
   j) TWILIO: tools/call twilio_status → configured:true, saldo, numery; list_twilio_messages
      {limit: 5} → historia SMS; list_twilio_calls {limit: 5} → połączenia; get_twilio_usage
      {category: "sms"} → zużycie; NIE wołaj twilio_place_call na prawdziwe numery;
   k) META: tools/call meta_status → tokeny ustawione, token_health bez ostrzeżeń (przy
      META_SYSTEM_USER_TOKEN: expires_at "never"), strona i konto IG z liczbą obserwujących;
      list_facebook_posts {limit: 3} → ostatnie posty; get_facebook_page_insights {} → statystyki;
      list_instagram_media {limit: 3} → wpisy; list_messenger_conversations {limit: 3} → rozmowy;
      list_meta_ad_accounts {} → konta; get_meta_campaigns_live {limit: 5} → kampanie z wynikami;
      list_meta_lead_forms_live {} → formularze. ZAPIS tylko bezpieczny: publish_facebook_post
      {message: "Test MCP — do usunięcia", scheduled_at: <data za 7 dni>} → zaplanowany post
      (id), potem delete_facebook_post {post_id} → usunięty. NIE publikuj nic od razu, NIE
      odpowiadaj na prawdziwe komentarze, NIE zmieniaj statusu ani budżetu kampanii, NIE wołaj
      sync_meta_leads (odpala SMS/voicebot do nowych leadów) ani send_meta_conversion_event;
   l) YOUTUBE: tools/call youtube_status → configured:true, kanał połączony, dane kanału;
      list_youtube_videos {limit: 5} → filmy ze statystykami; list_youtube_comments
      {video_id: <id z listy>} → komentarze; list_youtube_playlists {} → playlisty. Jeśli
      list_youtube_comments albo update_youtube_video zwraca 403 z podpowiedzią o zakresie —
      to oczekiwane do czasu ponownego połączenia kanału; wpisz to w raporcie. NIE wołaj
      update_youtube_video, reply_youtube_comment, delete_youtube_video ani
      publish_youtube_queue_item_now;
   m) HEYGEN: tools/call heygen_status → api_key_configured:true, quota z kredytami, awatary
      (mine ≥ 1, w tym awatar Filipa), zadania Studia po statusach; list_heygen_avatars {} →
      własne awatary; list_heygen_voices {language: "Polish"} → głosy; list_heygen_videos
      {limit: 5} → filmy; get_heygen_video {video_id: <id gotowego filmu z listy>} → status
      completed z video_url; list_studio_jobs {limit: 5} i list_avatar_faqs {limit: 5} → wiersze;
      generate_studio_script {prompt: "Czy mogę dostać pożyczkę pod dom z hipoteką?"} → scenariusz,
      tytuł, opis, hashtagi (nic nie zapisuje). ZAPIS: create_studio_video_job {prompt: "Test MCP",
      script: "To jest test konektora Finance You. Dziękuję.", publish_title: "Test MCP",
      start_now: false} → zadanie w statusie queued (NIE uruchamiaj run_studio_video_tick ani
      start_now — zużywają kredyty), potem delete_studio_job {id} → usunięte. NIE wołaj
      generate_avatar_video, publish_studio_job, generate_avatar_faq_video ani
      delete_heygen_video;
   n) GOOGLE: tools/call google_search_status → auth_method, site_url, lista witryn z
      uprawnieniami (jeśli sites_error mówi o braku dostępu — wpisz w raporcie e-mail konta
      usługi z odpowiedzi, żebym dodał go w Search Console i GA4); get_search_trend {days: 28}
      → dzienne wiersze i porównanie; get_top_queries {limit: 10} → frazy z pozycjami;
      get_top_pages {limit: 10} → strony; inspect_url {url: "https://financeyou.pl/"} → werdykt
      indeksowania; get_site_traffic {days: 7} → sesje i kanały (jeśli GA4_PROPERTY_ID jest);
      get_pagespeed {} → wyniki Lighthouse. NIE wołaj submit_sitemap, delete_sitemap ani
      request_google_indexing;
   Po testach usuń lead testowy (albo zostaw oznaczony jako zły z powodem "test") i link testowy.

6. Raport dla mnie: tabela kroków 1–5 z ✅/❌, dokładne odpowiedzi z punktu 4, id leada testowego,
   co zmieniłeś w konfiguracji. Jeśli coś nie działa z powodu kodu — opisz błąd i zaproponuj
   poprawkę, ale nie wdrażaj zmian w src/lib/mcp bez mojej zgody.
```

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
4. Pierwszy zapis zrobić na leadzie testowym („dodaj notatkę do leada TEST MCP"), żeby
   zobaczyć, jak klient MCP prosi o potwierdzenie.

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
- Narzędzia zapisujące wymagają logowania i roli zespołu (część tylko
  administrator); klienci MCP proszą o potwierdzenie przed każdym zapisem.
  Narzędzia `send_*` i `reply_institution_thread` wysyłają realne wiadomości —
  instrukcja serwera każe agentowi pokazać treść i czekać na wyraźne „wyślij".
  Zdarzenia zapisu są widoczne w panelu (notatki mają podpis MCP, e-maile mają
  źródło `mcp` w metadanych, akcje projektów trafiają do audytu).
