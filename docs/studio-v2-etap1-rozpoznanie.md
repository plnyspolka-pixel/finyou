# Studio publikacji v2 (ElevenLabs) — Etap 1: rozpoznanie

Data: 2026-09-25. Zakres: **wyłącznie rozpoznanie**, bez zmian w produkcji
(żadnej migracji, żadnej zmiany w kodzie ścieżek publikacji).

Cel etapu: ustalić stan klucza i planu ElevenLabs, wykonać po jednym wywołaniu
testowym, policzyć koszty, odpowiedzieć na pytania (a)(b)(c) i zarekomendować,
czy skład końcowy idzie przez Flows, czy przez własnego workera.

---

## 1. Wynik jednym zdaniem

Głos, muzyka, SFX i **alignment znakowy dla polszczyzny działają dziś, tym
kluczem**. Cała warstwa obrazu ElevenLabs (Image & Video, Flows, Templates,
Assets, lip-sync) jest **zablokowana brakiem uprawnienia klucza**, a planu i
zużycia kredytów **nie da się odczytać** z tego samego powodu. Skład końcowy
i tak powinien iść przez **własnego workera** — i to nie jest wniosek z braku
uprawnień, tylko z konstrukcji API (sekcja 5).

## 2. Klucz ElevenLabs — stan faktyczny (bloker)

Klucz jest skonfigurowany i działa, ale brakuje mu dwóch uprawnień:

| Uprawnienie | Stan | Co przez to nie działa |
| --- | --- | --- |
| `user_read` | **BRAK** | `GET /v1/user/subscription` → 401. Nie znamy planu, limitu kredytów ani zużycia. `eleven_status` raportuje `subscription: null` z tym błędem. |
| `image_video_generation` | **BRAK** | `/v1/flows/video`, `/v1/flows/image`, `/v1/flows/templates`, `/v1/assets` → 401. Czyli: przebitki, lip-sync (tryb A), Templates/Flows, wgrywanie assetów. |
| `text_to_speech` | jest | TTS i TTS with-timestamps działają. |
| `music_generation` | jest | `POST /v1/music` działa. |
| `sound_effects` | jest | `POST /v1/sound-generation` działa. |

Zgodnie z sekcją 11 promptu („Nie obchodź braku uprawnień klucza ElevenLabs —
zgłoś") **nie obchodzę tego**. Do naprawy po stronie człowieka: w panelu
ElevenLabs edytować klucz (albo wydać nowy) z zakresami `user_read` +
`image_video_generation`. Uwaga: **Image & Video API jest dostępne od planu Pro
w górę** — jeśli konto jest niżej, samo uprawnienie nie wystarczy.

## 3. Testy wykonane (i ich artefakty)

### 3.1 TTS with-timestamps — DZIAŁA, alignment znakowy trzyma polskie znaki

`POST /v1/text-to-speech/9STbwZjpEbcYG88ZekIQ/with-timestamps`
(`eleven_multilingual_v2`, stability 0.5, similarity_boost 0.75, style 0.2,
speed 1.05).

Odpowiedź zawiera `audio_base64`, `alignment`, `normalized_alignment`,
`quality_check`. `alignment` jest **per znak**, z polskimi diakrytykami jako
osobnymi pozycjami (`"ś"` to jeden element, nie rozbity bajt) — to wystarcza
do budowania bloków ASS z dokładnością wymaganą przez kanon
(`sync_tolerance_ms: 50`).

**Znalezisko krytyczne dla generatora napisów.** Znaczniki SSML zostają w
tablicy `alignment.characters` jako osobne znaki o **zerowym czasie trwania**,
sklejone do momentu końca pauzy. Fragment `Tutaj <break time="0.4s"/>
czterdzieści cztery.` dał:

- ostatni znak słowa „Tutaj" kończy się na `0.325 s`,
- wszystkie 20 znaków `<break time="0.4s"/>` ma start = koniec = `0.824 s`,
- pierwszy znak „czterdzieści" startuje `0.824 s`.

Czyli: realna pauza to **0.499 s przy zamówionych 0.4 s**, a indeksy w
`alignment` **nie są zgodne z indeksami w `script_captions`**. Wniosek do
Etapu 3/5: bloki napisów budujemy na `normalized_alignment` (tam tag jest
zredukowany do jednego `.`) albo mapujemy indeksy przez usunięcie zakresów
zerowej długości — nigdy „znak w znak" z tekstem TTS. Kanon i tak zakłada
dwa różne teksty (`script_tts` ≠ `script_captions`), więc i tak potrzebne jest
dopasowanie słowo-do-słowa, a nie znak-do-znaku.

Drugie znalezisko: przy dłuższym tekście odpowiedź `with-timestamps` jest duża
(base64 audio + trzy tablice na znak). Dla ~35 s rolki to kilkaset kB JSON-a.
Worker/funkcja musi to strumieniować albo zapisywać od razu do Storage, a nie
trzymać w pamięci razem z resztą joba.

### 3.2 TTS pełnego skryptu testowego (sekcja 10 promptu) — DZIAŁA

Skrypt LTV dla inwestora, głos Filip (`9STbwZjpEbcYG88ZekIQ`), speed 1.05:

- **575 znaków** rozliczanych,
- plik: `mcp/tts/2026-09/etap1-test-ltv-investor-1fbe5fea.mp3`, 524 164 B,
  `mp3_44100_128` → **≈ 32.8 s** głosu.

To mieści się w kanonie (`duration_s: 25–40`) i daje realny punkt odniesienia:
**jedno pytanie ≈ 575 znaków ≈ 33 s**. Tempo wypada ~150 słów/min, czyli w
dolnej granicy `speech_rate_wpm: [150, 170]` — przy `speed: 1.05` można zostać,
ale warto to zweryfikować na kilku skryptach w Etapie 3.

### 3.3 Muzyka — DZIAŁA

`compose_music`, prompt z kanonu (`minimal corporate underscore, 95 BPM, no
vocals, no drums in first 2 seconds, warm piano and soft pad, confident`),
38 s (reguła „głos + 3 s" dla 32.8 s → 36 s; wzięto 38 s).

Plik: `mcp/music/2026-09/minimal-corporate-underscore-41036972.mp3`, 609 011 B.

### 3.4 SFX — DZIAŁA

`generate_sound_effect`, whoosh, 0.5 s → `mcp/sfx/2026-09/short-clean-whoosh-transition-446b882e.mp3`,
8 821 B. Uwaga: API ma **minimum 0.5 s**, a kanon chce `whoosh_80ms` i
`click_40ms`. Te dwa trzeba **dociąć w składzie** (worker) — generujemy 0.5 s
i wycinamy początek, albo prosimy o „very short" i przycinamy. Nie jest to
problem, ale to kolejny argument za workerem z ffmpeg.

### 3.5 Wideo 9:16 5 s — NIE WYKONANE (401)

`POST /v1/flows/video` zwraca 401 `missing the permission
image_video_generation`. Nie obchodzę. Bez tego nie ma przebitek z ElevenLabs
ani trybu A awatara.

### 3.6 Lip-sync na 10 s nagraniu — NIE WYKONANE (dwie przeszkody)

1. To samo 401 (`image_video_generation`).
2. **Nie ma nagrania bazowego Filipa.** Konto HeyGen ma 8 140 „moich" awatarów,
   ale wszystkie istotne to **talking photos** (zdjęcia), nie klipy wideo.
   Istniejące `studio_video_jobs.video_url_clean` to już wyrenderowane wideo
   HeyGena, nie materiał źródłowy.

Czyli „tryb A: lip-sync na nagraniu bazowym Filipa" dziś **nie ma wejścia**.
Realny wariant A to lip-sync **ze zdjęcia** (image + audio), co modele
ElevenLabs obsługują — ale to inna jakość ruchu niż z nagrania i trzeba to
zobaczyć, zanim wpiszemy do kanonu.

## 4. Koszty — czego NIE dowiozłem i dlaczego

Kosztów w kredytach **nie da się dziś zmierzyć**: `GET /v1/user/subscription`
to dokładnie ten endpoint, który blokuje brak `user_read`. Dodatkowo
`elevenlabs.io` jest **odcięte przez politykę sieciową środowiska**, więc nie
mogłem odczytać oficjalnego cennika ani dokumentacji bezpośrednio (szedłem
przez wyszukiwarkę).

Co da się podać twardo, bo zmierzone na naszych wywołaniach:

| Pozycja | Miara na 1 rolkę (1 wariant hooka) |
| --- | --- |
| TTS | **575 znaków** (`character_cost_multiplier = 1` dla `eleven_multilingual_v2`, z `/v1/models`) |
| Muzyka | **38 s** |
| SFX | 4 pliki × 0.5 s, **generowane raz na cały kanon**, nie per rolka |
| Przebitki | 3–5 × 3–5 s wideo → **nieznane**, endpoint zablokowany |
| Awatar | tryb B (HeyGen): ~33 s renderu |

Para A/B to **2 × TTS + 2 × muzyka + 2 × przebitki + 2 × awatar**, czyli ok.
**1 150 znaków TTS i ~76 s muzyki na temat**. Przy 250 pytaniach to rząd
**~290 tys. znaków TTS** i **~5.3 h muzyki** — to liczba, którą trzeba
skonfrontować z planem, gdy `user_read` wróci.

Kredyty HeyGen (tryb B) są znane: **5 536 pozostałych ≈ 92 min renderu**,
czyli ~165 rolek po 33 s. Na parę A/B z 250 pytań (500 rolek × 33 s ≈ 275 min)
**to nie wystarczy** — trzeba albo doładować HeyGen, albo postawić tryb A.

## 5. Odpowiedzi na pytania (a)(b)(c) z sekcji 0

### (a) Czy węzeł kompozycji Flows daje pikselową kontrolę napisów? **NIE.**

Rozbicie na trzy fakty:

1. `POST /v1/flows/video` to endpoint **generatywny**, nie montażowy: bierze
   `model_id` (np. `creatify-aurora`), media jako `inline_base64` (obraz +
   audio) i `size` mapowany na **480p/720p**. Zwraca `generation_id`,
   status przez `GET /v1/flows/video/{generation_id}` (`pending`/`generating`/
   `completed`/`failed`), opcjonalnie webhook `flows_generation`.
2. „Composition node" jest węzłem **kanwy Flows w UI** — warstwuje audio/wideo
   do podglądu. Napisy i precyzyjne cięcia to według dokumentacji domena
   **Studio** (liniowa oś czasu ze ścieżką napisów), a **Studio nie ma
   programowego uruchamiania** — jest zapowiedziane „w przyszłym wydaniu".
3. Templates API (`POST /v1/flows/templates/{template_id}/runs`, `inputs`
   per port wejściowy, `version_id`, webhook `flows_template_run`) uruchamia
   **szablon zbudowany wcześniej ręcznie w kanwie**. Kontrola sprowadza się do
   wartości portów wejściowych — nie ma tam `baseline_y`, obrysu w px, opacity
   boxa ani `\pos`. Kanon `captions` (sekcja 4 promptu) jest w całości
   niewyrażalny w tym interfejsie.

Do tego: 720p sufit modelu Aurora stoi w sprzeczności z `export.resolution
[1080, 1920]` — przebitki z Flows trzeba by skalować w górę, a master awatara
i tak nie może z tego pochodzić.

### (b) Czy lip-sync ElevenLabs trzyma polskie głoski na nagraniu Filipa? **NIEROZSTRZYGNIĘTE.**

Nie da się sprawdzić: 401 na `image_video_generation` **i** brak nagrania
bazowego (sekcja 3.6). Nie zakładam odpowiedzi.

Co wiem o polu wyboru, gdy uprawnienie wróci: Aurora (najszybsza i najtańsza,
**sufit 720p**), OmniHuman 1.5 (~30 s, limit z długości audio), WAN 2.6
(do 1080p, mocniejszy ruch), Sync 3 (do 4K). Dla rolki 33 s przy 1080×1920
realne są **WAN 2.6 lub Sync 3**; Aurora wypada na rozdzielczości, OmniHuman
ociera się o limit długości.

### (c) Plan ElevenLabs i koszty? **NIEROZSTRZYGNIĘTE.**

`user_read` blokuje odczyt planu i zużycia. Pośrednia przesłanka: skoro
`image_video_generation` zwraca „brak uprawnienia", a nie „brak planu", nie
wiemy nawet, czy konto jest na Pro (wymaganym dla Image & Video). To pytanie
do rozstrzygnięcia w panelu ElevenLabs, nie z API.

## 6. Rekomendacja składu końcowego: **własny worker**, nie Flows

Rekomenduję **compose przez własnego workera z ffmpeg**, a Flows/Templates
**wyłącznie jako generator materiału** (przebitki, ewentualnie lip-sync), gdy
uprawnienie wróci. Powody, w kolejności wagi:

1. Flows nie ma pikselowej kontroli napisów (sekcja 5a), a kanon `captions`
   jest w całości o pikselach. Warunek z promptu „alternatywa, jeśli w Etapie 1
   okaże się, że węzeł kompozycji Flows spełnia spec napisów" **nie jest
   spełniony**.
2. QA z sekcji 7.6 (pierwsza klatka nie czarna, każdy blok w `safe_zone`,
   LUFS ±1, liczba cięć w widełkach) wymaga **inspekcji własnego pliku**.
   Czarna skrzynka Flows tego nie odda.
3. Sufit 720p Aurory i minimum 0.5 s w SFX i tak wymuszają przeskalowanie i
   docięcie po naszej stronie.
4. Templates wymagają ręcznie zbudowanego szablonu w kanwie — to konfiguracja
   poza repo, niewersjonowana, sprzeczna z „kanon jest konfiguracją w jednej
   tabeli".

### Gdzie ten worker ma stać — korekta założenia z promptu

Prompt mówi „domyślnie: AWS Lambda z warstwą ffmpeg w `eu-central-1` (mamy tam
już Bedrock)". **W tym repo nie ma ani jednego odwołania do AWS ani Bedrock** —
`grep -ri bedrock` i `AWS_*` nie zwracają nic. Realny stan:

- aplikacja to **TanStack Start na Cloudflare Workers** (`wrangler.jsonc`,
  `main: src/server.ts`), nie Supabase Edge Functions,
- Supabase Edge Functions są tylko trzy (`didit-webhook`, `rcn-proxy`,
  `tpay-proxy`) i Studio z nich nie korzysta,
- LLM idzie przez **Lovable AI gateway** (`ai.gateway.lovable.dev`),
- cron to **pg_cron → `/api/public/hooks/*`** z `x-cron-secret`
  (`requireCronSecret`), tick Studia co 10 min.

Cloudflare Workers nie uruchomią ffmpeg (brak binariów natywnych, limity CPU).
Więc worker musi być osobnym kontenerem. Propozycja do decyzji:
**kontener z ffmpeg na Google Cloud Run w `europe-central2` (Warszawa)** —
skalowanie do zera, region w EU, wywoływany z server function przez HTTPS,
wynik do bucketu `studio-media`. Alternatywy: Fly.io (region `waw`),
Cloudflare Containers. AWS Lambda pozostaje możliwa, ale wymagałaby **założenia
konta AWS od zera** — nie ma go w projekcie.

Uwaga na marginesie: do sesji podłączony jest MCP **Descript** (montaż wideo
z API). Nie rekomenduję go do składu — brak deterministycznej kontroli
pozycji napisów w px — ale jest realnym awaryjnym kanałem, gdyby worker się
opóźnił.

## 7. Ustalone ścieżki API ElevenLabs (do zapisania w Etapie 2)

Sprawdzone metodą 401 vs 404 vs 405 — 401 oznacza, że trasa istnieje i tylko
uprawnienie blokuje.

| Klucz z promptu | Wartość ustalona | Jak potwierdzone |
| --- | --- | --- |
| `eleven_video_create_path` | `POST /v1/flows/video` | 401 na uprawnienie (trasa istnieje) |
| `eleven_video_status_path` | `GET /v1/flows/video/{generation_id}` | 401 na `/v1/flows/video/test-id-123` |
| `eleven_video_id_field` | `generation_id` | dokumentacja Image & Video |
| `eleven_template_id` | — | do uzupełnienia po zbudowaniu szablonu w kanwie; run: `POST /v1/flows/templates/{template_id}/runs` |
| obrazy | `POST /v1/flows/image` | 401 na uprawnienie |
| assets | `/v1/assets` | 401 na uprawnienie |
| webhook | zdarzenia `flows_generation`, `flows_template_run` | dokumentacja |

Ścieżki, które **działają dziś**: `/v1/models` (GET),
`/v1/text-to-speech/{voice_id}/with-timestamps` (POST), `/v1/music` (POST),
`/v1/sound-generation` (POST), `/v1/forced-alignment` (POST — istnieje,
405 na GET).

`/v1/forced-alignment` to **nieoczekiwanie ważne znalezisko**: pozwala
dopasować dowolne audio do tekstu i **nie wymaga** `image_video_generation`.
Daje fallback alignmentu dla materiału, który nie wyszedł z naszego TTS
(np. master z HeyGena) — wpisuję do planu Etapu 5 jako zapas dla generatora ASS.

Gdzie to zapisać: **tabela `studio_settings` nie istnieje.** Istnieje
`integration_settings` (`integration_name`, `configuration jsonb`,
`is_enabled`, `status`, `webhook_url`, `last_error`) — to naturalne miejsce na
te klucze i nie wymaga nowej tabeli. Do decyzji w Etapie 2.

## 8. Rozbieżności prompt ↔ repo (do rozstrzygnięcia przed Etapem 2)

Nie poprawiam ich samodzielnie, bo każda zmienia zakres migracji:

1. **Edge Functions vs server functions.** Prompt planuje `studio-script`,
   `studio-eleven-webhook` jako Edge Functions (Deno). W repo cała logika
   Studia to `src/lib/studio-*.server.ts` + `src/routes/api/public/hooks/*`.
   Proponuję zostać przy konwencji repo (server functions + hook route dla
   webhooka ElevenLabs), bo inaczej rozjeżdżamy projekt na dwa runtime'y.
2. **`studio_jobs` nie istnieje.** Istniejąca tabela to `studio_video_jobs`
   (kolumny: `prompt`, `script`, `avatar_id`, `voice_id`, `heygen_video_id`,
   `status`, `video_url`, `video_url_clean`, `captions`, `subtitle_url`,
   `scene_plan`, `auto_publish_*`, `caption_wait_since`). „Rozszerz istniejącą"
   znaczy więc: rozszerzyć `studio_video_jobs`, a jej `status` to **`text`, nie
   enum** — maszyna stanów z sekcji 2 wymaga albo nowego enuma z migracją
   danych, albo CHECK-a. Stare 9 jobów dostaje `canon_version = 0`,
   `avatar_mode = heygen` (zgodnie z sekcją 11).
3. **Bank pytań to nie tabela.** 250 pytań (faktycznie 253 wpisy) siedzi
   w generowanym pliku `src/lib/shorts-question-bank.ts` (źródło:
   `docs/shorts/pozyczki-prywatne-250-pytan.md`). `question_id int (FK do banku
   pytań)` nie ma do czego się dowiązać — albo zostaje `int` bez FK, albo
   bank trafia do tabeli. Kategorie w banku to `klient`/`inwestor`, czyli
   `audience` = `borrower`/`investor` po zmapowaniu.
4. **Brak AWS/Bedrock** — sekcja 6 powyżej.
5. **`studio_settings` nie istnieje** — sekcja 7 powyżej.

## 9. Usterka zastana przy okazji (nie naprawiam bez zgody)

`studio_video_jobs.video_url_clean` przechowuje **wygasające linki HeyGena**
(`files2.heygen.ai/...?Expires=1788826161&Signature=...`). Ten znacznik czasu
minął na początku września 2026 — czyste mastery istniejących jobów są dziś
**martwymi linkami**. Prompt w sekcji 6 wymaga „kopiuj do Storage
natychmiast"; dotyczy to nie tylko nowej ścieżki, ale i tej działającej.
Do naprawy w Etapie 4, gdzie i tak dotykamy kopiowania do Storage.

## 10. Lista niewiadomych po Etapie 1

1. Plan ElevenLabs i zużycie kredytów — zablokowane przez `user_read`.
2. Koszt sekundy wideo i przebitki — zablokowane przez `image_video_generation`.
3. Jakość lip-syncu na polskich głoskach — zablokowane podwójnie (uprawnienie
   + brak nagrania bazowego). **Czy Filip nagra 30–60 s materiału bazowego
   (statyczne ujęcie, patrzenie w kamerę), czy tryb A robimy ze zdjęcia?**
4. Który model lip-sync — WAN 2.6 czy Sync 3 (Aurora nie wyrobi 1080p).
5. Czy stawiamy worker na Cloud Run (Warszawa), Fly.io, Cloudflare Containers,
   czy zakładamy konto AWS. Decyzja infrastrukturalna, nie moja.
6. Czy `studio_settings` powstaje jako nowa tabela, czy klucze idą do
   `integration_settings.configuration`.
7. Czy bank 250 pytań migrujemy do tabeli (potrzebne dla FK i dla
   `pair_id`/`variant` po stronie bazy).
8. Kredyty HeyGen: 92 min zostało, para A/B z 250 pytań potrzebuje ~275 min.
   Doładowanie czy tryb A?
9. `elevenlabs.io` jest odcięte przez politykę sieciową tego środowiska —
   do dalszej pracy z dokumentacją API trzeba dodać tę domenę do dozwolonych.

## 11. Czego potrzebuję, żeby ruszyć Etap 2

Etap 2 (migracje, RLS, `transition`, audyt, seed kanonu v1) da się zacząć
**bez** odblokowania ElevenLabs — nie dotyka API. Potrzebuję tylko decyzji
z punktów 6 i 7 listy niewiadomych oraz akceptacji rozbieżności z sekcji 8.

Etap 4 (obraz) jest **twardo zablokowany** do momentu naprawy uprawnień klucza
i rozstrzygnięcia sprawy nagrania bazowego.

---

Źródła dokumentacji ElevenLabs użyte w tym raporcie (czytane przez wyszukiwarkę,
bo domena jest odcięta w tym środowisku):
`docs/api-reference/flows/video/create`, `docs/api-reference/flows/video/get`,
`docs/api-reference/flows/templates/runs/create`,
`docs/eleven-api/guides/how-to/image-and-video/webhooks`,
`docs/eleven-creative/products/flows`, `docs/eleven-creative/products/studio`,
`blog/introducing-the-image-video-and-templates-apis`.
