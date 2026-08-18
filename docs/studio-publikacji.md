# Studio publikacji — multi-platformowa publikacja + generatory AI

Jedno miejsce (panel **/admin/studio-publikacji**) do:

1. **Publikacji wideo** na YouTube (Shorts), Instagram Reels, Facebook Reels
   i postów na Facebooku (tekst / grafika / wideo) — z jednego formularza,
   z harmonogramem i kolejką.
2. **Generowania wideo HeyGen z promptu** — prompt → scenariusz AI →
   lektor ElevenLabs → awatar HeyGen (pion 9:16).
3. **Generatora promptów** — pomysły na wideo, grafiki i posty social.
4. **Generatora grafik z promptu** — Lovable AI gateway
   (`google/gemini-2.5-flash-image`), zapis do Supabase Storage z trwałym
   publicznym URL.

## Architektura

| Element                                   | Plik                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Publikacja Meta (Graph API)               | `src/lib/studio-publishing.server.ts`                                                    |
| Klasyfikacja błędów Meta + backoff        | `src/lib/meta-graph-errors.ts` (+ testy `meta-graph-errors.test.ts`)                     |
| Helpery AI (scenariusz, prompty, grafiki) | `src/lib/studio-ai.server.ts`                                                            |
| Server functions                          | `src/lib/studio.functions.ts`                                                            |
| Baza 250 pytań do shortów (generowana)    | `src/lib/shorts-question-bank.ts`                                                        |
| Źródło bazy pytań + generator             | `docs/shorts/pozyczki-prywatne-250-pytan.md`, `scripts/generate-shorts-question-bank.ts` |
| Cron tick Meta                            | `src/routes/api/public/hooks/social-publish-tick.ts`                                     |
| Panel admina                              | `src/routes/admin.studio-publikacji.tsx`                                                 |
| Migracja (tabele + bucket + cron)         | `supabase/migrations/20260803130000_studio_publikacji.sql`                               |

Tabele:

- `social_publish_queue` — kolejka publikacji Meta (`facebook_post`,
  `facebook_reels`, `instagram_reels`). Statusy: `pending → publishing →
(processing) → published`; `failed` po 3 **realnych** próbach; `cancelled`
  ręcznie. Instagram publikuje się dwuetapowo: tick tworzy kontener mediów
  (status `processing`, znacznik czasu w `ig_container_at`), a po zakończeniu
  transkodowania po stronie Meta kolejny tick woła `media_publish`.
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

| Sekret                   | Do czego                                                 |
| ------------------------ | -------------------------------------------------------- |
| `META_PAGE_ID`           | ID strony FB, na którą publikujemy                       |
| `META_PAGE_ACCESS_TOKEN` | Token strony (fallback: `META_ACCESS_TOKEN`)             |
| `META_IG_USER_ID`        | ID konta Instagram **Business** powiązanego ze stroną    |
| `HEYGEN_API_KEY`         | Generowanie wideo awatara (już używany przez Awatar FAQ) |
| `HEYGEN_CAPTION_STYLE`   | Opcjonalny styl napisów HeyGen (domyślnie `default`)     |
| `ELEVENLABS_API_KEY`     | Lektor TTS (już używany)                                 |
| `LOVABLE_API_KEY`        | AI gateway: scenariusze, prompty, grafiki (już używany)  |

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
