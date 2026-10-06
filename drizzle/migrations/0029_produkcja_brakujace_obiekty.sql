-- =====================================================================
-- Produkcja: obiekty z migracji, które nigdy nie trafiły do lustra drizzle.
--
-- Od 2026-09-24 produkcja dostaje wyłącznie migracje z lustrem w
-- drizzle/migrations i wpisem w _journal.json. Poniższe migracje powstały
-- wcześniej (albo z datą wsteczną) i nie mają lustra, więc ich tabele,
-- kolumny, polityki i joby pg_cron nie istnieją na produkcji (audyt
-- information_schema z 2026-10-06), choć kod z nich korzysta:
--
--   20260718130000_rcn_transactions          → rcn_transactions
--   20260730090000_bot_loop_guard            → comms_suppressions, CHECK suppressed_emails
--   20260803120000_windykacja_simplified     → kolumny wind_*, voicebot_settings, polityka Storage
--   20260803150000_seo_location_pages        → seo_location_pages + job seo-location-publish-tick
--   20260803153000_seo_location_report       → seo_location_report_entries
--   20260803170000_video_pipeline            → video_pipeline, youtube_video_id + job video-pipeline-tick
--   20260804120000_institutional_investor_bot→ text_agent_settings id=2, audience, match_text_agent_knowledge
--
-- Do tego joby pg_cron, których żadna migracja nigdy nie rejestrowała,
-- choć endpointy istnieją: affiliate-events-tick, kw-easymkw-poll.
--
-- Świadomie POMINIĘTE (zastąpione nowszymi migracjami, które są na produkcji):
--   * 20260802120000_module_access_full_investor — investor_has_full_access
--     zmieniono 2026-09-30 (abonament); odtworzenie nadpisałoby obecny model.
--   * 20260629162531 debt_collection_* — tabele celowo usunięte 2026-06-30.
--
-- Cała migracja jest idempotentna (IF NOT EXISTS / DROP IF EXISTS / guardy),
-- żeby nie wywróciła się na częściowo istniejących obiektach.
-- =====================================================================

-- ── 1. Rejestr Cen Nieruchomości (lokalne transakcje) ───────────────────────
create table if not exists public.rcn_transactions (
  id             uuid not null default gen_random_uuid() primary key,
  source         text not null default 'deweloperuch/rejestr-cen-nieruchomosci',
  city           text,
  external_id    text,
  property_kind  text not null default 'inne',
  lat            double precision not null,
  lng            double precision not null,
  tx_date        date,
  price_pln      numeric,
  area_m2        numeric,
  area_ha        numeric,
  price_per_m2   numeric,
  price_per_ha   numeric,
  land_use       text,
  created_at     timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists rcn_tx_lat_idx  on public.rcn_transactions (lat);
create index if not exists rcn_tx_lng_idx  on public.rcn_transactions (lng);
create index if not exists rcn_tx_kind_idx on public.rcn_transactions (property_kind);
create index if not exists rcn_tx_date_idx on public.rcn_transactions (tx_date);

revoke all on public.rcn_transactions from public, anon;
grant select, insert, update, delete on public.rcn_transactions to authenticated;
grant all on public.rcn_transactions to service_role;
alter table public.rcn_transactions enable row level security;

drop policy if exists rcn_tx_staff_all on public.rcn_transactions;
create policy rcn_tx_staff_all on public.rcn_transactions for all to authenticated
  using (public.has_role(auth.uid(), 'administrator'::public.app_role)
         or public.has_role(auth.uid(), 'operator'::public.app_role))
  with check (public.has_role(auth.uid(), 'administrator'::public.app_role)
              or public.has_role(auth.uid(), 'operator'::public.app_role));

-- ── 2. Ochrona przed pętlami bot-bot ────────────────────────────────────────
-- Na produkcji CHECK zawiera 'internal' (spoza migracji) — lista jest sumą
-- obu wersji, żeby nie odrzucić istniejących wierszy.
alter table public.suppressed_emails
  drop constraint if exists suppressed_emails_reason_check;
alter table public.suppressed_emails
  add constraint suppressed_emails_reason_check check (
    reason in (
      'unsubscribe',
      'bounce',
      'complaint',
      'internal',
      'loop_detected',
      'bot_detected',
      'repeated_content',
      'manual'
    )
  );

create table if not exists public.comms_suppressions (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  identifier text not null,
  reason text not null,
  metadata jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel, identifier)
);

revoke all on public.comms_suppressions from public, anon;
grant all on public.comms_suppressions to service_role;
alter table public.comms_suppressions enable row level security;

drop policy if exists "Service role can read comms suppressions" on public.comms_suppressions;
create policy "Service role can read comms suppressions"
  on public.comms_suppressions for select
  using (auth.role() = 'service_role');
drop policy if exists "Service role can insert comms suppressions" on public.comms_suppressions;
create policy "Service role can insert comms suppressions"
  on public.comms_suppressions for insert
  with check (auth.role() = 'service_role');
drop policy if exists "Service role can update comms suppressions" on public.comms_suppressions;
create policy "Service role can update comms suppressions"
  on public.comms_suppressions for update
  using (auth.role() = 'service_role');
drop policy if exists "Service role can delete comms suppressions" on public.comms_suppressions;
create policy "Service role can delete comms suppressions"
  on public.comms_suppressions for delete
  using (auth.role() = 'service_role');

create index if not exists idx_comms_suppressions_lookup
  on public.comms_suppressions (channel, identifier);

-- ── 3. Windykacja: opłaty, potwierdzenia nadania/odbioru, agent, skany ─────
alter table public.wind_events
  add column if not exists oplata numeric not null default 0;

alter table public.wind_documents
  add column if not exists potwierdzenie_nadania_url text,
  add column if not exists data_nadania date,
  add column if not exists potwierdzenie_odbioru_url text,
  add column if not exists data_odbioru date;

alter table public.voicebot_settings
  add column if not exists windykacja_agent_id text;

-- Inwestor: pełny dostęp do własnych skanów windykacyjnych
-- (pliki-klienta / windykacja/<auth.uid()>/<caseId>/plik).
drop policy if exists pliki_klienta_windykacja_own on storage.objects;
create policy pliki_klienta_windykacja_own on storage.objects
  for all to authenticated
  using (
    bucket_id = 'pliki-klienta'
    and (storage.foldername(name))[1] = 'windykacja'
    and (storage.foldername(name))[2] = (auth.uid())::text
  )
  with check (
    bucket_id = 'pliki-klienta'
    and (storage.foldername(name))[1] = 'windykacja'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

-- ── 4. Programmatic SEO: podstrony /pozyczki/[miasto] i raport lokalizacji ──
create table if not exists public.seo_location_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  teryt text not null unique,
  geo_unit_id uuid references public.geo_units(id) on delete set null,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  meta_title text not null,
  meta_description text not null,
  content jsonb not null,
  content_hash text not null,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_seo_loc_pages_status
  on public.seo_location_pages (status, generated_at);

drop trigger if exists trg_seo_loc_pages_touch_updated_at on public.seo_location_pages;
create trigger trg_seo_loc_pages_touch_updated_at
  before update on public.seo_location_pages
  for each row execute function public.set_updated_at();

alter table public.seo_location_pages enable row level security;

-- Publiczny odczyt wyłącznie opublikowanych stron; kadra widzi też drafty.
drop policy if exists seo_loc_pages_public_read on public.seo_location_pages;
create policy seo_loc_pages_public_read on public.seo_location_pages
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists seo_loc_pages_staff_read on public.seo_location_pages;
create policy seo_loc_pages_staff_read on public.seo_location_pages
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    or public.has_role(auth.uid(), 'operator'::public.app_role)
  );

revoke all on public.seo_location_pages from public, anon;
grant select on public.seo_location_pages to anon, authenticated;
grant all on public.seo_location_pages to service_role;

comment on table public.seo_location_pages is
  'Programmatic SEO: podstrony /pozyczki/[miasto] generowane z danych GUS/TERYT. Publiczny odczyt tylko status=published; zapis tylko service_role.';

create table if not exists public.seo_location_report_entries (
  id uuid primary key default gen_random_uuid(),
  teryt text not null unique,
  name text not null,
  voivodeship text not null,
  rank integer not null,
  population integer,
  density_per_km2 numeric(10,2),
  population_within_25km integer not null default 0,
  population_within_45km integer not null default 0,
  attractiveness integer,
  fua_role text not null default 'none' check (fua_role in ('core','commuting_zone','none')),
  data_version text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_seo_loc_report_rank
  on public.seo_location_report_entries (rank);

drop trigger if exists trg_seo_loc_report_touch_updated_at on public.seo_location_report_entries;
create trigger trg_seo_loc_report_touch_updated_at
  before update on public.seo_location_report_entries
  for each row execute function public.set_updated_at();

alter table public.seo_location_report_entries enable row level security;

-- Dane zagregowane z GUS/TERYT (bez danych klientów) — publiczny odczyt.
drop policy if exists seo_loc_report_public_read on public.seo_location_report_entries;
create policy seo_loc_report_public_read on public.seo_location_report_entries
  for select to anon, authenticated
  using (true);

revoke all on public.seo_location_report_entries from public, anon;
grant select on public.seo_location_report_entries to anon, authenticated;
grant all on public.seo_location_report_entries to service_role;

comment on table public.seo_location_report_entries is
  'Publiczny ranking lokalizacji (asset linkowalny /raport-lokalizacje). Wyłącznie agregaty GUS/TERYT + scoring bazowy; zapis tylko service_role.';

-- ── 5. Pipeline YouTube (treść → scenariusz → render → publikacja) ──────────
create table if not exists public.video_pipeline (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'blog'
    check (source_type in ('blog', 'location')),
  source_slug text not null,
  source_title text not null,
  source_url text not null,
  script_md text,
  yt_title_options text[] not null default '{}',
  yt_title text,
  yt_description text,
  yt_tags text[] not null default '{}',
  status text not null default 'queued'
    check (status in ('queued', 'script_ready', 'rendering', 'rendered',
                      'publish_queued', 'published', 'failed')),
  render_provider text,
  render_video_id text,
  video_url text,
  youtube_queue_id uuid references public.youtube_publish_queue(id) on delete set null,
  youtube_video_id text,
  last_error text,
  created_by uuid,
  script_generated_at timestamptz,
  rendered_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_slug)
);

create index if not exists idx_video_pipeline_status
  on public.video_pipeline (status, created_at desc);

drop trigger if exists trg_video_pipeline_touch_updated_at on public.video_pipeline;
create trigger trg_video_pipeline_touch_updated_at
  before update on public.video_pipeline
  for each row execute function public.set_updated_at();

alter table public.ai_seo_articles
  add column if not exists youtube_video_id text;
alter table public.seo_location_pages
  add column if not exists youtube_video_id text;

alter table public.video_pipeline enable row level security;

drop policy if exists video_pipeline_staff_read on public.video_pipeline;
create policy video_pipeline_staff_read on public.video_pipeline
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    or public.has_role(auth.uid(), 'operator'::public.app_role)
  );

revoke all on public.video_pipeline from public, anon;
grant select on public.video_pipeline to authenticated;
grant all on public.video_pipeline to service_role;

comment on table public.video_pipeline is
  'Pipeline YouTube (treść → scenariusz → render → publikacja). Render przez adapter (HeyGen); brak kluczy = stop na script_ready. Upload przez youtube_publish_queue za flagą env.';

-- ── 6. Bot dla inwestorów instytucjonalnych (agent tekstowy id=2) ───────────
alter table public.text_agent_settings
  drop constraint if exists text_agent_settings_id_check;
alter table public.text_agent_settings
  add constraint text_agent_settings_id_check check (id in (1, 2));

insert into public.text_agent_settings (id, system_prompt)
values (2, '')
on conflict do nothing;

alter table public.text_agent_knowledge
  add column if not exists audience text not null default 'klient'
  check (audience in ('klient', 'inwestor', 'wspolna'));

-- Wersja 2-argumentowa (produkcja) ustępuje 3-argumentowej z filtrem
-- audience — dwa przeciążenia byłyby dla PostgREST niejednoznaczne.
drop function if exists public.match_text_agent_knowledge(vector, int);

create or replace function public.match_text_agent_knowledge(
  query_embedding vector(1536),
  match_count int default 5,
  filter_audience text default null
)
returns table (
  id uuid,
  title text,
  content text,
  similarity float
)
language sql stable
security definer
set search_path = public
as $$
  select k.id, k.title, k.content, 1 - (k.embedding <=> query_embedding) as similarity
  from public.text_agent_knowledge k
  where k.embedding is not null
    and (filter_audience is null or k.audience = filter_audience or k.audience = 'wspolna')
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_text_agent_knowledge(vector, int, text) from public, anon;
grant execute on function public.match_text_agent_knowledge(vector, int, text) to authenticated, service_role;

-- ── 7. Joby pg_cron dla istniejących endpointów ─────────────────────────────
-- Bez pg_cron / pg_net migracja nie może się wywrócić — wtedy harmonogram
-- pomijamy (do zarejestrowania ręcznie).
do $do$
declare
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
  jobs constant text[][] := array[
    -- Poniedziałek 06:00 UTC — publikacja do 10 najstarszych draftów SEO.
    array['seo-location-publish-tick', '0 6 * * 1'],
    -- Co godzinę: poll renderów i synchronizacja publikacji pipeline'u wideo.
    array['video-pipeline-tick', '30 * * * *'],
    -- Prowizje sieciowe dla zdarzeń z triggerów DB (np. wypłata pożyczki).
    array['affiliate-events-tick', '*/15 * * * *'],
    -- Wyniki asynchronicznych zamówień treści KW z EasyMKW.
    array['kw-easymkw-poll', '*/2 * * * *']
  ];
  i int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron / pg_net niedostępne — joby seo-location-publish-tick, video-pipeline-tick, affiliate-events-tick, kw-easymkw-poll pominięte';
    return;
  end if;

  for i in 1 .. array_length(jobs, 1) loop
    for job in select jobname from cron.job where jobname = jobs[i][1] loop
      perform cron.unschedule(job.jobname);
    end loop;
    perform cron.schedule(jobs[i][1], jobs[i][2], format(
      $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);$j$,
      base_url || '/api/public/hooks/' || jobs[i][1], hdrs));
  end loop;
end
$do$;

notify pgrst, 'reload schema';
