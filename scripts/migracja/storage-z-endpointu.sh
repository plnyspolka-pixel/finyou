#!/usr/bin/env bash
# Kopia plików prywatnych: manifest z tymczasowego endpointu starej aplikacji (/api/migration/storage-manifest,
# podpisane linki 3 h generowane po stronie serwera) → storage-copy.py → nowy projekt.
#   bash scripts/migracja/storage-z-endpointu.sh <katalog_roboczy> [bucket1,bucket2…]
# Token: $STATE/migration_token (w starej bazie tylko jego SHA-256 w public.migration_export_tokens).
# Adres starej aplikacji: OLD_APP_URL (domyślnie https://financeyou.pl).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="${STATE:-$HOME/.finyou-migracja}"
DIR="$1"; BUCKETS="${2:-documents,lead-magnets,marketing-materials,pliki-klienta,training-videos,shorts-video,podpisy,aml-private,avatars,property-photos,screening-attachments}"
mkdir -p "$DIR"; chmod 700 "$DIR"
export MIG_TOKEN="$(tr -d '\r\n' < "$STATE/migration_token")" OLD_APP_URL="${OLD_APP_URL:-https://financeyou.pl}"
PYTHONIOENCODING=utf-8 python -I - "$DIR" "$BUCKETS" <<'PY'
import json, os, sys, urllib.request
out_dir, buckets = sys.argv[1], sys.argv[2].split(',')
base, token = os.environ['OLD_APP_URL'].rstrip('/'), os.environ['MIG_TOKEN']
items, missing = [], []
for b in buckets:
    off = 0
    while off is not None:
        r = urllib.request.Request(f'{base}/api/migration/storage-manifest?bucket={b}&offset={off}&limit=100',
                                   headers={'x-migration-token': token, 'User-Agent': 'finyou-migracja'})
        d = json.load(urllib.request.urlopen(r, timeout=120))
        items += d['items']; missing += d.get('missing', [])
        off = d['next_offset']
    print(f'{b}: razem {len(items)} z linkiem, brak pliku: {len(missing)}', flush=True)
json.dump(items, open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8'))
json.dump(missing, open(os.path.join(out_dir, 'brakujace.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
os.chmod(os.path.join(out_dir, 'manifest.json'), 0o600)
PY
bash "$REPO/scripts/migracja/storage-kopia.sh" "$DIR" manifest.json --workers "${WORKERS:-2}"
rm -f "$DIR/manifest.json"   # podpisane linki usuwane od razu po kopii
echo "manifest z linkami usunięty"
