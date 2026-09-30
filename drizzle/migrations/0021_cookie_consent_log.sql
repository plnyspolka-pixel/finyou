-- =====================================================================
-- Rejestr zgód na cookies (rozliczalność, art. 7 ust. 1 RODO).
--
-- Każda decyzja z banera / „Ustawień cookies” to nowy wiersz. consent_id
-- to losowy identyfikator zapisany także w cookie fy_cookie_consent —
-- łączy wpis z przeglądarką bez przechowywania pełnego IP (ostatni
-- oktet IPv4 / ostatnie 80 bitów IPv6 są zerowane po stronie serwera).
-- Zapis wyłącznie przez serwer (service_role); odczyt — administrator.
-- =====================================================================

create table if not exists public.cookie_consent_log (
  id bigint generated always as identity primary key,
  consent_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  consent_version int not null,
  analytics boolean not null,
  marketing boolean not null,
  source text not null check (source in ('banner_accept_all', 'banner_reject', 'settings')),
  page_path text,
  ip_truncated text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists cookie_consent_log_consent_id_idx
  on public.cookie_consent_log (consent_id, created_at desc);
create index if not exists cookie_consent_log_user_id_idx
  on public.cookie_consent_log (user_id) where user_id is not null;
create index if not exists cookie_consent_log_created_at_idx
  on public.cookie_consent_log (created_at);

revoke all on public.cookie_consent_log from public, anon;
grant all on public.cookie_consent_log to service_role;
grant select on public.cookie_consent_log to authenticated;

alter table public.cookie_consent_log enable row level security;

drop policy if exists "cookie_consent_log_admin_read" on public.cookie_consent_log;
create policy "cookie_consent_log_admin_read"
  on public.cookie_consent_log for select
  to authenticated
  using (public.has_role(auth.uid(), 'administrator'));

-- Retencja: 3 lata od ostatniej decyzji danej przeglądarki (consent_id),
-- zgodnie z § 15 ust. 6 polityki prywatności. Codziennie o 3:40.
-- Bez pg_cron migracja nie może się wywrócić — wtedy harmonogram pomijamy.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-cookie-consent-log',
      '40 3 * * *',
      $job$delete from public.cookie_consent_log l
         where l.created_at < now() - interval '3 years'
           and not exists (
             select 1 from public.cookie_consent_log n
              where n.consent_id = l.consent_id
                and n.created_at >= now() - interval '3 years'
           );$job$
    );
  end if;
end
$do$;

notify pgrst, 'reload schema';
