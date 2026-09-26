# Studio publikacji — multi-platformowa publikacja + generatory AI

Jedno miejsce (panel **/admin/studio-publikacji**) do:

1. **Publikacji wideo** na YouTube (Shorts), Instagram Reels, Facebook Reels,
   TikToka i postów na Facebooku (tekst / grafika / wideo) — z jednego
   formularza, z harmonogramem i kolejką.
2. **Generowania wideo HeyGen z promptu** — prompt → scenariusz AI →
   lektor ElevenLabs → awatar HeyGen (pion 9:16).
3. **Generatora promptów** — pomysły na wideo, grafiki i posty social.
4. **Generatora grafik z promptu** — Lovable AI gateway
   (`google/gemini-2.5-flash-image`), zapis do Supabase Storage z trwałym
   publicznym URL.

## Architektura

| Element                                      | Plik                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Publikacja Meta (Graph API)                  | `src/lib/studio-publishing.server.ts`                                                    |
| Publikacja TikTok (Content Posting API)      | `src/lib/tiktok.server.ts`                                                               |
| TikTok — czysta logika chunków/tytułu        | `src/lib/tiktok-upload.ts` (+ testy `tiktok-upload.test.ts`)                             |
| TikTok — server functions panelu             | `src/lib/tiktok.functions.ts`                                                            |
| TikTok — ekran publikacji (zgodny z audytem) | `src/components/admin/tiktok-post-options-fields.tsx`                                    |
| TikTok — scenariusz nagrania do audytu       | `docs/tiktok-audyt-nagranie.md`                                                          |
| TikTok — OAuth (start + callback)            | `src/routes/api/tiktok/auth.ts`, `src/routes/api/tiktok/callback.ts`                     |
| Klasyfikacja błędów Meta + backoff           | `src/lib/meta-graph-errors.ts` (+ testy `meta-graph-errors.test.ts`)                     |
| Helpery AI (scenariusz, prompty, grafiki)    | `src/lib/studio-ai.server.ts`                                                            |
| Server functions                             | `src/lib/studio.functions.ts`                                                            |
| Baza 250 pytań do shortów (generowana)       | `src/lib/shorts-question-bank.ts`                                                        |
| Źródło bazy pytań + generator                | `docs/shorts/pozyczki-prywatne-250-pytan.md`, `scripts/generate-shorts-question-bank.ts` |
| Cron tick Meta                               | `src/routes/api/public/hooks/social-publish-tick.ts`                                     |
| Panel admina                                 | `src/routes/admin.studio-publikacji.tsx`                                                 |
| Migracja (tabele + bucket + cron)            | `supabase/migrations/20260803130000_studio_publikacji.sql`                               |
| Migracja TikToka                             | `supabase/migrations/20260926120000_tiktok_content_posting.sql`                          |
| Migracja: ustawienia posta twórcy            | `supabase/migrations/20260926140000_tiktok_ustawienia_publikacji_tworcy.sql`             |

Tabele:

- `social_publish_queue` — kolejka publikacji Meta (`facebook_post`,
  `facebook_reels`, `instagram_reels`) **oraz TikToka** (`tiktok`). Statusy:
  `pending → publishing → (processing) → published`; `failed` po 3 **realnych**
  próbach; `cancelled` ręcznie. Instagram publikuje się dwuetapowo: tick tworzy
  kontener mediów (status `processing`, znacznik czasu w `ig_container_at`),
  a po zakończeniu transkodowania po stronie Meta kolejny tick woła
  `media_publish`. TikTok analogicznie — kolumny `tiktok_publish_id`,
  `tiktok_status` (`pending | uploading | processing | publish_complete |
failed`) i `tiktok_fail_reason`. **Oba tory filtrują się wzajemnie po
  `platform`**: tick Meta pomija wpisy `tiktok`, a tick TikToka bierze tylko je.
- `tiktok_integration` — singleton z tokenami OAuth TikToka (dostęp wyłącznie
  `service_role`, jak `youtube_integration`).
- `studio_video_jobs` — joby wideo HeyGen z promptu (statusy jak w Awatar FAQ:
  `generating_audio → uploading → rendering → ready/failed`).
- `studio_images` — wygenerowane grafiki; pliki w publicznym buckecie
  `studio-media` (trwałe URL-e, które Meta może pobrać przy publikacji).

Publikacja na **YouTube** korzysta z istniejącego modułu YouTube Shorts —
formularz Studia wstawia wpisy do `youtube_publish_queue`
(patrz `docs/youtube-shorts.md`; OAuth kanału w /admin/youtube-shorts).

Cron `social-publish-tick` (pg_cron co 10 minut) najpierw domyka kontenery IG
(maks. 5 na przebieg), potem publikuje maks. 3 wymagalne wpisy Meta. Ręczne
wywołanie: `GET /api/public/hooks/social-publish-tick?run=1` z nagłówkiem
`x-cron-secret: <CRON_SECRET>` (lub `apikey` z kluczem anon).

### Limity Meta („(#4) Application request limit reached")

Kody `#4`, `#17`, `#32`, `#341`, `#613`, HTTP 429/5xx i błędy sieci to błędy
**chwilowe** — `src/lib/meta-graph-errors.ts` rozpoznaje je i wtedy:

- próba **nie jest zużywana** (licznik `attempt_count` stoi),
- kontener IG **nie jest kasowany** — kolejny przebieg dokańcza publikację
  z tego samego kontenera zamiast tworzyć nowy (mniej wywołań = mniej limitu),
- wpis wraca do kolejki z odstępem rosnącym wykładniczo (15 → 30 → 60 → …,
  maks. 6 h; przy limicie minimum 1 h albo tyle, ile Meta poda w nagłówkach
  `x-business-use-case-usage` / `retry-after`),
- gdy Meta zgłosi limit, przebieg **przerywa dalsze wywołania** i odracza całą
  wymagalną kolejkę — zamiast dobijać limit co 10 minut.

Panel pokazuje komunikat po polsku (z oryginałem Meta w nawiasie), licznik
`próby: n/3` i godzinę kolejnej próby. Przycisk „Ponów" (dostępny też dla
wpisów w `processing`) zeruje licznik prób i publikuje od ręki. Błędy trwałe
(wygasły token, zły format wideo) nie są ponawiane w kółko — komunikat mówi,
co poprawić.

## Konfiguracja — sekrety środowiska

| Sekret                   | Do czego                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| `META_PAGE_ID`           | ID strony FB, na którą publikujemy                                |
| `META_PAGE_ACCESS_TOKEN` | Token strony (fallback: `META_ACCESS_TOKEN`)                      |
| `META_IG_USER_ID`        | ID konta Instagram **Business** powiązanego ze stroną             |
| `TIKTOK_CLIENT_KEY`      | Klient TikTok for Developers (Content Posting API)                |
| `TIKTOK_CLIENT_SECRET`   | Sekret tego klienta                                               |
| `TIKTOK_REDIRECT_URI`    | Opcjonalny; domyślnie `https://financeyou.pl/api/tiktok/callback` |
| `HEYGEN_API_KEY`         | Generowanie wideo awatara (już używany przez Awatar FAQ)          |
| `HEYGEN_CAPTION_STYLE`   | Opcjonalny styl napisów HeyGen (domyślnie `default`)              |
| `ELEVENLABS_API_KEY`     | Lektor TTS (już używany)                                          |
| `LOVABLE_API_KEY`        | AI gateway: scenariusze, prompty, grafiki (już używany)           |

Token strony musi mieć uprawnienia: `pages_manage_posts`,
`pages_read_engagement`, a dla Instagrama dodatkowo `instagram_basic`
i `instagram_content_publish`. Długożyjący token strony wygenerujesz
w [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
(token użytkownika z ww. scope → wymiana na long-lived → `GET /me/accounts`
zwraca **bezterminowy** token strony). `META_IG_USER_ID` znajdziesz przez
`GET /{page-id}?fields=instagram_business_account`.

## Ograniczenia platform

- **Reels (FB/IG)**: MP4, pion 9:16, zalecane 1080×1920; IG Reels 3 s – 15 min.
  Meta pobiera plik z podanego URL — musi być publiczny (bucket
  `studio-media` albo inne trwałe źródło; URL-e HeyGen wygasają!).
- **IG Reels** wymaga konta Instagram Business/Creator powiązanego ze stroną FB.
- **YouTube**: limity quota — ok. 6 uploadów/dobę (opis w
  `docs/youtube-shorts.md`).
- **Post FB**: tekst, tekst+grafika (`/photos`), tekst+wideo (`/videos`).
- **TikTok**: MP4, pion 9:16, plik do 100 MB (limit bufora workera). Limit
  publikacji ~15/dobę na konto, więc tick wysyła **jeden post na przebieg**.
  Tytuł do 150 znaków. Wideo idzie metodą `FILE_UPLOAD` (nie `PULL_FROM_URL`),
  więc plik pobieramy z bucketu `studio-media` i wysyłamy chunkami.

## Użycie

Zakładki panelu:

1. **Publikacja** — zaznacz platformy, podaj tytuł/treść, wybierz wideo
   (możesz podstawić wygenerowane w Studio lub Awatar FAQ) albo grafikę,
   ustaw termin → „Dodaj do kolejki publikacji". „Publikuj teraz" wysyła
   od ręki; błędy ponawiają się do 3 razy.
2. **Wideo AI (HeyGen)** — dwie drogi do promptu:
   - **Baza pytań do shortów (250)** — pytania z pliku „Pożyczki prywatne —
     250 pytań do shortów" z filtrami (kategoria klient/inwestor, sekcja,
     szukajka). „Użyj" podstawia pytanie jako prompt (z prefiksem `#N · `)
     oraz **gotowy, sprawdzony scenariusz złożony 1:1 z treści paczki** —
     rozbity w panelu na edytowalne sekcje: **hook** (znacznik kategorii +
     pytanie), **treść** (teza) i **CTA**; lektor czyta ich sklejkę. AI
     niczego nie przepisuje (`src/lib/shorts-script.ts`). Obok scenariusza
     panel pokazuje **elementy dynamiczne** (instrukcje ekranowe do
     montażu, lektor ich nie czyta): ikonka „AI" 0–3 s, znacznik kategorii
     na starcie, duże pytanie od ~0,8/1,0 s — z przyciskiem „Kopiuj".
     Tytuł i opis publikacji też pochodzą z paczki (teza + nota „materiał
     edukacyjny"). Pytania, dla których wideo już istnieje, mają zielony
     znaczek (rozpoznanie po prefiksie promptu — bez zmiany schematu DB).
   - **Własny prompt** — scenariusz pisze AI, jak dotychczas.

   **Napisy** — przełącznik „Napisy na wideo" przy wyborze głosu (domyślnie
   włączony, bo rolki ogląda się bez dźwięku). Render idzie do HeyGen z polem
   `caption: { file_format: "srt", style: … }` (v3 nie przyjmuje `caption:
true` z API v2 — walidacja odrzuca boolean). Znaczenie pól jest różne
   i to jest tu sedno:
   - `file_format` sam → HeyGen oddaje **tylko plik SRT** obok wideo,
   - `file_format` + `style` → napisy są **dodatkowo wypalane w obrazie**.

   Wypalona wersja **nie nadpisuje `video_url`** — HeyGen zwraca ją jako
   osobny plik w polu `captioned_video_url`, a `video_url` zostaje czystym
   masterem. Dlatego przy odbiorze renderu bierzemy `captioned_video_url`
   (gdy zamówiono napisy) i to on ląduje w `studio_video_jobs.video_url`,
   czyli w tym, co idzie do publikacji na YouTube, FB i IG. Czysty master
   zapisujemy obok w `video_url_clean` (przycisk „Bez napisów" w bibliotece).
   Na IG/FB Reels to jedyna droga — te platformy nie przyjmują osobnej
   ścieżki napisów.

   Gdy konto HeyGen nie ma napisów w planie, generacja **nie pada**:
   schodzimy po drabinie `burned → sidecar → off` (odrzucony `style` nie kasuje
   już napisów całkowicie — najpierw próbujemy samego pliku SRT). Jeśli wideo
   jest gotowe, a wypalonej wersji jeszcze nie ma, job **zostaje w
   `rendering`** przez karencję (`caption_wait_since`, 12 min ≈ jeszcze jeden
   tick); po jej upływie publikujemy czysty plik, zapisujemy `captions = false`
   i wpisujemy powód w `last_error`, zamiast po cichu wypuszczać rolkę bez
   napisów. Biblioteka rozróżnia trzy stany: „napisy na wideo", „tylko plik
   SRT", „bez napisów". Plik SRT nadal ląduje w `subtitle_url` (przycisk
   „SRT"). Ustawienie obowiązuje też dla generowania wsadowego.

   Pozostałe ścieżki HeyGena zamawiają świadomie `captions: "sidecar"`
   (nie wypalamy tego, czego nie publikujemy): FAQ awatara gra na stronie
   z dźwiękiem, a pipeline YouTube robi materiały 5–8 min, gdzie wypalone
   napisy przeszkadzają, a player YT ma własne.

   **Urozmaicenie (przebitki)** — drugi przełącznik obok napisów, domyślnie
   wyłączony. Włączony renderuje rolkę jako **sklejkę scen** zamiast jednego
   ujęcia gadającej głowy (`POST /v3/videos` z `type: "studio"`):
   1. scenariusz tniemy **deterministycznie po zdaniach** na maks. 6 segmentów
      (`splitScriptIntoSegments`) — AI nie dostaje tekstu do przepisania,
      więc lektor mówi dokładnie to, co zatwierdzono w panelu,
   2. AI (`planVideoScenes`) dostaje ponumerowane segmenty i wskazuje tylko,
      **które zilustrować** i jaką angielską frazą szukać w bibliotece,
   3. frazy idą do stocku HeyGena (`GET /v3/assets/search`, `type=image`),
      z preferencją grafik pionowych (kadr 9:16 docina resztę),
   4. każdy segment dostaje własne audio z ElevenLabs (długość sceny HeyGen
      liczy z jej audio) i ląduje jako scena `avatar_video` albo pełnoekranowa
      `image` **z narracją** — lektor gra przez przebitkę dalej.

   Reguły montażowe pilnuje `applyScenePlan` (testy w `studio-scenes.test.ts`):
   hook i CTA zawsze na awatarze, żadnych dwóch przebitek pod rząd, przebitka
   bez frazy albo bez znalezionej grafiki wraca na awatara. Plan faktycznie
   wysłany na render zapisujemy w `scene_plan` — biblioteka pokazuje go jako
   „3 ujęcia z awatarem + 2 przebitki" (szczegóły w tooltipie).

   **Nic z tego nie blokuje generacji**: gdy planer AI nie odpowie, nie wskaże
   sensownej ilustracji, biblioteka nic nie znajdzie albo render wieloscenowy
   zostanie odrzucony — rolka wychodzi jako pojedyncze ujęcie, a powód ląduje
   w `last_error` (widoczny w tabeli).

   **Czego API HeyGena NIE potrafi** (sprawdzone w specyfikacji v3, żeby nie
   szukać tego drugi raz):
   - **nakładek na awatara** — sceny są pełnoekranowe i sklejane, nie ma
     warstw. Ikonka „AI" w rogu, znacznik kategorii i duże pytanie na środku
     z paczki 250 pytań zostają więc **instrukcją montażową** (przycisk
     „Kopiuj"), a nie czymś, co API wyrenderuje. Jedyny tekst, jaki HeyGen
     nakłada na obraz, to wypalane napisy. Pole `watermark` (grafika w rogu)
     istnieje, ale jest płatną opcją tylko dla kont Enterprise i obowiązuje
     dla całego wideo, nie od 0 do 3 s.
   - **klipów wideo z narracją** — scena `video` przyjmuje klip, ale nie
     przyjmuje audio i nie ma przycinania (`playback` to dziś tylko głośność
     i wyciszenie). Wstawiona w środek rolki ucięłaby lektora i zrobiła ciszę
     na całą długość klipu źródłowego. Dlatego przebitki robimy z grafik,
     nie z filmików stokowych.
   - **wyszukiwarki klipów** — `/v3/assets/search` obsługuje `type=image`
     i `type=icon`; biblioteka wideo nie jest wystawiona przez API.

   Dalej: „Wygeneruj scenariusz" (edytowalny) → wybór awatara i głosu →
   „Generuj wideo". **Awatary** są pobierane na żywo z konta HeyGen
   (`src/lib/heygen-catalog.server.ts`: grupy użytkownika + talking photos
   - publiczne awatary; cache 5 min; fallback: sztywna lista
     `HEYGEN_AVATARS`), z wyszukiwarką i filtrem „Tylko moje". Talking
     photos dostają przy generacji payload `type: talking_photo`. **Głosy**
     to pełna lista z konta ElevenLabs (`/v2/voices` z paginacją; własne
     sklonowane głosy na górze; fallback: Filip). Status odświeża się
     automatycznie; gotowe wideo ma przycisk „Publikuj", który podstawia URL
     do zakładki Publikacja. Biblioteka wygenerowanych wideo pokazuje
     miniatury oraz użyty awatar i głos.

   **Generowanie wsadowe** — w bazie pytań zaznacz checkboxami kilka pytań
   (albo „Zaznacz 5 kolejnych bez wideo") i kliknij „Generuj zaznaczone".
   Pytania trafiają jako joby `queued` (maks. 25 na serię; pytania z już
   istniejącym wideo są pomijane). Kolejkę przetwarza otwarty panel
   (sekwencyjnie, 1 job na raz — logika w
   `src/lib/studio-video-queue.server.ts`) oraz cron `social-publish-tick`
   (2 joby na przebieg co 10 min), więc działa też po zamknięciu
   przeglądarki. Scenariusze, tytuły i opisy serii brane są z gotowej
   treści paczki (AI tylko dla jobów z własnym promptem).

   **Auto-publikacja po wygenerowaniu** — przełącznik on/off nad
   generatorem. Gdy włączony, wybierasz platformy (YouTube / IG Reels /
   FB Reels) i widoczność YouTube; każde wideo (pojedyncze i z serii) po
   zakończeniu renderu trafia automatycznie do kolejek publikacji z tytułem
   i opisem od AI (kolumny `auto_publish_platforms`, `publish_*` w
   `studio_video_jobs`; migracja `20260805120000_studio_video_batch.sql`).
   Auto-publikację domyka polling panelu lub cron tick — znacznik
   `auto_published_at` chroni przed dublami. W bibliotece wideo widać
   „auto: …" z platformami i godziną wysłania do kolejek.

   Regeneracja bazy pytań po zmianie pliku źródłowego:
   `bun run scripts/generate-shorts-question-bank.ts`.

3. **Grafiki AI** — prompt → grafika zapisana w Storage; „Do posta"
   podstawia ją do posta na Facebooku.
4. **Generator promptów** — temat + rodzaj (wideo / grafiki / posty) →
   lista promptów z przyciskami „Użyj" / kopiuj.

## TikTok — Content Posting API (Direct Post)

### Połączenie konta (OAuth, raz)

1. W [TikTok for Developers](https://developers.tiktok.com/) dodaj aplikacji
   **oba** produkty:
   - **Login Kit** z włączonym **Configure for Web** — to on obsługuje
     `/v2/auth/authorize/`. Bez niego logowanie pada na „popraw client_key",
     choćby klucz był idealny; Content Posting API tego nie zastępuje.
   - **Content Posting API** z opcją **Direct Post**.

   Dodaj zakresy `user.info.basic` i `video.publish`, a jako Redirect URI wpisz
   dokładnie `https://financeyou.pl/api/tiktok/callback`.

2. Client key i secret wrzuć do sekretów jako `TIKTOK_CLIENT_KEY`
   i `TIKTOK_CLIENT_SECRET`.
3. W panelu **/admin/studio-publikacji** → karta „TikTok" → **Połącz TikTok**.
   Po powrocie z TikToka karta pokazuje zieloną kropkę, `open_id` i datę
   wygaśnięcia tokena. „Rozłącz" unieważnia grant i czyści tokeny z bazy.

Przycisk NIE prowadzi wprost na TikToka: admin-only server fn
`startTiktokConnect` wydaje jednorazowy `state`, a dopiero endpoint
`/api/tiktok/auth?state=…` robi redirect. Bez tego ktokolwiek mógłby przejść
flow na **swoim** koncie i podmienić firmową integrację na własną —
`/api/tiktok/auth` jest publiczny, bo nawigacja przeglądarki nie nosi nagłówka
`Authorization` (sesja Supabase jedzie w nim, nie w ciasteczku).

### Tokeny

`access_token` żyje 24 h, `refresh_token` 365 dni. Tick odświeża token, gdy
do wygaśnięcia zostało mniej niż 2 h. **TikTok rotuje `refresh_token`** przy
każdym odświeżeniu — zapisujemy nowy, inaczej integracja padłaby po dobie.

### Przebieg publikacji (rozłożony na ticki)

1. **`creator_info/query`** — wołane **przed każdą** publikacją (wymóg TikToka).
   Służy do **sprawdzenia wyborów twórcy** (czy wybrany `privacy_level` jest
   nadal dozwolony) i domknięcia przełączników ograniczeniami konta. Sam wybór
   robi człowiek na ekranie publikacji — patrz sekcja poniżej.
2. **`video/init`** (`FILE_UPLOAD`) → `publish_id` + `upload_url`, zapis
   `publish_id` do bazy **przed** uploadem (gdyby worker padł, kolejny tick
   domknie wpis pollingiem, a nie opublikuje drugi raz), potem `PUT` chunków
   z nagłówkiem `Content-Range`.
3. **`status/fetch`** — polling co 30 s (do 3 prób w tym ticku), a jeśli TikTok
   wciąż przetwarza, wpis zostaje w `processing` i domykają go kolejne ticki
   (limit całkowity: 60 min). `PUBLISH_COMPLETE` → wpis `published`;
   `FAILED` → `tiktok_fail_reason` z odpowiedzi, bez ponawiania (materiał
   odrzucony merytorycznie nie przejdzie też za drugim razem).

#### Dlaczego chunki liczymy `floor`, nie `ceil`

TikTok waliduje `total_chunk_count == floor(video_size / chunk_size)`, a
**ostatni chunk pochłania resztę** (może być większy niż `chunk_size`).
`ceil` — jak w pierwotnej specyfikacji modułu — kończyłby się błędem
`invalid_params` dla każdego rozmiaru niepodzielnego przez `chunk_size`
(25 MB / 10 MB → `ceil` daje 3, a TikTok oczekuje 2 chunków: 10 MB i 15 MB).
Plik poniżej 5 MB leci jako jeden chunk. Niezmienniki pilnują testy
w `src/lib/tiktok-upload.test.ts`.

### Bez znaku wodnego

TikTok nie dopuszcza cudzych watermarków w Direct Post. Render Studia
(`src/lib/studio-render.server.ts`) wypala w obraz **tylko napisy** — żadnego
logo ani nakładki Finance You — więc materiał nadaje się do publikacji bez zmian.

## Zgodność z audytem TikToka (ekran publikacji)

Content Sharing Guidelines zabraniają hardkodowania prywatności: _„Developers
should not hardcode one privacy setting… your export screen must reflect those
values"_. Pierwsza wersja integracji wybierała `privacy_level` po stronie
serwera — **to nie przeszłoby audytu**, więc wybór należy do twórcy i jedzie
razem z wpisem w kolejce.

Ekran (`TiktokPostOptionsFields`, wspólny dla publikacji ręcznej
i auto-publikacji zadania wideo) pokazuje:

- nick konta, na które publikujemy,
- **wybór prywatności z `creator_info`, bez wartości domyślnej** — dopóki twórca
  nie wskaże, przycisk publikacji jest nieaktywny,
- przełączniki komentarzy / duetu / stitcha, **wyszarzone** gdy konto twórcy je
  blokuje (`applyCreatorConstraints` liczy iloczyn: nie włączamy niczego, czego
  twórca nie zaznaczył),
- **ujawnienie treści komercyjnej** — domyślnie wyłączone, po włączeniu
  checkboxy „Twoja marka" (`brand_organic_toggle`) i „Treść brandowana"
  (`brand_content_toggle`) plus etykieta, jaką TikTok nada filmowi,
- deklarację **„Publikując, akceptujesz Music Usage Confirmation"** tuż przed
  przyciskiem.

Wybory lądują w `social_publish_queue.tiktok_post_options` (auto-publikacja:
najpierw w `studio_video_jobs.tiktok_post_options`, skąd kopiuje je
`maybeAutoPublishJob`). Panel i serwer walidują je **tym samym**
`parseTiktokPostOptions`, żeby UI nie przepuszczał czegoś, co publikacja
odrzuci. Reguła TikToka „treść brandowana nie może być prywatna" jest
egzekwowana po obu stronach — zgłaszamy błąd, zamiast po cichu zmieniać wybór
twórcy.

Klient **przed audytem** ma wymuszone `SELF_ONLY` — `creator_info` zwróci wtedy
tylko tę opcję i tyle zobaczy twórca. To oczekiwane, nie obchodzimy tego.

Scenariusz nagrania do wniosku audytowego: `docs/tiktok-audyt-nagranie.md`.
