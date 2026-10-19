#!/usr/bin/env bash
# Migracja Finance You: wszystko, co da się zrobić automatycznie po wklejeniu trzech wartości.
#
# Użycie (wartości NIE trafiają do repo ani do logów):
#   export SUPABASE_PAT=sbp_...            # https://supabase.com/dashboard/account/tokens
#   export CLOUDFLARE_API_TOKEN=...        # token konta (cfat_…) albo użytkownika z uprawnieniem Workers
#   export CLOUDFLARE_ACCOUNT_ID=...
#   # opcjonalnie: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (własny klient OAuth),
#   #              DIDIT_WEBHOOK_SECRET (z panelu Didit; bez niego funkcja didit-webhook odrzuca podpisy),
#   #              STAGES="1 2 3 4 5 6" — które etapy uruchomić (domyślnie 1 2 3 4 5; 6 tylko jawnie),
#   #              CONFIRM_SQL=tak — bez tego etap 4 robi tylko kopię i podgląd, nic nie usuwa,
#   #              HOOK=workers|cutover — tryb etapu 6 (patrz niżej).
#   bash scripts/migracja/po-tokenach.sh
#
# Co robi (idempotentnie, każdy etap osobno loguje wynik):
#   1. Management API: klucze service_role i anon (do sekretów Workera, nie zapisywane w repo).
#   2. Auth: redirecty (scalone z obecną listą, nie nadpisywane), (Google OAuth, jeśli podano).
#      NIE rusza site_url ani hooka „Send Email” — to etap 6.
#   3. Sekrety funkcji Edge: PROXY_SHARED_SECRET (generowany), DIDIT_WEBHOOK_SECRET (jeśli podano).
#   4. SQL: kopia supabase_migrations.schema_migrations → schema_migrations_backup_20261019,
#      podgląd, a po CONFIRM_SQL=tak: usunięcie 208 wpisów Lovable z historii + 4 DROP (dogonienie).
#   5. Cloudflare: build + `wrangler deploy` na adres tymczasowy *.workers.dev + sekrety Workera
#      (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, PROXY_SHARED_SECRET, SEND_EMAIL_HOOK_SECRET,
#      CRON_SECRET) + smoke test. Pozostałe sekrety aplikacji (lista: docs/migracja/sekrety-aplikacji.md)
#      wgrywa się później z pliku JSON: `npx wrangler secret bulk plik.json`.
#   6. Hook „Send Email” + site_url (tylko jawnie, STAGES=6):
#        HOOK=workers — hook i site_url na adres workers.dev (testy; wymaga RESEND_API_KEY w Workerze),
#        HOOK=cutover — hook i site_url na $APP_URL (dopiero w oknie serwisowym, po przepięciu domeny).
set -euo pipefail
cd "$(dirname "$0")/../.."

REF="vkzndnaoxhdxrxlpntcb"
APP_URL="${APP_URL:-https://app.financeyou.pl}"
API="https://api.supabase.com/v1/projects/$REF"
STATE="${STATE:-$HOME/.finyou-migracja}"   # poza repo; chmod 600
STAGES=" ${STAGES:-1 2 3 4 5} "
mkdir -p "$STATE"; chmod 700 "$STATE"

: "${SUPABASE_PAT:?brak SUPABASE_PAT}"
AUTH=(-H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json")
log(){ printf '\n== %s\n' "$*"; }
run(){ [[ "$STAGES" == *" $1 "* ]]; }
sb(){ # sb METODA ŚCIEŻKA [JSON]
  local m=$1 p=$2 d=${3:-}
  if [ -n "$d" ]; then curl -sS -f -X "$m" "${AUTH[@]}" "$API$p" -d "$d"; else curl -sS -f -X "$m" "${AUTH[@]}" "$API$p"; fi
}
sql(){ sb POST /database/query "$(jq -cn --arg q "$1" '{query:$q}')"; }
gen(){ openssl rand -hex 32; }
# stałe sekrety między uruchomieniami (żeby ponowne odpalenie nie rotowało wartości)
keep(){ local f="$STATE/$1"; [ -s "$f" ] || { gen > "$f"; chmod 600 "$f"; }; cat "$f"; }
wrangler(){ npx --yes wrangler@4 "$@"; }

# Sekret hooka: Supabase i Worker dostają TEN SAM napis `v1,whsec_<base64>` (webhook.ts dekoduje base64).
SEND_EMAIL_HOOK_SECRET="v1,whsec_$(printf '%s' "$(keep send_email_hook_secret)" | base64 -w0)"
PROXY_SHARED_SECRET=$(keep proxy_shared_secret)

if run 1 || run 5; then
  log "1. Klucze service_role / anon"
  KEYS=$(sb GET '/api-keys?reveal=true')
  SERVICE_ROLE=$(jq -r '.[] | select(.name=="service_role") | .api_key' <<<"$KEYS")
  ANON=$(jq -r '.[] | select(.name=="anon") | .api_key' <<<"$KEYS")
  [ -n "$SERVICE_ROLE" ] && [ "$SERVICE_ROLE" != null ] || { echo "nie udało się pobrać service_role"; exit 1; }
  echo "ok (service_role: ${#SERVICE_ROLE} znaków, anon: ${#ANON} znaków)"
fi

if run 2; then
  log "2. Auth (redirecty scalone z obecnymi, Google) — bez site_url i hooka"
  OUR_URIS="$APP_URL/**,https://financeyou.pl/**,https://www.financeyou.pl/**,https://*.financeyou.workers.dev/**,http://localhost:3000/**"
  CUR=$(sb GET /config/auth)
  MERGED=$(jq -r --arg ours "$OUR_URIS" '[(.uri_allow_list // "" | split(",")), ($ours | split(","))] | add
    | map(gsub("^\\s+|\\s+$"; "")) | map(select(. != "")) | unique | join(",")' <<<"$CUR")
  AUTH_BODY=$(jq -cn --arg uris "$MERGED" --arg gid "${GOOGLE_OAUTH_CLIENT_ID:-}" --arg gsec "${GOOGLE_OAUTH_CLIENT_SECRET:-}" '
    {uri_allow_list:$uris, mailer_autoconfirm:false, external_email_enabled:true}
    + (if $gid != "" then {external_google_enabled:true, external_google_client_id:$gid, external_google_secret:$gsec} else {} end)')
  sb PATCH /config/auth "$AUTH_BODY" | jq -c '{site_url,uri_allow_list,hook_send_email_enabled,external_google_enabled}'
fi

if run 3; then
  log "3. Sekrety funkcji Edge"
  FN_SECRETS=$(jq -cn --arg p "$PROXY_SHARED_SECRET" --arg d "${DIDIT_WEBHOOK_SECRET:-}" \
    '[{name:"PROXY_SHARED_SECRET",value:$p}] + (if $d != "" then [{name:"DIDIT_WEBHOOK_SECRET",value:$d}] else [] end)')
  sb POST /secrets "$FN_SECRETS" >/dev/null && echo "ustawiono: $(jq -r '[.[].name]|join(", ")' <<<"$FN_SECRETS")"
  [ -n "${DIDIT_WEBHOOK_SECRET:-}" ] || echo "UWAGA: DIDIT_WEBHOOK_SECRET nie podany — ustaw później (ten sam sekret co w panelu Didit)."
fi

if run 4; then
  log "4. SQL: historia migracji (208 wpisów Lovable) + dogonienie_usuniecia (4 DROP)"
  LIST=$(tr -d '\r' < docs/migracja/baseline-wersje-lovable.txt | grep -E '^[0-9]+$' | paste -sd, - | sed "s/,/','/g; s/^/'/; s/$/'/")
  FN_Q="SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('reconcile_object_names','reconcile_shadow_upsert','reconcile_shadow_delete','free_investor_usage');"
  sql "CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations_backup_20261019 AS SELECT * FROM supabase_migrations.schema_migrations;" >/dev/null
  echo "kopia: $(sql "SELECT count(*) AS n FROM supabase_migrations.schema_migrations_backup_20261019;" | jq -r '.[0].n') wierszy w schema_migrations_backup_20261019"
  echo "wszystkich wpisów: $(sql "SELECT count(*) AS n FROM supabase_migrations.schema_migrations;" | jq -r '.[0].n'), do usunięcia (Lovable): $(sql "SELECT count(*) AS n FROM supabase_migrations.schema_migrations WHERE version IN ($LIST);" | jq -r '.[0].n'), funkcji do DROP: $(sql "$FN_Q" | jq -r '.[0].n')"
  if [ "${CONFIRM_SQL:-}" = "tak" ]; then
    sql "DELETE FROM supabase_migrations.schema_migrations WHERE version IN ($LIST);" >/dev/null
    echo "pozostało wpisów Lovable: $(sql "SELECT count(*) AS n FROM supabase_migrations.schema_migrations WHERE version IN ($LIST);" | jq -r '.[0].n')"
    sql "$(tr -d '\r' < supabase/migrations/20261010120100_dogonienie_usuniecia.sql)" >/dev/null
    sql "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261010120100','dogonienie_usuniecia') ON CONFLICT DO NOTHING;" >/dev/null
    echo "DROP wykonane, wersja 20261010120100 zapisana w historii"
    echo "funkcje reconcile_*/free_investor_usage pozostałe: $(sql "$FN_Q" | jq -r '.[0].n'); wpisów w historii: $(sql "SELECT count(*) AS n FROM supabase_migrations.schema_migrations;" | jq -r '.[0].n')"
  else
    echo "tylko podgląd — usunięcie po ponownym uruchomieniu z CONFIRM_SQL=tak STAGES=4"
  fi
fi

if run 5; then
  : "${CLOUDFLARE_API_TOKEN:?brak CLOUDFLARE_API_TOKEN}"; : "${CLOUDFLARE_ACCOUNT_ID:?brak CLOUDFLARE_ACCOUNT_ID}"
  export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
  # token konta (cfat_…) nie przechodzi /user/tokens/verify — weryfikacja przez endpoint konta
  curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify" \
    | jq -e '.success and .result.status=="active"' >/dev/null || { echo "token Cloudflare nieaktywny"; exit 1; }
  log "5a. Build + wrangler deploy (adres tymczasowy *.workers.dev)"
  # bez `npm run build`: skrypt w package.json ma składnię POSIX (NODE_OPTIONS=…), której cmd na Windows nie zna
  [ -d dist ] && [ -z "${REBUILD:-}" ] || NODE_OPTIONS=--max-old-space-size=8192 ./node_modules/.bin/vite build
  wrangler deploy 2>&1 | tee "$STATE/deploy.log" | tail -n 15
  WORKER_URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$STATE/deploy.log" | head -1 || true)

  log "5b. Sekrety Workera"
  CRON_SECRET=$(keep cron_secret)
  jq -cn --arg sr "$SERVICE_ROLE" --arg an "$ANON" --arg p "$PROXY_SHARED_SECRET" --arg h "$SEND_EMAIL_HOOK_SECRET" --arg c "$CRON_SECRET" \
    '{SUPABASE_SERVICE_ROLE_KEY:$sr, SUPABASE_PUBLISHABLE_KEY:$an, SUPABASE_ANON_KEY:$an, PROXY_SHARED_SECRET:$p, SEND_EMAIL_HOOK_SECRET:$h, CRON_SECRET:$c}' \
    > "$STATE/worker-secrets.json"; chmod 600 "$STATE/worker-secrets.json"
  wrangler secret bulk "$STATE/worker-secrets.json"
  echo "Pozostałe sekrety aplikacji: osobny plik JSON wg docs/migracja/sekrety-aplikacji.md → npx wrangler secret bulk <plik>"

  log "5c. Smoke test"
  if [ -n "$WORKER_URL" ]; then
    for p in / /robots.txt; do printf '%s -> ' "$WORKER_URL$p"; curl -s -o /dev/null -w '%{http_code}\n' "$WORKER_URL$p"; done
    echo "WORKER_URL=$WORKER_URL" > "$STATE/worker-url"
  else echo "nie znaleziono adresu workers.dev w logu — sprawdź $STATE/deploy.log"; fi
fi

if run 6; then
  case "${HOOK:-}" in
    workers) [ -s "$STATE/worker-url" ] || { echo "brak $STATE/worker-url — najpierw etap 5"; exit 1; }
             BASE=$(sed -n 's/^WORKER_URL=//p' "$STATE/worker-url") ;;
    cutover) BASE="$APP_URL" ;;
    *) echo "etap 6 wymaga HOOK=workers albo HOOK=cutover"; exit 1 ;;
  esac
  log "6. Hook „Send Email” + site_url → $BASE"
  AUTH_BODY=$(jq -cn --arg site "$BASE" --arg hook "$BASE/lovable/email/auth/webhook" --arg sec "$SEND_EMAIL_HOOK_SECRET" \
    '{site_url:$site, hook_send_email_enabled:true, hook_send_email_uri:$hook, hook_send_email_secrets:$sec}')
  sb PATCH /config/auth "$AUTH_BODY" | jq -c '{site_url,hook_send_email_enabled,hook_send_email_uri}'
fi

log "Gotowe. Dalej: okno serwisowe (docs/migracja-z-lovable.md, sekcja „Kolejność przełączenia”)."
