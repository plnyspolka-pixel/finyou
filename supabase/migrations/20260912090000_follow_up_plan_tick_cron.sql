-- Cron dla kadencji follow-up (mail / SMS / telefon z `lead_follow_up_schedule`).
--
-- Kontekst: migracja 20260707120000 zaplanowała `follow-up-tick` (*/15), a
-- wysyłka kadencji jechała doczepiona do tamtego handlera. Później kadencja
-- dostała własny endpoint `/api/public/hooks/follow-up-plan-tick` (bo przegrywała
-- z synchronizacją Messengera — pg_net zrywa połączenie po 5 s), ale ŻADNA
-- migracja nie zarejestrowała dla niego joba. Efekt: `processDueFollowUps`
-- nie miał już żadnego wywołującego, pozycje w `lead_follow_up_schedule`
-- wisiały w `pending` w nieskończoność i ciepłe leady stygły.
--
-- Ten plik domyka pętlę. Endpoint sam pilnuje okien godzinowych, statusów
-- terminalnych i hamulców (1 SMS / 1 telefon na numer na dobę), więc może być
-- odpytywany często i po prostu no-opuje, gdy nie ma nic „due".

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'follow-up-plan-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co 5 minut: jedna partia to max 200 pozycji, a zaległości po dłuższej
  -- przerwie mają się rozładować szybciej niż przy */15.
  PERFORM cron.schedule('follow-up-plan-tick', '*/5 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/follow-up-plan-tick', hdrs));
END $$;
