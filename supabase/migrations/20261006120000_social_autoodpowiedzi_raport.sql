-- =====================================================================
-- Social media: automatyczne odpowiedzi na komentarze + tygodniowy raport.
--
-- 1. social_comment_replies — rejestr decyzji automatu odpowiedzi
--    (FB / IG / YouTube): każda obsłużona wiadomość dostaje wiersz z akcją
--    replied / skipped / escalated / failed / dry_run. Unikalne
--    (platform, comment_id) to jednocześnie blokada przed podwójną
--    odpowiedzią przy równoległych przebiegach.
--    Logika: src/lib/social-auto-reply.server.ts,
--    tick: /api/public/hooks/social-comments-tick (pg_cron co 15 minut).
-- 2. social_stats_snapshots — liczba obserwujących per platforma zapisywana
--    przy każdym raporcie (różnica tydzień do tygodnia).
--    Logika: src/lib/social-weekly-report.server.ts,
--    tick: /api/public/hooks/social-weekly-report (poniedziałki 06:00 UTC).
--
-- Obie tabele: zapis wyłącznie przez serwer (service_role), odczyt —
-- administrator i operator. Brak dostępu dla anon.
-- =====================================================================

create table if not exists public.social_comment_replies (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram', 'youtube')),
  comment_id text not null,
  -- Post / media / film, pod którym jest komentarz.
  object_id text,
  author_name text,
  comment_text text,
  permalink text,
  action text not null
    check (action in ('replied', 'skipped', 'escalated', 'failed', 'dry_run')),
  reason text,
  reply_text text,
  reply_id text,
  created_at timestamptz not null default now(),
  constraint social_comment_replies_platform_comment_key unique (platform, comment_id)
);

create index if not exists social_comment_replies_created_at_idx
  on public.social_comment_replies (created_at desc);
create index if not exists social_comment_replies_action_idx
  on public.social_comment_replies (action, created_at desc);

revoke all on public.social_comment_replies from public, anon;
grant all on public.social_comment_replies to service_role;
grant select on public.social_comment_replies to authenticated;

alter table public.social_comment_replies enable row level security;

drop policy if exists "social_comment_replies_staff_read" on public.social_comment_replies;
create policy "social_comment_replies_staff_read"
  on public.social_comment_replies for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    or public.has_role(auth.uid(), 'operator'::public.app_role)
  );

comment on table public.social_comment_replies is
  'Automat odpowiedzi na komentarze FB/IG/YT: decyzja per komentarz (tick co 15 min).';

create table if not exists public.social_stats_snapshots (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram', 'youtube')),
  -- null = odczyt się nie udał (wiersz i tak zapisujemy jako ślad przebiegu).
  followers bigint,
  metrics jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists social_stats_snapshots_platform_captured_idx
  on public.social_stats_snapshots (platform, captured_at desc);

revoke all on public.social_stats_snapshots from public, anon;
grant all on public.social_stats_snapshots to service_role;
grant select on public.social_stats_snapshots to authenticated;

alter table public.social_stats_snapshots enable row level security;

drop policy if exists "social_stats_snapshots_staff_read" on public.social_stats_snapshots;
create policy "social_stats_snapshots_staff_read"
  on public.social_stats_snapshots for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    or public.has_role(auth.uid(), 'operator'::public.app_role)
  );

comment on table public.social_stats_snapshots is
  'Obserwujący per platforma (FB/IG/YT) z każdego raportu tygodniowego — baza do różnic tydzień do tygodnia.';

-- ── Cron (pg_cron → endpointy) ───────────────────────────────────────────────
-- Bez pg_cron / pg_net migracja nie może się wywrócić — wtedy harmonogram
-- pomijamy (do zarejestrowania ręcznie). Limit czasu 60 s: tick czeka na
-- model AI i publikację kilku odpowiedzi, raport — na API trzech platform.
do $do$
declare
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron / pg_net niedostępne — joby social-comments-tick i social-weekly-report pominięte';
    return;
  end if;

  for job in
    select jobname from cron.job where jobname in ('social-comments-tick', 'social-weekly-report')
  loop
    perform cron.unschedule(job.jobname);
  end loop;

  -- Co 15 minut; endpoint no-opuje, gdy nie ma nowych komentarzy
  -- (albo gdy SOCIAL_AUTO_REPLY=off).
  perform cron.schedule('social-comments-tick', '*/15 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);$j$,
    base_url || '/api/public/hooks/social-comments-tick', hdrs));

  -- Poniedziałki 06:00 UTC (8:00 latem, 7:00 zimą czasu polskiego).
  perform cron.schedule('social-weekly-report', '0 6 * * 1', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);$j$,
    base_url || '/api/public/hooks/social-weekly-report', hdrs));
end
$do$;

notify pgrst, 'reload schema';
