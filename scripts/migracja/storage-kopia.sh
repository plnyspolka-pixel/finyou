#!/usr/bin/env bash
# Kopia Storage stary → nowy projekt z manifestu (podpisane linki / pliki publiczne).
#   bash scripts/migracja/storage-kopia.sh <katalog_z_manifestami> <plik1.json[,plik2.json…]> [dodatkowe opcje storage-copy.py]
# Klucz service_role nowego projektu pobierany przez Management API (nie trafia na dysk ani do logów).
# Stan wznawiania (storage-copy.state.json) zapisuje się w katalogu manifestów, poza repo.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$1"; MANIFESTS="$2"; shift 2
# shellcheck disable=SC1091
source "${STATE:-$HOME/.finyou-migracja}/env"
NEW_SERVICE_KEY=$(curl -sS -f -H "Authorization: Bearer $SUPABASE_PAT" \
  "https://api.supabase.com/v1/projects/vkzndnaoxhdxrxlpntcb/api-keys?reveal=true" | jq -r '.[]|select(.name=="service_role")|.api_key')
export NEW_SERVICE_KEY NEW_SUPABASE_URL="https://vkzndnaoxhdxrxlpntcb.supabase.co" PYTHONIOENCODING=utf-8
cd "$DIR"
exec python -u "$REPO/docs/migracja/storage-copy.py" --mode full --signed-manifest "$MANIFESTS" "$@"
