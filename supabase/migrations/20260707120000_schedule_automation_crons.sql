-- === Planowanie brakujących cronów automatyzacji (pg_cron) ===
-- Do tej pory w migracjach były tylko 'daily-blog-tick' i 'process-scheduled-calls-tick'.
-- Batche maili/SMS/przypomnień/followupów NIE MIAŁY crona → nigdy nie startowały
-- ("nic nie idzie"). Ten plik planuje je na stałe. Wszystkie endpointy same pilnują
-- swoich okien (godziny, dni, harmonogram w reminder_email_schedule), więc mogą być
-- odpytywane często i po prostu no-opują poza swoim oknem.
--
-- Ten sam URL bazowy + apikey co działający 'process-scheduled-calls-tick'.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Zabezpieczenie: upewnij się, że harmonogram maili jest WŁĄCZONY (gdyby seed
-- z 20260705120000 nie zdążył/nie wszedł — batch i tak sam sprawdza `enabled`).
INSERT INTO public.reminder_email_schedule (id, enabled, cron_expression, timezone)
VALUES (1, true, '0 8,20 * * 1-6', 'Europe/Warsaw')
ON CONFLICT (id) DO UPDATE SET enabled = true;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  -- Usuń ewentualne wcześniejsze wersje tych zadań (idempotentnie).
  FOR job IN SELECT jobname FROM cron.job WHERE jobname IN (
    'loan-reminder-emails-tick',
    'loan-reminders-tick',
    'follow-up-tick',
    'saturday-sms-reminders',
    'meta-leads-pull'
  ) LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- 1) MAILE przypominające — co minutę; endpoint sam sprawdza harmonogram
  --    (reminder_email_schedule: '0 8,20 * * 1-6') i wysyła tylko gdy „due".
  PERFORM cron.schedule('loan-reminder-emails-tick', '* * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/loan-reminder-emails-tick', hdrs));

  -- 2) TELEFONY-PRZYPOMNIENIA (Ania dzwoni do wniosków „due") — co minutę;
  --    endpoint sam pilnuje okna 8:00–22:00 i next_reminder_at.
  PERFORM cron.schedule('loan-reminders-tick', '* * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/loan-reminders', hdrs));

  -- 3) FOLLOW-UP (nudge dot. leadów, które ucichły) — co 15 minut.
  PERFORM cron.schedule('follow-up-tick', '*/15 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/follow-up-tick', hdrs));

  -- 4) SMS (raz na miesiąc, sobotni poranek) — sprawdzamy co godzinę;
  --    endpoint sam gate'uje na sobotę 8–11 Warszawa i throttle ~28 dni.
  PERFORM cron.schedule('saturday-sms-reminders', '0 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/saturday-sms-reminders', hdrs));

  -- 5) Backup pull leadów z Meta (uzupełnia webhook) — co minutę.
  PERFORM cron.schedule('meta-leads-pull', '* * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/meta-leads-pull', hdrs));
END $$;
