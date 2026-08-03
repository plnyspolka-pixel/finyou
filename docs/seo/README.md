# System SEO financeyou.pl (moduły 1–5)

Zautomatyzowany system SEO zbudowany według promptu „System SEO financeyou.pl".
Strategia: własne dane i assety na własnej domenie (dane GUS/TERYT z modułu
scoringu lokalizacyjnego), NIE manipulacja linkami.

Repo serwuje stronę publiczną przez **TanStack Start SSR** (Cloudflare) — loadery
wykonują się na serwerze, robot dostaje pełny HTML z meta i JSON-LD bez JS.
Dlatego podstrony lokalizacyjne są zwykłymi route'ami SSR (nie SSG); „Edge
Functions" z promptu są zaimplementowane zgodnie z konwencją repo jako server
routes `/api/public/hooks/*` wywoływane przez pg_cron (`net.http_post`).

## Mapa modułów

| Moduł | Co robi | Kluczowe pliki |
| --- | --- | --- |
| 1. Programmatic SEO | Podstrony `/pozyczki/[miasto]` z danych GUS | `src/lib/seo-location/{core,server}.ts`, `src/routes/pozyczki.*`, migracja `20260803150000` |
| 2. Techniczne SEO | sitemap, robots, schema.org, canonicale, ping | `src/lib/seo/*`, `src/routes/sitemap[.]xml.ts`, `public/robots.txt` |
| 3. Linkowalne assety | `/kalkulator-ltv`, `/raport-lokalizacje` | `src/routes/kalkulator-ltv.tsx`, `src/routes/raport-lokalizacje.tsx`, migracja `20260803153000` |
| 4. Digital PR | monitoring RSS → draft AI → ręczna wysyłka | `src/lib/pr/*`, `src/lib/pr.functions.ts`, `src/routes/admin.pr-media.tsx`, migracja `20260803160000` |
| 5. Pipeline YouTube | artykuł → scenariusz → render → upload → embed | `src/lib/video-pipeline/*`, `src/routes/admin.video-pipeline.tsx`, migracja `20260803170000` |

## Crony (pg_cron → `net.http_post` z nagłówkiem `apikey`)

| Job | Harmonogram | Endpoint | Działanie |
| --- | --- | --- | --- |
| `seo-location-publish-tick` | pon. 06:00 UTC | `/api/public/hooks/seo-location-publish-tick` | publikuje ~10 najstarszych draftów podstron + ping sitemapy |
| `pr-monitor-tick` | co 6 h | `/api/public/hooks/pr-monitor-tick` | Google News RSS dla fraz + feedy z `PR_MONITOR_FEEDS`, dedupe, insert `new` |
| `video-pipeline-tick` | co godzinę (:30) | `/api/public/hooks/video-pipeline-tick` | poll renderów HeyGen, opcjonalny auto-upload (za flagą), sync publikacji + embed |

Hook jednorazowy (uruchamiany ręcznie):

```
# seed TOP 50 miast (drafty) + odświeżenie rankingu /raport-lokalizacje
curl -X POST https://financeyou.pl/api/public/hooks/seo-location-seed \
  -H "x-cron-secret: $CRON_SECRET"
# każdy tick można też odpalić ręcznie: GET ...?run=1 z tym samym nagłówkiem
```

## Moduł 1 — podstrony lokalizacyjne

- Generator (`generateLocationPages`) bierze TOP 50 gmin miejskich
  (`unit_type='municipality'`, `degurba=1` lub `is_city_above_30k`) po liczbie
  ludności z `geo_units` (data_version `gus-2021-1`, nadpisywalne env
  `SEO_LOCATION_DATA_VERSION`).
- **Brak wiersza w `geo_unit_location_metrics` (albo zerowe metryki) = strona
  się NIE generuje** — miasta pominięte są logowane i zwracane w polu
  `skippedNoData` odpowiedzi hooka.
- Treść: deterministyczne warianty sekcji (seed = FNV(TERYT)) — intro (3
  warianty), nagłówki, rotowana pula FAQ; jedyne liczby pochodzą z metryk.
  Snapshot ląduje w `seo_location_pages.content` (jsonb) + `content_hash`.
- Publiczny odczyt WYŁĄCZNIE `status='published'` (RLS, anon key). Tabele
  referencyjne pozostają staff-only — strona publiczna ich nie dotyka.
- Linkowanie wewnętrzne „Pożyczki w pobliżu": sąsiedzi z `geo_unit_adjacency`,
  dopełnienie miastami z województwa (5–8 linków); render pokazuje tylko linki
  do stron już opublikowanych.
- Publikacja partiami ~10/tydz. (naturalne tempo indeksacji).

## Moduł 2 — techniczne SEO

- `src/lib/seo/company.ts` — dane firmy (ul. Nowogrodzka 31, 00-511 Warszawa,
  NIP 7010611803) i buildery JSON-LD: `FinancialService`+`LocalBusiness`,
  `FAQPage`, `BreadcrumbList`. Meta title podstron ≤ 60 znaków
  (`buildMetaTitle` z fallbackami, testowane).
- `sitemap.xml` — server route; statyczne strony + opublikowane artykuły
  bloga + opublikowane `seo_location_pages`. Czysta logika w
  `src/lib/seo/sitemap-core.ts` (testy).
- Ping po publikacji (`src/lib/seo/ping.server.ts`): Google + Bing,
  best-effort. Uwaga: Google wycofał endpoint ping (2023) — głównym
  mechanizmem jest świeży `<lastmod>` i Google Search Console.
- `robots.txt` — blokada paneli: /admin, /inwestor, /klient, /operator,
  /posrednik, /api, /embed, /lovable.
- Canonical: wszystkie publiczne strony (uzupełniono strony prawne).
- Core Web Vitals: strony renderują się SSR (LCP bez czekania na JS), embedy
  YouTube są lazy (`loading="lazy"`, youtube-nocookie), obrazy bloga mają
  stałe proporcje (BlogCover). Pełny audyt Lighthouse na produkcji pozostaje
  do wykonania po wdrożeniu (patrz „Decyzje człowieka").

## Moduł 3 — linkowalne assety

- `/kalkulator-ltv` — czysty frontend, zero zapisu danych; LTV, orientacyjna
  maks. kwota (50–60% wartości), widełki kosztów spójne z kalkulatorem
  pożyczki (15–45%/rok); share przez parametry URL (`?w=&k=`), druk/PDF;
  disclaimer art. 66 KC; JSON-LD `WebApplication`.
- `/raport-lokalizacje` — ranking ~100 miast ze snapshotu
  `seo_location_report_entries` (WYŁĄCZNIE agregaty GUS/TERYT + scoring
  bazowy; public read, zapis service_role). Sort/filtr/szukaj, print CSS,
  przycisk „Cytuj ten raport" ze snippetem HTML zawierającym link (mechanizm
  pozyskiwania linków). JSON-LD `Dataset`. Odświeżanie: hook
  `seo-location-seed`.

## Moduł 4 — Digital PR (human-in-the-loop)

Przepływ: `pr-monitor-tick` (co 6 h) → `pr_opportunities(status=new)` →
panel `/admin/pr-media` → „Generuj draft" (AI) → edycja + adres odbiorcy →
**„Zatwierdź i wyślij"** (jedyna ścieżka wysyłki; wymaga roli administrator)
→ `pr_outreach_log` → webhook Resend aktualizuje statusy
(delivered/opened/clicked/bounced).

- Frazy monitoringu: „pożyczka pod zastaw", „pożyczki prywatne", „rynek
  nieruchomości" (Google News RSS per fraza). Dodatkowe feedy (np. zapytania
  dziennikarzy): env `PR_MONITOR_FEEDS` (URL-e po przecinku).
- Draft: podpis Filip Bielak, Prezes Zarządu Finance You; zakaz liczb spoza
  naszych danych — model ma wstawiać `[DO UZUPEŁNIENIA]`, dodatkowo kod
  wykrywa liczby i dokleja ostrzeżenie; UI blokuje wysyłkę, dopóki w treści
  są placeholdery.
- **Nie ma żadnej auto-wysyłki i nie należy jej dodawać** (wymóg promptu).

## Moduł 5 — pipeline YouTube

Przepływ: panel `/admin/video-pipeline` → „Dodaj artykuł" (opublikowany wpis
bloga) → „Generuj scenariusz" (5–8 min: hook, 3–4 sekcje, CTA; opis YT z
gwarantowanym linkiem do źródła; tagi; 3 tytuły) → render:

- **HeyGen skonfigurowany** (`HEYGEN_API_KEY` + `ELEVENLABS_API_KEY`):
  „Renderuj" robi ElevenLabs TTS (głos Filipa) → HeyGen avatar; tick polluje
  status.
- **Brak kluczy**: wpis zostaje w `script_ready` — człowiek renderuje sam
  i wkleja URL MP4 („Oznacz jako zrenderowane"). Render NIE jest mockowany.

Upload: wpis `rendered` trafia do istniejącej kolejki `youtube_publish_queue`
(OAuth/refresh token/quota obsługuje moduł YouTube Shorts) — ręcznie
przyciskiem albo automatycznie w ticku **tylko przy
`VIDEO_PIPELINE_AUTO_UPLOAD=1`**. Po publikacji tick zapisuje
`youtube_video_id` w `ai_seo_articles`/`seo_location_pages` i strona osadza
film (embed youtube-nocookie).

## Zmienne środowiskowe

| Env | Moduł | Znaczenie |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | wszystkie | już skonfigurowane (server) |
| `CRON_SECRET` | wszystkie ticki | mocny sekret do ręcznego wywoływania hooków |
| `SEO_LOCATION_DATA_VERSION` | 1, 3 | wersja danych geo (domyślnie `gus-2021-1`) |
| `LOVABLE_API_KEY` | 4, 5 | bramka AI (drafty PR, scenariusze) + Resend gateway |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | 4 | wysyłka + tracking (już używane w repo) |
| `PR_MONITOR_FEEDS` | 4 | opcjonalne dodatkowe feedy RSS (po przecinku) |
| `PR_DRAFT_MODEL`, `VIDEO_SCRIPT_MODEL` | 4, 5 | override modelu (domyślnie `google/gemini-2.5-flash`) |
| `HEYGEN_API_KEY`, `ELEVENLABS_API_KEY` | 5 | adapter renderowania (brak = render ręczny) |
| `VIDEO_PIPELINE_AVATAR_ID` | 5 | avatar HeyGen (domyślnie digital twin Filipa) |
| `VIDEO_PIPELINE_AUTO_UPLOAD` | 5 | `1` = tick sam koleikuje upload zrenderowanych |
| `VIDEO_PIPELINE_YT_PRIVACY` | 5 | `public`/`unlisted`/`private` (domyślnie public) |

Żadnych sekretów w kodzie — wszystko przez env / Supabase secrets.

## Jak uruchomić po wdrożeniu (kolejność)

1. Zastosuj migracje (Lovable Cloud robi to automatycznie przy deployu).
2. Upewnij się, że dane geo są zaimportowane
   (`bun scripts/location-scoring/gus-import.ts`, patrz
   `scripts/location-scoring/README-import.md`).
3. Odpal seed: `POST /api/public/hooks/seo-location-seed` (drafty + raport).
4. Sprawdź `/raport-lokalizacje` i przykładowy draft w tabeli; publikacja
   ruszy sama w najbliższy poniedziałek (albo ręcznie:
   `GET /api/public/hooks/seo-location-publish-tick?run=1`).
5. Zgłoś sitemapę w Google Search Console.

## Testy

`npm test` (vitest). Testy modułów SEO:

- `src/lib/seo/sitemap-core.test.ts` — XML, dedupe, escape,
- `src/lib/seo-location/core.test.ts` — warianty/determinizm, limity meta,
  brak danych = brak strony, zakazane frazy, hash,
- `src/lib/pr/core.test.ts` — parser RSS/Atom, frazy, dedupe URL,
- `src/lib/video-pipeline/core.test.ts` — walidacja scenariusza, link
  źródłowy w opisie, tagi.

## Decyzje wymagające człowieka (stan na wdrożenie)

1. **Kolizja fraz sitemap/GSC**: zgłoszenie sitemapy i monitorowanie
   indeksacji w Google Search Console (konto właściciela domeny).
2. **OG images** dla `/kalkulator-ltv` i `/raport-lokalizacje` — strony mają
   pełne meta OG bez dedykowanej grafiki; warto dodać statyczne PNG 1200×630
   (decyzja kreatywna/brandowa).
3. **Audyt Core Web Vitals na produkcji** (Lighthouse/PageSpeed po deployu) —
   lokalnie niewykonalny wiarygodnie.
4. **Moduł 4**: uzupełnianie adresów e-mail dziennikarzy (celowo ręczne) oraz
   ewentualne feedy z zapytaniami dziennikarzy do `PR_MONITOR_FEEDS`.
5. **Moduł 5**: wybór tytułu z 3 propozycji przed uploadem (domyślnie 1.),
   decyzja o `VIDEO_PIPELINE_AUTO_UPLOAD` i widoczności filmów do czasu
   zatwierdzenia audytu YouTube API (patrz `docs/youtube-shorts.md`).
6. **Tempo publikacji podstron** (10/tydzień) i lista TOP 50 — łatwe do
   zmiany parametrami hooków (`?limit=`, `?batch=`).
