#!/usr/bin/env bash
# Limity Storage w nowym projekcie na czas kopii plików (15 plików > 50 MB, największy 147 MB).
#   bash scripts/migracja/storage-limity.sh kopia     — globalny limit 200 MB (zostaje na stałe),
#                                                        training-videos i marketing-materials bez limitu
#   bash scripts/migracja/storage-limity.sh przywroc  — te dwa buckety z powrotem na 100 MB
set -euo pipefail
# shellcheck disable=SC1091
source "${STATE:-$HOME/.finyou-migracja}/env"
B="https://api.supabase.com/v1/projects/vkzndnaoxhdxrxlpntcb"
A=(-H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json")
sql(){ curl -sS -f -X POST "${A[@]}" "$B/database/query" -d "$(jq -cn --arg q "$1" '{query:$q}')"; }
case "${1:-}" in
  kopia)
    curl -sS -f -X PATCH "${A[@]}" "$B/config/storage" -d '{"fileSizeLimit":209715200}' >/dev/null
    sql "update storage.buckets set file_size_limit = null where id in ('training-videos','marketing-materials')" >/dev/null ;;
  przywroc)
    sql "update storage.buckets set file_size_limit = 104857600 where id in ('training-videos','marketing-materials')" >/dev/null ;;
  *) echo "użycie: $0 kopia|przywroc"; exit 1 ;;
esac
echo "globalny limit: $(curl -sS -f "${A[@]}" "$B/config/storage" | jq '.fileSizeLimit/1048576') MB"
sql "select id, file_size_limit from storage.buckets where id in ('training-videos','marketing-materials') order by id" | jq -c '.[]'
