#!/usr/bin/env python3
"""
Kopiowanie Supabase Storage: stary projekt (Lovable Cloud) -> nowy projekt (vkzndnaoxhdxrxlpntcb).

Założenia (inwentaryzacja 2026-10-10): 13 bucketów, 2 535 obiektów, 4,63 GB; unikalnych po eTag 3,99 GB;
283 grupy duplikatów (1 451 zbędnych kopii, 655 MB, głównie `pliki-klienta`); 19 filmów w `training-videos`
z mimetype application/octet-stream (do poprawy na video/mp4). Buckety w nowym projekcie już istnieją
(wiersze storage.buckets skopiowane w kroku 4, z tymi samymi limitami rozmiaru).

Klucze WYŁĄCZNIE ze zmiennych środowiskowych (nigdy w repo/czacie):
  OLD_SUPABASE_URL=https://jqvepxhulxdnbwbogkhe.supabase.co   OLD_SERVICE_KEY=<service_role starego projektu>
  NEW_SUPABASE_URL=https://vkzndnaoxhdxrxlpntcb.supabase.co   NEW_SERVICE_KEY=<service_role nowego projektu>
Alternatywa, gdy brak OLD_SERVICE_KEY: plik manifestu z podpisanymi URL-ami (--signed-manifest signed.json:
  [{"bucket":..., "name":..., "url":...}]) wygenerowanymi np. narzędziem MCP aplikacji `supabase_storage/signed_url`.

Tryby:
  --mode full   (domyślny) kopia 1:1 — każda ścieżka istnieje w nowym projekcie (bezpieczne dla odwołań w bazie)
  --mode dedup  wgrywa tylko pierwszą ścieżkę z każdej grupy (bucket, eTag) i zapisuje mapping duplikatów
                do dedup-map.json (ścieżka -> ścieżka kanoniczna) — odwołania w bazie trzeba potem przepisać
                (kolumny: documents.file_path/file_url, marketing_materials.storage_path, training_videos.file_path,
                studio_images.storage_path, lead_magnets.file_path/file_url, aml_*.*_storage_path, ...).
Wznawialny: stan w storage-copy.state.json (ścieżki ukończone + eTag). Przed wgraniem sprawdza, czy obiekt
o tym samym rozmiarze już jest w nowym projekcie. Limity bucketów (100 MB w części bucketów) — obiekty większe
są raportowane; na czas kopii można podnieść limit: update storage.buckets set file_size_limit = null (i przywrócić).

Użycie:  python3 storage-copy.py --mode full [--buckets pliki-klienta,marketing-materials] [--workers 4] [--dry-run]
"""
import argparse, json, mimetypes, os, sys, tempfile, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

VIDEO_FIX = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/x-m4v'}
STATE_FILE = 'storage-copy.state.json'
DEDUP_MAP_FILE = 'dedup-map.json'


def env(name):
    v = os.environ.get(name)
    if not v:
        sys.exit(f'brak zmiennej środowiskowej {name}')
    return v


def req(url, key, method='GET', data=None, headers=None, timeout=600):
    h = {'Authorization': f'Bearer {key}', 'apikey': key}
    if headers:
        h.update(headers)
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    return urllib.request.urlopen(r, timeout=timeout)


def list_objects(base, key, bucket, prefix=''):
    """Rekurencyjna lista obiektów bucketu: [{name, size, etag, mimetype}] (bez folderów i placeholderów)."""
    out = []
    offset = 0
    while True:
        body = json.dumps({'prefix': prefix, 'limit': 1000, 'offset': offset,
                           'sortBy': {'column': 'name', 'order': 'asc'}}).encode()
        with req(f'{base}/storage/v1/object/list/{bucket}', key, 'POST', body,
                 {'Content-Type': 'application/json'}) as resp:
            items = json.loads(resp.read())
        if not items:
            break
        for it in items:
            name = (prefix + '/' if prefix else '') + it['name']
            if it.get('id') is None:              # folder
                out.extend(list_objects(base, key, bucket, name))
            elif not name.endswith('.emptyFolderPlaceholder'):
                md = it.get('metadata') or {}
                out.append({'name': name, 'size': md.get('size'), 'etag': md.get('eTag'),
                            'mimetype': md.get('mimetype')})
        if len(items) < 1000:
            break
        offset += len(items)
    return out


def download(url, key, dest):
    with req(url, key) as resp, open(dest, 'wb') as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
        return resp.headers.get('Content-Type')


def upload(base, key, bucket, name, path, content_type):
    size = os.path.getsize(path)
    with open(path, 'rb') as f:
        r = urllib.request.Request(f'{base}/storage/v1/object/{bucket}/{name}', data=f, method='POST',
                                   headers={'Authorization': f'Bearer {key}', 'apikey': key,
                                            'Content-Type': content_type, 'Content-Length': str(size),
                                            'x-upsert': 'true', 'cache-control': 'max-age=3600'})
        with urllib.request.urlopen(r, timeout=1800) as resp:
            return resp.status


def fixed_mimetype(name, mimetype):
    ext = os.path.splitext(name)[1].lower()
    if (not mimetype or mimetype == 'application/octet-stream') and ext in VIDEO_FIX:
        return VIDEO_FIX[ext]
    return mimetype or mimetypes.guess_type(name)[0] or 'application/octet-stream'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['full', 'dedup'], default='full')
    ap.add_argument('--buckets', default='')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--signed-manifest', default='')
    a = ap.parse_args()

    new_base, new_key = env('NEW_SUPABASE_URL'), env('NEW_SERVICE_KEY')
    old_base = os.environ.get('OLD_SUPABASE_URL', 'https://jqvepxhulxdnbwbogkhe.supabase.co')
    old_key = os.environ.get('OLD_SERVICE_KEY')
    signed = {}
    if a.signed_manifest:
        for e in json.load(open(a.signed_manifest)):
            signed[(e['bucket'], e['name'])] = e['url']
    if not old_key and not signed:
        sys.exit('potrzebny OLD_SERVICE_KEY albo --signed-manifest')

    state = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
    with req(f'{new_base}/storage/v1/bucket', new_key) as resp:
        new_buckets = {b['id'] for b in json.loads(resp.read())}
    with req(f'{old_base}/storage/v1/bucket', old_key or new_key) as resp:
        old_buckets = [b['id'] for b in json.loads(resp.read())] if old_key else sorted({b for b, _ in signed})
    wanted = [b for b in old_buckets if not a.buckets or b in a.buckets.split(',')]
    missing = [b for b in wanted if b not in new_buckets]
    if missing:
        sys.exit(f'brak bucketów w nowym projekcie: {missing}')

    plan, dedup_map, oversize = [], {}, []
    for b in wanted:
        objs = list_objects(old_base, old_key, b) if old_key else [{'name': n, 'size': None, 'etag': None, 'mimetype': None} for (bb, n) in signed if bb == b]
        have = {o['name']: o for o in list_objects(new_base, new_key, b)}
        seen = {}
        for o in sorted(objs, key=lambda x: x['name']):
            key_ = (o['etag'], o['size'])
            if a.mode == 'dedup' and o['etag'] and key_ in seen:
                dedup_map[f"{b}/{o['name']}"] = f"{b}/{seen[key_]}"
                continue
            seen[key_] = o['name']
            if o['name'] in have and have[o['name']]['size'] == o['size'] and o['size'] is not None:
                continue
            if state.get(f'{b}/{o["name"]}') == (o['etag'] or 'signed'):
                continue
            plan.append((b, o))
    total = sum((o['size'] or 0) for _, o in plan)
    print(f'do skopiowania: {len(plan)} obiektów, {total/1048576:.1f} MB; pominiętych duplikatów: {len(dedup_map)}')
    if a.mode == 'dedup':
        json.dump(dedup_map, open(DEDUP_MAP_FILE, 'w'), indent=1, ensure_ascii=False)
    if a.dry_run:
        return

    def work(item):
        b, o = item
        name = o['name']
        src = signed.get((b, name)) or f"{old_base}/storage/v1/object/{b}/{urllib.parse.quote(name)}"
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            path = tmp.name
        try:
            ct = download(src, old_key or '', path) if old_key or signed else None
            content_type = fixed_mimetype(name, o['mimetype'] or ct)
            upload(new_base, new_key, b, name, path, content_type)
            return b, name, o['etag'] or 'signed', None
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors='replace')[:200]
            return b, name, None, f'HTTP {e.code}: {body}'
        except Exception as e:
            return b, name, None, repr(e)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    import urllib.parse
    done = errors = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(work, it) for it in plan]
        for i, f in enumerate(as_completed(futs), 1):
            b, name, etag, err = f.result()
            if err:
                errors += 1
                print(f'[{i}/{len(plan)}] BŁĄD {b}/{name}: {err}', flush=True)
                if 'exceeded the maximum allowed size' in err or 'Payload too large' in err:
                    oversize.append(f'{b}/{name}')
            else:
                done += 1
                state[f'{b}/{name}'] = etag
            if i % 25 == 0 or i == len(plan):
                json.dump(state, open(STATE_FILE, 'w'))
                print(f'[{i}/{len(plan)}] ok={done} błędy={errors} {time.time()-t0:.0f}s', flush=True)
    json.dump(state, open(STATE_FILE, 'w'))
    print(f'koniec: ok={done} błędy={errors}; ponad limit bucketu: {oversize}')


if __name__ == '__main__':
    main()
