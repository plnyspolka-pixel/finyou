-- =====================================================================
-- Digital PR na produkcji: tabele pr_opportunities / pr_outreach_log
-- i job pg_cron monitoringu (pr-monitor-tick).
--
-- Dlaczego osobna migracja: moduł PR przyszedł w pliku
-- 20260803160000_pr_module.sql (data wsteczna względem chwili dodania do
-- repozytorium), a od 24.09.2026 na produkcję trafia wyłącznie lustro
-- w drizzle/migrations z wpisem w _journal.json. Plik PR nigdy nie dostał
-- lustra, więc produkcja go nie wykonała („Could not find the table
-- 'public.pr_opportunities' in the schema cache"). Lustra starego pliku nie
-- da się po prostu dopisać: drizzle wgrywa tylko wpisy o `when` późniejszym
-- niż ostatnio wgrany, a stary plik ma też niezabezpieczone
-- CREATE EXTENSION i job bez limitu czasu.
--
-- Ta migracja powtarza schemat 20260803160000 w wersji w pełni idempotentnej
-- (bezpieczna tam, gdzie stary plik już przeszedł — np. lokalnie):
--   * tabele / indeksy: if not exists,
--   * triggery updated_at: drop if exists + create,
--   * RLS: odczyt administrator / operator, zapis wyłącznie service_role,
--     bez dostępu anon,
--   * pg_cron: tylko gdy pg_cron i pg_net są dostępne; co 6 h, limit 60 s.
-- Logika: src/lib/pr/{core,monitor.server,draft.server,panel.server}.ts,
-- hook /api/public/hooks/pr-monitor-tick, panel /admin/pr-media.
-- =====================================================================

create table if not exists public.pr_opportunities (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  url text not null,
  -- Znormalizowany URL (pr/core.ts dedupeKey).
  dedupe_hash text not null unique,
  topic text not null,
  snippet text,
  matched_phrases text[] not null default '{}',
  article_published_at timestamptz,
  deadline timestamptz,
  status text not null default 'new'
    check (status in ('new', 'drafted', 'approved', 'sent', 'rejected')),
  draft_subject text,
  draft_body text,
  draft_generated_at timestamptz,
  recipient_email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pr_opportunities_status
  on public.pr_opportunities (status, created_at desc);

create table if not exists public.pr_outreach_log (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.pr_opportunities(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  body_text text not null,
  -- Id z Resend (join dla webhooka statusów).
  resend_id text,
  status text not null default 'sent'
    check (status in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied', 'failed')),
  error text,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pr_outreach_log_opportunity
  on public.pr_outreach_log (opportunity_id, sent_at desc);
create index if not exists idx_pr_outreach_log_resend
  on public.pr_outreach_log (resend_id);

drop trigger if exists trg_pr_opportunities_touch_updated_at on public.pr_opportunities;
create trigger trg_pr_opportunities_touch_updated_at
  before update on public.pr_opportunities
  for each row execute function public.set_updated_at();

drop trigger if exists trg_pr_outreach_log_touch_updated_at on public.pr_outreach_log;
create trigger trg_pr_outreach_log_touch_updated_at
  before update on public.pr_outreach_log
  for each row execute function public.set_updated_at();

-- ── RLS: narzędzie wewnętrzne — odczyt kadra, zapisy przez service_role ─────
revoke all on public.pr_opportunities from public, anon;
revoke all on public.pr_outreach_log from public, anon;
grant all on public.pr_opportunities to service_role;
grant all on public.pr_outreach_log to service_role;
grant select on public.pr_opportunities to authenticated;
grant select on public.pr_outreach_log to authenticated;

alter table public.pr_opportunities enable row level security;
alter table public.pr_outreach_log enable row level security;

drop policy if exists "pr_opportunities_staff_read" on public.pr_opportunities;
create policy "pr_opportunities_staff_read"
  on public.pr_opportunities for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    or public.has_role(auth.uid(), 'operator'::public.app_role)
  );

drop policy if exists "pr_outreach_log_staff_read" on public.pr_outreach_log;
create policy "pr_outreach_log_staff_read"
  on public.pr_outreach_log for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    or public.has_role(auth.uid(), 'operator'::public.app_role)
  );

comment on table public.pr_opportunities is
  'Digital PR: okazje medialne z monitoringu RSS (cron 6h). Wysyłka wyłącznie ręcznie z panelu /admin/pr-media.';
comment on table public.pr_outreach_log is
  'Digital PR: log wysyłek outreach (Resend) + statusy dostarczenia z webhooka.';

-- ── Cron: monitoring co 6 godzin ────────────────────────────────────────────
-- Bez pg_cron / pg_net migracja nie może się wywrócić — wtedy harmonogram
-- pomijamy (do zarejestrowania ręcznie). Limit czasu 60 s: tick pobiera
-- kilka feedów RSS po maks. 15 s każdy.
do $do$
declare
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron / pg_net niedostępne — job pr-monitor-tick pominięty';
    return;
  end if;

  for job in select jobname from cron.job where jobname = 'pr-monitor-tick' loop
    perform cron.unschedule(job.jobname);
  end loop;

  perform cron.schedule('pr-monitor-tick', '0 */6 * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);$j$,
    base_url || '/api/public/hooks/pr-monitor-tick', hdrs));
end
$do$;

notify pgrst, 'reload schema';
