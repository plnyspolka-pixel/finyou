# Migracja z Lovable

Cel: całkowicie odciąć projekt od Lovable. Kod rozwijany w Claude Code, AI w aplikacji
na Claude API, baza na własnym Supabase (Frankfurt), hosting na własnym koncie.

## Stan na 2026-10-09 (ustalenia)

### Do czego służy Lovable

| Obszar | Gdzie | Zamiennik |
|---|---|---|
| Baza / auth / storage (Lovable Cloud, Supabase `jqvepxhulxdnbwbogkhe`) | wszędzie | własny Supabase `finyou-prod`, Frankfurt, plan Pro |
| Hosting (`project--5394e6ca-…lovable.app`, Cloudflare Workers) | `vite.config.ts`, `wrangler.jsonc` | własne konto Cloudflare albo AWS |
| Crony w bazie z `base_url` na `lovable.app` | ~20 migracji, 34 joby `cron.job` | nowy adres w jednym ustawieniu |
| AI Gateway `ai.gateway.lovable.dev` + `LOVABLE_API_KEY` | ~40 plików, `src/lib/lovable-ai.server.ts` | Claude API; obrazy → Gemini API, embeddingi → Voyage/OpenAI, transkrypcja → ElevenLabs STT |
| Connector gateway (Resend, Mailgun, Twilio, Stripe, Google Drive/Sheets/Docs) | ~13 plików | oficjalne API z własnymi kluczami |
| `@lovable.dev/cloud-auth-js`, `email-js`, `webhooks-js`, `mcp-js`, `vite-tanstack-config` | `src/integrations/lovable`, `src/routes/lovable/email/*`, `src/lib/mcp/` | `supabase.auth.signInWithOAuth`, Resend, `@modelcontextprotocol/sdk`, zwykły config Vite |
| Assety CDN (`*.asset.json`, 48 szt.) | `src/assets` | `public/` albo Storage |

### Baza (Lovable Cloud nie ma eksportu ani transferu)

- Projekt Supabase nie jest na koncie właściciela (sprawdzone: GitHub i e-mail).
- Dostęp tylko przez `mcp__Lovable__query_database` jako `postgres` (nie superuser).
- PostgreSQL 17.6; 245 tabel w `public`; 419 MB, z czego ok. 190 MB to logi techniczne
  (`net._http_response` 142 MB, `cron.job_run_details` 50 MB) — NIE przenosić.
- `auth.users`: 389 kont, 380 z hashem hasła; `auth.identities`: 406 (email, google, apple).
- Rozszerzenia `postgres_fdw` i `dblink` dostępne (niezainstalowane), `pg_cron` 1.6.4, `pg_net` 0.20.0.
- Incydent: lead `8e20abbc-48f9-4df4-be2f-fdf04f2db0de` (adres w `financeyou.pl`) ma 45 329
  wpisów e-mail w `lead_communications` z 16–18.06 (pętla autoodpowiedzi) — pominąć przy migracji.
- `email_subscribers`: 60 663 z `baza_posrednikow` — do weryfikacji podstawy prawnej (RODO).

### Storage (4,7 GB, 2530 plików, 13 bucketów)

- `marketing-materials` 2,0 GB, `training-videos` 1,0 GB, `pliki-klienta` 0,9 GB (dane osobowe),
  `studio-media` 0,7 GB (publiczny), reszta drobna, 5 pustych.
- ~930 MB prawdopodobnych duplikatów (ten sam rozmiar); m.in. leady `f4c7438c…` (484 pliki,
  17 unikalnych) i `b2238d53…` (559 plików, 20 unikalnych) z 28–30.07 — przenosić tylko unikalne
  (po sumie kontrolnej), zachowując odwołania w bazie.
- 19 filmów Akademii ma mimetype `application/octet-stream` — poprawić na `video/mp4`.

## Nowy projekt Supabase (utworzony 2026-10-09)

- Organizacja „Finance you sp z oo” (Pro), projekt „Finance you produkcja”
- Ref `vkzndnaoxhdxrxlpntcb`, URL `https://vkzndnaoxhdxrxlpntcb.supabase.co`
- Central EU (Frankfurt, eu-central-1), Micro, Postgres (nie OrioleDB)
- Data API: włączone; automatyczne wystawianie nowych tabel: WYŁĄCZONE (granty kopiujemy
  dokładnie z produkcji); automatyczny RLS: włączony; GitHub: niepodłączony (świadomie)

## Narzędzia dostępu (stan 2026-10-09)

- **Stara baza (Lovable):** `mcp__Lovable__query_database`, projekt Lovable
  `5394e6ca-0160-41ed-aa82-1afa633ecc0c`, rola `postgres` (nie superuser).
- **Nowa baza:** konektor claude.ai **Supabase** (OAuth) — `mcp__Supabase__execute_sql`,
  `apply_migration`, `list_tables`, `get_advisors` itd. Widzi tylko projekt
  `vkzndnaoxhdxrxlpntcb`. Token Management API NIE jest potrzebny.
- Kontener sesji wychodzi do sieci tylko przez proxy HTTPS — Postgres (5432) z kontenera
  nie działa, więc `psql`/`pg_dump` odpadają.
- Do kopiowania Storage potrzebny network secret z kluczem `service_role` nowego projektu
  (host `vkzndnaoxhdxrxlpntcb.supabase.co`, nagłówki `apikey` bez prefiksu i
  `Authorization` z prefiksem `Bearer`) — jeszcze NIEdodany. Nigdy w czacie/repo/zmiennych.

## Ustalenia dotyczące schematu (2026-10-09)

- Produkcja ma **231** zastosowane migracje (ostatnia `20260916162804`), repo ma **304**
  pliki (najnowszy 2026-10-09). Migracje z repo ≠ produkcja → **schemat kopiujemy z katalogu
  produkcji**, nie odtwarzamy z `supabase/migrations/`.
- Produkcja (`public`): 243 tabele, 2 widoki, 231 funkcji (~129 kB DDL), 374 polityki RLS,
  145 triggerów, 38 enumów, 677 indeksów, 740 constraintów, 3612 kolumn. `storage`:
  36 polityk, 13 bucketów. `auth`: trigger `on_auth_user_created -> handle_new_user`.
- Rozszerzenia produkcji: pg_cron, pg_net, pg_stat_statements, pg_trgm, pgcrypto, pgmq,
  supabase_vault, uuid-ossp, vector (w schemacie `public`). Schemat `drizzle` też istnieje.
- Nowa baza ma domyślnie tylko: plpgsql, pgcrypto, uuid-ossp, pg_stat_statements,
  supabase_vault. `dblink`, `postgres_fdw`, `pg_cron`, `pg_net`, `pgmq`, `vector`, `pg_trgm`
  dostępne do włączenia.
- **Crony: 34 aktywne, 30 woła `lovable.app`.** W nowej bazie tworzyć je WYŁĄCZONE
  i z nowym adresem — inaczej nowa baza uruchamiałaby zadania produkcji drugi raz
  (podwójne maile/SMS-y). Włączyć dopiero przy przełączeniu.

## Wybrana metoda: baza → baza przez `dblink` (schemat i dane)

Ani schemat, ani dane nie idą przez czat ani kontener — stara baza łączy się z nową.

1. Nowa baza (konektor): tymczasowa rola **`migrator`** (login, losowe hasło;
   `grant migrator to postgres`; `usage, create` w `public`). Pierwotny pomysł
   (`alter role postgres password …`) jest na Supabase zablokowany — `postgres` to rola
   uprzywilejowana, hasło zmienia tylko panel — więc hasło `postgres` zostaje nietknięte.
   Obiekty powstają jako `migrator`; na końcu `reassign owned by migrator to postgres`
   (sprawdzone w wycofanej transakcji: tabele i funkcje trafiają do `postgres`) i
   `drop role migrator`. `grant postgres to migrator` jest zablokowany (brak `set role`).
2. Stara baza (produkcja): `create extension dblink with schema extensions` — zmiana tylko
   dodająca, aplikacja z niej nie korzysta; usunąć po migracji. Connection string do nowej
   bazy leży w Vault starej bazy jako sekret `migration_target` (hasło w SQL pojawiło się
   raz; każde zapytanie `dblink` czyta `vault.decrypted_secrets`).
3. Test połączenia stara → nowa (pooler sesyjny, port 5432). Jeśli Lovable blokuje ruch
   wychodzący — stop, szukamy innej drogi.
4. Schemat generowany z katalogu produkcji (enumy, sekwencje, tabele, constrainty, indeksy,
   widoki, funkcje, triggery, RLS + polityki, granty dokładnie jak w produkcji, komentarze,
   buckety i polityki storage, trigger auth) i wykonany w nowej bazie przez `dblink_exec`.
   Crony wyłączone.
5. Weryfikacja: liczby obiektów po obu stronach + `get_advisors` (security, performance).
6. (Osobna zgoda) Dane: `INSERT … SELECT` tabela po tabeli, w tym `auth.users` (z hashami)
   i `auth.identities`; pominąć `net._http_response`, `cron.job_run_details` i 45 329 wpisów
   pętli mailowej leada `8e20abbc…`. Porównanie liczby wierszy w każdej tabeli.
7. Storage przez Storage API (deduplikacja po sumie kontrolnej, poprawa mimetype filmów).
8. Sprzątanie: stara baza — `drop extension dblink`, `delete from vault.secrets where
   name='migration_target'`; nowa baza — `drop schema _mig cascade` (tabele `ddl`, `ddl_log`,
   funkcje `run`, `run2`), `drop owned by migrator`, `drop role migrator`. Uwaga: konektor
   Supabase wymaga osobnego potwierdzenia dla `drop`/`delete`.
9. Najpierw próbna kopia; finalna kopia i przełączenie w oknie serwisowym.

Alternatywa odrzucona jako gorsza: przenoszenie schematu porcjami przez czat (~500 kB DDL).

### Postęp (2026-10-09, wieczór)

Właściciel zatwierdził kroki 1–3 (rola `migrator` zamiast hasła `postgres`, `dblink`
w produkcji, sekret w Vault). Wykonane i zweryfikowane:

- Stara baza: `dblink` 1.2 w schemacie `extensions`; sekret Vault `migration_target`
  (id `8b2ef014-2cb5-43dd-81c1-371cc1ff33f6`).
- Nowa baza: rola `migrator` (login, bez `createrole`/`bypassrls`), `postgres` jest jej
  członkiem, `migrator` ma `usage, create` na `public`. Żadnych obiektów użytkownika.
- **Połączenie stara → nowa działa** w obu wariantach: session pooler
  `aws-1-eu-central-1.pooler.supabase.com:5432` (user `migrator.vkzndnaoxhdxrxlpntcb`;
  `aws-0` zwraca „tenant/user not found”) oraz **bezpośrednio** `db.vkzndnaoxhdxrxlpntcb.supabase.co:5432`
  (tylko IPv6 — stara baza ma wyjście IPv6, do IPv4 używa NAT64). Wybrano wariant
  bezpośredni (bez limitów Supavisora przy długich sesjach); sekret zaktualizowany.
- Nierozstrzygnięte: czy `migrator` może tworzyć polityki na `storage.objects` i trigger
  na `auth.users` (właściciele: `supabase_storage_admin`, `supabase_auth_admin`). Jeśli nie —
  te nieliczne obiekty (36 polityk storage, 1 trigger auth, 34 crony) wykonać przez
  konektor jako `postgres`; duży schemat `public` idzie przez `dblink`.

### Krok 4 (schemat) — przebieg (2026-10-10)

Zmiana metody wykonania względem pierwotnego planu (lepsza, uzgodniona z właścicielem):
stara baza tylko **generuje** DDL z katalogu (czyste `SELECT`-y, plik `docs/migracja/ddl-generators.sql`) i wysyła go przez `dblink` do tabeli roboczej `_mig.ddl` w nowej bazie; **wykonuje**
go konektor jako `postgres` (funkcja `_mig.run(faza_od, faza_do, limit)`: każda instrukcja
w osobnej podtransakcji, błędy w `_mig.ddl_log`, ponowienia tylko nieudanych; limit konektora
2 min/wywołanie → porcje). Dzięki temu właścicielem obiektów jest od razu `postgres`
(bez `reassign owned`), a polityki `storage`, trigger `auth` i crony nie wymagają sztuczek
(sprawdzone w wycofanych transakcjach). Rola `migrator` jest tylko kurierem (właściciel `_mig`).

- Rozszerzenia w nowej bazie = produkcja (10 szt.; `vector` 0.8.2 w `public`, `pg_net` 0.20.4,
  `pg_cron` 1.6.4, `pgmq` 1.5.1, `pg_trgm` 1.6; produkcja ma dodatkowo tylko `dblink` na czas migracji).
- Wygenerowano i przesłano **3875 instrukcji (727 952 B)**, transport zweryfikowany co do bajta.
  Fazy: 0 schematy (`drizzle`, `supabase_migrations`), 1 enumy 38, 2 sekwencje nie-identity 6,
  3 tabele 245 (243 + 2), 4 `owned by` 5, 5 constrainty 743 (p 245, u 89, c 211, f 198),
  6 indeksy poza PK/unique 346, 7 funkcje 113 (118 funkcji `vector` pochodzą z rozszerzenia),
  8 widoki 2, 9 triggery 145, 10 RLS 243 + polityki 374, 11 `revoke`/`grant` 260 + 746 na
  relacjach i 113 + 297 na funkcjach (dokładnie jak produkcja; granty roli `sandbox_exec`
  Lovable pominięte, bo rola nie istnieje), 12 komentarze 79, 13 buckety 13 + polityki storage 36,
  14 trigger `auth.users` 1, 15 crony 34 × (`cron.schedule` + `alter_job active=false`).
- Świadome różnice względem produkcji: brak `sandbox_exec`; **default privileges nie są
  kopiowane** (właściciel wyłączył auto-wystawianie nowych tabel w nowej bazie — nowe tabele
  tworzone w przyszłości NIE dostaną automatycznie grantów dla `anon`/`authenticated`/
  `service_role`; migracje aplikacji muszą nadawać granty jawnie albo trzeba to włączyć);
  `jobid` cronów nie są zachowane (nazwy tak); polecenia cronów zawierają stary URL
  `lovable.app` i klucz `anon` starego projektu — do przepisania przy przełączeniu.
- Generatory przeszły niezależną recenzję adwersarialną (5 perspektyw + weryfikacja każdego
  znaleziska) przed wykonaniem; wynik i poprawki — niżej.



#### Wynik kroku 4 i weryfikacja (krok 5) — 2026-10-10

Recenzja generatorów (5 perspektyw, 16 znalezisk, 4 obalone jako już poprawione) — przyjęte:
- **crony atomowo** — `cron.alter_job(job_id := cron.schedule(...), active := false)` w jednej
  instrukcji (osobne wiersze mogły zostać rozdzielone granicą porcji i job przez chwilę byłby aktywny);
- bucket: dodana kolumna `versioning_status`; `lifecycle_*` celowo NULL (trigger storage);
- pozycje sekwencji (`setval`) to stan danych → faza 16 generatorów, do uruchomienia **po** danych;
- wykonawca `_mig.run2` (licznik prób, pierwszy błąd w wyniku, `search_path` przypięty) i transfer
  upsertem z kontrolą obecności sekretu; kontrole wstępne: uprawnienia EXECUTE 118 funkcji `vector`
  identyczne (118/118/118), `supabase_migrations.schema_migrations` nie istniała wcześniej.

Wykonanie: **3841 instrukcji, 0 błędów, 0 ponowień** w trzech wywołaniach (fazy 0–6: 1385;
7–14: 2422; 15: 34). Crony: 34 zaplanowane, **0 aktywnych**.

Weryfikacja: liczby obiektów identyczne z produkcją (243 tabele, 2 widoki, 12 sekwencji, 38 enumów,
113 funkcji własnych, 145 + 1 triggerów, 374 + 36 polityk, RLS 243/243, 677 indeksów, 740 constraintów,
79 komentarzy, granty tabel anon 222 / authenticated 243 / service_role 245, 256 grantów funkcji dla
ról API, 13 bucketów, wszystko własnością `postgres`). Diff strukturalny baza↔baza przez `dblink`
(`docs/migracja/schema-diff.sql`, ~3 800 podpisów: kolumny, constrainty, indeksy, definicje funkcji,
triggery, polityki, widoki, enumy, sekwencje, granty, komentarze): **jedyna różnica to
`public.rls_auto_enable()` + event trigger `ensure_rls`** — opcja Supabase „automatyczny RLS”
zaznaczona przy tworzeniu projektu (zostaje; włącza RLS na nowych tabelach w `public`).

`get_advisors` nowej bazy — wszystko odziedziczone z produkcji, nic nie wynika z migracji:
- security: 14 funkcji `SECURITY DEFINER` wykonywalnych przez `anon` i 72 przez `authenticated`
  — w tym **`exec_admin_any(_sql text)`, `exec_admin_select`, `exec_admin_write`** (wykonują SQL
  przekazany jako tekst; zakładam kontrolę roli wewnątrz — **do osobnego przeglądu bezpieczeństwa**);
  5 tabel z RLS bez polityk (`messenger_outbox`, `push_subscriptions`, `tiktok_integration`,
  `x_integration`, `youtube_integration` — jak w produkcji, dostęp tylko przez `service_role`);
  `esign_events_immutable` bez `search_path`; `vector` w `public` (świadome); `_mig.run` (sprzątanie).
- performance: 85 FK bez indeksu, 355 polityk z `auth.uid()` bez `(select …)`, 92 tabele z wieloma
  politykami permisywnymi, 2 pary zduplikowanych indeksów (`kw_fetch_attempts`, `kw_section_sources`),
  325 „nieużywanych” indeksów (pusta baza). Materiał na optymalizację po migracji, nie przed.

Przy finalnej kopii (okno serwisowe), jeśli schemat produkcji zmieni się do tego czasu: ponownie
uruchomić `schema-diff.sql`, a różnice dogenerować z `ddl-generators.sql` (upsert do `_mig.ddl`,
`_mig.run2` ponawia tylko zmienione wiersze).

### Krok 6 (dane) — próbna kopia wykonana (2026-10-10, ok. 10:00 UTC)

Właściciel zatwierdził: `postgres_fdw`, kopiowanie `supabase_migrations.schema_migrations` (231 wierszy)
i zakres `auth` = `users` + `identities`.

**Metoda.** Stara baza: `postgres_fdw` (schemat `extensions`), `server newdb` (bezpośredni host IPv6,
`sslmode=require`, `batch_size=1000`), `user mapping` roli `migrator`, schemat roboczy `_mig_remote`
z `import foreign schema` (249 tabel obcych: `public`, `drizzle`, `supabase_migrations`, staging `_mig`).
Kopiowanie: `insert into _mig_remote.<t> (<kolumny bez generated>) select … from public.<t>` w blokach
`DO` (jedno wywołanie = jedna transakcja; wynik per tabela w tabeli tymczasowej).

**Nowa baza na czas ładowania** (wszystko odwrócone po załadowaniu): `migrator` z `bypassrls`
i grantami na tabele/sekwencje; `disable trigger user` na 245 tabelach; 7 kolumn identity na
`generated by default`; `handle_new_user()` tymczasowo jako no-op (`create or replace`; oryginał
odtworzony z `_mig.ddl`) — bo trigger na `auth.users` nie da się wyłączyć bez własności, a konektor
anulował `drop`; para FK w cyklu `ai_seo_articles ↔ ai_seo_topics` jako `deferrable initially deferred`
i załadowana w jednej transakcji. **FK nie były zdejmowane** (wywołanie z `drop constraint` zostało
anulowane przez konektor) — zamiast tego ładowanie w kolejności topologicznej grafu FK (185 krawędzi,
6 poziomów, jedyny rodzic zewnętrzny: `auth.users`), więc integralność referencyjna była wymuszana
przez cały import. Ograniczenia platformy sprawdzone w wycofanych transakcjach: `postgres` NIE może
`set session_replication_role` ani `disable trigger` na `auth.users`; MOŻE nadać `bypassrls`,
`disable trigger user`, `drop trigger` na `auth.users`.

**Kolejność:** (1) `auth.users` 389 (380 z hasłem) + `auth.identities` 406 (email 380, google 24,
apple 2) przez staging `_mig.auth_*` → `insert` jako `postgres` (bez kolumny generated `confirmed_at`);
(2) poziomy 0–5 (138 / 36 / 40 / 13 / 11 / 5 tabel) + para w cyklu; `lead_communications` z filtrem
`lead_id <> '8e20abbc…'` (22 901 z 68 230). Całość ~1,5 min czystego transferu (największe:
`screening_name_index` 73 720 wierszy / 4,7 s, `email_subscribers` 60 968 / 3,9 s,
`lead_communications` 22 901 / 18 s, `call_queue` 5 690 / 13,8 s).

**Po załadowaniu:** identity z powrotem `always` (7/7), `enable trigger user` (145/145), FK cyklu
`not deferrable`, `handle_new_user` = oryginał (md5 zgodne), faza 16 `setval` (10 sekwencji;
np. `cookie_consent_log_id_seq` 59 → następny id 60), `migrator` bez `bypassrls` i bez grantów.
**Uwaga:** staging `_mig.auth_users` nadal zawiera hashe haseł i tokeny (konektor anulował `update`
zerujący te kolumny) — do usunięcia przy sprzątaniu (`drop schema _mig cascade`) albo ręcznie
w panelu SQL: `update _mig.auth_users set encrypted_password = null, confirmation_token = null,
recovery_token = null, email_change_token_new = null, email_change_token_current = null,
phone_change_token = null, reauthentication_token = null, raw_user_meta_data = '{}';
update _mig.auth_identities set identity_data = '{}';`

**Weryfikacja:** liczby wierszy 245/245 tabel zgodne (268 127 wierszy w nowej bazie; jedyna
różnica zamierzona: `lead_communications` −45 329). Sumy kontrolne per tabela (ten sam SQL po obu
stronach: `md5(string_agg(md5(wiersz::text) order by PK))`, identyczne `timezone`/`DateStyle`/
`extra_float_digits`): **240/245 identyczne**; 5 różnych to dryf żywej produkcji po kopii
(`loan_applications` 1 wiersz, `loan_reminder_email_variants` 1, `meta_lead_forms` 4,
`reminder_email_schedule` 1 — `updated_at` późniejsze niż kopia, zbieżne z uruchomieniami cronów
`loan-reminder*-tick`, `meta-leads-pull`; `loan_reminder_email_sends` 2 wiersze — tylko kolumny
`open_count`/`opened_at`, czyli śledzenie otwarć e-maili). Bez wierszy brakujących/nadmiarowych.

**Finalna kopia (okno serwisowe), procedura:** (a) zatrzymać ruch do starej bazy (publikacja
Lovable/aplikacja, crony produkcji wstrzymane), (b) `schema-diff.sql` → ewentualne różnice schematu
dogenerować, (c) w nowej bazie: `grant`y + `bypassrls` dla `migrator`, `disable trigger user`,
identity `by default`, `handle_new_user` no-op, FK cyklu `deferred`; `truncate` tabel docelowych
i `auth.users`/`auth.identities` (konektor poprosi o potwierdzenie) albo ładowanie przyrostowe po
`updated_at`/PK; (d) ładowanie w tej samej kolejności topologicznej; (e) przywrócenie + `setval`
+ liczby wierszy + sumy kontrolne (oczekiwane 245/245); (f) storage (krok 7), zmiana adresu w cronach
i ich włączenie, przełączenie kluczy w aplikacji.

**Otwarte przed przełączeniem:** krok 7 (Storage API: 4,7 GB, deduplikacja, mimetype filmów —
potrzebny network secret z kluczem `service_role` nowego projektu); crony: podmiana `lovable.app`
→ nowy adres hooków i klucza `anon` w poleceniach, dopiero wtedy `active = true`; sekrety
funkcji/API aplikacji (poza bazą); `supabase_migrations` vs 304 pliki w repo — ustalić baseline
przed pierwszym `supabase db push`.

**Sprzątanie po migracji (zaktualizowane):** stara baza — `drop schema _mig_remote cascade`,
`drop user mapping for postgres server newdb`, `drop server newdb`, `drop extension postgres_fdw`,
`drop extension dblink`, `delete from vault.secrets where name = 'migration_target'`; nowa baza —
`drop schema _mig cascade`, `drop role migrator` (`drop owned by migrator` wcześniej). Konektor
Supabase wymaga potwierdzenia dla `drop`/`delete`/`truncate`.

### Historia migracji: repo vs produkcja (2026-10-10)

Repo: 304 pliki `supabase/migrations/` (20260518124329 … 20261009130000). Produkcja
(`supabase_migrations.schema_migrations`, skopiowana do nowej bazy): 231 wersji
(20260518124328 … 20260916162804). Dopasowanie (nazwa pliku = `name` wersji, UUID w nazwie
albo znacznik czasu ±5 s): **~166 par**. Pozostałe: ~138 plików „nazwanych” (ręczne migracje:
`*_project_module_core`, `*_pep_screening` …) bez wpisu w historii oraz ~65 wersji zastosowanych
przez Lovable (20.07–16.09, nazwy UUID) bez pliku w repo — Lovable nadawał własne znaczniki przy
stosowaniu ręcznych migracji, więc historia i pliki rozjechały się dwustronnie. Wniosek:
`supabase db push` z obecną historią uznałby wszystkie 304 pliki za niezastosowane.

Kontrola treści niedopasowanych plików względem schematu (773 obiektów: tabele, funkcje,
indeksy, kolumny, polityki) wykazała, że **nie wszystko z repo trafiło do produkcji**:
- brak tabel: `comms_suppressions` (20260730090000_bot_loop_guard), `pr_opportunities`,
  `pr_outreach_log` (20260803160000_pr_module), `rcn_transactions` (20260718130001),
  `seo_location_pages` (20260803150000), `seo_location_report_entries` (20260803153000),
  `video_pipeline` (20260803170000);
- brak funkcji: `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`
  (kolejka e-mail na pgmq z `email_infra`; produkcja nie ma kolejek pgmq),
  `investor_module_access_active` (20260802120000_module_access_full_investor);
- brak 20 indeksów, m.in. `call_queue`/`lead_communications` z
  20260925130000_dogonienie_cennika_i_indeksy_timeoutow (plik zastosowany **częściowo**),
  `access_payments_unlock_one_in_flight`, `investor_assistant_messages_user_idx`;
- brak kolumn: `text_agent_knowledge.audience`, `ai_seo_articles.youtube_video_id`,
  `seo_location_pages.youtube_video_id`; brak 10 polityk (w tym `investors.investors_partner_select`,
  `affiliate_commission_rules.rules_select_all`, `affiliate_unregistered_activity_limits.limits_select_all`).
Narzędzia MCP aplikacji (`list_pr_opportunities`, `list_seo_location_pages`, `generate_video`…)
odwołują się do brakujących tabel — te funkcje w produkcji nie mogą działać.

**Migracja „dogonienie” — gotowa, przetestowana, nie zastosowana.** Plik
`supabase/migrations/20261010120000_dogonienie_niezastosowanych_z_repo.sql` (442 linie) zbiera
brakujące obiekty, treść 1:1 z plików źródłowych (podanych w nagłówkach sekcji), wszystko
idempotentnie (`CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, polityki i triggery
w blokach `DO` z kontrolą istnienia, funkcje `CREATE OR REPLACE`): 7 tabel z RLS, 3 kolumny,
20 indeksów, 7 polityk, 5 triggerów `updated_at`, 4 funkcje pgmq (`enqueue_email`,
`read_email_batch`, `delete_email`, `move_to_dlq`). Świadomie pominięte (uzasadnienie w nagłówku
pliku): `investors_partner_select` (usunięta celowo przez 20260719123238), `rules_select_all` /
`limits_select_all` (produkcja ma wersje tylko dla kadry), `investor_module_access_active` (0 użyć).
Próbne wykonanie w nowej bazie 2026-10-10 w transakcji wycofanej na końcu (`begin; … rollback;`):
**0 błędów**, po wycofaniu żadna z tabel ani funkcji nie została (kontrola w `pg_class`/`pg_proc`).

Dwie rzeczy, których pliki źródłowe nie miały, a nowa baza wymaga:
- **jawne granty** — nowy projekt ma wyłączone automatyczne wystawianie tabel przez API
  (default privileges ról `anon`/`authenticated`/`service_role` nie zawierają nowych tabel; funkcje
  domyślnie tylko `postgres`), więc migracja nadaje `GRANT` 1:1 z intencją plików źródłowych
  (`authenticated`/`service_role`; `anon` tylko `SELECT` na dwóch tabelach SEO z publicznymi
  politykami). **Ta sama zasada obowiązuje każdą przyszłą migrację** — bez grantu tabela jest
  niewidoczna przez PostgREST niezależnie od polityk RLS;
- **utwardzenie wrapperów pgmq** — `SECURITY DEFINER` bez `search_path` i wykonywalne przez
  wszystkich w plikach źródłowych; tutaj `SET search_path = ''`, `REVOKE … FROM PUBLIC, anon,
  authenticated`, `GRANT EXECUTE … TO service_role` (woła je tylko backend przez klucz service_role,
  `src/routes/lovable/email/queue/process.ts`).

**Baseline historii — gotowy do decyzji właściciela.** Cel: historia w nowej bazie = dokładnie
pliki z repo, żeby `supabase db push` miał czystą bazę. Stan: 231 wersji Lovable w bazie vs 304 plików
w repo (bez dogonienia); **wspólne tylko 23**, 208 wersji Lovable nie ma odpowiednika w repo. Po drodze
wyszły **4 pary plików o tej samej wersji** (`version` jest kluczem głównym historii, więc `db push`
i `migration repair` wywaliłyby się na drugim pliku pary) — drugi plik każdej pary przesunięty
o 1 s: `20260718130001_rcn_transactions`, `20260721120001_didit_kyc`,
`20260730120001_offer_card_distribution`, `20260802120001_remove_investor_free_tier` (zmiana tylko
nazwy; treść i baza nietknięte; odwołania w docs poprawione).

Narzędzia (`docs/migracja/`): `baseline-historii.py` generuje z repo i listy wersji z bazy:
`baseline-wersje-repo.txt` (304), `baseline-wersje-lovable.txt` (208 do usunięcia) i
`baseline-historii.sql` — (1) archiwum starej historii do `_mig.lovable_schema_migrations`,
(2) **DELETE** 208 wierszy (destrukcyjne — konektor poprosi o potwierdzenie), (3) `INSERT … ON CONFLICT`
304 wierszy, (4) kontrola. Wariant w repo ma `statements = NULL` (100 KB); wariant z treścią plików
(`--bez --no-statements`, 3,8 MB) generuje się na żądanie. Równoważnik przez CLI (zapisuje też
`statements`, wymaga hasła bazy): `supabase migration repair --status reverted $(cat
baseline-wersje-lovable.txt)` → `--status applied $(cat baseline-wersje-repo.txt)` → `migration list`
→ `db push` (zastosuje i zarejestruje `20261010120000` dogonienie). **Nie** rejestrować dogonienia
przez `apply_migration` konektora — nadaje własną wersję (bieżący czas), co znów rozjedzie historię
z plikiem; przez konektor: `execute_sql` z treścią pliku + jawny `insert` wersji `20261010120000`.
Alternatywa (gorsza): zostawić historię Lovable i puścić `db push` — uznałby 281 plików za
niezastosowane, a pliki zastosowane częściowo wywaliłyby się na `create table` bez `if not exists`.
Zastosowanie dogonienia przed finalną kopią danych jest bezpieczne: `data-sync.sql` ładuje tylko
tabele istniejące w produkcji, a nowe tabele są puste.

### Storage (krok 7) — inwentarz i droga

Inwentarz `storage.objects`: 2 535 obiektów, 4,63 GB; **unikalnych po eTag 3,99 GB**
(283 grupy duplikatów = 1 451 zbędnych kopii / 655 MB; `pliki-klienta`: 2 020 obiektów → 630
unikalnych, 901 → 532 MB). Buckety wg rozmiaru: `marketing-materials` 2 051 MB (351),
`training-videos` 1 038 MB (35; 19 filmów `application/octet-stream` = 814 MB → `video/mp4`),
`pliki-klienta` 901 MB, `studio-media` 730 MB (publiczny), reszta < 15 MB; 5 bucketów pustych.
Największe pliki 147 MB i 106 MB — przekraczają limit 100 MB części bucketów (na czas kopii:
`file_size_limit = null`, potem przywrócić). Odwołania do ścieżek w bazie: `documents.file_path/
file_url`, `marketing_materials.storage_path`, `training_videos.file_path`, `studio_images.storage_path`,
`lead_magnets.file_path/file_url`, `aml_*.*_storage_path`, `esign_envelopes.source_bucket` …
→ kopia 1:1 (tryb `full`) jest bezpieczna; deduplikacja (`dedup`) wymaga przepisania odwołań.

Skrypt: `docs/migracja/storage-copy.py` (lista rekurencyjna, pobranie, poprawa mimetype, upload
z `x-upsert`, wznawialny, 4 wątki). Kontener dosięga obu projektów (sprawdzone). **Potrzebne od
właściciela (jako sekrety sieciowe środowiska, nigdy w czacie):** `NEW_SERVICE_KEY` (service_role
nowego projektu — Supabase → Settings → API) oraz `OLD_SERVICE_KEY` (service_role starego projektu,
jeśli Lovable Cloud go pokazuje). Awaryjnie bez klucza starego projektu: MCP aplikacji
`supabase_storage/signed_url` (do 7 dni) — ~1 100 unikalnych plików = ~1 100 wywołań, manifest
`--signed-manifest`. `app.settings.jwt_secret` w starej bazie nie jest czytelny.

### Crony — przepisanie na nowy adres

`docs/migracja/cron-rewrite.sql`: podmiana `https://project--5394e6ca-….lovable.app` →
`__NEW_HOOKS_BASE__` (adres nowego hostingu — do uzupełnienia) i klucza `anon` starego projektu na
nowy (`eyJ…ImpxdmVweGh1bHhkbmJ3Ym9na2hlI…` → klucz z `get_publishable_keys` nowego projektu;
URL API: `https://vkzndnaoxhdxrxlpntcb.supabase.co`). Włączenie dopiero przy przełączeniu;
4 joby czysto SQL-owe można włączyć wcześniej.

## Do sprawdzenia w kodzie (osobno)

- Zabezpieczenie przed pętlą mailową (odpowiedzi na własną domenę / autorespondery).
- Idempotencja zapisu załączników do `pliki-klienta` (zdublowane uploady z lipca).
