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

| Element                                      | Plik                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Publikacja Meta (Graph API)                  | `src/lib/studio-publishing.server.ts`                                                     |
| Publikacja TikTok (Content Posting API)      | `src/lib/tiktok.server.ts`                                                                |
| TikTok — czysta logika chunków/tytułu        | `src/lib/tiktok-upload.ts` (+ testy `tiktok-upload.test.ts`)                              |
| TikTok — server functions panelu             | `src/lib/tiktok.functions.ts`                                                             |
| TikTok — ekran publikacji (zgodny z audytem) | `src/components/admin/tiktok-post-options-fields.tsx`                                     |
| TikTok — scenariusz nagrania do audytu       | `docs/tiktok-audyt-nagranie.md`                                                           |
| TikTok — OAuth (start + callback)            | `src/routes/api/tiktok/auth.ts`, `src/routes/api/tiktok/callback.ts`                      |
| Klasyfikacja błędów Meta + backoff           | `src/lib/meta-graph-errors.ts` (+ testy `meta-graph-errors.test.ts`)                      |
| Helpery AI (scenariusz, prompty, grafiki)    | `src/lib/studio-ai.server.ts`                                                             |
| Bank b-rolli (import, dobór, seed)           | `src/lib/studio-broll.server.ts`                                                          |
| Bank b-rolli — czysta logika doboru          | `src/lib/studio-broll-match.ts` (+ testy `studio-broll-match.test.ts`)                    |
| Domyślne awatary (rotacja a-rolli)           | `src/lib/studio-avatars.server.ts`                                                        |
| Server functions                             | `src/lib/studio.functions.ts`                                                             |
| Kolejki — wspólne wstawianie wpisów          | `src/lib/studio-enqueue.server.ts`, `src/lib/studio-platforms.ts`                         |
| „Publikuj" przy materiale (Materiały)        | `src/lib/marketing-material-publish*.ts` (logika, kopia publiczna, server functions)      |
| Dialog „Publikuj" (Materiały)                | `src/components/admin/material-publish-dialog.tsx`                                        |
| Napisy własne — styl (SRT → ASS, presety)    | `src/lib/caption-style.ts` (+ testy `caption-style.test.ts`)                              |
| Napisy własne — decyzje pipeline'u           | `src/lib/studio-captions.ts` (+ testy `studio-captions.test.ts`)                          |
| Napisy własne — klient usługi wypalania      | `src/lib/caption-burner.server.ts`                                                        |
| Usługa FFmpeg (napisy + kompresja)           | `services/caption-burner/` (server.mjs, transcode-plan.mjs, Dockerfile, fly.toml, README) |
| Kompresja przed publikacją — decyzje         | `src/lib/video-rendition.ts` (+ testy `video-rendition.test.ts`)                          |
| Kompresja przed publikacją — usługa, Storage | `src/lib/video-rendition.server.ts`                                                       |
| Migracja: kompresja (video_renditions)       | `supabase/migrations/20260929120000_video_renditions.sql`                                 |
| Baza 250 pytań do shortów (generowana)       | `src/lib/shorts-question-bank.ts`                                                         |
| Źródło bazy pytań + generator                | `docs/shorts/pozyczki-prywatne-250-pytan.md`, `scripts/generate-shorts-question-bank.ts`  |
| Cron tick Meta                               | `src/routes/api/public/hooks/social-publish-tick.ts`                                      |
| Panel admina                                 | `src/routes/admin.studio-publikacji.tsx`                                                  |
| Migracja (tabele + bucket + cron)            | `supabase/migrations/20260803130000_studio_publikacji.sql`                                |
| Migracja: bank b-rolli + domyślne awatary    | `supabase/migrations/20260927120000_studio_bank_broll_i_domyslne_awatary.sql`             |
| Migracja: napisy własne                      | `supabase/migrations/20260928120000_studio_napisy_wlasne.sql`                             |
| Migracja TikToka                             | `supabase/migrations/20260926120000_tiktok_content_posting.sql`                           |
| Migracja: ustawienia posta twórcy            | `supabase/migrations/20260926140000_tiktok_ustawienia_publikacji_tworcy.sql`              |

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
  `generating_audio → uploading → rendering → ready/failed`; przy własnym stylu
  napisów między `rendering` a `ready` jest jeszcze `captioning` — wypalanie
  w naszej usłudze).
- `studio_images` — wygenerowane grafiki; pliki w publicznym buckecie
  `studio-media` (trwałe URL-e, które Meta może pobrać przy publikacji).
- `studio_broll_assets` — **bank b-rolli**: przebitki (`kind = 'broll'`).
  Pliki w tym samym buckecie `studio-media`, dobór po tagach, rotacja po
  `last_used_at` / `use_count`. Stare wiersze `kind = 'hook'` (wizual hooki,
  usunięte) zostają w tabeli, ale kod ich nie czyta ani nie pokazuje.
- `studio_default_avatars` — **stały zestaw domyślnych awatarów**; `position`
  wyznacza rotację a-rolli w rolce.

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

| Sekret                            | Do czego                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `META_PAGE_ID`                    | ID strony FB, na którą publikujemy                                                                     |
| `META_PAGE_ACCESS_TOKEN`          | Token strony (fallback: `META_ACCESS_TOKEN`)                                                           |
| `META_IG_USER_ID`                 | ID konta Instagram **Business** powiązanego ze stroną                                                  |
| `TIKTOK_CLIENT_KEY`               | Klient TikTok for Developers (Content Posting API)                                                     |
| `TIKTOK_CLIENT_SECRET`            | Sekret tego klienta                                                                                    |
| `TIKTOK_REDIRECT_URI`             | Opcjonalny; domyślnie `https://financeyou.pl/api/tiktok/callback`                                      |
| `HEYGEN_API_KEY`                  | Generowanie wideo awatara (już używany przez Awatar FAQ)                                               |
| `PEXELS_API_KEY`                  | Opcjonalny; źródło b-rolli (bez niego bank bierze stock HeyGena)                                       |
| `HEYGEN_CAPTION_STYLE`            | Opcjonalny styl napisów HeyGen (domyślnie `default`; API zna tylko tę wartość)                         |
| `CAPTION_BURNER_URL`              | Opcjonalny; adres usługi FFmpeg (własne style napisów + kompresja przed publikacją)                    |
| `CAPTION_BURNER_SECRET`           | Sekret tej usługi (Bearer) — bez pary URL+sekret zostaje styl HeyGena i publikacja oryginalnych plików |
| `CAPTION_BURN_TIMEOUT_MINUTES`    | Opcjonalny; ile czekać na wynik usługi, zanim opublikujemy wersję HeyGena (domyślnie 45)               |
| `VIDEO_RENDITION_TIMEOUT_MINUTES` | Opcjonalny; ile czekać na kompresję wideo, zanim ponowimy / wyślemy oryginał (domyślnie 120)           |
| `STUDIO_AI_BADGE`                 | Opcjonalny; `0` / `off` wyłącza znaczek „AI" w rogu rolek (domyślnie włączony)                         |
| `ELEVENLABS_API_KEY`              | Lektor TTS (już używany)                                                                               |
| `LOVABLE_API_KEY`                 | AI gateway: scenariusze, prompty, grafiki (już używany)                                                |

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
  `docs/youtube-shorts.md`); plik do 100 MB (limit bufora workera).
- **Post FB**: tekst, tekst+grafika (`/photos`), tekst+wideo (`/videos`).
- **TikTok**: MP4, pion 9:16, plik do 100 MB (limit bufora workera). Limit
  publikacji ~15/dobę na konto, więc tick wysyła **jeden post na przebieg**.
  Tytuł do 150 znaków. Wideo idzie metodą `FILE_UPLOAD` (nie `PULL_FROM_URL`),
  więc plik pobieramy z bucketu `studio-media` i wysyłamy chunkami.
  **Przed audytem aplikacji** w TikTok for Developers TikTok przyjmuje posty
  tylko na konto prywatne z widocznością „Tylko ja" — inaczej init zwraca
  `unaudited_client_can_only_post_to_private_accounts`. Ten błąd jest trwały:
  wpis od razu dostaje `failed` z polskim komunikatem (bez trzech prób,
  `classifyTiktokError` w `tiktok-upload.ts`). Rozwiązanie: audyt
  (`docs/tiktok-audyt-nagranie.md`) albo na czas testów prywatne konto
  i „Tylko ja".
- **X**: wideo do 64 MB (bufor workera), tylko MP4 H.264/AAC.

**Rozdział torów we wspólnej kolejce.** `social_publish_queue` obsługuje Meta,
TikToka i X. Każdy tor filtruje po **swoich** platformach — tor Meta po liście
`META_PLATFORMS`. Wcześniej filtr Meta wykluczał tylko TikToka, więc tick Meta
przejmował wpisy X, robił z nich (nieopublikowany) kontener Instagrama i wpis X
wisiał w „przetwarzanie…". Tick X sam odbija takie wpisy do kolejki
(`reclaimHijackedItems`), a „Ponów" czyści obcy `ig_creation_id` przy każdej
platformie innej niż Instagram — żeby ponowienie nie opublikowało tego
kontenera na IG.

**Facebook Reels — adres uploadu.** Plik idzie na adres `upload_url` z odpowiedzi
`upload_phase=start` (zapasowo `rupload.facebook.com/video-upload/v21.0/{id}`).
Wcześniej kod używał `/video-reels/…`, na co Meta odpowiadała
„Endpoint … doesn't exist" i każdy FB Reel kończył się błędem.

Te limity są pilnowane **automatycznie**: przed wysyłką na którąkolwiek
platformę wideo przechodzi przez kompresję do wspólnego profilu publikacji
(sekcja niżej). Ręcznie trzeba pilnować tylko **długości** materiału (Shorts
≤ 3 min, X ≤ 2:20 na koncie bez Premium, TikTok wg `max_video_post_duration_sec`
z `get_tiktok_creator_info`) — kompresja nie tnie treści.

## Kompresja wideo przed publikacją (`video_renditions`)

**Problem.** Każda platforma ma inne limity i wymagania, a do tego nasze
publikatory TikToka, YouTube'a i X-a buforują plik w pamięci workera
(Cloudflare: 128 MB), więc tną go na 100 MB / 100 MB / 64 MB. Filmy z biblioteki
materiałów bywają nagrane telefonem (MOV, HEVC, 4K, 60 kl./s, po kilkaset MB)
— publikacja kończyła się „Plik za duży" albo odrzuceniem po stronie
platformy (X i Reels nie przyjmują HEVC/MOV), i to dopiero w chwili wysyłki.

**Rozwiązanie.** Jeden **profil publikacji**, do którego usługa FFmpeg
(`services/caption-burner`, zadanie `transcode`) sprowadza każde wideo PRZED
wysyłką na jakąkolwiek platformę:

| Parametr        | Wartość                                            | Dlaczego                                                                                                      |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Kontener, kodek | MP4, H.264 High 4.1, yuv420p, `faststart`          | jedyny zestaw przyjmowany przez wszystkie cztery platformy                                                    |
| Rozdzielczość   | ≤ 1080 px krótszy bok (1080×1920 / 1920×1080)      | Reels/TikTok i tak skalują do 1080p                                                                           |
| Klatkaż         | ≤ 30 kl./s                                         | 60 kl./s podwaja rozmiar bez zysku na telefonie                                                               |
| Audio           | AAC-LC 128 kb/s, stereo, 48 kHz                    | wymóg X-a (≤ 48 kHz) i Reels                                                                                  |
| Rozmiar         | ≤ **60 MB**                                        | poniżej najciaśniejszego bufora (X: 64 MB) z zapasem                                                          |
| Bitrate         | z długości filmu: `60 MB × 8 / czas`, sufit 6 Mb/s | rolka 60 s → pełne 6 Mb/s; 3 min → ~2,6 Mb/s; dłuższe schodzą do 720p / 540p / 480p, żeby nie rozmazać obrazu |

Wartości siedzą w `VIDEO_RENDITION_TARGET` (`src/lib/video-rendition.ts`);
zmiana progów w dół = **nowa wersja profilu** (`VIDEO_RENDITION_PROFILE`),
żeby stare renditions nie były brane za dobre.

**Jak to działa.**

1. Wpis z wideo trafia do kolejki (Studio, „Publikuj" przy materiale, MCP
   `queue_social_publication` / `publish_marketing_material`, auto-publikacja
   HeyGena) → `requestVideoRendition(url)` zakłada wiersz `pending` w
   `video_renditions` (klucz: adres źródłowy + profil). Tani zapis, bez
   wołania usługi.
2. Tick `social-publish-tick` (co 10 min) w `runVideoRenditionTick()`:
   zakłada renditions dla wszystkich wpisów `pending` w obu kolejkach
   (także YouTube — plik ma być gotowy PRZED terminem), domyka zadania w toku
   (odpytanie usługi → zapis wyniku) i zleca nowe (2 na przebieg; usługa
   koduje jedno naraz).
3. Usługa robi `ffprobe`. Plik **zgodny z profilem** (typowa rolka z HeyGena
   po wypaleniu napisów) wraca jako `unchanged` — publikujemy oryginał,
   zero straty jakości. Inaczej koduje i **sama wgrywa wynik** na podpisany
   URL Storage (`createSignedUploadUrl`, bajty nie idą przez worker) do
   `studio-media/renditions/<profil>/<id>.mp4`; gdy upload jej nie wyjdzie,
   plik pobiera worker (wynik jest ≤ 60 MB, więc mieści się w pamięci).
4. Każdy publikator (YouTube `uploadShort`, TikTok `uploadVideo`, X
   `uploadMedia`, Meta: post z wideo / FB Reels / kontener IG) woła
   `ensurePublishableVideo(url)` **tuż przed pobraniem pliku**:
   - rendition gotowy → dostaje adres skompresowanego pliku (albo oryginał
     przy `unchanged`),
   - trwa albo dopiero zlecony → `VideoPreparingError`: wpis wraca do
     `pending` na 5 min z notatką „Wideo w przygotowaniu…" w `last_error`
     (panel pokazuje ją szarym, nie czerwonym; **próba nie jest zużywana**;
     nic nie poszło na platformę — przy FB Reels sprawdzenie jest przed
     `upload_phase=start`, więc nie zostaje otwarta sesja),
   - usługa nieskonfigurowana albo kompresja ostatecznie nieudana → oryginał,
     jak dotąd (i dotychczasowy komunikat „Plik za duży", jeśli przekracza
     bufor).
     „Publikuj teraz" w panelu i w MCP zwraca wtedy `preparing: true`
     (toast: „wideo jest kompresowane… wpis wyjdzie automatycznie").
5. Ten sam film na cztery platformy = **jedna** kompresja (deduplikacja po
   adresie źródłowym). Ponowna publikacja tego samego materiału używa
   gotowego renditionu.

**Odporność** (decyzje w `resolveVideoRendition`, testy w
`video-rendition.test.ts`): usługa nie odpowiada (uśpiony kontener) → czekamy
do limitu (`VIDEO_RENDITION_TIMEOUT_MINUTES`, domyślnie 120 — darmowy Render
koduje wolno); błąd usługi, zaginione zadanie (restart) albo przekroczony
czas → jedno ponowienie, potem `failed` i publikacja oryginału z powodem
w `last_error` renditionu; „Ponów" przy wpisie kolejki zeruje też próby
renditionu, więc po naprawie usługi kompresja rusza od nowa. Optymistyczne
przejęcie wiersza (`pending → processing`) chroni przed podwójnym zleceniem,
gdy tick i „Publikuj teraz" trafią na ten sam plik w tej samej chwili.

Diagnostyka: `run_publish_tick` (MCP) zwraca sekcję `renditions`
(`discovered / submitted / ready / failed / errors`), a `GET /health` usługi
mówi, czy ma `ffprobe`. Stan konkretnego pliku: tabela `video_renditions`
(`status`, `unchanged`, `output_url`, `last_error`).

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

   **Styl napisów — własne wypalanie.** HeyGen v3 przyjmuje w `caption.style`
   **wyłącznie `"default"`** (sprawdzone na żywym API: walidacja odpowiada
   „Input should be 'default'"), więc rozmiar, czcionka i pozycja napisów
   HeyGena nie są do ustawienia — wychodzą małe, nisko, w szarym pasku.
   Dlatego obok przełącznika jest **select „Styl napisów"**:
   - `HeyGen (domyślne)` — jak dotąd,
   - `Rolka — duże z obrysem`, `TikTok — wielkie litery, podświetlanie słów`,
     `Ramka — biały na ciemnym pasku`, `Delikatne — mniejsze u dołu` —
     **wypalane u nas**. Presety (rozmiar, kolory, obrys, pozycja, maks.
     znaków w wierszu, podświetlanie słowa) siedzą w `src/lib/caption-style.ts`;
     zmiana wyglądu to zmiana w tym pliku.

   Jak to działa: backend chodzi na Cloudflare Workers, gdzie nie ma FFmpega,
   więc obraz wypala mała usługa `services/caption-burner` (FFmpeg + libass,
   jeden plik, bez zależności). Stanie na darmowym planie Render.com
   (`render.yaml` w repo — Blueprint), na Koyebie, na własnym komputerze
   z Cloudflare Tunnel albo na Fly.io z usypianiem za grosze — zadania
   zapisuje na dysku, więc uśpienie i wybudzenie nic nie gubi; patrz
   `services/caption-burner/README.md`. Pipeline po
   zakończeniu renderu HeyGena bierze **czysty master** (`video_url`) i **plik
   SRT** (`caption_url`), z SRT buduje ASS w wybranym stylu (`srtToAss`:
   parser SRT odporny na BOM/CRLF/tagi, cięcie kwestii do maks. 1–2 wierszy
   po N znaków z czasem proporcjonalnym do liczby znaków, wyrównanie dwóch
   wierszy, opcjonalne wielkie litery i podświetlanie słowa — czasy słów też
   proporcjonalne, bo SRT nie zna czasów słów), wysyła zadanie do usługi
   i przechodzi w status **`captioning`**. Kolejne odpytanie (panel co 15 s,
   tick co 10 min) pobiera gotowy MP4, zapisuje go w buckecie `studio-media`
   (**trwały link** — linki HeyGena wygasają po ~7 dniach) i dopiero wtedy
   ustawia `ready` + auto-publikację. Czysty master zostaje w `video_url_clean`.

   Nic z tego nie blokuje generacji ani nie zostawia joba w zawieszeniu
   (`planCaptionBurn` / `resolveCaptionBurn` w `studio-captions.ts`, testy):
   brak sekretów usługi, brak SRT z HeyGena, błąd zlecenia → od razu napisy
   HeyGena z powodem w `last_error`; błąd usługi albo zaginione zadanie (restart)
   → jedno ponowienie, potem wersja HeyGena; brak wyniku po 45 min → wersja
   HeyGena. Panel pokazuje styl w badge'u („napisy: Rolka — duże z obrysem")
   i faktyczny stan, nie zamówiony. Kolumny: `caption_style`, `caption_burn_id`,
   `caption_burn_started_at`, `caption_burn_attempts`.

   **Zmiana napisów gotowego filmu** — w bibliotece przy gotowym wideo select
   „Zmień napisy…" (także `restyle_studio_job_captions` w MCP): czysty master
   - SRT lecą do usługi w nowym stylu, poprzedni plik zostaje do czasu sukcesu
     i wraca przy porażce. Nie publikuje ponownie. Działa dla filmów z ostatnich
     ~7 dni (potem linki HeyGena wygasają); dla starszych trzeba wygenerować
     rolkę od nowa.

   Pozostałe ścieżki HeyGena zamawiają świadomie `captions: "sidecar"`
   (nie wypalamy tego, czego nie publikujemy): FAQ awatara gra na stronie
   z dźwiękiem, a pipeline YouTube robi materiały 5–8 min, gdzie wypalone
   napisy przeszkadzają, a player YT ma własne.

   **Montaż rolki** — wybór obok napisów (domyślnie „pojedyncze ujęcie");
   pozostałe dwa tryby — „przebitki AI" i „struktura" (opisana niżej w sekcji
   „Struktura rolki") — renderują rolkę jako **sklejkę scen** zamiast jednego
   ujęcia gadającej głowy (`POST /v3/videos` z `type: "studio"`):
   1. scenariusz tniemy **deterministycznie po zdaniach** na maks. 6 segmentów
      (`splitScriptIntoSegments`) — AI nie dostaje tekstu do przepisania,
      więc lektor mówi dokładnie to, co zatwierdzono w panelu,
   2. AI (`planVideoScenes`) dostaje ponumerowane segmenty i wskazuje tylko,
      **które zilustrować** i jaką angielską frazą szukać w bibliotece,
   3. frazy idą do **banku b-rolli** (`resolveBrollImage`: najpierw własna
      biblioteka, potem stock — Pexels albo `GET /v3/assets/search`
      HeyGena — z preferencją grafik pionowych, bo kadr 9:16 docina resztę),
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

3. **B-rolle** — bank materiałów, z którego jadą przebitki
   (opis niżej: „Bank b-rolli").

4. **Grafiki AI** — prompt → grafika zapisana w Storage; „Do posta"
   podstawia ją do posta na Facebooku.
5. **Generator promptów** — temat + rodzaj (wideo / grafiki / posty) →
   lista promptów z przyciskami „Użyj" / kopiuj.

## Publikacja z biblioteki materiałów (/admin/materialy)

Wgrane grafiki i filmy z **Materiałów marketingowych** publikuje się bez
przepisywania URL-i do Studia: przy każdej karcie jest przycisk **„Publikuj"**,
który otwiera dialog z:

- wyborem platform (grafika → post na Facebooku / X; film → dodatkowo YouTube
  Short, Instagram i Facebook Reels, TikTok). Platformy niepołączone albo bez
  sekretów są wyszarzone — stan bierze z `getStudioStatus`;
- tytułem i treścią, podstawionymi z materiału (opis ręczny, a gdy go brak —
  opis AI) oraz przyciskiem **„Wygeneruj opis AI"** (`generateMaterialDescription`);
  checkbox „Zapisz tytuł i opis także w materiale" (domyślnie włączony)
  utrwala tekst w `marketing_materials`, żeby następna publikacja go podstawiła;
- terminem, widocznością YouTube i ekranem publikacji TikToka (ten sam
  komponent co w Studiu — wymogi audytu);
- trzema akcjami: **„Zapisz tylko opis"**, **„Dodaj do kolejki"** (cron co
  10 minut albo wybrany termin) i **„Publikuj teraz"** (wpis w kolejce
  i natychmiastowe przetworzenie każdej platformy, wynik osobnym toastem;
  nieudany wpis zostaje w kolejce z błędem — ponowienia jak zwykle w Studiu).

Bucket `marketing-materials` jest prywatny, a platformy pobierają plik dopiero
w chwili publikacji — dlatego serwer robi najpierw **publiczną kopię** w
`studio-media/marketing-materials/<id materiału>.<ext>` (Storage `copy` między
bucketami, bez przepuszczania pliku przez workera). Ścieżka jest
deterministyczna: ponowna publikacja używa tej samej kopii, a badge'e pod kartą
(„FB Reels: zaplanowany", „YouTube Short: opublikowany" z linkiem) powstają
z dopasowania wpisów kolejek po tym URL-u. Kopii nie usuwamy razem z materiałem
z biblioteki, żeby zaplanowany wpis nie stracił źródła.

Pliki: `src/lib/studio-platforms.ts` (etykiety i reguły platform, wspólne),
`src/lib/studio-enqueue.server.ts` (wstawianie do kolejek — wspólne ze
Studiem), `src/lib/marketing-material-publish.ts` (+ testy),
`src/lib/marketing-material-publish.server.ts` (kopia publiczna),
`src/lib/marketing-material-publish.functions.ts` (server functions),
`src/components/admin/material-publish-dialog.tsx` (dialog).

## Bank b-rolli (zakładka „B-rolle")

Do tej pory przebitki brały się wprost z wyszukiwarki stocku HeyGena. To trzy
problemy naraz: każdy przebieg oddaje co innego (rolki wychodzą niespójne),
raz znalezionej dobrej grafiki nie da się użyć drugi raz, a cudzy URL może
wygasnąć między planowaniem a renderem. Dlatego materiał trzymamy u siebie.

- **Co jest w banku** — `studio_broll_assets`, wyłącznie przebitki (`broll`)
  ilustrujące treść. Wizual hooki (efekciarskie ujęcia po pierwszym zdaniu)
  zostały usunięte z montażu, banku i panelu.
- **Skąd** — przycisk „Uzupełnij bank ze stocku" (startowy zestaw ok. 100
  tematów — nieruchomości, umowy i formalności, pieniądze, inwestowanie,
  biznes i ludzie — po `SEED_IMAGES_PER_QUERY` = 4 ujęcia na temat, czyli
  kilkaset przebitek do wyboru; Pexels, gdy jest `PEXELS_API_KEY`, inaczej
  biblioteka HeyGena). Seed idzie porcjami (`SEED_QUERIES_PER_CALL` tematów
  na wywołanie — limit żądań funkcji), a panel woła go w pętli, pokazując
  postęp na przycisku. Dalej: ręczne
  dodanie z publicznego URL-a, albo przycisk „do banku" przy grafice AI.
  **Każdy plik kopiujemy do bucketu `studio-media`** — HeyGen i Meta dostają
  trwały https, nie wygasający link stocku. Seed jest idempotentny (pomija
  frazy, które już są), a plik przyjmujemy tylko gdy to faktycznie obraz
  (`content-type: image/*`) do 15 MB.
- **Jak render dobiera materiał** (`resolveBrollImage` — jedyne wejście):
  najpierw bank (pokrycie słów frazy przez tagi/tytuł/frazę źródłową, próg
  0,34; przy remisie pion przed kwadratem, potem najdawniej użyte), potem
  stock — a to, co stock oddał, **od razu wpada do banku**. Bank sam się więc
  zapełnia w trakcie normalnej pracy. Gdy fraza nic nie znajdzie, lepszy jest
  najdawniej użyty materiał z banku (jest tematyczny) niż dziura w montażu.
- **Rotacja** — użycie odnotowujemy dopiero, gdy render faktycznie ruszył
  (`use_count`, `last_used_at`), żeby nieudana próba nie przesuwała kolejki.
  W jednej rolce ten sam plik nie wystąpi dwa razy.
- **Wyłączanie zamiast kasowania** — przełącznik „oko" zdejmuje materiał
  z doboru, ale zostawia go w bibliotece (`active = false`).

## Domyślne awatary (przycisk „Ustaw jako domyślne")

W siatce awatarów każda kafelka ma gwiazdkę: klikanie buduje zestaw
(numer na gwiazdce = miejsce w rotacji), a przycisk **„Ustaw jako domyślne"**
zapisuje go na stałe do `studio_default_avatars`. Zestaw zastępowany jest
w całości — „domyślne" to dokładnie to, co widać w panelu.

Zestaw obowiązuje wszystkie tory generacji, nie tylko otwarty panel. Zestaw
to **pula**, a nie lista twarzy jednej rolki: rolkę prowadzi awatar wybrany
w formularzu, a partnerów (domyślnie jeden — **2 twarze w rolce**,
`AVATARS_PER_REEL`; pole „Twarze w rolce", maks. 6) dobiera `reelRotations`
z puli rotacyjnie — twarz najdawniej użyta w ostatnich 50 rolkach z montażem
wchodzi pierwsza, a w serii wsadowej każda rolka dostaje kolejnego partnera.
Wynik zapisujemy w `studio_video_jobs.avatar_ids`; job z kolejki bez zapisanej
rotacji dostaje prowadzącego + partnera z aktualnego zestawu w chwili renderu.

Domyślny montaż w panelu, serii, cronie i MCP to **struktura rolki z przebitkami
b-roll** (poniżej); pojedyncze ujęcie trzeba wybrać świadomie.

Konektor MCP czyta ten sam zapis: `heygen_status` i `list_heygen_avatars`
pokazują zestaw (`default_avatars`, a w katalogu `is_default` /
`default_position` — 1 = prowadzi rolkę), a `create_studio_video_job` bez
`avatar_id` / `avatar_ids` bierze z niego prowadzącego i partnera dobieranego
rotacyjnie po ostatnich rolkach (`reelRotations`: najdawniej użyty pierwszy;
domyślnie 2 twarze, `avatars_per_reel`). Montaż z MCP domyślnie idzie strukturą
rolki z przebitkami b-roll (`reel_structure=false` wyłącza). Czat nie musi więc
zgadywać domyślnych awatarów po nazwie.

## Struktura rolki (montaż: ujęcie → b-roll → a-roll)

Pole **„Montaż rolki"** w zakładce „Wideo AI" ma trzy tryby:

1. **Pojedyncze ujęcie** — gadająca głowa (trzeba wybrać ręcznie).
2. **Przebitki — miejsca cięć wskazuje AI** (`applyScenePlan`) — dotychczasowe
   urozmaicenie, tylko materiał leci teraz z banku.
3. **Struktura** (`planReelStructure`, kolumna `reel_structure`) — **domyślna**;
   stały, deterministyczny rytm:

   | scena | co widać                                                        |
   | ----- | --------------------------------------------------------------- |
   | 0     | ujęcie z pierwszym domyślnym awatarem (hook mówi twarz)         |
   | 1     | **b-roll** — przebitka ilustrująca treść                        |
   | 2     | **a-roll drugiej twarzy rolki** (partner z rotacji)             |
   | …     | cykl się powtarza; ostatnia scena (CTA) zawsze wraca na awatara |

   AI nie decyduje już **gdzie** ciąć — dostaje tylko indeksy przebitek
   i oddaje frazę wyszukiwania dla każdej (`planBrollQueries`). Lektor gra
   przez przebitki dalej, a tekst dzielony jest deterministycznie po zdaniach,
   więc mówi dokładnie to, co zatwierdzono w panelu.

Każda scena niesie awatara, który ją przejmie, **gdy grafiki zabraknie** — awaria
przebitki nie wybija rotacji z rytmu, tylko wraca na twarz. Gdy nie uda się
zdobyć ani jednej grafiki, rolka wychodzi jako pojedyncze ujęcie z powodem
w `last_error`. Przy jednym domyślnym awatarze struktura nadal tnie — po prostu
bez zmiany twarzy (panel o tym mówi). Plan faktycznie wysłany na render
zapisujemy w `scene_plan`, a biblioteka pokazuje go jako
„4 ujęcia z awatarem + 2 przebitki (3 awatary)". Stare plany ze scenami
`hook` (sprzed usunięcia wizual hooków) liczą się tam po prostu jako przebitki.

## Znaczek „AI" w rogu rolki

Każda rolka Studia dostaje w prawym górnym rogu mały znaczek **„AI"**
(półprzezroczysta pigułka z białym napisem, 64×36 px w kadrze 720×1280,
140 px od góry — poniżej ikonek aplikacji, powyżej przycisków polubień).
Znaczek jest częścią pliku ASS, który wypala usługa `caption-burner`
(`aiBadgeEvents` / `aiBadgeAss` w `src/lib/caption-style.ts`), więc sama
usługa nie wymaga zmian. HeyGen nie ma warstw, na których dałoby się go położyć.

Jak trafia na film (`settleHeygenCompletion`):

- **napisy własne** (reels / tiktok / box / minimal) — znaczek jedzie tym samym
  przebiegiem co napisy, bez dodatkowego kosztu;
- **napisy HeyGena albo bez napisów** — po renderze (i karencji na wersję
  z napisami) plik HeyGena idzie do usługi jeszcze raz, tylko po znaczek
  (`planBadgeBurn`, status „captioning"; `caption_style` zostaje `heygen`);
- **porażka** (usługa nie odpowiada, błąd FFmpega, limit czasu) — jedno
  ponowienie, potem publikacja pliku HeyGena bez znaczka z adnotacją
  „Znaczek AI nieudany…" w `last_error`; brak usługi = „Znaczek AI pominięty…".

Zmiana napisów gotowego filmu (`restyle_studio_job_captions`) też dokłada
znaczek; `video_url_clean` zostaje czystym masterem bez znaczka, żeby nowe
wypalenie nie dołożyło drugiego. Filmy gotowe przed wdrożeniem znaczka go nie
mają. Stan: `heygen_status` → `ai_badge` (MCP) i podpowiedź przy napisach
w panelu.

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
