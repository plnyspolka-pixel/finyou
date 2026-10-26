# Lead magnety — materiał za e-mail + automat „komentarz → link”

Panel **/admin/marketing/lead-magnety**. Cel: ktoś z social mediów dostaje od
nas bezpłatny materiał (przewodnik PDF, checklistę, kalkulator) w zamian za
zapis na listę mailingową — osobno dla **klienta pożyczkowego** i dla
**inwestora**. Optymalna ścieżka: polubienie + komentarz z hasłem pod postem →
automatyczna odpowiedź z linkiem → e-mail na stronie → plik.

## Jak to działa

1. **Materiał.** W panelu tworzysz lead magnet: tytuł, grupa (klient /
   inwestor), nagłówek i lista „co jest w środku”, plik (PDF wgrany do
   prywatnego bucketa `lead-magnets`) albo zewnętrzny adres, treść maila.
   Zakładka „AI Copy” wypełnia stronę z briefu. Strona publiczna:
   `https://financeyou.pl/pobierz/<slug>`.
2. **Post z hasłem.** Publikujesz post („Polub i napisz w komentarzu
   PRZEWODNIK — wyślemy link w wiadomości”) i powiązujesz go z lead magnetem
   (zakładka „Posty”: Facebook — id posta strony, Instagram — id mediów,
   YouTube — id filmu). Hasła ustawiasz w zakładce „Automat social”; bez haseł
   każdy komentarz pod powiązanym postem dostaje link. Opcja „reaguj pod każdym
   postem” działa też pod niepowiązanymi postami (wymaga hasła).
3. **Komentarz → link.**
   - Facebook: webhook `feed` (ten sam, który obsługuje komentarze dla bota)
     → wiadomość prywatna do autora komentarza (Private Reply) z linkiem +
     publiczne potwierdzenie „napisaliśmy do Ciebie w wiadomości”. Gdy DM się nie
     uda — link publicznie pod komentarzem. Komentarz obsłużony przez lead
     magnet **nie** idzie do agenta AI.
   - Instagram: webhook `comments` → Private Reply (`/{ig-user-id}/messages`
     z `recipient.comment_id`) + publiczna odpowiedź. Konto na Instagramie ma
     zablokowane linki (ograniczenie z 29.09.2026), więc domyślnie działa tu
     **tryb bez linku** (niżej).
   - YouTube: brak webhooków i DM → tick `/api/public/hooks/lead-magnet-tick`
     (pg_cron co 10 minut, także przycisk „Sprawdź komentarze YouTube” i
     narzędzie MCP) czyta wątki pod powiązanymi filmami i odpowiada publicznie
     linkiem na nowe komentarze z hasłem. Komentarze sprzed powiązania filmu
     (z godziną zapasu) i nasze własne są pomijane.
   - Polubienia: Meta nie pozwala napisać do osoby, która tylko zareagowała,
     więc reakcje pod powiązanymi postami FB są tylko liczone w dzienniku.
     Dlatego post musi prosić o **komentarz** (polubienie jako dodatek).
   - Link w odpowiedzi niesie UTM-y (`utm_source=facebook|instagram|youtube`,
     `utm_medium=comment`, `utm_campaign=lm-<slug>`) i `ref=<id komentarza>`,
     więc zapis wie, skąd przyszedł.
4. **E-mail → lista.** Na stronie osoba zostawia e-mail (imię opcjonalnie) i
   zaznacza zgodę (treść zgody zależy od grupy; zapisywana przy zapisie).
   Serwer: subskrybent w `email_subscribers` (upsert; tagi `lead-magnet`,
   `klient`/`inwestor`, `lead-magnet:<slug>` + własne; wypisany dostaje
   status `active` z powrotem — wyraził nową zgodę; bounce zostaje), wiersz
   `lead_magnet_signups` z osobistym tokenem pobrania (jeden na e-mail i lead
   magnet), opcjonalny lead w CRM (`create_crm_lead`, domyślnie wyłączone),
   mail z linkiem (`sendResendEmail`, kategoria `transactional` — osoba
   właśnie poprosiła o plik). Na stronie od razu przycisk pobrania (`instant_download`).
5. **Pobranie.** `/pobierz-plik/<token>` → podpisany link do pliku w Storage
   (15 minut) albo zewnętrzny adres + licznik pobrań. Plik nie jest publiczny,
   więc nikt nie udostępni go dalej bez zapisu.

### Tryb bez linku: e-mail w wiadomości prywatnej

Na platformach z listy `email_in_dm_platforms` (domyślnie `instagram`; w
panelu: „Automat social” → „Bez linku”) automat nie wysyła żadnego adresu:

1. Komentarz z hasłem → wiadomość prywatna z prośbą o e-mail
   (`reply_ask_email_template`; informuje, że podanie adresu = zapis na
   newsletter) + publiczne potwierdzenie bez linku. Gdy wiadomość prywatna nie
   przejdzie — publicznie: „napisz do nas wiadomość ze swoim e-mailem”.
   W dzienniku komentarzy wpis ma `awaiting_email = true` („czeka na e-mail”).
2. Osoba odpisuje adresem → webhook wiadomości (`messages`), przed agentem AI:
   `handleDirectMessageForLeadMagnet` dopasowuje ją do komentarza (po id
   autora, awaryjnie po imieniu i nazwisku z FB albo loginie z IG; do 7 dni),
   wyciąga adres (`extractEmail`) i robi ten sam zapis co formularz
   (subskrybent z tagami, `lead_magnet_signups` ze źródłem `instagram`, UTM
   `medium=dm`, zgoda z dopiskiem o wiadomości prywatnej, mail z plikiem).
   Odpowiedź `reply_email_received_template` ({imie}, {tytul}, {email}) też jest
   bez linku. Wpis w dzienniku dostaje `signup_id` („e-mail zebrany”), a lead w
   CRM — adres e-mail, jeśli go nie miał.
3. Wiadomość bez adresu → jedno przypomnienie („odpisz samym adresem”), każda
   kolejna idzie już do agenta AI.

Link do pliku jest tylko w mailu — poza Instagramem. Facebook zostaje
domyślnie przy linku (linki przechodzą), ale można go przełączyć tak samo.
YouTube nie ma wiadomości prywatnych, więc zawsze dostaje link.

Każdy komentarz obsługujemy raz (unikalny indeks `platform + id komentarza`).
Ochrona przed pętlami bot-bot na Facebooku działa jak dla agenta
(`bot-loop-guard.server.ts`) — sprawdzana przed lead magnetem.

## Katalog startowy — PDF składane z kodu, pliki w Storage

Siedem gotowych lead magnetów (brief agenta publikującego, p. 5.4) żyje w kodzie:
`src/lib/lead-magnets/catalog.ts` (treść PDF, copy strony, mail, hasło, następny
krok) + `pdf.ts` (render przez `ReportWriter`: okładka, sekcje, checklisty z
kwadracikami, kroki, ramki „Ważne” / „Ryzyko”, tabele, strona końcowa z CTA,
kontaktem i stopką compliance). Provisioning składa PDF i wgrywa go jako **zwykły
plik** do prywatnego bucketa `lead-magnets` pod `katalog/<slug>/<CATALOG_VERSION>/<plik>`
(`catalogFilePath`), ustawiając `file_path` / `file_name` / `file_size` rekordu —
pobranie to ten sam podpisany link, co dla pliku wgranego ręcznie. Wersja w
ścieżce sprawia, że po zmianie treści (commit + podbicie `CATALOG_VERSION`)
następny provisioning widzi plik „nieaktualny”, składa nowy i usuwa stary;
`refresh_files` wymusza ponowny skład bez zmiany wersji. Rekord, który pliku
jeszcze nie ma, dostaje PDF składany **w locie** (`resolveLeadMagnetDownload`
→ `kind: "generated"` → `renderCatalogPdf`) — dlatego schemat i
`leadMagnetCrossChecks` dopuszczają publikację bez pliku dla slugów z
`catalog-slugs.ts`. Własny plik albo adres wgrany w panelu mają pierwszeństwo i
nie są nadpisywane.

Hasła są tymi samymi, które serie rolek mają jako `defaultKeyword`
(`autopilot/series.ts`), a materiały tworzą drabinkę per tor:

| Tor            | Hasło       | Slug                                                                             | Etap          | Następny krok          |
| -------------- | ----------- | -------------------------------------------------------------------------------- | ------------- | ---------------------- |
| inwestor       | `START`     | `start-inwestora` — przewodnik startowy („jak zarabiać jak bank”)                | świadomość    | kalkulator LTV         |
| inwestor       | `KSIĘGA`    | `checklista-ksiegi-wieczystej` — checklista działów I–IV, sygnały ostrzegawcze   | przygotowanie | kalkulator LTV         |
| inwestor       | `BŁĘDY`     | `bledy-inwestora` — 7 błędów inwestora + lista „przed decyzją”                   | decyzja       | program dla inwestorów |
| pożyczkobiorca | `ODMOWA`    | `bank-odmowil-co-dalej` — 5 dróg finansowania, LTV, koszty, czerwone flagi       | świadomość    | kalkulator ILE         |
| pożyczkobiorca | `DOKUMENTY` | `checklista-dokumentow` — dokumenty firmy, nieruchomości, celu, osób             | przygotowanie | wniosek                |
| pożyczkobiorca | `PROCES`    | `od-wniosku-do-wyplaty` — 10 kroków, notariusz, rozliczenie wypłaty, mit vs fakt | decyzja       | wniosek                |

Kalkulatory `ILE` / `RATA` / `LTV` zakłada `autopilot_provision_tools`. Wzór
umowy (`UMOWA`) nie jest pisany przez AI: `wzor-umowy.ts` składa go tym samym
potokiem co prawdziwą umowę (`przetworzSzkic` → `renderuj` → `umowaBloki` z
biblioteki klauzul silnika umów) na przykładowych warunkach (100 000 zł, 12 rat,
hipoteka i art. 777 do 260 000 zł), a dane stron, PESEL, NIP, numer KW i rachunki
maskuje polami w nawiasach kwadratowych. PDF (`wzor-umowy-pdf.ts`, `pdfZBlokow`,
serif jak w .docx): okładka i wprowadzenie z katalogu → umowa (ze spisem
Załączników 1–4 w treści) → strona „Załączniki do umowy — w pakiecie dokumentów”
(wniosek + Zał. 1–4 z opisem i miejscem, gdzie są) → zakończenie. Testy
`wzor-umowy.test.ts` pilnują braku błędów walidacji silnika i braku danych
identyfikujących. `resolveKeywordTarget(hasło)` zwraca materiał z katalogu albo
kalkulator — do opisu-lejka („Skomentuj HASŁO, a wyślę Ci …”).

Każdy materiał niesie oznaczenie AI, nadawcę z KRS i linię ryzyka (PDF i mail)
oraz tagi subskrybenta `katalog`, `katalog:<slug>`, `etap:<swiadomosc|przygotowanie|decyzja>`.
Strona `/pobierz/<slug>` po zapisie pokazuje przycisk „Następny krok” (`next`).

**Provisioning** (`catalog.server.ts` → `ensureCatalogMagnets`): zakłada
brakujące rekordy `lead_magnets`, wgrywa brakujące albo nieaktualne pliki PDF
(skład z kontroli jakości idzie prosto do Storage), przy `publish` publikuje te,
które przeszły kontrolę jakości (reguły twarde compliance dla strony, PDF i maila

- próbny render), istniejących rekordów nie nadpisuje (chyba że `overwrite`),
  własnego pliku zespołu nie rusza, nigdy nie cofa publikacji. Materiał z
  problemami nie dostaje nowego pliku. Wynik per materiał niesie `file`:
  `aktualny` / `wgrany` / `odświeżony` / `własny` / `nieaktualny` / `brak` / `błąd`.
  Trzy wejścia:

* MCP `provision_lead_magnet_catalog` (`publish`, `overwrite`, `refresh_files`,
  `dry_run`, `slugs`; publikacja, nadpisanie i odświeżenie plików — administrator),
* panel: karta „Katalog startowy PDF” z przyciskami „Załóż szkice” / „Odśwież PDF-y” /
  „Załóż i opublikuj” oraz podgląd PDF w edytorze (badge „PDF z katalogu (bez pliku)”
  zamiast „brak pliku”, dopóki plik nie zostanie wgrany),
* tick autopilota (`full_autopilot`, 6:00) — razem z narzędziami-kalkulatorami;
  po podbiciu wersji sam odświeża pliki.

Zmiana treści = commit + podbicie `CATALOG_VERSION` (okładka, ścieżka pliku) +
testy `catalog.test.ts` (unikalność haseł, spójność z seriami, compliance, schemat,
render, znaki w foncie) i `catalog.server.test.ts` (decyzje o plikach w Storage).
Podgląd lokalny: `bun scripts/lead-magnets-catalog.ts render tmp/lead-magnets`
(JSON wierszy: `… dump`).

## Segmenty mailingu

Subskrybenci z lead magnetów mają tagi, po których filtrują segmenty
(`email_segments.filters.tags`): `lead-magnet`, `klient` / `inwestor`,
`lead-magnet:<slug>` oraz tagi własne z panelu. Źródło: `source =
lead_magnet`, `source_id = id lead magnetu`, UTM-y z linku.

## Zaproszenia do opinii Trustpilot (AFS)

Każdy, kto pierwszy raz pobiera dany lead magnet, może dostać od Trustpilot
zaproszenie do wystawienia opinii — opinia z takiego zaproszenia ma znacznik
„Zweryfikowano”. Mechanizm to AFS (Automatic Feedback Service): Trustpilot daje
firmie unikalny adres `…@invite.trustpilot.com`, a mail z linkiem do pliku
dostaje ten adres w ukrytej kopii (BCC). Trustpilot sam wysyła zaproszenie po
opóźnieniu ustawionym w jego panelu (domyślnie kilka dni); limit zaproszeń
w planie Free sprawdzasz w koncie Trustpilot.

- Konfiguracja: `/admin/integracje` → karta **Trustpilot**: adres AFS
  (Trustpilot Business → Get reviews → Automatic invitations), przełącznik
  „Zapraszaj po pobraniu lead magnetu” i włączenie integracji. Zapis w
  `integration_settings` (`integration_name = trustpilot`, `configuration`:
  `afs_bcc_email`, `invite_lead_magnets`). Adres spoza domeny
  `invite.trustpilot.com` nie zostanie zapisany.
- Kod: `src/lib/trustpilot.ts` (czysta logika, testy w `trustpilot.test.ts`),
  `src/lib/trustpilot.server.ts` (odczyt ustawień), `registerLeadMagnetSignup`
  w `src/lib/lead-magnets/lead-magnets.server.ts` dokłada BCC do maila
  z linkiem (także do maila z własną treścią, np. z kalkulatora), a
  `sendResendEmail` ma pole `bcc` (test `resend-send.bcc.test.ts`).
- Ponowny zapis tego samego adresu na ten sam materiał wysyła plik jeszcze raz,
  ale już bez BCC — nie mnożymy zaproszeń. Powtórki między różnymi materiałami
  ogranicza ustawienie częstotliwości zaproszeń po stronie Trustpilot.
- Awaria odczytu ustawień albo brak wiersza nigdy nie blokuje wysyłki pliku:
  mail idzie bez BCC, a błąd trafia do logów (`[trustpilot]`).
- W `email_send_log.metadata` każda wysyłka z kopią ma pole `bcc`.
- Widżet na stronie: `src/components/marketing/trustpilot-box.tsx` (oficjalny
  TrustBox, identyfikator profilu i szablony w `src/lib/trustpilot.ts`). Strona
  główna ma sekcję „Opinie” (`/#opinie`, szablon Review Collector — dostępny
  w planie Free), stopka link do profilu. Szablony z treścią opinii (Carousel,
  Grid) wymagają planu płatnego — wtedy wystarczy zmienić `template` na stronie.
  TrustBox nie zapisuje ciasteczek, więc nie podlega zgodzie cookies.

## Co jest w repo

| Element                                            | Plik                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Czysta logika (hasła, dopasowanie, szablony)       | `src/lib/lead-magnets/core.ts` (+ testy `core.test.ts`)                                 |
| Schemat zod (panel + MCP)                          | `src/lib/lead-magnets/schema.ts`                                                        |
| Zapis, mail, pobranie, komentarze, tick YouTube    | `src/lib/lead-magnets/lead-magnets.server.ts`                                           |
| Server functions panelu i strony                   | `src/lib/lead-magnets/lead-magnets.functions.ts`                                        |
| Panel                                              | `src/routes/admin.marketing.lead-magnety.tsx`                                           |
| Strona publiczna                                   | `src/routes/pobierz.$slug.tsx`                                                          |
| Pobranie pliku z tokenem                           | `src/routes/pobierz-plik.$token.ts`                                                     |
| Tick YouTube (pg_cron co 10 min)                   | `src/routes/api/public/hooks/lead-magnet-tick.ts`                                       |
| Webhook Meta (FB `feed`, IG `comments`, reakcje)   | `src/lib/meta-messaging.server.ts` (`handleFeedChange`, `handleInstagramCommentChange`) |
| Private Reply Instagram                            | `src/lib/meta-comments.server.ts` (`sendIgPrivateReplyToComment`)                       |
| Narzędzia MCP                                      | `src/lib/mcp/tools/lead-magnets.ts`                                                     |
| Katalog startowy (treść, render PDF, provisioning) | `src/lib/lead-magnets/catalog.ts`, `catalog-slugs.ts`, `pdf.ts`, `catalog.server.ts`    |
| Migracja (tabele, RLS, bucket, liczniki, cron)     | `supabase/migrations/20261006150000_lead_magnety.sql`                                   |
| Migracja: tryb „e-mail w wiadomości”               | `supabase/migrations/20261006170000_lead_magnety_email_w_wiadomosci.sql`                |

Tabele: `lead_magnets` (treść, plik, mail, hasła, szablony, liczniki),
`lead_magnet_posts` (powiązane posty; jeden post → jeden lead magnet),
`lead_magnet_signups` (zapisy z tokenem pobrania), `lead_magnet_triggers`
(dziennik komentarzy i reakcji ze statusem odpowiedzi). Liczniki zapisów,
pobrań i dopasowanych komentarzy utrzymują triggery w bazie; odsłony — RPC
`lead_magnet_increment_views`.

## Wymagania konfiguracyjne

- **Meta**: webhook strony z polem `feed` (już używany przez bota) oraz dla
  Instagrama pole `comments` w subskrypcji aplikacji; uprawnienia
  `pages_manage_engagement`, `pages_messaging`, `instagram_manage_comments`,
  `instagram_manage_messages`. Private Reply działa do 7 dni od komentarza.
  Tokeny: `ensureMetaTokens()` (użytkownik systemowy), `META_IG_USER_ID` dla
  Instagrama.
- **YouTube**: kanał połączony w panelu YouTube Shorts (token OAuth) — ten sam,
  którym odpowiadamy na komentarze. Limity na przebieg: 20 filmów, 15
  odpowiedzi (comments.insert kosztuje 50 jednostek kwoty API).
- **E-mail**: Resend przez bramkę Lovable (`LOVABLE_API_KEY`, `RESEND_API_KEY`).
- **Cron**: migracja rejestruje `lead-magnet-tick` w pg_cron (co 10 minut,
  ten sam nagłówek `apikey` co pozostałe ticki).

## Narzędzia MCP

`list_lead_magnets`, `get_lead_magnet`, `create_lead_magnet`,
`update_lead_magnet`, `delete_lead_magnet`, `link_lead_magnet_post`,
`unlink_lead_magnet_post`, `list_lead_magnet_signups`,
`list_lead_magnet_triggers`, `check_lead_magnet_youtube_comments` (realna
publikacja odpowiedzi), `generate_lead_magnet_copy`,
`provision_lead_magnet_catalog` (katalog startowy PDF z kodu — wyżej). Plik wgrywa się w panelu
(albo `supabase_storage` do bucketa `lead-magnets` i `file_path` w
`update_lead_magnet`).

## Typowy scenariusz

1. `generate_lead_magnet_copy` z briefem → `create_lead_magnet` (szkic).
2. W panelu wgrywasz PDF, włączasz „Opublikowany”.
3. Publikujesz post (`queue_social_publication` / `publish_facebook_post`) z
   treścią z zakładki „Automat social” i powiązujesz go
   (`link_lead_magnet_post` z `external_post_id` z kolejki publikacji).
4. Komentarze z hasłem dostają link; zapisy widać w „Zapisy” (CSV) i w
   subskrybentach mailingu z tagami — gotowe do kampanii dla segmentu.
