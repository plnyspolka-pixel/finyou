-- === Rozłożenie ticków pg_cron na różne minuty ===
-- Wszystkie ticki HTTP (pull leadów z Meta, follow-upy, scoring lokalizacji,
-- przydziały projektów, wzbogacanie rozmów voicebota…) startowały w tej samej
-- sekundzie — w minucie 0 i co 5/15 minut. Warstwa hostingu odrzucała nadmiarowe
-- żądania (502), więc te uruchomienia przepadały: leady wpadały z opóźnieniem,
-- follow-upy i statusy się spóźniały, scoring/przydziały były nieaktualne.
--
-- Zmieniamy WYŁĄCZNIE pole minut — częstotliwość każdego joba zostaje ta sama:
--   '*/N …'           → 'K-59/N …'  (np. */15 → 7-59/15 = 7, 22, 37, 52)
--   '0 * * * *'       → 'K * * * *'
--   '0 */H * * *'     → 'K */H * * *'
-- Joby rozpoznajemy po adresie endpointu w komendzie (nie po nazwie), bo część
-- z nich (voicebot-enrich-tick, kw-easymkw-poll, ania-callbacks, sync-accounting…)
-- była zakładana poza migracjami. Endpointy spoza listy dostają stałe przesunięcie
-- z hasha nazwy joba. Joby co minutę i dzienne/tygodniowe zostają bez zmian.
--
-- Dodatkowo: gdyby w bazie nie było joba wołającego follow-up-plan-tick
-- (kadencja mail/SMS/telefon z `lead_follow_up_schedule`), zakładamy go na wzór
-- `follow-up-tick` (ten sam adres bazowy, nagłówki i limit czasu).
--
-- Idempotentne: ponowne uruchomienie daje ten sam wynik. Bez pg_cron — no-op.

DO $do$
DECLARE
  offsets constant jsonb := '{
    "voicebot-enrich-tick": 1,
    "kw-easymkw-poll": 2,
    "follow-up-plan-tick": 2,
    "project-assignments-tick": 3,
    "location-scoring-tick": 4,
    "social-publish-tick": 5,
    "analysis-pipeline-tick": 6,
    "meta-leads-pull": 7,
    "youtube-shorts-tick": 8,
    "institution-mail-tick": 9,
    "follow-up-tick": 11,
    "status-email-tick": 12,
    "ania-callbacks": 14,
    "auto-distribution-tick": 16,
    "missing-info-follow-up-tick": 19,
    "saturday-sms-reminders": 23,
    "access-expiry-tick": 31,
    "pr-monitor-tick": 33,
    "sync-accounting": 43,
    "dispatch-campaigns": 13,
    "affiliate-events-tick": 10
  }'::jsonb;
  base_url constant text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs constant jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  j record;
  tmpl text;
  hook text;
  m text;
  rest text;
  hour_f text;
  n int;
  off int;
  new_schedule text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron niedostępny — pomijam rozkładanie ticków.';
    RETURN;
  END IF;

  -- 0) Kadencja follow-up musi mieć wywołującego.
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE command ~ '/hooks/follow-up-plan-tick([''"?]|$)'
  ) THEN
    SELECT command INTO tmpl FROM cron.job
    WHERE command ~ '/hooks/follow-up-tick([''"?]|$)'
    ORDER BY jobid LIMIT 1;
    IF tmpl IS NOT NULL THEN
      tmpl := replace(tmpl, '/hooks/follow-up-tick', '/hooks/follow-up-plan-tick');
    ELSE
      tmpl := format(
        $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb, timeout_milliseconds := 20000);$j$,
        base_url || '/api/public/hooks/follow-up-plan-tick', hdrs);
    END IF;
    PERFORM cron.schedule('follow-up-plan-tick', '2-59/5 * * * *', tmpl);
  END IF;

  -- 1) Rozłożenie minut.
  FOR j IN
    SELECT jobid, jobname, schedule, command FROM cron.job
    WHERE command ILIKE '%net.http_post%' AND command ~ '/hooks/'
  LOOP
    BEGIN
      hook := substring(j.command from '/hooks/([A-Za-z0-9_-]+)');
      m := split_part(j.schedule, ' ', 1);
      rest := substr(j.schedule, length(m) + 2);
      hour_f := split_part(rest, ' ', 1);
      new_schedule := NULL;

      IF m ~ '^\*/[0-9]+$' THEN
        n := substring(m from 3)::int;
        IF n BETWEEN 2 AND 59 THEN
          off := COALESCE(
            (offsets ->> hook)::int,
            1 + (abs(hashtext(coalesce(j.jobname, hook))::bigint) % (n - 1))::int
          );
          -- Start >= N zgubiłby uruchomienia w godzinie — zawijamy do [1, N).
          IF off >= n THEN off := greatest(off % n, 1); END IF;
          new_schedule := off || '-59/' || n || ' ' || rest;
        END IF;
      ELSIF m = '0'
        AND hour_f ~ '^(\*|\*/[0-9]+)$'
        AND substr(rest, length(hour_f) + 2) = '* * *' THEN
        off := COALESCE(
          (offsets ->> hook)::int,
          1 + (abs(hashtext(coalesce(j.jobname, hook))::bigint) % 59)::int
        );
        new_schedule := off || ' ' || rest;
      END IF;

      IF new_schedule IS NOT NULL AND new_schedule <> j.schedule THEN
        PERFORM cron.alter_job(j.jobid, schedule := new_schedule);
        RAISE NOTICE 'cron %: % → %', coalesce(j.jobname, j.jobid::text), j.schedule, new_schedule;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cron %: pominięto (%).', coalesce(j.jobname, j.jobid::text), SQLERRM;
    END;
  END LOOP;
END
$do$;
