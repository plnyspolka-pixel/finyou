# Autopilot agenta publikującego – jak działa (stan 19.10.2026)

Moduł `src/lib/autopilot/` rozbudowuje istniejący agent publikujący (silnik wzrostu,
Studio publikacji, kolejki, lead magnety). Nie ma równoległych kolejek ani rendererów:
korzysta z `ai_growth_settings`, `ai_growth_action_log`, `social_publish_queue`,
`youtube_publish_queue`, `studio_video_jobs`, `lead_magnets`.

## Tryb i wyłącznik

| Ustawienie | Gdzie | Domyślnie |
|---|---|---|
| Tryb modułu | `ai_growth_settings.autopilot_mode` (MCP `autopilot_set_mode`, tylko administrator) | `manual_review` |
| Wyłącznik awaryjny | `autopilot_paused` (MCP `autopilot_kill_switch`) | wyłączony |
| Profile torów | `audience_profiles` (MCP `autopilot_update_profiles`) | z kodu (`profiles.ts`) |
| Limity | `autopilot_limits` (MCP `autopilot_update_limits`, tylko administrator) | AI 50 zł/dzień, reklamy 0 zł |

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

## Gotowe rolki Studia (Etap 0)

W `full_autopilot` bez wyłącznika tick co godzinę bierze do 2 rolek `ready`, jeszcze nie
opublikowanych (`ready-reels.server.ts`):

1. Tor z `track` albo `material_audience` (bez toru rolka czeka – wpis `ready_reel_no_track`).
2. Scenariusz przez pełną bramkę **bez autora poprawek** (wideo już wyrenderowane): naruszenie =
   `compliance_status = 'rejected'` i powód w `last_error`.
3. Tytuł i opis przez pełną bramkę (mogą być przepisane); wynik zapisany na zadaniu, żeby ponowna
   próba nie płaciła za recenzenta.
4. Wolne sloty toru (`audience_profiles[track].slots`) na IG Reels, FB Reels i YouTube z limitem
   `maxPostsPerDayPerPlatform`; wstawienie przez `enqueuePublication` z `idempotency_key`.
   Brak slotu → rolka wraca w kolejnym ticku.

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

| Raport | Kiedy | Gdzie trafia |
|---|---|---|
| Dzienny | 20:xx | do dziennika; SMS tylko w trybach `semi_auto` i `full_autopilot` |
| Tygodniowy | pon. 8:xx | do dziennika; SMS jak wyżej |

## Lejek

- `funnel-description.ts` – opis-lejek per platforma:
  1. linia „Skomentuj HASŁO…” albo link z UTM,
  2. narzędzie,
  3. kim jesteśmy, potem ryzyko, AI i hashtagi.

  Na X opis mieści się w 280 znakach.
- `calculator-engine.ts` + `calculators.ts` – narzędzia z konfiguracji (ILE, RATA, LTV) na funkcjach
  `fees.ts` / `loan-math.ts`. Część wyniku jest dostępna dopiero po zapisie na listę; przypadki
  testowe są sprawdzane przed publikacją.
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
