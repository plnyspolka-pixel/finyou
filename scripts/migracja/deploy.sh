#!/usr/bin/env bash
# Build + wdrożenie Workera `finyou` z dowolnej maszyny (Linux/macOS/Git Bash, sesja w chmurze).
#
#   bash scripts/migracja/deploy.sh            # build (vite) + wrangler deploy
#   SKIP_BUILD=1 bash scripts/migracja/deploy.sh   # tylko deploy gotowej paczki .output
#
# Logowanie do Cloudflare — jedno z dwóch, w tej kolejności:
#   1. zmienne CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID w środowisku albo w ~/.finyou-migracja/env
#   2. zwykłe `npx wrangler login` (OAuth w przeglądarce) — wtedy plik env nie jest potrzebny.
# Sekrety Workera są już w Cloudflare; skrypt ich nie dotyka. wrangler.jsonc ma nazwę `finyou`
# i jedyną zmienną SUPABASE_URL (nowy projekt vkzndnaoxhdxrxlpntcb).
# Build potrzebuje ok. 8 GB wolnej pamięci (BUILD_HEAP w MB, domyślnie 8192).
set -euo pipefail
cd "$(dirname "$0")/../.."

STATE="${STATE:-$HOME/.finyou-migracja}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$STATE/env" ]; then
  # shellcheck disable=SC1091
  source "$STATE/env"; export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
fi
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "== Cloudflare: token API (konto ${CLOUDFLARE_ACCOUNT_ID:-?})"
else
  echo "== Cloudflare: brak tokena, używam sesji wrangler login"
  npx --yes wrangler@4 whoami >/dev/null 2>&1 || { echo "Nie zalogowano. Uruchom: npx wrangler login"; exit 1; }
fi

if [ ! -d node_modules ]; then
  echo "== Instalacja zależności"
  if command -v bun >/dev/null 2>&1; then bun install --frozen-lockfile; else npm install --no-audit --no-fund; fi
fi

if [ -z "${SKIP_BUILD:-}" ] || [ ! -f .output/server/index.mjs ]; then
  echo "== Build (vite)"
  NODE_OPTIONS="--max-old-space-size=${BUILD_HEAP:-8192}" node node_modules/vite/bin/vite.js build
else
  echo "== Pomijam build (SKIP_BUILD=1, jest .output)"
fi
[ -f .output/server/index.mjs ] || { echo "brak paczki .output/server/index.mjs po buildzie"; exit 1; }

echo "== wrangler deploy"
LOG="$(mktemp)"
npx --yes wrangler@4 deploy 2>&1 | tee "$LOG" | tail -n 15
URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$LOG" | head -1 || true)
rm -f "$LOG"
if [ -n "$URL" ]; then
  echo "== Smoke test"
  for p in / /robots.txt; do printf '%s -> ' "$URL$p"; curl -s -o /dev/null -w '%{http_code}\n' "$URL$p"; done
fi
