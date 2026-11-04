#!/usr/bin/env bash
# wrangler z tokenami z ~/.finyou-migracja/env (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID),
# a gdy pliku nie ma — z sesji `npx wrangler login` albo zmiennych środowiska.
#   bash scripts/migracja/wrangler.sh deploy
#   bash scripts/migracja/wrangler.sh secret bulk ~/.finyou-migracja/sekrety.json
set -euo pipefail
cd "$(dirname "$0")/../.."
STATE="${STATE:-$HOME/.finyou-migracja}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$STATE/env" ]; then
  # shellcheck disable=SC1091
  source "$STATE/env"; export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
fi
exec npx --yes wrangler@4 "$@"
