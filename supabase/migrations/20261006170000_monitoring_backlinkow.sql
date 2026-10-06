-- =====================================================================
-- Monitoring backlinków (ai_backlinks) — raz w tygodniu.
--
-- 1. ai_backlinks.status_changed_at — kiedy status zmienił się ostatnio
--    (ustawia trigger przy INSERT i przy każdej zmianie statusu: z ticka
--    monitoringu, z panelu i z MCP). Na tym opiera się sekcja „Backlinki"
--    w poniedziałkowym raporcie social media („nowe live", „utracone"
--    w ostatnich 7 dniach). Istniejące wiersze: created_at.
-- 2. ai_backlinks.last_error — błąd ostatniego sprawdzenia (sieć, 5xx,
--    blokada botów). Taki błąd NIE zmienia statusu — jednorazowa awaria
--    strony nie oznacza utraty linku.
-- 3. Job pg_cron backlinks-check-tick w niedziele 04:00 UTC (przed
--    raportem w poniedziałek 06:00 UTC): najwyżej 50 wierszy 'live' /
--    'pending', najdawniej sprawdzane najpierw.
--
-- Logika: src/lib/backlinks-monitor.ts (analiza HTML, decyzja o statusie)
-- i backlinks-monitor.server.ts (tick). Uprawnienia tabeli bez zmian
-- (RLS: administrator; zapis z ticka przez service_role).
-- Migracja idempotentna; bez tabeli ai_backlinks kolumny i trigger są
-- pomijane (z komunikatem), a bez pg_cron / pg_net — harmonogram.
-- =====================================================================

do $do$
begin
  if to_regclass('public.ai_backlinks') is null then
    raise notice 'Brak tabeli public.ai_backlinks — kolumny i trigger monitoringu pominięte';
    return;
  end if;

  alter table public.ai_backlinks add column if not exists status_changed_at timestamptz;
  alter table public.ai_backlinks add column if not exists last_error text;

  update public.ai_backlinks
     set status_changed_at = created_at
   where status_changed_at is null;

  create index if not exists idx_ai_backlinks_status_checked
    on public.ai_backlinks (status, last_checked_at);
  create index if not exists idx_ai_backlinks_status_changed
    on public.ai_backlinks (status_changed_at desc);

  comment on column public.ai_backlinks.status_changed_at is
    'Ostatnia zmiana statusu (trigger). Raport tygodniowy: nowe live / utracone w ostatnich 7 dniach.';
  comment on column public.ai_backlinks.last_error is
    'Błąd ostatniego sprawdzenia (sieć, 5xx, blokada) — status zostaje bez zmian.';
end
$do$;

create or replace function public.ai_backlinks_track_status_change()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := coalesce(new.status_changed_at, now());
  elsif new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end
$fn$;

do $do$
begin
  if to_regclass('public.ai_backlinks') is null then
    return;
  end if;
  drop trigger if exists trg_ai_backlinks_status_changed on public.ai_backlinks;
  create trigger trg_ai_backlinks_status_changed
    before insert or update on public.ai_backlinks
    for each row execute function public.ai_backlinks_track_status_change();
end
$do$;

-- ── Cron (pg_cron → endpoint) ────────────────────────────────────────────────
-- Bez pg_cron / pg_net migracja nie może się wywrócić — wtedy harmonogram
-- pomijamy (do zarejestrowania ręcznie). Limit czasu 120 s: do 50 stron
-- po 10 s, równolegle po 5, z budżetem ~95 s po stronie serwera.
do $do$
declare
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron / pg_net niedostępne — job backlinks-check-tick pominięty';
    return;
  end if;

  for job in select jobname from cron.job where jobname = 'backlinks-check-tick' loop
    perform cron.unschedule(job.jobname);
  end loop;

  -- Niedziele 04:00 UTC — dane gotowe na poniedziałkowy raport (06:00 UTC).
  perform cron.schedule('backlinks-check-tick', '0 4 * * 0', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 120000);$j$,
    base_url || '/api/public/hooks/backlinks-check-tick', hdrs));
end
$do$;

notify pgrst, 'reload schema';
