-- === NAPRAWA AUTOMATYZACJI (followupy / przypomnienia / kampanie) ===
--
-- Problem 1 (krytyczny): zadania pg_cron wysyłały wyłącznie publiczny nagłówek
-- `apikey` (anon JWT), a wszystkie endpointy /api/public/hooks/* wymagają
-- prywatnego sekretu (`x-cron-secret`). Każdy tick kończył się 401 —
-- ŻADEN followup mailowy/telefoniczny/SMS nie wychodził.
--
-- Rozwiązanie: sekret cronów żyje w tabeli `cron_config` (dostęp wyłącznie
-- service-role; generowany losowo raz, tutaj). Zadania pg_cron czytają go
-- w momencie każdego wywołania, a endpointy weryfikują go przez
-- `requireCronAuth` (env CRON_SECRET LUB wartość z cron_config).
--
-- Problem 2: część silników nigdy nie miała crona (dispatch-campaigns,
-- voicebot-enrich-tick, affiliate-events-tick, sync-accounting,
-- ania-callbacks, lead-follow-ups) — planujemy je tutaj.
--
-- Problem 3: nowe wnioski nie dostawały `next_reminder_at`, więc kadencja
-- telefoniczna nigdy nie startowała — backfill + trigger BEFORE INSERT.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Sekret cronów — tabela tylko dla service-role (RLS bez polityk).
CREATE TABLE IF NOT EXISTS public.cron_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cron_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_config FROM anon, authenticated;

INSERT INTO public.cron_config (key, value)
VALUES ('cron_secret', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 2) Przeplanowanie WSZYSTKICH zadań z poprawnym nagłówkiem.
--    Nagłówek budowany w momencie każdego ticka (subselect z cron_config),
--    więc rotacja sekretu nie wymaga przeplanowania zadań.
DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  cmd_tpl text := $c$SELECT net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM public.cron_config WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );$c$;
  job record;
  jobs text[][] := ARRAY[
    -- [nazwa, harmonogram, ścieżka]
    ARRAY['loan-reminder-emails-tick', '* * * * *',    '/api/public/hooks/loan-reminder-emails-tick'],
    ARRAY['loan-reminders-tick',       '* * * * *',    '/api/public/hooks/loan-reminders'],
    ARRAY['follow-up-tick',            '*/15 * * * *', '/api/public/hooks/follow-up-tick'],
    ARRAY['saturday-sms-reminders',    '0 * * * *',    '/api/public/hooks/saturday-sms-reminders'],
    ARRAY['meta-leads-pull',           '* * * * *',    '/api/public/hooks/meta-leads-pull'],
    ARRAY['process-scheduled-calls-tick', '* * * * *', '/api/public/hooks/process-scheduled-calls'],
    ARRAY['daily-blog-6am-pl',         '0 4 * * *',    '/api/public/hooks/daily-blog-tick'],
    -- Dotąd NIGDY nie zaplanowane silniki:
    ARRAY['ania-callbacks',            '*/15 * * * *', '/api/public/hooks/ania-callbacks'],
    ARRAY['lead-follow-ups-tick',      '*/10 * * * *', '/api/public/hooks/lead-follow-ups'],
    ARRAY['dispatch-campaigns',        '*/5 * * * *',  '/api/public/hooks/dispatch-campaigns'],
    ARRAY['voicebot-enrich-tick',      '*/2 * * * *',  '/api/public/hooks/voicebot-enrich-tick'],
    ARRAY['affiliate-events-tick',     '*/15 * * * *', '/api/public/hooks/affiliate-events-tick'],
    ARRAY['sync-accounting',           '15 * * * *',   '/api/public/hooks/sync-accounting'],
    -- Automatyczne zaciąganie treści KW dla skompletowanych wniosków:
    ARRAY['kw-autofetch',              '*/10 * * * *', '/api/public/hooks/kw-autofetch']
  ];
  j text[];
BEGIN
  FOREACH j SLICE 1 IN ARRAY jobs LOOP
    -- idempotentnie: usuń starą wersję zadania, jeśli istnieje
    FOR job IN SELECT jobname FROM cron.job WHERE jobname = j[1] LOOP
      PERFORM cron.unschedule(job.jobname);
    END LOOP;
    PERFORM cron.schedule(j[1], j[2], format(cmd_tpl, base_url || j[3]));
  END LOOP;
END $$;

-- 3) Kadencja telefoniczna: zasiew `next_reminder_at`.
--    a) backfill dla aktywnych wniosków bez terminu,
UPDATE public.loan_applications
SET next_reminder_at = now() + interval '2 hours'
WHERE next_reminder_at IS NULL
  AND reminder_paused = false
  AND status IN (
    'nowy_lead', 'brak_kontaktu', 'kontakt', 'kompletowanie_danych',
    -- wartości sprzed unifikacji statusów (gdyby coś się przecisnęło):
    'w_trakcie_uzupelniania', 'braki_w_dokumentach', 'do_kontaktu', 'w_follow_upie'
  );

--    b) każdy NOWY wniosek dostaje pierwszy termin automatycznie.
CREATE OR REPLACE FUNCTION public.seed_next_reminder_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.next_reminder_at IS NULL THEN
    NEW.next_reminder_at := now() + interval '2 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_next_reminder ON public.loan_applications;
CREATE TRIGGER trg_seed_next_reminder
  BEFORE INSERT ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.seed_next_reminder_at();
