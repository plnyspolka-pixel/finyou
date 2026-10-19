# Autopilot agenta publikującego — jak działa i jak go włączyć

Rozbudowa silnika wzrostu (`ai_growth_settings`, `ai_growth_action_log`) opisana
w `BRIEF_DLA_CLAUDE_CODE.md`. Mapa istniejącego kodu: `INWENTARYZACJA.md`.

## Stan po wdrożeniu tego PR

**Autopilot jest wyłączony.** Migracja ustawia `video_module_mode = 'off'`,
nie zmienia `automation_mode` (`manual_review`), budżet reklam obu torów to
0 zł, kanał X jest na liście `disabled_platforms`. Od razu po wdrożeniu działają
tylko rzeczy bezpieczne:

- **bramka compliance przed każdą publikacją** z kolejek (Meta, TikTok, X,
  YouTube) — także ręcznych; treść z obietnicą zysku, procentem zwrotu,
  „bez ryzyka”, ceną w wideo itp. nie wyjdzie (status `failed`, powód
  w `last_error`, audyt w `ai_compliance_checks`); brakująca etykieta AI,
  linia ryzyka i KRS są doklejane automatycznie do opisu;
- flagi AI na platformach: YouTube `containsSyntheticMedia`, TikTok `is_aigc`;
- odbijanie wpisów Meta zawieszonych w „publishing” > 60 min (→ `failed`
  z opisem, bez ryzyka zdublowania posta);
- blog: bieżąca data w prompcie, ramka przeglądu tygodnia liczona w kodzie,
  odcinanie starych wiadomości z RSS, strażnik nieaktualnego roku w tytule,
  zakaz komunikowania stóp zwrotu i bramka compliance (artykuł, który nie
  przejdzie po 3 poprawkach, zostaje szkicem);
- tick `autopilot-tick` (co godzinę, :20): anomalie, import metryk IG/YouTube
  do `social_post_metrics`, raport dzienny (8:00+) i tygodniowy (poniedziałek).

## Jak włączyć (właściciel)

Przez konektor MCP Finance You (albo SQL na `ai_growth_settings`):

1. `update_autopilot_settings` z `owner_alert_phone` i `owner_report_email` —
   bez nich alarmy i raporty lądują tylko w dzienniku.
2. Opcjonalnie `update_audience_profile` — sloty, serie, budżety torów
   (domyślne: pożyczkobiorca IG/FB 16:05, YT 12:15; inwestor IG/FB 17:05,
   YT 19:15; pon–sob; 25 zł AI/dzień na tor; reklamy 0 zł).
3. `update_autopilot_settings` z `video_module_mode: "full_autopilot"`.
   Od następnego ticka agent bierze gotowe rolki Studia (`status = ready`,
   jeszcze nie publikowane), sprawdza scenariusz, tytuł i opis bramką
   (reguły twarde → recenzent LLM → do 3 poprawek) i wstawia je w wolne
   sloty swojego toru. Rolka, której scenariusz nie przechodzi, jest
   odrzucana (`studio_video_jobs.compliance_status = 'blocked'`).

## Wyłącznik awaryjny

- `set_autopilot_kill_switch {on: true, reason}` — każdy członek zespołu;
  zatrzymuje produkcję i publikację wpisów autopilota (ręczne publikacje
  działają dalej, ale nadal przez bramkę).
- `set_autopilot_kill_switch {on: false, reason}` — tylko administrator.
- Automatyczna pauza (tylko w `full_autopilot`): seria nieudanych publikacji
  na platformie (domyślnie 3), przekroczony dzienny budżet AI, ≥ 10 blokad
  bramki dziennie, sygnał ostrzegawczy platformy → kill switch + SMS.

## Reguły compliance

`src/lib/autopilot/compliance-rules.ts`, wersja `COMPLIANCE_RULES_VERSION`
(zapisywana przy każdej decyzji). Zmiana wyłącznie commitem — agent ani MCP
nie mogą ich zmienić. Test dowolnego tekstu: `check_content_compliance`.
Wyjątek celowy: artykuły bloga mogą przytaczać oprocentowanie lokat i obligacji
ze źródeł (fakt rynkowy) — ocenia je recenzent LLM; słowny przedział zwrotów
(„kilkanaście procent”) jest zablokowany wszędzie.

## Narzędzia MCP

| Narzędzie | Kto | Co robi |
|---|---|---|
| `get_autopilot_status` | zespół | tryb, wyłącznik, limity, profile torów, dziennik, blokady bramki |
| `set_autopilot_kill_switch` | zespół (on) / admin (off) | wyłącznik awaryjny |
| `update_autopilot_settings` | admin | tryb modułu, kanały, limity, telefon i e-mail raportów |
| `update_audience_profile` | admin | profil toru: CTA, ton, serie, sloty, kadencja, budżety |
| `check_content_compliance` | zespół | test tekstu na bramce (bez zapisu) |
| `get_autopilot_report` | zespół | raport na żądanie |
| `run_autopilot_tick` | admin | przebieg ticka teraz |

## Zadanie jednorazowe dla właściciela: profil Instagram

Graph API nie zmienia nazwy, bio ani zdjęcia profilu — to trzeba zrobić raz
w aplikacji Instagram (@filipbielakconsulting):

- **Nazwa:** `Finance You · Filip Bielak`
- **Bio (136/150 znaków):**
  ```
  Finanse pod zastaw nieruchomości 🏠
  💼 Firmy: finansowanie na cel firmowy
  📈 Inwestorzy: jak zarabiają banki
  Treści z AI · KRS 0000635207 ↓
  ```
- **Link:** do czasu link-huba (Etap 3, kolejny PR) zostaje obecny; potem
  stały adres link-huba z wyborem „Potrzebuję finansowania” / „Chcę inwestować”.
- **Wyróżnione relacje:** „Dla firm” i „Dla inwestorów” (dwa tory jako serie).
- **Zdjęcie profilowe:** logo Finance You na granatowym tle (`brand.json`:
  `background #070b22`, logo odwrócone na ciemne tło).
