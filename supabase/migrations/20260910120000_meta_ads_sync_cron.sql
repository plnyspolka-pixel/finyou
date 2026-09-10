-- Synchronizacja kampanii Meta: cron tick wołający endpoint aplikacji
-- (wzorem pozostałych ticków).
--
-- Dotąd `meta_ad_accounts` / `meta_campaigns` odświeżały się WYŁĄCZNIE po
-- ręcznym kliknięciu w /admin/meta — ostatni wpis w meta_sync_log pochodził
-- z 13.06.2026, więc statusy, budżety i CPL kampanii były nieaktualne.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'meta-ads-sync-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co godzinę o :20 — insighty Meta i tak aktualizują się z opóźnieniem,
  -- a limity Graph API nie lubią częstszego pobierania pełnej listy kampanii.
  PERFORM cron.schedule('meta-ads-sync-tick', '20 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/meta-ads-sync-tick', hdrs));
END $$;
