#!/usr/bin/env python3
"""
Baseline historii migracji w NOWEJ bazie (vkzndnaoxhdxrxlpntcb): zastąpienie 231 wersji Lovable
dokładnie wersjami z plików supabase/migrations/ w repo, żeby `supabase db push` miał czystą bazę.

Tło (docs/migracja-z-lovable.md, „Historia migracji: repo vs produkcja”): Lovable nadawał własne
znaczniki przy stosowaniu ręcznych migracji (np. plik 20260518124329 ↔ wersja 20260518124328), więc
wersje w bazie i w plikach rozjechały się dwustronnie; wspólne są tylko nieliczne.

Generuje (bez dotykania bazy):
  baseline-wersje-repo.txt     — wersje z repo (bez migracji „dogonienie”, patrz --include-catchup)
  baseline-wersje-lovable.txt  — wersje w bazie, których nie ma w repo (do `--status reverted`)
  baseline-historii.sql        — SQL: archiwum starej historii do _mig.lovable_schema_migrations,
                                 DELETE wierszy spoza repo (DESTRUKCYJNE — konektor pyta o zgodę),
                                 INSERT wersji z repo (version, name, statements = treść pliku),
                                 kontrola. Z --no-statements kolumna statements zostaje NULL
                                 (plik ~40 KB zamiast ~3,7 MB; dla `db push` liczy się tylko version).

Użycie:  python3 docs/migracja/baseline-historii.py --db-versions <plik z listą wersji z bazy, po przecinku>
         [--out-dir docs/migracja] [--no-statements] [--include-catchup]
Listę wersji z bazy daje: select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations;

Równoważnik przez Supabase CLI (zapisuje też statements, wymaga hasła bazy):
  supabase migration repair --db-url "$DB_URL" --status reverted $(cat docs/migracja/baseline-wersje-lovable.txt)
  supabase migration repair --db-url "$DB_URL" --status applied  $(cat docs/migracja/baseline-wersje-repo.txt)
  supabase migration list   --db-url "$DB_URL"     # oczekiwane: wszystkie lokalne = zdalne, poza dogonieniem
  supabase db push          --db-url "$DB_URL"     # stosuje i rejestruje 20261010120000 (dogonienie)
"""
import argparse, os, re, sys

CATCHUP = '20261010120000'
TAG = '$mig$'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db-versions', required=True)
    ap.add_argument('--migrations-dir', default='supabase/migrations')
    ap.add_argument('--out-dir', default='docs/migracja')
    ap.add_argument('--no-statements', action='store_true')
    ap.add_argument('--include-catchup', action='store_true')
    a = ap.parse_args()

    db = sorted(v.strip() for v in open(a.db_versions).read().replace('\n', ',').split(',') if v.strip())
    files = {}
    for f in sorted(os.listdir(a.migrations_dir)):
        m = re.match(r'^(\d{14})_(.*)\.sql$', f)
        if not m:
            sys.exit(f'nazwa pliku niezgodna ze wzorcem <wersja>_<nazwa>.sql: {f}')
        if m.group(1) == CATCHUP and not a.include_catchup:
            continue
        if m.group(1) in files:
            sys.exit(f'zduplikowana wersja {m.group(1)}: {files[m.group(1)][1]} i {f} — przesuń jeden plik o 1 s '
                     f'(version jest kluczem głównym supabase_migrations.schema_migrations)')
        files[m.group(1)] = (m.group(2), os.path.join(a.migrations_dir, f))
    repo = sorted(files)
    common = sorted(set(db) & set(files))
    only_db = sorted(set(db) - set(files))

    os.makedirs(a.out_dir, exist_ok=True)
    open(os.path.join(a.out_dir, 'baseline-wersje-repo.txt'), 'w').write('\n'.join(repo) + '\n')
    open(os.path.join(a.out_dir, 'baseline-wersje-lovable.txt'), 'w').write('\n'.join(only_db) + '\n')

    out = []
    w = out.append
    w('-- Baseline historii migracji w NOWEJ bazie — wygenerowane przez docs/migracja/baseline-historii.py')
    w(f'-- wersje w bazie: {len(db)}; w repo: {len(repo)}; wspólne: {len(common)}; do usunięcia: {len(only_db)}')
    w('-- Uruchamiać przez konektor Supabase jako postgres (DELETE wymaga potwierdzenia) albo w panelu SQL.')
    w('-- Kolejność: 1 archiwum → 2 DELETE → 3 INSERT → 4 kontrola. Każdy krok idempotentny.')
    w('')
    w('-- 1) Archiwum dotychczasowej historii (ginie razem z `drop schema _mig cascade` przy sprzątaniu;')
    w('--    oryginał pozostaje w starej bazie produkcyjnej).')
    w('create schema if not exists _mig;')
    w('create table if not exists _mig.lovable_schema_migrations as')
    w('  select *, now() as archived_at from supabase_migrations.schema_migrations;')
    w('')
    w(f'-- 2) DESTRUKCYJNE: usunięcie {len(only_db)} wersji Lovable, których nie ma w repo')
    w('delete from supabase_migrations.schema_migrations')
    w(' where version not in (' + ', '.join(f"'{v}'" for v in repo) + ');')
    w('')
    w(f'-- 3) Wstawienie {len(repo)} wersji z repo (version, name' + (', statements' if not a.no_statements else '') + ')')
    for v in repo:
        name, path = files[v]
        if a.no_statements:
            stmts = 'null'
        else:
            body = open(path, encoding='utf-8').read()
            if TAG in body:
                sys.exit(f'plik {path} zawiera znacznik {TAG} — zmień TAG w skrypcie')
            stmts = f'array[{TAG}{body}{TAG}]'
        w(f"insert into supabase_migrations.schema_migrations (version, name, statements)\n"
          f"  values ('{v}', '{name}', {stmts})\n"
          f"  on conflict (version) do update set name = excluded.name, statements = coalesce(excluded.statements, supabase_migrations.schema_migrations.statements);")
    w('')
    w('-- 4) Kontrola: oczekiwane n = liczba wersji w repo, brak_w_repo = 0')
    w('select count(*) as n, min(version), max(version),')
    w('       count(*) filter (where version not in (' + ', '.join(f"'{v}'" for v in repo) + ')) as brak_w_repo')
    w('  from supabase_migrations.schema_migrations;')
    sql = '\n'.join(out) + '\n'
    open(os.path.join(a.out_dir, 'baseline-historii.sql'), 'w', encoding='utf-8').write(sql)
    print(f'baza: {len(db)}, repo: {len(repo)}, wspólne: {len(common)} {common[:10]}, do usunięcia: {len(only_db)}; SQL {len(sql)//1024} KB')


if __name__ == '__main__':
    main()
