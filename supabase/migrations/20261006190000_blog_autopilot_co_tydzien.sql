-- === Automat bloga: z codziennie na co tydzień ===
-- Cron 'daily-blog-6am-pl' (20260623153029) odpalał tick codziennie o 04:00 UTC.
-- Teraz: raz w tygodniu, w poniedziałek o 04:00 UTC (06:00 czasu PL latem, 05:00 zimą).
-- Zmieniamy tylko harmonogram — komenda (URL + nagłówki) zostaje bez zmian.
-- Dodatkowo runDailyBlogTick sam pilnuje odstępu ~6 dni między publikacjami.

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'daily-blog-6am-pl';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(jid, schedule := '0 4 * * 1');
  END IF;
END $$;
