#!/usr/bin/env bash
# wrangler z tokenami z ~/.finyou-migracja/env (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID).
#   bash scripts/migracja/wrangler.sh deploy
#   bash scripts/migracja/wrangler.sh secret bulk ~/.finyou-migracja/sekrety.json
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck disable=SC1091
source "${STATE:-$HOME/.finyou-migracja}/env"; export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
exec npx --yes wrangler@4 "$@"
