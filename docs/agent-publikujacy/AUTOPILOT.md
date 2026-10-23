# Autopilot agenta publikującego – jak działa (stan 21.10.2026)

Moduł `src/lib/autopilot/` rozbudowuje istniejący agent publikujący (silnik wzrostu,
Studio publikacji, kolejki, lead magnety). Nie ma równoległych kolejek ani rendererów:
korzysta z `ai_growth_settings`, `ai_growth_action_log`, `social_publish_queue`,
`youtube_publish_queue`, `studio_video_jobs`, `lead_magnets`.

## Tryb i wyłącznik

| Ustawienie         | Gdzie                                                                               | Domyślnie                    |
| ------------------ | ----------------------------------------------------------------------------------- | ---------------------------- |
| Tryb modułu        | `ai_growth_settings.autopilot_mode` (MCP `autopilot_set_mode`, tylko administrator) | `manual_review`              |
| Wyłącznik awaryjny | `autopilot_paused` (MCP `autopilot_kill_switch`)                                    | wyłączony                    |
| Profile torów      | `audience_profiles` (MCP `autopilot_update_profiles`)                               | z kodu (`profiles.ts`)       |
| Limity             | `autopilot_limits` (MCP `autopilot_update_limits`, tylko administrator)             | AI 50 zł/dzień, reklamy 0 zł |

Znaczenie trybów (`safety.ts` → `evaluateGuards`):

- `off` – nic.
- `manual_review` – tylko szkice i propozycje; nic nie wychodzi na zewnątrz.
- `semi_auto` – produkcja automatycznie; publikacja, podbicia i maile jako szkic.
- `full_autopilot` – wszystko automatycznie w limitach. **Przełącza właściciel.**

Pauza (ręczna albo automatyczna przy anomalii) wstrzymuje **wyłącznie wpisy autopilota**
(`origin = 'autopilot'`). Ręczne publikacje zespołu idą dalej. Wznowienie – tylko administrator.

## Bramka compliance (brief 5.7)

1. **Reguły twarde** – `compliance-rules.ts`, wersja `COMPLIANCE_RULES_VERSION`. Zmiana tylko przez commit.
   Reguły wspólne, tor pożyczkobiorcy (B2B, bez BIK/„dla każdego”, bez presji) i tor inwestora
   (odkup, „sam inwestuję”, „drukarka” bez ryzyka). Procent przy słowach o zwrocie blokowany;
   LTV, NBP, inflacja i lokaty jako fakty rynkowe – dozwolone.
2. **Elementy obowiązkowe** – oznaczenie AI, Finance You + KRS, linia ryzyka. Doklejane automatycznie
   w opisach, lead magnetach, stronach, mailach i reklamach. Flagi platform: YouTube
   `containsSyntheticMedia`, TikTok `is_aigc` (kolumna `contains_synthetic_media`, domyślnie `true`).
3. **Recenzent LLM** – Claude (gdy jest `ANTHROPIC_API_KEY`), inaczej Gemini Pro z osobnym promptem.
   Autor poprawek: Gemini Flash.
4. **Pętla** – maks. 3 poprawki; potem odrzucenie i temat wraca do banku. Brak recenzenta = odrzucenie.
5. **Audyt** – każda decyzja w `ai_growth_action_log` (`module = compliance_gate`): wersja reguł,
   iteracje, uwagi, tekst wejściowy i finalny.
6. **Brak ścieżki ominięcia** – `enqueuePublication` (Studio, materiały, MCP `queue_social_publication`)
   odrzuca każdą publikację z blokadą reguł twardych, także ręczną.
7. **Kontrola końcowa w tickach** (`publish-gate.ts`) – ticki Meta, TikToka, X i YouTube sprawdzają
   tytuł i opis jeszcze raz tuż przed wysyłką. Łapie to wpisy dodane przed wdrożeniem bramki,
   zmienione po wstawieniu, ponowienia i bezpośrednie zapisy do tabel. Blokada = `failed` z powodem
   w `last_error` + wpis `gate_publish_final` w dzienniku. Brakująca stopka (AI, KRS, ryzyko) jest
   doklejana także do wpisów ręcznych (poza X – limit znaków).

## Produkcja rolek z lead magnetów (Etap 1)

W `full_autopilot` (i w `semi_auto`) tick co godzinę dba o zapas rolek per tor
(`production.server.ts`, logika w `production.ts`; na żądanie: MCP `autopilot_produce_reels`):

1. Strażnik: tryb, wyłącznik, dzienny budżet AI, kredyty HeyGen (odczyt `remaining_quota`,
   próg `heygenMinRemainingCredits`).
2. Zapas toru = rolki `ready` nieopublikowane + w produkcji (`queued` … `captioning`). Poniżej
   bufora `REEL_BUFFER_PER_TRACK` (2) powstaje jedna rolka; maks. `MAX_PRODUCED_PER_TRACK_PER_DAY`
   (2) na dobę.
3. Seria rotacyjnie (najdawniej użyta w ostatnich rolkach toru; bez odcinków tygodniowych), hasło
   serii → **opublikowany** lead magnet z katalogu albo kalkulator (`resolveKeywordTarget`); bez
   opublikowanego materiału rolka kończy się zachętą do obserwowania, bez hasła. Temat z
   `allowedTopics` profilu, też rotacyjnie.
4. Brief (`buildReelBrief`: szkielet serii, ton toru, lead magnet, CTA „Skomentuj HASŁO”, zdanie o
   ryzyku, ostatnie tytuły do uniknięcia) → scenariusz (`generateVideoScript` z zasadami toru) →
   bramka compliance z poprawkami → tytuł z hasłem (`… Napisz HASŁO`).
5. Job `queued` w Studiu z `track`, `series`, `compliance_status`, promptem z prefiksem
   `[autopilot]`; render i napisy robi tick Studia, a gotową rolkę planuje Etap 0 w slotach toru.

Dziennik: `reel_produced`, `reel_production_rejected`, `reel_production_error` (koszt ≈ 0,6 zł
na scenariusz + bramkę; HeyGen rozlicza się przy renderze).

## Gotowe rolki Studia (Etap 0)

W `full_autopilot` bez wyłącznika tick co godzinę bierze do 2 rolek `ready`, jeszcze nie
opublikowanych (`ready-reels.server.ts`):

1. Tor z `track` albo `material_audience` — zapytanie bierze tylko rolki z torem (rolka bez toru
   nie blokuje kolejki; przypisz odbiorcę w panelu, żeby weszła do obiegu).
2. Scenariusz przez pełną bramkę **bez autora poprawek** (wideo już wyrenderowane): naruszenie =
   `compliance_status = 'rejected'` i powód w `last_error`.
3. Tytuł i opis przez pełną bramkę (mogą być przepisane); wynik zapisany na zadaniu, żeby ponowna
   próba nie płaciła za recenzenta.
4. Lead magnet rolki: hasło serii (`series.defaultKeyword`) albo z CTA w opisie („Skomentuj START”)
   → opublikowany wiersz `lead_magnets`. Opis składa `buildFunnelDescription` osobno per
   platforma (hasło + materiał, kalkulator toru, stopka compliance, link `/pobierz/<slug>` z UTM
   tam, gdzie link jest klikalny), a reguły twarde sprawdzają go raz jeszcze bez recenzenta.
   Wpis kolejki dostaje `keyword` i `lead_magnet_id`.
5. Wolne sloty toru (`audience_profiles[track].slots`) na IG Reels, FB Reels i YouTube z limitem
   `maxPostsPerDayPerPlatform`; wstawienie przez `enqueuePublication` z `idempotency_key`.
   Brak slotu → rolka wraca w kolejnym ticku.
6. Po publikacji (tick Meta / YouTube) wpis z `lead_magnet_id` jest automatycznie wiązany z postem
   w `lead_magnet_posts` (`linkPublishedPost`), więc komentarz z hasłem od razu dostaje link.
   Rolki z zapasu sprzed Etapu 1 (duplikaty, testy, opublikowane inną ścieżką) dostały
   `compliance_status = 'rejected'` z notatką w `last_error` — autopilot je pomija; żeby któraś
   wróciła do obiegu, wyczyść `compliance_status` i przypisz tor w panelu.

## Hook wizualny rolek Studia (21.10.2026)

Każda rolka wykańczana silnikiem Remotion dostaje hook 0–2,5 s (`src/lib/studio-hook.ts`,
`studio-hook.server.ts`, `services/remotion/src/Hook.tsx`):

- **Obraz:** pełny kadr nad pierwszym zdaniem lektora — obraz-metafora problemu widza (drzwi
  skarbca, pieczątka na wniosku, klucz w snopie światła). Ruch od 1. klatki, uderzenie z
  wstrząsem i błyskiem w 0,2 s. Model obrazu/wideo ma zakaz tekstu w kadrze.
- **Tekst:** 1–4 słowa na całą szerokość (min. 12% wysokości kadru), jedno słowo złote.
  Napisy lektora, znacznik serii i elementy dynamiczne wchodzą dopiero po hooku; znaczek
  i etykieta AI zostają na wierzchu.
- **Dźwięk:** efekt uderzenia z ElevenLabs Sound Effects (działa na obecnym planie),
  opcjonalnie podkład `music_prompt` ściszony pod lektorem.
- **Źródło klipu (`source`, domyślnie `auto`):** decyzja właściciela 21.10 — bez grafiki
  ElevenLabs (planu Pro nie kupujemy). Kolejność: bank gotowych klipów hooka (`clip_bank`,
  tabela `studio_hook_clips`) → grafika z naszego generatora (`generate_studio_image`) →
  bank przebitek (te dwa z animacją Remotion). ElevenLabs: głos,
  efekty dźwiękowe i muzyka. Ścieżka ElevenLabs Flows (`flows_video` / `flows_image`) zostaje
  w kodzie za flagą `STUDIO_HOOK_FLOWS=1` (domyślnie wyłączona).
- **Bank klipów hooka (`clip_bank`):** gotowe klipy 9:16 ~5 s; każdy kończy się nieruchomą
  klatką białej ściany biura z logo 3D financeyou.pl — tym samym tłem co pionowe awatary
  `e0db8779828f484a8311fd427e815abe` i `65ef986081bc48ed890c742cfa73d42e`, więc rolka z takim
  hookiem powinna zaczynać się od jednego z nich. Klip gra w całości (hook trwa długość klipu,
  bez najazdu, wstrząsu, błysku i wygaszenia — styl `clip`), tekst z winietą znika między
  2,2 a 2,6 s, na końcu twarde cięcie do awatara. **Dobór do TREŚCI rolki (nie losowanie,
  nie rotacja):** kandydaci to aktywne klipy toru rolki albo `both`, zwinięte do konceptów
  (ta sama metafora z różnych modeli). AI dostaje scenariusz, tekst hooka i listę konceptów
  (tytuł, `description`, `tags`) i wskazuje jeden z wynikiem 0–100 — klip wchodzi tylko przy
  wyniku ≥ 55. Bez AI (błąd / brak klucza) — słowa kluczowe (polskie znaki zdjęte, rdzeń
  z 5 pierwszych liter), też z progiem. Brak dopasowania = brak klipu (grafika Studia).
  W koncepcie wygrywa najwyższa ocena; najdawniej użyty rozstrzyga tylko remis ocen.
  Zasoby hooka mają `clip_id`, `clip_concept`, `clip_match_reason`. Pole hooka `clip_slug`
  przypina konkretny klip (pomija dopasowanie). MCP: `import_hook_clips` (kopia z URL-a do
  Storage, upsert po `slug`, `description` i `tags`), `list_hook_clips`,
  `set_hook_clip_active`.
- **Planer:** rolka bez hooka dostaje 3 warianty z AI (odsiew compliance + `scoreHook`), bez
  AI — motyw zapasowy. Dwa najlepsze idą do testu A/B (`hook_variant` A/B, przydział po id).
- **MCP:** `hook` / `hook_variant` w `create_studio_video_job` i `update_studio_job`,
  `preview_studio_hook` (podgląd i zasoby bez renderu HeyGena), gotową rolkę wykańcza na nowo
  `restyle_studio_job_captions` (bez kredytów HeyGen). `STUDIO_VISUAL_HOOK=0` wyłącza hook.

**Silnik wykończenia:** `auto` bez `STUDIO_RENDER_ENGINE` = Remotion, gdy skonfigurowany.
Gdy caption-burner nie odpowiada na preflight albo nie przyjmie zlecenia, zadanie przechodzi
samo na Remotion (wpis `studio_finisher_fallback`, sekcja „Produkcja” w raporcie).

**Awatary poziome:** orientację zdjęcia wykrywamy z podglądu (`studio_avatar_orientations`).
Poziomy awatar nie prowadzi rolki (hook mówi pionowy z zestawu), a jego ujęcia Remotion
kadruje „cover” do pełnego pionu. Poprawka kadru: `set_studio_avatar_framing`
(`focus_x`, `focus_y`). Panel oznacza poziome awatary.

**Tor pożyczkobiorcy w rolkach:** bez akcentu „tylko dla firm” (`autopilot/track-voice.ts`):
„firma / przedsiębiorca / działalność” najwyżej raz. Reguła compliance „konsument” i linia
o celu gospodarczym w stopce opisu zostają.

## Zadanie jednorazowe dla właściciela: profil Instagram

Graph API nie zmienia nazwy, bio ani zdjęcia profilu – raz w aplikacji Instagram
(@filipbielakconsulting):

- **Nazwa:** `Finance You · Filip Bielak`
- **Bio (136/150 znaków):**
  ```
  Finanse pod zastaw nieruchomości 🏠
  💼 Firmy: finansowanie na cel firmowy
  📈 Inwestorzy: jak zarabiają banki
  Treści z AI · KRS 0000635207 ↓
  ```
- **Link:** `https://financeyou.pl/start` (link-hub z wyborem toru).
- **Wyróżnione relacje:** „Dla firm” i „Dla inwestorów”.
- **Zdjęcie profilowe:** znak Finance You (`financeyou-mark-v2`) na tle `primary` z `brand.json`.

## Bezpieczniki (brief 5.8)

Strażnik (`/api/public/hooks/autopilot-tick`, cron co godzinę w 7. minucie) liczy zużycie:

- koszt AI dziś vs średnia 7 dni,
- publikacje na dobę i platformę,
- nieudane publikacje z rzędu,
- sygnały platform,
- odrzucenia kontroli jakości.

Przy anomalii włącza pauzę i wysyła SMS do właściciela: `OWNER_ALERT_PHONE`, fallback na numer
z `company.ts`, maks. 3 SMS na dobę. W trybach `off` i `manual_review` strażnik nic nie robi.

Kolejki mają `idempotency_key` (unikalny), więc ten sam materiał autopilota nie trafi do kolejki
drugi raz. Wpisy Meta wiszące w `publishing` ponad 60 min przechodzą w `failed` z opisem. Nie są
ponawiane automatycznie, bo przy Reels groziłby duplikat.

## Raporty

Pełny raport daje `autopilot_report` (MCP).

| Raport     | Kiedy     | Gdzie trafia                                                     |
| ---------- | --------- | ---------------------------------------------------------------- |
| Dzienny    | 20:xx     | do dziennika; SMS tylko w trybach `semi_auto` i `full_autopilot` |
| Tygodniowy | pon. 8:xx | do dziennika; SMS jak wyżej                                      |

## Lejek

- `funnel-description.ts` – opis-lejek per platforma:
  1. linia „Skomentuj HASŁO…” albo link z UTM,
  2. narzędzie,
  3. kim jesteśmy, potem ryzyko, AI i hashtagi.

  Na X opis mieści się w 280 znakach.

- `calculator-engine.ts` + `calculators.ts` – narzędzia z konfiguracji (ILE, RATA, LTV) na funkcjach
  `fees.ts` / `loan-math.ts`. Część wyniku jest dostępna dopiero po zapisie na listę; przypadki
  testowe są sprawdzane przed publikacją.
- `src/lib/lead-magnets/catalog.ts` – katalog startowy lead magnetów (brief 5.4): siedem branded PDF-ów
  składanych z kodu i wgrywanych jako pliki do bucketa `lead-magnets` przy provisioningu (inwestor:
  START → KSIĘGA → BŁĘDY, UMOWA; pożyczkobiorca: ODMOWA → DOKUMENTY → PROCES), hasła zgodne z
  `defaultKeyword` serii. `resolveKeywordTarget(hasło)`
  zwraca materiał albo kalkulator dla opisu-lejka. Provisioning: MCP `provision_lead_magnet_catalog`,
  panel, tick (6:00 w `full_autopilot`). Każdy materiał przechodzi reguły twarde compliance w testach
  (`catalog.test.ts`). Szczegóły: `docs/lead-magnety.md`.
- `/start` – link-hub do bio z wyborem „Potrzebuję finansowania” / „Chcę inwestować”. Treść pochodzi
  z profili i opublikowanych lead magnetów.
- `src/lib/brand/brand.json` – tokeny marki (kolory ze `styles.css`, Montserrat, logo, stopka).

## Planer (pure)

- `series.ts` – serie i formaty obu torów jako dane; każda seria ma linię ryzyka (`alert`).
- `idea-scoring.ts` – scoring pomysłów 0–100 (próg 60) i hooków. Najlepszy hook idzie do produkcji,
  drugi do testu A/B.
- `metrics.ts` – mediany per konto i tor, outliery ≥ 3×, A/B po 72 h, ocena lead magnetów pod opt-in.

## Powiązanie z PR #276 (agent wzrostu)

PR #276 (`growth_agent`, `agent_owner`, `truth-guard`) jest otwarty i niezmergowany. Po jego
zmergowaniu:

- `truth-guard.ts` warto wpiąć jako dodatkową warstwę w `runGateLoop` (sprawdza liczby względem
  `fees.ts` i `plans.ts`),
- `notifyOwner` może zastąpić `smsOwner`.

Oba moduły piszą do tego samego `ai_growth_action_log`, a koszty `growth_agent` wliczają się
do budżetu autopilota.
