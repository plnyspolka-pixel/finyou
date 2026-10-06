-- =====================================================================
-- Codzienny digest zaangażowania i link buildingu (jeden mail rano,
-- ~10 gotowych akcji „kliknij → skopiuj → wklej → Zrobione").
--
-- System tylko ZNAJDUJE, PRZYGOTOWUJE i ŚLEDZI. Nic nie publikuje na
-- cudzych stronach (fora, cudze filmy YouTube, cudze konta Instagram) —
-- automatyczne wpisy tam łamią zasady platform i wytyczne Google o spamie;
-- wkleja człowiek.
--
-- 1. engagement_opportunities — kolejka akcji: komentarz pod filmem YT,
--    komentarz IG, odpowiedź na forum, pitch PR, pitch outreach, wpis
--    w katalogu firm. dedupe_key unikalny (to samo źródło nie wraca),
--    status new → sent (wysłane w mailu) → done / skipped (linki w mailu,
--    podpisane HMAC). Zrobiona akcja z linkiem do financeyou.pl dopisuje
--    wiersz ai_backlinks ze statusem 'pending'.
-- 2. engagement_feeds — lista feedów RSS/Atom (Google Alerts, fora) do
--    przeszukiwania; edytowalna bez wdrożenia (wiersz = feed; keywords
--    puste = domyślne słowa kluczowe, a dla Google Alerts — wszystko).
--
-- Logika: src/lib/engagement/*, tick: /api/public/hooks/engagement-digest-tick
-- (pg_cron codziennie 05:30 UTC), oznaczanie: /api/public/engagement/mark.
-- Obie tabele: zapis wyłącznie przez serwer (service_role), odczyt —
-- administrator i operator. Brak dostępu dla anon.
-- =====================================================================

create table if not exists public.engagement_opportunities (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('youtube_comment', 'instagram_comment', 'forum_reply', 'pr_pitch', 'outreach_pitch', 'directory_listing')),
  -- Nazwa serwisu / kanału / feedu, z którego pochodzi okazja.
  source text,
  -- Dokąd iść (strona, film, post, wątek albo mailto:).
  url text not null,
  title text,
  -- Co napisała druga strona (opis filmu, treść wątku, lead artykułu).
  snippet text,
  -- Tekst do wklejenia.
  suggested_text text,
  -- Dodatki: temat maila, mailto, instrukcje, adres strony, id źródeł.
  extra jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  status text not null default 'new'
    check (status in ('new', 'sent', 'done', 'skipped')),
  sent_at timestamptz,
  done_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  constraint engagement_opportunities_dedupe_key_key unique (dedupe_key)
);

create index if not exists engagement_opportunities_status_created_idx
  on public.engagement_opportunities (status, created_at);
create index if not exists engagement_opportunities_kind_status_idx
  on public.engagement_opportunities (kind, status);
create index if not exists engagement_opportunities_sent_at_idx
  on public.engagement_opportunities (sent_at desc);

revoke all on public.engagement_opportunities from public, anon;
grant all on public.engagement_opportunities to service_role;
grant select on public.engagement_opportunities to authenticated;

alter table public.engagement_opportunities enable row level security;

drop policy if exists "engagement_opportunities_staff_read" on public.engagement_opportunities;
create policy "engagement_opportunities_staff_read"
  on public.engagement_opportunities for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    or public.has_role(auth.uid(), 'operator'::public.app_role)
  );

comment on table public.engagement_opportunities is
  'Codzienny digest zaangażowania: akcje do ręcznego wykonania (komentarze, fora, PR, outreach, katalogi). Nic nie jest publikowane automatycznie.';

create table if not exists public.engagement_feeds (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  label text,
  -- Puste = domyślne słowa kluczowe (feedy Google Alerts: bez filtra).
  keywords text[] not null default '{}',
  active boolean not null default true,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint engagement_feeds_url_key unique (url)
);

revoke all on public.engagement_feeds from public, anon;
grant all on public.engagement_feeds to service_role;
grant select on public.engagement_feeds to authenticated;

alter table public.engagement_feeds enable row level security;

drop policy if exists "engagement_feeds_staff_read" on public.engagement_feeds;
create policy "engagement_feeds_staff_read"
  on public.engagement_feeds for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    or public.has_role(auth.uid(), 'operator'::public.app_role)
  );

comment on table public.engagement_feeds is
  'Feedy RSS/Atom (Google Alerts, fora) przeszukiwane przez digest zaangażowania. Dodanie wiersza = nowe źródło od następnego poranka.';

-- ── Cron (pg_cron → endpoint) ────────────────────────────────────────────────
-- Bez pg_cron / pg_net migracja nie może się wywrócić — wtedy harmonogram
-- pomijamy (do zarejestrowania ręcznie). Limit czasu 300 s: przebieg czeka
-- na API YouTube / Instagrama, feedy RSS i kilka szkiców od modelu AI.
do $do$
declare
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron / pg_net niedostępne — job engagement-digest-tick pominięty';
    return;
  end if;

  for job in select jobname from cron.job where jobname = 'engagement-digest-tick' loop
    perform cron.unschedule(job.jobname);
  end loop;

  -- Codziennie 05:30 UTC (7:30 latem, 6:30 zimą czasu polskiego).
  perform cron.schedule('engagement-digest-tick', '30 5 * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 300000);$j$,
    base_url || '/api/public/hooks/engagement-digest-tick', hdrs));
end
$do$;

notify pgrst, 'reload schema';
