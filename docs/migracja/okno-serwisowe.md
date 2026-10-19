# Okno serwisowe: przełączenie Finance You z Lovable na własny Supabase + Cloudflare

Checklista do odhaczania w dniu przełączenia. Tło i uzasadnienia: `docs/migracja-z-lovable.md`
(sekcja „Kolejność przełączenia”), sekrety: `docs/migracja/sekrety-aplikacji.md`, automatyzacja:
`scripts/migracja/po-tokenach.sh`.

| | Stara (produkcja dziś) | Nowa |
|---|---|---|
| Baza / Auth / Storage | Lovable Cloud `jqvepxhulxdnbwbogkhe` | Supabase `vkzndnaoxhdxrxlpntcb` (eu-central-1) |
| Aplikacja | Lovable (`app.financeyou.pl` → A `185.158.133.1`) | Worker `finyou` (`https://finyou.financeyou.workers.dev`) |
| DNS | NS w AZ.pl (`ns6/7/8.az.pl`) | strefa Cloudflare (pending) → `noel.ns.cloudflare.com`, `sharon.ns.cloudflare.com` |

**Narzędzia:** [STARA] = Lovable `query_database` (rola postgres); [NOWA] = Management API przez
`SUPABASE_PAT` (`po-tokenach.sh` / `curl …/database/query`). Konektor Supabase w sesji automatycznej
anuluje DELETE/DROP/TRUNCATE — w oknie albo Management API, albo właściciel zatwierdza w czacie.

Zmienne w środowisku sesji (nigdy w czacie/repo): `SUPABASE_PAT`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `NEW_SERVICE_KEY`, `OLD_SERVICE_KEY` (Storage).

---

## T−1 (dzień przed, produkcja działa normalnie)

- [ ] **Historia migracji**: `CONFIRM_SQL=tak STAGES=4 bash scripts/migracja/po-tokenach.sh` — kopia
      `schema_migrations_backup_20261019` (514 wierszy) już jest; oczekiwane po: 307 wpisów, 0 funkcji
      `reconcile_*`/`free_investor_usage`.
- [ ] **Worker + sekrety Edge**: `STAGES="1 3 5" bash scripts/migracja/po-tokenach.sh` →
      `PROXY_SHARED_SECRET` ten sam w Edge i Workerze, deploy, smoke test `/` i `/robots.txt` = 200.
- [ ] **Pozostałe sekrety Workera**: plik JSON poza repo (np. `~/.finyou-migracja/app-secrets.json`,
      `chmod 600`) wg `sekrety-aplikacji.md` → `npx wrangler secret bulk ~/.finyou-migracja/app-secrets.json`;
      kontrola: `npx wrangler secret list` (same nazwy).
- [ ] **Google OAuth**: własny klient w Google Cloud, redirect
      `https://vkzndnaoxhdxrxlpntcb.supabase.co/auth/v1/callback`; potem
      `GOOGLE_OAUTH_CLIENT_ID=… GOOGLE_OAUTH_CLIENT_SECRET=… STAGES=2 bash scripts/migracja/po-tokenach.sh`.
- [ ] **Didit**: `DIDIT_WEBHOOK_SECRET=… STAGES=3 bash scripts/migracja/po-tokenach.sh` (ten sam sekret
      co w panelu Didit; URL webhooka zmienia się dopiero w T0).
- [ ] **Maile Auth (test)**: `RESEND_API_KEY` w Workerze → `HOOK=workers STAGES=6 bash scripts/migracja/po-tokenach.sh`
      (hook + site_url na workers.dev). Rate limit: Supabase → Auth → Rate Limits → „emails sent” z 2/h
      na ~100/h (przy hooku limit nadal liczy maile).
- [ ] **Testy na workers.dev** (na danych z próbnej kopii): rejestracja + mail potwierdzający,
      logowanie hasłem i Google, reset hasła, złożenie wniosku z plikiem, podgląd pliku z `pliki-klienta`,
      panel admina, ręczne wywołanie jednego hooka cron (`curl -H "apikey: <anon>" …/api/public/hooks/<nazwa>`).
- [ ] **Storage — wstępna kopia** (skraca okno do delty): `python3 docs/migracja/storage-copy.py --mode full`
      (wznawialny; przy plikach > 100 MB tymczasowo `file_size_limit = null` w bucketach, potem przywrócić).
- [ ] **DNS w Cloudflare przygotowany** (strefa pending, nic jeszcze nie działa): porównać 15 rekordów
      z AZ.pl, uporządkować `_dmarc` (niżej), **nie** dodawać jeszcze rekordu `app` dla Workera.
      Obniżyć TTL rekordów `app` i `@` w AZ.pl do 300 s (dzień wcześniej).
- [ ] Ogłoszenie przerwy (baner/mail do zespołu), wybrać porę najmniejszego ruchu.

## T0 — okno serwisowe (kolejność ma znaczenie)

1. [ ] **Zamrożenie starej produkcji** [STARA]:
       ```sql
       create table if not exists public._cron_active_przed_oknem as
         select jobid, jobname from cron.job where active;   -- zapamiętany zestaw aktywnych
       select cron.alter_job(jobid, active := false) from cron.job where active;
       ```
       Lovable: wstrzymać publikację/edycję projektu (żeby nic nie wdrożyło się w trakcie).
       Od tej chwili żadnych zapisów w starej bazie (komunikat przerwy).
2. [ ] **Finalna kopia danych**: `docs/migracja/data-sync.sql` sekcje 0→7 w podanej kolejności
       (1b TRUNCATE celu przez Management API). Weryfikacja z sekcji 7: wszystkie tabele zgodne
       (próba 10.10: 245/245).
3. [ ] **Delta Storage**: ponownie `storage-copy.py --mode full` (pomija skopiowane), na końcu raport
       0 błędów; przywrócić `file_size_limit`.
4. [ ] **Przełączenie DNS** (wymaga wyraźnej zgody właściciela w tym momencie):
       - AZ.pl → domena `financeyou.pl` → serwery DNS: `noel.ns.cloudflare.com`, `sharon.ns.cloudflare.com`.
       - Cloudflare: poczekać na status strefy *Active* (zwykle minuty–godziny).
       - Workers → `finyou` → Settings → Domains & Routes → *Custom domain* `app.financeyou.pl`
         (Cloudflare sam zastąpi rekord A `185.158.133.1`; usunąć go, jeśli koliduje).
       - Zostawić bez zmian rekordy poczty: `MX app` → `inbound-smtp.eu-west-1.amazonaws.com`,
         `resend._domainkey.app`, `send.app` (MX+TXT), `resend._domainkey`, `send` (MX+TXT), `MX @`, SPF `@`.
       - `financeyou.pl` / `www` nadal wskazują Lovable (`185.158.133.1`) — osobna decyzja, co tam ma być
         (strona główna); jeśli to ta sama aplikacja → też custom domain Workera.
       - Kontrola: `curl -sI https://app.financeyou.pl` → nagłówek `server: cloudflare`, 200.
5. [ ] **Crony w nowej bazie** [NOWA]: polecenia już przepisane na `https://app.financeyou.pl`
       i nowy klucz anon (30/34 jobów; 34 nieaktywne — stan 19.10). Włączyć **ten sam zestaw**, który był
       aktywny w starej bazie (lista z kroku 1; `dedup-loan-applications` był nieaktywny i ma zostać):
       ```sql
       select cron.alter_job(jobid, active := true) from cron.job
       where jobname in (<lista z _cron_active_przed_oknem>);
       ```
       Jeśli od 19.10 doszły nowe joby w starej bazie — najpierw `docs/migracja/cron-rewrite.sql`.
6. [ ] **Auth na docelowy adres**: `HOOK=cutover STAGES=6 bash scripts/migracja/po-tokenach.sh`
       → `site_url = https://app.financeyou.pl`, hook „Send Email” → `https://app.financeyou.pl/lovable/email/auth/webhook`.
7. [ ] **Webhook Didit**: panel Didit → Webhooks → URL
       `https://vkzndnaoxhdxrxlpntcb.supabase.co/functions/v1/didit-webhook` (sekret = `DIDIT_WEBHOOK_SECRET`).
       Pozostałe webhooki dostawców wskazujące `*.lovable.app` (Resend, Twilio, Meta, ElevenLabs, Tpay/TubaPay)
       → `https://app.financeyou.pl/...` (ta sama ścieżka).
8. [ ] **Kontrola** (każdy punkt na `https://app.financeyou.pl`):
       - [ ] logowanie hasłem istniejącego konta i przez Google (sesje sprzed okna wygasły — to oczekiwane)
       - [ ] nowy wniosek z plikiem → plik widoczny w panelu, otwiera się stary plik klienta
       - [ ] mail: reset hasła dochodzi (Resend → Logs), mail transakcyjny z aplikacji
       - [ ] cron: `select jobname, status, return_message from cron.job_run_details order by start_time desc limit 20;`
             + `net._http_response` z kodami 200
       - [ ] Didit: testowa sesja/„Resend webhook” → 200 w logach funkcji `didit-webhook`
       - [ ] `npx wrangler tail finyou` — brak błędów 5xx przez 15 min
9. [ ] **Decyzja go / no-go.** Wycofanie (do momentu nowych zapisów w nowej bazie): rekord `app` →
       A `185.158.133.1` (w Cloudflare, bez zmiany NS), crony starej bazy z powrotem `active = true`
       wg `_cron_active_przed_oknem`, publikacja Lovable wznowiona.

## Po oknie — sprzątanie

- [ ] Monitorować 48 h (wrangler tail, Resend, cron.job_run_details), potem:
- [ ] stara baza: crony zostają wyłączone; FDW/`_mig_remote`/user mapping `newdb` usunąć; rola `migrator`
      w nowej bazie: `alter role migrator nobypassrls` + revoke (sekcja 6 `data-sync.sql`) lub `drop role`.
- [ ] `localhost:3000` i `*.financeyou.workers.dev` w `uri_allow_list` — zostawić tylko, jeśli potrzebne do dev.
- [ ] Usunąć tokeny migracyjne: Supabase PAT `finyou-migracja`, token Cloudflare all-access (zastąpić
      wąskim: Workers Scripts:Edit + Zone DNS:Edit, jeśli potrzebny do CI).
- [ ] Usunąć `schema_migrations_backup_20261019` po miesiącu bez problemów.
- [ ] Lovable: projekt w trybie tylko do odczytu / eksport, wyłączenie po okresie przejściowym.

## DMARC — 3 sprzeczne rekordy `_dmarc` w strefie Cloudflare

Publicznie (AZ.pl, 19.10) jest jeden: `v=DMARC1; p=none; pct=100; rua=mailto:dmarcreports@lovable.dev`
(raporty trafiają do Lovable). Wiele rekordów `v=DMARC1` pod tą samą nazwą = DMARC nieważny (RFC 7489 §6.6.3),
więc w Cloudflare przed aktywacją strefy **zostawić dokładnie jeden** `TXT _dmarc`:

```
v=DMARC1; p=none; rua=mailto:<skrzynka właściciela, np. dmarc@financeyou.pl>; adkim=r; aspf=r
```

- Usunąć pozostałe dwa (i wersję z `rua=…@lovable.dev`, gdy przestajemy korzystać z Lovable).
- Adres `rua` musi być w domenie `financeyou.pl` albo mieć autoryzację zewnętrzną
  (`financeyou.pl._report._dmarc.<domena-odbiorcy>`).
- Subdomena `app` dziedziczy politykę (`sp` niepodane = `p`). Po 2–4 tygodniach czystych raportów
  (Resend z DKIM `resend._domainkey`, SPF `send.*`) → `p=quarantine`.
