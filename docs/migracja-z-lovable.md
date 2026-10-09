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

## Wybrana metoda migracji bazy: baza → baza przez `postgres_fdw`

1. Schemat w nowym projekcie z `supabase/migrations/` + porównanie katalogu z produkcją.
2. W starej bazie: `create extension postgres_fdw`, serwer do nowej bazy, `INSERT … SELECT`
   tabela po tabeli (z `auth.users`/`auth.identities` z hashami haseł).
3. Weryfikacja liczby wierszy we wszystkich tabelach.
4. Usunięcie mappingu i rozszerzenia w starej bazie; **rotacja hasła nowej bazy** (hasło
   przechodzi przez Lovable).
5. Storage: skrypt kopiujący przez Storage API (deduplikacja po sumie kontrolnej).
6. Crony odtworzone z nowym adresem aplikacji, retencja logów `cron.job_run_details` ~3 dni.
7. Najpierw próbna kopia; finalna kopia i przełączenie w oknie serwisowym.

## Sekrety (tylko w ustawieniach środowiska sesji, nigdy w czacie ani w repo)

- `NEW_SUPABASE_DB_URL` — Connection string, Session pooler, z hasłem
- `NEW_SUPABASE_URL` — Project URL
- `NEW_SUPABASE_SERVICE_ROLE_KEY` — klucz `service_role`

## Do sprawdzenia w kodzie (osobno)

- Zabezpieczenie przed pętlą mailową (odpowiedzi na własną domenę / autorespondery).
- Idempotencja zapisu załączników do `pliki-klienta` (zdublowane uploady z lipca).
