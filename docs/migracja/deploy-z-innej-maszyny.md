# Deploy Workera `finyou` z innej maszyny (np. sesja Claude Code w chmurze)

Build Vite potrzebuje ok. 8 GB wolnej pamięci; na laptopie z 6 GB RAM esbuild pada
(„The service was stopped: write EOF”). Dlatego build i deploy robimy na maszynie z większą pamięcią.
Sekrety Workera (58 sztuk) i zmienna SUPABASE_URL są już w Cloudflare — nic nie trzeba kopiować.

## Kroki

1. Pobierz gałąź:
   ```bash
   git clone https://github.com/plnyspolka-pixel/finyou.git && cd finyou
   git checkout migracja-na-main
   ```
2. Zaloguj się do Cloudflare zwykłą sesją (konto z Workerem `finyou`, account 9dcf6ebe33b66eac13bbb74240ec4c42):
   ```bash
   npx wrangler login
   ```
   Alternatywa bez przeglądarki: `export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=9dcf6ebe33b66eac13bbb74240ec4c42`
   (token z uprawnieniem Workers Scripts: Edit).
3. Build + deploy jednym poleceniem (instaluje zależności, buduje, wdraża, robi smoke test):
   ```bash
   bash scripts/migracja/deploy.sh
   ```
   Gdy paczka `.output` już jest: `SKIP_BUILD=1 bash scripts/migracja/deploy.sh`.
   Mniej pamięci: `BUILD_HEAP=6144 bash scripts/migracja/deploy.sh`.

Deploy idzie na adres tymczasowy `https://finyou.financeyou.workers.dev` — domena app.financeyou.pl
nie jest ruszana (brak `routes` w wrangler.jsonc).

## Co jest w repo, a co nie

- `wrangler.jsonc`: nazwa `finyou`, jedna zmienna `SUPABASE_URL` (nowy projekt `vkzndnaoxhdxrxlpntcb`).
  `TPAY_API_BASE` usunięty — kod ma ten sam adres domyślnie.
- `.env` (klucze publiczne Supabase i VITE_*) jest w repo, build ich używa.
- Sekrety aplikacji NIE są w repo; lista i stan: `docs/migracja/sekrety-do-zrobienia.md`.
- Plik `~/.finyou-migracja/env` z tokenami jest opcjonalny; bez niego skrypty używają `wrangler login`.

## Limit zmiennych Workera (plan Free: 64)

Stan 2026-11-04: 59 z 64. Usunięte jako zbędne: SUPABASE_ANON_KEY (kod czyta SUPABASE_PUBLISHABLE_KEY),
VAPID_SUBJECT (domyślne `mailto:kontakt@financeyou.pl`), FINANCEYOU_WEBHOOK_SECRET (fallback dla
ELEVENLABS_WEBHOOK_SECRET), TPAY_API_BASE. Do dodania zostały: KSEF_TOKEN_FINANCE_YOU,
KSEF_TOKEN_FUNDACJA_IM_PIECZAKA, GUS_BIR_API_KEY, GUS_BDL_API_KEY, CEIDG_JWT_TOKEN (opcjonalnie EU_FSF_TOKEN,
CAPTION_BURNER_URL/SECRET). REMOTION_AWS_* i OWNER_ALERT_PHONE nie są czytane przez Workera.

## Wariant bez własnej maszyny: GitHub Actions

Workflow `.github/workflows/deploy-worker.yml` buduje i wdraża Workera na maszynie GitHub po każdym
pushu na gałąź `migracja-na-main` (albo ręcznie: Actions > Deploy Worker finyou > Run workflow).
Jednorazowo trzeba dodać sekret repozytorium `CLOUDFLARE_API_TOKEN`
(https://github.com/plnyspolka-pixel/finyou/settings/secrets/actions, token z uprawnieniem Workers Scripts: Edit).

## Gałąź `migracja-na-main` (2026-11-04)

Stara gałąź `claude/dazzling-ritchie-qn9w8w` stała na kodzie z 9.10, a `main` (produkcja Lovable) poszedł
o ~435 commitów dalej. Gałąź `migracja-na-main` = aktualny `main` + commity migracji (skrypty, dokumenty,
wrangler.jsonc, workflow) + ponownie nałożone „odlovable'owanie” kodu: wszystkie wywołania bramki AI przez
`aiFetch` (src/lib/ai.server.ts, Claude), bez `LOVABLE_API_KEY`, `metrics: false` w MCP. Przy konfliktach
logiki biznesowej (prowizja, pakiet prawny, kalkulatory) wygrywała wersja z `main`. Dodatkowo `aiFetch`
obsługuje części `type: "file"` (PDF → blok `document` Claude), których wcześniej nie tłumaczył.
