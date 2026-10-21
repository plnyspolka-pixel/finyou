-- =====================================================================================
-- Generatory DDL: produkcja (Lovable Cloud, PostgreSQL 17.6) -> nowa baza (Supabase, PG 17.11)
--
-- Każdy blok "-- FAZA n" to CZYSTY SELECT uruchamiany w STAREJ bazie jako rola postgres (nie superuser).
-- Każdy zwraca kolumny: seq bigint, phase int, kind text, obj text, stmt text.
-- Wynik jest wysyłany przez dblink do tabeli _mig.ddl w NOWEJ bazie (patrz TRANSFER na końcu),
-- a tam wykonywany przez _mig.run(faza_od, faza_do, limit) jako rola postgres (search_path
-- "$user", public, extensions — taki sam jak w sesji generującej, więc pg_get_*def kwalifikuje
-- nazwy identycznie po obu stronach).
--
-- Założenia (zweryfikowane inwentaryzacją):
--  * schematy użytkownika do skopiowania: public, drizzle, supabase_migrations
--  * w public: 243 tabele (relkind r, brak partycji/dziedziczenia/unlogged), 2 widoki (jeden
--    security_invoker=true), 12 sekwencji (7 identity 'a', 4 serial-like 'a' dep, 1 samodzielna),
--    38 enumów (brak domen/typów złożonych), 113 funkcji własnych (prokind 'f'; 118 pozostałych
--    należy do rozszerzenia vector i NIE są kopiowane), 145 triggerów (wszystkie tgenabled='O'),
--    374 polityk RLS, 677 indeksów, 740 constraintów (0 deferrable, 1 NOT VALID), 74 komentarze na
--    pg_class (19 tabel + 55 kolumn), 5 na funkcjach, 0 grantów kolumnowych, 0 kolacji niestandardowych
--  * storage: 13 bucketów, 36 polityk na storage.objects; auth: 1 trigger on_auth_user_created
--  * cron: 34 joby (tworzone WYŁĄCZONE)
--  * rola sandbox_exec (Lovable) NIE istnieje w nowej bazie -> jej granty są pomijane
--  * nowa baza: tabele tworzone przez postgres dostają z default privileges dla anon/authenticated/
--    service_role tylko "Dxtm", funkcje tylko postgres=X -> dlatego faza 11 robi revoke all + grant 1:1
-- =====================================================================================

-- FAZA 0: schematy pomocnicze (public już istnieje)
select 0*100000 + row_number() over (order by s) as seq, 0 as phase, 'schema' as kind, s as obj,
       format('create schema if not exists %I authorization postgres', s) as stmt
from unnest(array['drizzle','supabase_migrations']) as s;

-- FAZA 1: enumy (public)
select 1*100000 + row_number() over (order by t.typname) as seq, 1 as phase, 'type' as kind, t.typname as obj,
       format('create type public.%I as enum (%s)', t.typname,
              (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
               from pg_enum e where e.enumtypid = t.oid)) as stmt
from pg_type t
where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'
  and not exists (select 1 from pg_depend d
                  where d.classid = 'pg_type'::regclass and d.objid = t.oid and d.deptype = 'e');

-- FAZA 2: sekwencje NIE-identity (identity tworzą się razem z kolumną w fazie 3)
select 2*100000 + row_number() over (order by n.nspname, c.relname) as seq, 2 as phase, 'sequence' as kind,
       n.nspname || '.' || c.relname as obj,
       format('create sequence %I.%I as %s increment by %s minvalue %s maxvalue %s start with %s cache %s%s',
              n.nspname, c.relname, format_type(q.seqtypid, null), q.seqincrement, q.seqmin, q.seqmax,
              q.seqstart, q.seqcache, case when q.seqcycle then ' cycle' else '' end) as stmt
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_sequence q on q.seqrelid = c.oid
where c.relkind = 'S' and n.nspname in ('public','drizzle','supabase_migrations')
  and not exists (select 1 from pg_depend d
                  where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'i');

-- FAZA 3: tabele (kolumny: typ, kolacja, not null, default / generated / identity; bez constraintów)
select 3*100000 + row_number() over (order by n.nspname, c.relname) as seq, 3 as phase, 'table' as kind,
       n.nspname || '.' || c.relname as obj,
       format('create %stable %I.%I (%s)%s',
              case when c.relpersistence = 'u' then 'unlogged ' else '' end,
              n.nspname, c.relname,
              (select string_agg(
                        format('%I %s%s%s%s',
                               a.attname,
                               format_type(a.atttypid, a.atttypmod),
                               case when a.attcollation <> 0 and co.collname <> 'default'
                                    then format(' collate %I.%I', con.nspname, co.collname) else '' end,
                               case when a.attnotnull then ' not null' else '' end,
                               case
                                 when a.attidentity <> '' then
                                   format(' generated %s as identity (increment by %s minvalue %s maxvalue %s start with %s cache %s%s)',
                                          case when a.attidentity = 'a' then 'always' else 'by default' end,
                                          q.seqincrement, q.seqmin, q.seqmax, q.seqstart, q.seqcache,
                                          case when q.seqcycle then ' cycle' else '' end)
                                 when a.attgenerated = 's' then
                                   format(' generated always as (%s) stored', pg_get_expr(ad.adbin, ad.adrelid))
                                 when ad.adbin is not null then
                                   format(' default %s', pg_get_expr(ad.adbin, ad.adrelid))
                                 else ''
                               end),
                        ', ' order by a.attnum)
               from pg_attribute a
               left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
               left join pg_collation co on co.oid = a.attcollation
               left join pg_namespace con on con.oid = co.collnamespace
               left join pg_depend dp on dp.classid = 'pg_class'::regclass and dp.refclassid = 'pg_class'::regclass
                                     and dp.refobjid = a.attrelid and dp.refobjsubid = a.attnum and dp.deptype = 'i'
               left join pg_sequence q on q.seqrelid = dp.objid
               where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
              case when c.reloptions is not null
                   then format(' with (%s)', array_to_string(c.reloptions, ', ')) else '' end) as stmt
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public','drizzle','supabase_migrations');

-- FAZA 4: przypięcie sekwencji serial-like do kolumn (deptype 'a')
select 4*100000 + row_number() over (order by sn.nspname, s.relname) as seq, 4 as phase, 'sequence_owner' as kind,
       sn.nspname || '.' || s.relname as obj,
       format('alter sequence %I.%I owned by %I.%I.%I', sn.nspname, s.relname, tn.nspname, t.relname, a.attname) as stmt
from pg_depend d
join pg_class s on s.oid = d.objid and s.relkind = 'S'
join pg_namespace sn on sn.oid = s.relnamespace
join pg_class t on t.oid = d.refobjid
join pg_namespace tn on tn.oid = t.relnamespace
join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
where d.classid = 'pg_class'::regclass and d.refclassid = 'pg_class'::regclass and d.deptype = 'a'
  and sn.nspname in ('public','drizzle','supabase_migrations');

-- FAZA 5: constrainty (kolejność: p, u, x, c, f)
select 5*100000 + row_number() over (order by case c.contype when 'p' then 1 when 'u' then 2 when 'x' then 3 when 'c' then 4 when 'f' then 5 else 6 end,
                                          n.nspname, r.relname, c.conname) as seq,
       5 as phase, 'constraint_' || c.contype::text as kind,
       n.nspname || '.' || r.relname || '.' || c.conname as obj,
       format('alter table %I.%I add constraint %I %s', n.nspname, r.relname, c.conname, pg_get_constraintdef(c.oid)) as stmt
from pg_constraint c
join pg_class r on r.oid = c.conrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname in ('public','drizzle','supabase_migrations')
  and c.contype in ('p','u','x','c','f') and c.conislocal;

-- FAZA 6: indeksy, które NIE stoją za constraintem p/u/x
select 6*100000 + row_number() over (order by n.nspname, t.relname, ic.relname) as seq, 6 as phase, 'index' as kind,
       n.nspname || '.' || ic.relname as obj,
       pg_get_indexdef(i.indexrelid) as stmt
from pg_index i
join pg_class ic on ic.oid = i.indexrelid
join pg_class t on t.oid = i.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname in ('public','drizzle','supabase_migrations')
  and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid and c.contype in ('p','u','x'));

-- FAZA 7: funkcje własne w public (bez funkcji należących do rozszerzeń)
select 7*100000 + row_number() over (order by p.proname, p.oid) as seq, 7 as phase, 'function' as kind,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as obj,
       pg_get_functiondef(p.oid) as stmt
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  and not exists (select 1 from pg_depend d
                  where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');

-- FAZA 8: widoki (z opcjami, np. security_invoker)
select 8*100000 + row_number() over (order by c.relname) as seq, 8 as phase, 'view' as kind,
       'public.' || c.relname as obj,
       format('create %s public.%I%s as %s',
              case when c.relkind = 'm' then 'materialized view' else 'view' end,
              c.relname,
              case when c.reloptions is not null then format(' with (%s)', array_to_string(c.reloptions, ', ')) else '' end,
              regexp_replace(pg_get_viewdef(c.oid, true), ';\s*$', ''))
       || case when c.relkind = 'm' then ' with no data' else '' end as stmt
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('v','m');

-- FAZA 9: triggery (public) + stan inny niż domyślny
select 9*100000 + row_number() over (order by c.relname, t.tgname) as seq, 9 as phase, 'trigger' as kind,
       'public.' || c.relname || '.' || t.tgname as obj,
       pg_get_triggerdef(t.oid) as stmt
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
union all
select 9*100000 + 50000 + row_number() over (order by c.relname, t.tgname), 9, 'trigger_state',
       'public.' || c.relname || '.' || t.tgname,
       format('alter table public.%I %s trigger %I', c.relname,
              case t.tgenabled when 'D' then 'disable' when 'A' then 'enable always' when 'R' then 'enable replica' end,
              t.tgname)
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgenabled <> 'O';

-- FAZA 10: RLS (enable / force) + polityki (public)
select 10*100000 + row_number() over (order by c.relname) as seq, 10 as phase, 'rls' as kind,
       'public.' || c.relname as obj,
       format('alter table public.%I enable row level security', c.relname) as stmt
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
union all
select 10*100000 + 10000 + row_number() over (order by c.relname), 10, 'rls_force',
       'public.' || c.relname,
       format('alter table public.%I force row level security', c.relname)
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relforcerowsecurity
union all
select 10*100000 + 20000 + row_number() over (order by c.relname, p.polname), 10, 'policy',
       'public.' || c.relname || '.' || p.polname,
       format('create policy %I on public.%I as %s for %s to %s%s%s',
              p.polname, c.relname,
              case when p.polpermissive then 'permissive' else 'restrictive' end,
              case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,
              (select string_agg(case when u.roid = 0 then 'public' else quote_ident(r.rolname) end, ', ' order by u.ord)
               from unnest(p.polroles) with ordinality as u(roid, ord)
               left join pg_roles r on r.oid = u.roid),
              case when p.polqual is not null then format(' using (%s)', pg_get_expr(p.polqual, p.polrelid)) else '' end,
              case when p.polwithcheck is not null then format(' with check (%s)', pg_get_expr(p.polwithcheck, p.polrelid)) else '' end)
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relnamespace = 'public'::regnamespace;

-- FAZA 11: uprawnienia 1:1 (revoke all od ról API + grant dokładnie jak w produkcji; bez sandbox_exec)
with newdb_roles as (
  select unnest(array['anon','authenticated','authenticator','dashboard_user','pgbouncer','postgres','service_role',
                      'supabase_admin','supabase_auth_admin','supabase_etl_admin','supabase_privileged_role',
                      'supabase_read_only_user','supabase_realtime_admin','supabase_replication_admin',
                      'supabase_storage_admin']) as rolname
),
rels as (
  select c.oid, n.nspname, c.relname, c.relkind, c.relowner,
         coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner)) as acl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','drizzle','supabase_migrations') and c.relkind in ('r','v','m','S')
),
fns as (
  select p.oid, 'public' as nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args, p.proowner,
         coalesce(p.proacl, acldefault('f'::"char", p.proowner)) as acl
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
),
items as (
  -- relacje: revoke
  select 1 as grp, r.nspname, r.relname as objname, 0 as sub, 'revoke' as kind,
         format('revoke all on %s %I.%I from public, anon, authenticated, service_role',
                case when r.relkind = 'S' then 'sequence' else 'table' end, r.nspname, r.relname) as stmt
  from rels r
  union all
  -- relacje: grant (pogrupowane per grantee + grant option)
  select 1, r.nspname, r.relname, 1, 'grant',
         format('grant %s on %s %I.%I to %s%s',
                string_agg(a.privilege_type, ', ' order by a.privilege_type),
                case when r.relkind = 'S' then 'sequence' else 'table' end, r.nspname, r.relname,
                case when a.grantee = 0 then 'public' else quote_ident(g.rolname) end,
                case when a.is_grantable then ' with grant option' else '' end)
  from rels r
  cross join lateral aclexplode(r.acl) a
  left join pg_roles g on g.oid = a.grantee
  where a.grantee <> r.relowner
    and (a.grantee = 0 or g.rolname in (select rolname from newdb_roles))
  group by r.nspname, r.relname, r.relkind, a.grantee, g.rolname, a.is_grantable
  union all
  -- funkcje: revoke
  select 2, f.nspname, f.proname || '(' || f.args || ')', 0, 'revoke_fn',
         format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role', f.proname, f.args)
  from fns f
  union all
  -- funkcje: grant
  select 2, f.nspname, f.proname || '(' || f.args || ')', 1, 'grant_fn',
         format('grant %s on function public.%I(%s) to %s%s',
                string_agg(a.privilege_type, ', ' order by a.privilege_type),
                f.proname, f.args,
                case when a.grantee = 0 then 'public' else quote_ident(g.rolname) end,
                case when a.is_grantable then ' with grant option' else '' end)
  from fns f
  cross join lateral aclexplode(f.acl) a
  left join pg_roles g on g.oid = a.grantee
  where a.grantee <> f.proowner
    and (a.grantee = 0 or g.rolname in (select rolname from newdb_roles))
  group by f.nspname, f.proname, f.args, a.grantee, g.rolname, a.is_grantable
)
select 11*100000 + row_number() over (order by grp, nspname, objname, sub, stmt) as seq, 11 as phase, kind,
       nspname || '.' || objname as obj, stmt
from items;

-- FAZA 12: komentarze (tabele/widoki/sekwencje/indeksy, kolumny, funkcje, enumy)
select 12*100000 + row_number() over (order by k, obj) as seq, 12 as phase, kind, obj, stmt
from (
  select 1 as k, 'comment_rel' as kind, n.nspname || '.' || c.relname as obj,
         format('comment on %s %I.%I is %L',
                case c.relkind when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence' when 'i' then 'index' else 'table' end,
                n.nspname, c.relname, d.description) as stmt
  from pg_description d
  join pg_class c on c.oid = d.objoid
  join pg_namespace n on n.oid = c.relnamespace
  where d.classoid = 'pg_class'::regclass and d.objsubid = 0 and n.nspname in ('public','drizzle','supabase_migrations')
  union all
  select 2, 'comment_col', n.nspname || '.' || c.relname || '.' || a.attname,
         format('comment on column %I.%I.%I is %L', n.nspname, c.relname, a.attname, d.description)
  from pg_description d
  join pg_class c on c.oid = d.objoid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid
  where d.classoid = 'pg_class'::regclass and d.objsubid > 0 and n.nspname in ('public','drizzle','supabase_migrations')
  union all
  select 3, 'comment_fn', 'public.' || p.proname,
         format('comment on function public.%I(%s) is %L', p.proname, pg_get_function_identity_arguments(p.oid), d.description)
  from pg_description d
  join pg_proc p on p.oid = d.objoid
  where d.classoid = 'pg_proc'::regclass and p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend dd where dd.classid = 'pg_proc'::regclass and dd.objid = p.oid and dd.deptype = 'e')
  union all
  select 4, 'comment_type', 'public.' || t.typname,
         format('comment on type public.%I is %L', t.typname, d.description)
  from pg_description d
  join pg_type t on t.oid = d.objoid
  where d.classoid = 'pg_type'::regclass and t.typnamespace = 'public'::regnamespace and t.typtype = 'e'
) x;

-- FAZA 13: storage — buckety (wiersze metadanych) + polityki na storage.objects
select 13*100000 + row_number() over (order by b.id) as seq, 13 as phase, 'bucket' as kind, b.id as obj,
       -- lifecycle_* celowo pominięte (NULL w produkcji; trigger protect_bucket_control_insert blokuje niepuste)
       format('insert into storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type, versioning_status) '
              || 'values (%L, %L, %L, %L, %L, %L, %L, %L, %L::text[], %L, %L::storage.buckettype, %L) on conflict (id) do nothing',
              b.id, b.name, b.owner, b.created_at, b.updated_at, b.public, b.avif_autodetection, b.file_size_limit,
              b.allowed_mime_types, b.owner_id, b.type, b.versioning_status) as stmt
from storage.buckets b
union all
select 13*100000 + 10000 + row_number() over (order by c.relname, p.polname), 13, 'storage_policy',
       'storage.' || c.relname || '.' || p.polname,
       format('create policy %I on storage.%I as %s for %s to %s%s%s',
              p.polname, c.relname,
              case when p.polpermissive then 'permissive' else 'restrictive' end,
              case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,
              (select string_agg(case when u.roid = 0 then 'public' else quote_ident(r.rolname) end, ', ' order by u.ord)
               from unnest(p.polroles) with ordinality as u(roid, ord)
               left join pg_roles r on r.oid = u.roid),
              case when p.polqual is not null then format(' using (%s)', pg_get_expr(p.polqual, p.polrelid)) else '' end,
              case when p.polwithcheck is not null then format(' with check (%s)', pg_get_expr(p.polwithcheck, p.polrelid)) else '' end)
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relnamespace = 'storage'::regnamespace;

-- FAZA 14: trigger(y) na auth.users
select 14*100000 + row_number() over (order by c.relname, t.tgname) as seq, 14 as phase, 'auth_trigger' as kind,
       'auth.' || c.relname || '.' || t.tgname as obj,
       pg_get_triggerdef(t.oid) as stmt
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'auth'::regnamespace and not t.tgisinternal;

-- FAZA 15: crony — zaplanowanie 1:1 i wyłączenie w JEDNEJ instrukcji (atomowo; job nigdy nie jest
-- zatwierdzony jako aktywny — recenzja: osobne wiersze mogły zostać rozdzielone granicą porcji _mig.run).
-- Uruchamiać osobno: _mig.run(15, 15); kontrola po: select count(*) filter (where active) from cron.job -> 0
select 15*100000 + row_number() over (order by j.jobid) as seq, 15 as phase, 'cron_schedule_disabled' as kind, j.jobname as obj,
       format('select cron.alter_job(job_id := cron.schedule(%L, %L, %L), active := false)', j.jobname, j.schedule, j.command) as stmt
from cron.job j;

-- FAZA 16 (DANE — uruchomić dopiero PO skopiowaniu wierszy, nie przy schemacie): pozycje sekwencji 1:1,
-- w tym sekwencji identity; bez tego pierwsze inserty kolidowałyby z istniejącymi id
select 16*100000 + row_number() over (order by s.schemaname, s.sequencename) as seq, 16 as phase, 'sequence_setval' as kind,
       s.schemaname || '.' || s.sequencename as obj,
       format('select setval(%L, %s, true)', format('%I.%I', s.schemaname, s.sequencename), s.last_value) as stmt
from pg_sequences s
where s.schemaname in ('public','drizzle','supabase_migrations') and s.last_value is not null;

-- =====================================================================================
-- TRANSFER (w STAREJ bazie): opakowanie wybranych faz w jedno wywołanie dblink_exec.
-- JSON z wierszami jest wstawiany po stronie nowej bazy przez json_populate_recordset(null::_mig.ddl, ...).
-- Connection string czytany z Vault (sekret 'migration_target'); hasło nie pojawia się w zapytaniu.
--
-- Każda faza w NAWIASACH (faza 11 zaczyna się od WITH — bez nawiasów to błąd składni po UNION ALL), bez ';'.
-- Upsert po seq (ponowna wysyłka poprawionej fazy nadpisuje wiersze, a zmienione tracą wpis w ddl_log,
-- więc _mig.run wykona je ponownie). dblink_exec jest STRICT: brak sekretu = NULL bez błędu → kontrola secrets_found.
--
-- with gen as ( (<FAZA a>) union all (<FAZA b>) ... ),
--      payload as (select count(*) as n, json_agg(gen)::text as j from gen),
--      conn as (select decrypted_secret as c from vault.decrypted_secrets where name = 'migration_target')
-- select p.n as rows_sent, (select count(*) from conn) as secrets_found,   -- secrets_found musi być 1
--        extensions.dblink_exec((select c from conn),
--          'with up as (insert into _mig.ddl (seq, phase, kind, obj, stmt) '
--          || 'select seq, phase, kind, obj, stmt from json_populate_recordset(null::_mig.ddl, ' || quote_literal(p.j) || ') '
--          || 'on conflict (seq) do update set phase = excluded.phase, kind = excluded.kind, obj = excluded.obj, stmt = excluded.stmt '
--          || 'where _mig.ddl.stmt is distinct from excluded.stmt returning seq) '
--          || 'delete from _mig.ddl_log l where l.seq in (select seq from up)') as result   -- NULL = nic nie wysłano
-- from payload p where p.n > 0 and p.j is not null;
--
-- WYKONANIE (w NOWEJ bazie, przez konektor jako postgres; statement_timeout 2 min — przekroczenie cofa CAŁE wywołanie,
-- wtedy zmniejszyć limit). _mig.run(p_from, p_to, p_limit) -> (o_done, o_failed, o_pending_after, o_first_err).
--   select * from _mig.run(0, 6, 300);    -- powtarzać aż o_pending_after = 0 lub brak postępu
--   select * from _mig.run(7, 14, 300);
--   select * from _mig.run(0, 14, 300);   -- przebieg ponawiający nieudane (zależności krzyżowe)
--   select * from _mig.run(15, 15, 100);  -- crony osobno; potem: select count(*) filter (where active) from cron.job -> 0
--   select d.phase, d.kind, d.obj, l.err, l.attempts from _mig.ddl d join _mig.ddl_log l on l.seq=d.seq where not l.ok order by d.seq;
-- =====================================================================================
