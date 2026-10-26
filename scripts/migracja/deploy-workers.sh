#!/usr/bin/env bash
# Etap 5 z po-tokenach.sh bez ponownego builda: wdrożenie gotowej paczki (.output, `vite build`)
# na adres tymczasowy *.workers.dev + 6 podstawowych sekretów Workera + smoke test.
# Domena app.financeyou.pl NIE jest ruszana (ruch nadal idzie do Lovable).
# Tokeny z ~/.finyou-migracja/env (SUPABASE_PAT, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID).
#   bash scripts/migracja/deploy-workers.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
STATE="${STATE:-$HOME/.finyou-migracja}"; REF="vkzndnaoxhdxrxlpntcb"
# shellcheck disable=SC1091
source "$STATE/env"; export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
[ -f .output/server/index.mjs ] || { echo "brak paczki .output — najpierw: NODE_OPTIONS=--max-old-space-size=8192 ./node_modules/.bin/vite build"; exit 1; }
keep(){ local f="$STATE/$1"; [ -s "$f" ] || { openssl rand -hex 32 > "$f"; chmod 600 "$f"; }; tr -d '\r\n' < "$f"; }

echo "== 1. Klucze service_role / anon"
KEYS=$(curl -sS -f -H "Authorization: Bearer $SUPABASE_PAT" "https://api.supabase.com/v1/projects/$REF/api-keys?reveal=true")
SR=$(jq -r '.[]|select(.name=="service_role")|.api_key' <<<"$KEYS"); AN=$(jq -r '.[]|select(.name=="anon")|.api_key' <<<"$KEYS")
[ -n "$SR" ] && [ "$SR" != null ] || { echo "nie udało się pobrać service_role"; exit 1; }
echo "ok (service_role: ${#SR} znaków, anon: ${#AN} znaków)"

echo "== 2. wrangler deploy (*.workers.dev)"
npx --yes wrangler@4 deploy 2>&1 | tee "$STATE/deploy.log" | tail -n 15
WORKER_URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$STATE/deploy.log" | head -1 || true)

echo "== 3. Sekrety Workera"
HOOK="v1,whsec_$(printf '%s' "$(keep send_email_hook_secret)" | base64 -w0)"
jq -cn --arg sr "$SR" --arg an "$AN" --arg p "$(keep proxy_shared_secret)" --arg h "$HOOK" --arg c "$(keep cron_secret)" \
  '{SUPABASE_SERVICE_ROLE_KEY:$sr, SUPABASE_PUBLISHABLE_KEY:$an, SUPABASE_ANON_KEY:$an, PROXY_SHARED_SECRET:$p, SEND_EMAIL_HOOK_SECRET:$h, CRON_SECRET:$c}' \
  > "$STATE/worker-secrets.json"; chmod 600 "$STATE/worker-secrets.json"
npx --yes wrangler@4 secret bulk "$STATE/worker-secrets.json"

echo "== 4. Smoke test"
if [ -n "$WORKER_URL" ]; then
  for p in / /robots.txt /auth; do printf '%s -> ' "$WORKER_URL$p"; curl -s -o /dev/null -w '%{http_code}\n' "$WORKER_URL$p"; done
  echo "WORKER_URL=$WORKER_URL" > "$STATE/worker-url"
else echo "brak adresu workers.dev w logu — sprawdź $STATE/deploy.log"; fi
