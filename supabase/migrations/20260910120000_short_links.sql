-- Krótkie linki dla SMS-ów (financeyou.pl/s/<kod>).
--
-- Powód: w SMS-ie na wejściu leada leciał surowy magic link Supabase
-- (https://<projekt>.supabase.co/auth/v1/verify?token=…&type=…) — kilkaset
-- znaków, kilka segmentów SMS, wygląda jak phishing i wygasa po ~godzinie.
--
-- Teraz w SMS-ie jest kod, a docelowy adres rozwiązujemy dopiero przy kliknięciu:
-- gdy znamy maila klienta, generujemy ŚWIEŻY magic link w momencie kliknięcia
-- (link z SMS-a nie wygasa), a w przeciwnym razie idziemy na `target_url`
-- (zwykle /wniosek/<token> albo financeyou.pl).

create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  target_url text not null,
  -- Gdy ustawione: przy kliknięciu generujemy świeży magic link dla tego adresu.
  magic_link_email text,
  magic_link_role text not null default 'klient',
  lead_id uuid,
  client_id uuid,
  loan_application_id uuid,
  phone_normalized text,
  source text,
  click_count integer not null default 0,
  last_clicked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists short_links_phone_idx on public.short_links (phone_normalized);
create index if not exists short_links_lead_idx on public.short_links (lead_id);
create index if not exists short_links_created_idx on public.short_links (created_at desc);

alter table public.short_links enable row level security;

-- Odczyt tylko dla zespołu (panel/diagnostyka). Publiczne przekierowanie
-- rozwiązuje link przez service role w /s/$code, więc nie potrzebuje polityki.
drop policy if exists "short_links_staff_select" on public.short_links;
create policy "short_links_staff_select" on public.short_links
  for select using (public.is_internal_staff(auth.uid()));

comment on table public.short_links is
  'Krótkie linki do SMS-ów: financeyou.pl/s/<code>. Docelowy adres rozwiązywany przy kliknięciu.';
comment on column public.short_links.magic_link_email is
  'Gdy ustawione — przy kliknięciu generujemy świeży magic link dla tego maila (link w SMS nie wygasa).';
