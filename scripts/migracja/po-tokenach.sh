#!/usr/bin/env bash
# Migracja Finance You: wszystko, co da się zrobić automatycznie po wklejeniu trzech wartości.
#
# Użycie (wartości NIE trafiają do repo ani do logów):
#   export SUPABASE_PAT=sbp_...            # https://supabase.com/dashboard/account/tokens
#   export CLOUDFLARE_API_TOKEN=...        # szablon „Edit Cloudflare Workers”
#   export CLOUDFLARE_ACCOUNT_ID=...
#   # opcjonalnie: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (własny klient OAuth),
#   #              DIDIT_WEBHOOK_SECRET (z panelu Didit; bez niego funkcja didit-webhook odrzuca podpisy),
#   #              SKIP_SQL=1 / SKIP_CF=1 — pominięcie etapów.
#   bash scripts/migracja/po-tokenach.sh
#
# Co robi (idempotentnie, każdy etap osobno loguje wynik):
#   1. Management API: klucz service_role (do sekretów Workera, nie zapisywany na dysku poza $STATE).
#   2. Auth: site_url, redirecty, hook „Send Email” → Worker, (Google OAuth, jeśli podano).
#   3. Sekrety funkcji Edge: PROXY_SHARED_SECRET (generowany), DIDIT_WEBHOOK_SECRET (jeśli podano).
#   4. SQL: usunięcie 208 wpisów Lovable z historii migracji + 4 DROP (dogonienie_usuniecia).
#   5. Cloudflare: `wrangler deploy` na adres tymczasowy *.workers.dev + sekrety Workera
#      (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, PROXY_SHARED_SECRET, SEND_EMAIL_HOOK_SECRET,
#      CRON_SECRET) + smoke test. Pozostałe sekrety aplikacji (lista: docs/migracja/sekrety-aplikacji.md)
#      wgrywa się później z pliku JSON: `npx wrangler secret bulk sekrety.json`.
set -euo pipefail
cd "$(dirname "$0")/../.."

REF="vkzndnaoxhdxrxlpntcb"
APP_URL="${APP_URL:-https://app.financeyou.pl}"
API="https://api.supabase.com/v1/projects/$REF"
STATE="${STATE:-$HOME/.finyou-migracja}"   # poza repo; chmod 600
mkdir -p "$STATE"; chmod 700 "$STATE"

: "${SUPABASE_PAT:?brak SUPABASE_PAT}"
AUTH=(-H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json")
log(){ printf '\n== %s\n' "$*"; }
sb(){ # sb METODA ŚCIEŻKA [JSON]
  local m=$1 p=$2 d=${3:-}
  if [ -n "$d" ]; then curl -sS -f -X "$m" "${AUTH[@]}" "$API$p" -d "$d"; else curl -sS -f -X "$m" "${AUTH[@]}" "$API$p"; fi
}
sql(){ sb POST /database/query "$(jq -cn --arg q "$1" '{query:$q}')"; }
gen(){ openssl rand -hex 32; }
# stałe sekrety między uruchomieniami (żeby ponowne odpalenie nie rotowało wartości)
keep(){ local f="$STATE/$1"; [ -s "$f" ] || { gen > "$f"; chmod 600 "$f"; }; cat "$f"; }

log "1. Klucz service_role"
SERVICE_ROLE=$(sb GET '/api-keys?reveal=true' | jq -r '.[] | select(.name=="service_role") | .api_key')
ANON=$(sb GET '/api-keys?reveal=true' | jq -r '.[] | select(.name=="anon") | .api_key')
[ -n "$SERVICE_ROLE" ] && [ "$SERVICE_ROLE" != null ] || { echo "nie udało się pobrać service_role"; exit 1; }
echo "ok (długość ${#SERVICE_ROLE})"

log "2. Auth (site_url, redirecty, hook Send Email, Google)"
SEND_EMAIL_HOOK_SECRET=$(keep send_email_hook_secret)
HOOK_B64=$(printf '%s' "$SEND_EMAIL_HOOK_SECRET" | base64 -w0)
AUTH_BODY=$(jq -cn --arg site "$APP_URL" --arg hook "$APP_URL/lovable/email/auth/webhook" --arg sec "v1,whsec_$HOOK_B64" \
  --arg gid "${GOOGLE_OAUTH_CLIENT_ID:-}" --arg gsec "${GOOGLE_OAUTH_CLIENT_SECRET:-}" '
  {site_url:$site,
   uri_allow_list:"https://app.financeyou.pl/**,https://financeyou.pl/**,https://www.financeyou.pl/**,https://*.workers.dev/**,http://localhost:3000/**",
   hook_send_email_enabled:true, hook_send_email_uri:$hook, hook_send_email_secrets:$sec,
   mailer_autoconfirm:false, external_email_enabled:true}
  + (if $gid != "" then {external_google_enabled:true, external_google_client_id:$gid, external_google_secret:$gsec} else {} end)')
sb PATCH /config/auth "$AUTH_BODY" | jq -c '{site_url,hook_send_email_enabled,hook_send_email_uri,external_google_enabled}'

log "3. Sekrety funkcji Edge"
PROXY_SHARED_SECRET=$(keep proxy_shared_secret)
FN_SECRETS=$(jq -cn --arg p "$PROXY_SHARED_SECRET" --arg d "${DIDIT_WEBHOOK_SECRET:-}" \
  '[{name:"PROXY_SHARED_SECRET",value:$p}] + (if $d != "" then [{name:"DIDIT_WEBHOOK_SECRET",value:$d}] else [] end)')
sb POST /secrets "$FN_SECRETS" >/dev/null && echo "ustawiono: $(echo "$FN_SECRETS" | jq -r '[.[].name]|join(", ")')"
[ -n "${DIDIT_WEBHOOK_SECRET:-}" ] || echo "UWAGA: DIDIT_WEBHOOK_SECRET nie podany — ustaw później (ten sam sekret co w panelu Didit)."

if [ -z "${SKIP_SQL:-}" ]; then
  log "4. SQL: historia migracji (DELETE 208 wpisów Lovable) + dogonienie_usuniecia (4 DROP)"
  LIST=$(paste -sd, docs/migracja/baseline-wersje-lovable.txt | sed "s/,/','/g; s/^/'/; s/$/'/")
  sql "DELETE FROM supabase_migrations.schema_migrations WHERE version IN ($LIST);" >/dev/null
  echo "pozostało wpisów Lovable: $(sql "SELECT count(*) AS n FROM supabase_migrations.schema_migrations WHERE version IN ($LIST);" | jq -r '.[0].n')"
  sql "$(cat supabase/migrations/20261010120100_dogonienie_usuniecia.sql)" >/dev/null
  sql "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261010120100','dogonienie_usuniecia') ON CONFLICT DO NOTHING;" >/dev/null
  echo "DROP wykonane, wersja 20261010120100 zapisana w historii"
  echo "funkcje reconcile_*/free_investor_usage pozostałe: $(sql "SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('reconcile_object_names','reconcile_shadow_upsert','reconcile_shadow_delete','free_investor_usage');" | jq -r '.[0].n')"
fi

if [ -z "${SKIP_CF:-}" ]; then
  : "${CLOUDFLARE_API_TOKEN:?brak CLOUDFLARE_API_TOKEN}"; : "${CLOUDFLARE_ACCOUNT_ID:?brak CLOUDFLARE_ACCOUNT_ID}"
  export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
  log "5a. Build + wrangler deploy (adres tymczasowy *.workers.dev)"
  [ -d dist ] && [ -z "${REBUILD:-}" ] || npm run build
  npx --yes wrangler@4 deploy 2>&1 | tee "$STATE/deploy.log" | tail -n 15
  WORKER_URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$STATE/deploy.log" | head -1 || true)

  log "5b. Sekrety Workera"
  CRON_SECRET=$(keep cron_secret)
  jq -cn --arg sr "$SERVICE_ROLE" --arg an "$ANON" --arg p "$PROXY_SHARED_SECRET" --arg h "$SEND_EMAIL_HOOK_SECRET" --arg c "$CRON_SECRET" \
    '{SUPABASE_SERVICE_ROLE_KEY:$sr, SUPABASE_PUBLISHABLE_KEY:$an, SUPABASE_ANON_KEY:$an, PROXY_SHARED_SECRET:$p, SEND_EMAIL_HOOK_SECRET:$h, CRON_SECRET:$c}' \
    > "$STATE/worker-secrets.json"; chmod 600 "$STATE/worker-secrets.json"
  npx --yes wrangler@4 secret bulk "$STATE/worker-secrets.json"
  echo "Pozostałe sekrety aplikacji: uzupełnij $STATE/worker-secrets.json wg docs/migracja/sekrety-aplikacji.md i powtórz: npx wrangler secret bulk $STATE/worker-secrets.json"

  log "5c. Smoke test"
  if [ -n "$WORKER_URL" ]; then
    for p in / /robots.txt; do printf '%s -> ' "$WORKER_URL$p"; curl -s -o /dev/null -w '%{http_code}\n' "$WORKER_URL$p"; done
    echo "WORKER_URL=$WORKER_URL" > "$STATE/worker-url"
  else echo "nie znaleziono adresu workers.dev w logu — sprawdź $STATE/deploy.log"; fi
fi

log "Gotowe. Dalej: okno serwisowe (docs/migracja-z-lovable.md, sekcja „Kolejność przełączenia”)."
