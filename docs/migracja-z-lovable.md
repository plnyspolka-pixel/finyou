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
   name='migration_target'`; nowa baza — `reassign owned by migrator to postgres`,
   `drop owned by migrator`, `drop role migrator`.
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

Następny krok: krok 4 (schemat) — najpierw próbnie, z weryfikacją liczb obiektów (krok 5).

## Do sprawdzenia w kodzie (osobno)

- Zabezpieczenie przed pętlą mailową (odpowiedzi na własną domenę / autorespondery).
- Idempotencja zapisu załączników do `pliki-klienta` (zdublowane uploady z lipca).
