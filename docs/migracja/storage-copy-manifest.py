#!/usr/bin/env python3
"""Kopia Storage Lovable Cloud -> vkzndnaoxhdxrxlpntcb bez kluczy service_role w kontenerze.

Manifest z podpisanymi URL-ami: /api/migration/storage-manifest starej aplikacji (token w nagłówku
x-migration-token; skrót SHA-256 w public.migration_export_tokens starej bazy, z expires_at).
Wgrywanie: funkcja Edge `migration-storage-import` nowego projektu (źródło: storage-import-function.ts;
sekret w nagłówku x-import-secret, w kodzie tylko jego SHA-256). Wznawialny (state.json po eTag).
Użycie: python3 storage-copy-manifest.py pliki-klienta,marketing-materials,...
Bucketów publicznych (studio-media, ad-creatives) endpoint nie obsługuje — te z /object/public/.
"""
import json, subprocess, os, sys, time, urllib.request, urllib.parse, urllib.error
from concurrent.futures import ThreadPoolExecutor
S = os.environ.get('MIGRACJA_DIR', os.path.expanduser('~/.finyou-migracja'))  # export.token, import.secret, state.json (chmod 600, poza repo)
TOKEN = open(f'{S}/export.token').read().strip(); SECRET = open(f'{S}/import.secret').read().strip()
MAN = 'https://finyou.lovable.app/api/migration/storage-manifest'
FN = 'https://vkzndnaoxhdxrxlpntcb.supabase.co/functions/v1/migration-storage-import'
STATE = f'{S}/state.json'
state = json.load(open(STATE)) if os.path.exists(STATE) else {}
buckets = sys.argv[1].split(',')
def manifest(b):
    off = 0
    while off is not None:
        out = subprocess.run(['curl', '-sSfL', '--max-time', '120', '-H', f'x-migration-token: {TOKEN}', f'{MAN}?bucket={b}&offset={off}&limit=100'], capture_output=True, check=True).stdout
        d = json.loads(out)
        yield from d['items']; off = d['next_offset']
def one(it):
    k = f"{it['bucket']}/{it['name']}"
    if state.get(k) == it['etag']: return k, None, 0
    body = json.dumps({k2: it[k2] for k2 in ('bucket','name','url','mimetype','size')}).encode()
    for attempt in range(3):
        try:
            r = urllib.request.Request(FN, data=body, method='POST', headers={'x-import-secret': SECRET, 'Content-Type': 'application/json'})
            urllib.request.urlopen(r, timeout=600).read(); state[k] = it['etag']; return k, None, it['size'] or 0
        except urllib.error.HTTPError as e: err = f'HTTP {e.code} {e.read()[:300]!r}'
        except Exception as e: err = repr(e)
        time.sleep(3 * (attempt + 1))
    return k, err, 0
for b in buckets:
    items = list(manifest(b)); ok = mb = 0; errs = []
    with ThreadPoolExecutor(6) as ex:
        for i, (k, err, sz) in enumerate(ex.map(one, items), 1):
            if err: errs.append((k, err))
            else: ok += 1; mb += sz
            if i % 50 == 0: json.dump(state, open(STATE, 'w')); print(f'{b} {i}/{len(items)}', flush=True)
    json.dump(state, open(STATE, 'w'))
    print(f'== {b}: {len(items)} obiektów, ok={ok}, nowe MB={mb/1048576:.0f}, błędy={len(errs)}', flush=True)
    for k, e in errs: print('  BŁĄD', k, e, flush=True)
