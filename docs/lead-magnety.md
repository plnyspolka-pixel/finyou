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
     publiczne potwierdzenie „wysłaliśmy Ci link w wiadomości”. Gdy DM się nie
     uda — link publicznie pod komentarzem. Komentarz obsłużony przez lead
     magnet **nie** idzie do agenta AI.
   - Instagram: webhook `comments` → Private Reply (`/{ig-user-id}/messages`
     z `recipient.comment_id`) + publiczna odpowiedź; fallback publicznie.
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

Każdy komentarz obsługujemy raz (unikalny indeks `platform + id komentarza`).
Ochrona przed pętlami bot-bot na Facebooku działa jak dla agenta
(`bot-loop-guard.server.ts`) — sprawdzana przed lead magnetem.

## Segmenty mailingu

Subskrybenci z lead magnetów mają tagi, po których filtrują segmenty
(`email_segments.filters.tags`): `lead-magnet`, `klient` / `inwestor`,
`lead-magnet:<slug>` oraz tagi własne z panelu. Źródło: `source =
lead_magnet`, `source_id = id lead magnetu`, UTM-y z linku.

## Co jest w repo

| Element                                          | Plik                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Czysta logika (hasła, dopasowanie, szablony)     | `src/lib/lead-magnets/core.ts` (+ testy `core.test.ts`)                                 |
| Schemat zod (panel + MCP)                        | `src/lib/lead-magnets/schema.ts`                                                        |
| Zapis, mail, pobranie, komentarze, tick YouTube  | `src/lib/lead-magnets/lead-magnets.server.ts`                                           |
| Server functions panelu i strony                 | `src/lib/lead-magnets/lead-magnets.functions.ts`                                        |
| Panel                                            | `src/routes/admin.marketing.lead-magnety.tsx`                                           |
| Strona publiczna                                 | `src/routes/pobierz.$slug.tsx`                                                          |
| Pobranie pliku z tokenem                         | `src/routes/pobierz-plik.$token.ts`                                                     |
| Tick YouTube (pg_cron co 10 min)                 | `src/routes/api/public/hooks/lead-magnet-tick.ts`                                       |
| Webhook Meta (FB `feed`, IG `comments`, reakcje) | `src/lib/meta-messaging.server.ts` (`handleFeedChange`, `handleInstagramCommentChange`) |
| Private Reply Instagram                          | `src/lib/meta-comments.server.ts` (`sendIgPrivateReplyToComment`)                       |
| Narzędzia MCP                                    | `src/lib/mcp/tools/lead-magnets.ts`                                                     |
| Migracja (tabele, RLS, bucket, liczniki, cron)   | `supabase/migrations/20261006150000_lead_magnety.sql`                                   |

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
publikacja odpowiedzi), `generate_lead_magnet_copy`. Plik wgrywa się w panelu
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
