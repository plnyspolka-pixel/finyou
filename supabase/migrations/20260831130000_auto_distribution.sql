-- Auto-dystrybucja wniosków do inwestorów instytucjonalnych.
-- Rozruch z zatwierdzaniem: silnik (cron) proponuje wysyłki, człowiek
-- zatwierdza jednym kliknięciem w /admin/auto-dystrybucja; wysyłka idzie
-- rdzeniem współdzielonym z ręczną dystrybucją.

-- ── Kryteria per instytucja ─────────────────────────────────────────────────
create table if not exists public.investor_distribution_criteria (
  investor_id uuid primary key references public.investors(id) on delete cascade,
  min_amount numeric,            -- null = bez dolnej granicy
  max_amount numeric,            -- null = bez górnej granicy
  auto_send_enabled boolean not null default true,
  accepting_applications boolean not null default true,
  paused_until timestamptz,      -- zawieszenie czasowe (np. z maila instytucji)
  notes text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Seed kryteriów od właściciela (dopasowanie po nazwie, best-effort):
-- Korona: tylko do 350 000 zł; JanVest: tylko powyżej 100 000 zł.
insert into public.investor_distribution_criteria (investor_id, max_amount, notes)
select i.id, 350000, 'Seed: przyjmuje wnioski do 350 tys. zł'
from public.investors i
where i.investor_type = 'instytucjonalny' and i.company_name ilike '%korona%'
on conflict (investor_id) do nothing;

insert into public.investor_distribution_criteria (investor_id, min_amount, notes)
select i.id, 100000, 'Seed: przyjmuje wnioski powyżej 100 tys. zł'
from public.investors i
where i.investor_type = 'instytucjonalny'
  and (i.company_name ilike '%janvest%' or i.company_name ilike '%jan vest%')
on conflict (investor_id) do nothing;

-- ── Ustawienia globalne (singleton) ─────────────────────────────────────────
create table if not exists public.auto_distribution_settings (
  id integer primary key check (id = 1),
  enabled boolean not null default true,
  -- Minimalny potencjał lokalizacyjny; wniosek bez score przechodzi (neutralne 40).
  min_location_score numeric not null default 40,
  -- Maksymalna liczba zatwierdzonych wysyłek na dobę (bezpiecznik).
  daily_send_limit integer not null default 20,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.auto_distribution_settings (id) values (1) on conflict (id) do nothing;

-- ── Kolejka propozycji ──────────────────────────────────────────────────────
create table if not exists public.auto_distribution_proposals (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.loan_applications(id) on delete cascade,
  status text not null default 'proposed'
    check (status in ('proposed','sending','approved_sent','rejected','failed','stale')),
  -- Dlaczego wniosek się kwalifikuje: {loan_amount, location_score, brief_empty}
  eligibility jsonb not null default '{}'::jsonb,
  -- Dopasowane instytucje: [{investor_id, name, reason}]
  matches jsonb not null default '[]'::jsonb,
  proposed_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  sent_result jsonb,
  error text
);

-- Jedna otwarta propozycja per wniosek.
create unique index if not exists auto_distribution_open_proposal_idx
  on public.auto_distribution_proposals (loan_application_id)
  where status = 'proposed';

create index if not exists auto_distribution_proposals_status_idx
  on public.auto_distribution_proposals (status, proposed_at desc);

-- ── RLS: odczyt tylko personel wewnętrzny; zapis przez service_role ─────────
alter table public.investor_distribution_criteria enable row level security;
alter table public.auto_distribution_settings enable row level security;
alter table public.auto_distribution_proposals enable row level security;

drop policy if exists "idc_staff_select" on public.investor_distribution_criteria;
create policy "idc_staff_select" on public.investor_distribution_criteria
  for select using (public.is_internal_staff(auth.uid()));

drop policy if exists "ads_staff_select" on public.auto_distribution_settings;
create policy "ads_staff_select" on public.auto_distribution_settings
  for select using (public.is_internal_staff(auth.uid()));

drop policy if exists "adp_staff_select" on public.auto_distribution_proposals;
create policy "adp_staff_select" on public.auto_distribution_proposals
  for select using (public.is_internal_staff(auth.uid()));

-- ── Cron tick (propozycje; wysyłka wyłącznie po zatwierdzeniu w panelu) ─────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'auto-distribution-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('auto-distribution-tick', '*/30 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/auto-distribution-tick', hdrs));
END $$;
