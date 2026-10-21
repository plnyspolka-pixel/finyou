-- =====================================================================================
-- Strukturalny diff schematu: produkcja (Lovable) vs nowa baza (Supabase) — baza ↔ baza przez dblink.
-- Uruchamiany w STAREJ bazie (narzędzie Lovable query_database, rola postgres). Zwraca WYŁĄCZNIE różnice.
--
-- Zapytanie SIG (poniżej) liczy „podpis” każdego obiektu i musi być wykonane po obu stronach z tym samym
-- search_path ("$user", public, extensions), inaczej deparsowane wyrażenia (pg_get_expr, pg_get_indexdef)
-- różnią się kwalifikacją nazw. Po stronie zdalnej search_path ustawia dblink_exec na nazwanym połączeniu.
-- Użycie: wkleić SIG raz jako CTE `l`, drugi raz dosłownie wewnątrz $q$ ... $q$ w CTE `r`.
--
-- Pomijane celowo: rola sandbox_exec (Lovable), funkcje rozszerzeń (deptype 'e'), buckety storage i cron.job
-- (rola migrator nie ma do nich SELECT — sprawdzane osobno przez konektor), pozycje sekwencji (last_value).
-- Znane, akceptowane różnice (2026-10-10): public.rls_auto_enable() + event trigger ensure_rls (auto-RLS Supabase).
-- =====================================================================================

-- select extensions.dblink_connect('newdb', (select decrypted_secret from vault.decrypted_secrets where name = 'migration_target'));
-- select extensions.dblink_exec('newdb', 'set search_path = "$user", public, extensions');
-- with l as ( <SIG> ),
--      r as (select * from extensions.dblink('newdb', $q$ <SIG> $q$) as t(kind text, ident text, sig text)),
--      d as (select coalesce(l.kind, r.kind) as kind, coalesce(l.ident, r.ident) as ident,
--                   case when l.sig is null then 'extra_in_new' when r.sig is null then 'missing_in_new' else 'differs' end as status,
--                   left(l.sig, 160) as prod_sig, left(r.sig, 160) as new_sig
--            from l full outer join r on l.kind = r.kind and l.ident = r.ident
--            where l.sig is distinct from r.sig)
-- select json_build_object(
--   'prod_counts', (select json_agg(json_build_object('kind', kind, 'n', n) order by kind) from (select kind, count(*) n from l group by 1) x),
--   'new_counts',  (select json_agg(json_build_object('kind', kind, 'n', n) order by kind) from (select kind, count(*) n from r group by 1) x),
--   'diff_count',  (select count(*) from d),
--   'diffs',       (select json_agg(d order by d.kind, d.ident) from (select * from d order by kind, ident limit 150) d)
-- ) as result;

-- ===== SIG =====
select 'table_cols' as kind, n.nspname||'.'||c.relname as ident,
       md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s', a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull,
            coalesce(pg_get_expr(ad.adbin, ad.adrelid),''), a.attidentity::text, a.attgenerated::text,
            case when a.attcollation <> 0 then (select collname from pg_collation where oid=a.attcollation) else '' end), ',' order by a.attnum)) as sig
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
where n.nspname in ('public','drizzle','supabase_migrations') and c.relkind='r'
group by n.nspname, c.relname
union all
select 'rls', n.nspname||'.'||c.relname, c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||c.relpersistence::text||'|'||coalesce(array_to_string(c.reloptions,','),'')
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','drizzle','supabase_migrations') and c.relkind='r'
union all
select 'constraint', n.nspname||'.'||r.relname||'.'||c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname in ('public','drizzle','supabase_migrations')
union all
select 'index', n.nspname||'.'||ic.relname, md5(pg_get_indexdef(i.indexrelid))
from pg_index i join pg_class ic on ic.oid=i.indexrelid join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname in ('public','drizzle','supabase_migrations')
union all
select 'function', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', md5(pg_get_functiondef(p.oid))
from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
union all
select 'function_acl', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')@'||coalesce(g.rolname,'public'), string_agg(a.privilege_type||case when a.is_grantable then '*' else '' end, ',' order by a.privilege_type)
from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a left join pg_roles g on g.oid=a.grantee
where p.pronamespace='public'::regnamespace and p.prokind='f' and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') and a.grantee <> p.proowner and coalesce(g.rolname,'public') <> 'sandbox_exec'
group by 1,2
union all
select 'rel_acl', n.nspname||'.'||c.relname||'@'||coalesce(g.rolname,'public'), string_agg(a.privilege_type||case when a.is_grantable then '*' else '' end, ',' order by a.privilege_type)
from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl, acldefault((case when c.relkind='S' then 's' else 'r' end)::"char", c.relowner))) a left join pg_roles g on g.oid=a.grantee
where n.nspname in ('public','drizzle','supabase_migrations') and c.relkind in ('r','v','m','S') and a.grantee <> c.relowner and coalesce(g.rolname,'public') <> 'sandbox_exec'
group by 1,2
union all
select 'trigger', n.nspname||'.'||c.relname||'.'||t.tgname, pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and not t.tgisinternal
union all
select 'policy', n.nspname||'.'||c.relname||'.'||p.polname, p.polpermissive::text||'|'||p.polcmd::text||'|'||(select string_agg(coalesce(r.rolname,'public'), ',' order by coalesce(r.rolname,'public')) from unnest(p.polroles) u(roid) left join pg_roles r on r.oid=u.roid)||'|'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage')
union all
select 'view', n.nspname||'.'||c.relname, md5(pg_get_viewdef(c.oid,true))||'|'||coalesce(array_to_string(c.reloptions,','),'')
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m')
union all
select 'enum', t.typname, (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid)
from pg_type t where t.typnamespace='public'::regnamespace and t.typtype='e'
union all
select 'sequence', n.nspname||'.'||c.relname, format('%s|%s|%s|%s|%s|%s|%s', format_type(q.seqtypid,null), q.seqincrement, q.seqmin, q.seqmax, q.seqstart, q.seqcache, q.seqcycle)
from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_sequence q on q.seqrelid=c.oid where c.relkind='S' and n.nspname in ('public','drizzle','supabase_migrations')
union all
select 'seq_owner', sn.nspname||'.'||s.relname, tn.nspname||'.'||t.relname||'.'||a.attname||'|'||d.deptype::text
from pg_depend d join pg_class s on s.oid=d.objid and s.relkind='S' join pg_namespace sn on sn.oid=s.relnamespace join pg_class t on t.oid=d.refobjid join pg_namespace tn on tn.oid=t.relnamespace join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
where d.classid='pg_class'::regclass and d.refclassid='pg_class'::regclass and d.deptype in ('a','i') and sn.nspname in ('public','drizzle','supabase_migrations')
union all
select 'comment_rel', n.nspname||'.'||c.relname, d.description
from pg_description d join pg_class c on c.oid=d.objoid join pg_namespace n on n.oid=c.relnamespace where d.classoid='pg_class'::regclass and d.objsubid=0 and n.nspname in ('public','drizzle','supabase_migrations')
union all
select 'comment_col', n.nspname||'.'||c.relname||'.'||a.attname, d.description
from pg_description d join pg_class c on c.oid=d.objoid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.objsubid where d.classoid='pg_class'::regclass and d.objsubid>0 and n.nspname in ('public','drizzle','supabase_migrations')
union all
select 'comment_fn', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', d.description
from pg_description d join pg_proc p on p.oid=d.objoid where d.classoid='pg_proc'::regclass and p.pronamespace='public'::regnamespace and not exists (select 1 from pg_depend dd where dd.classid='pg_proc'::regclass and dd.objid=p.oid and dd.deptype='e')
