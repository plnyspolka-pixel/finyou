-- Ocena ryzyka i wycena w ciągu ok. 15 minut od uruchomienia analizy
-- (Analityka, raport Projektu w „Moich zleceniach", analiza KW spoza Finance You).
--
-- Panel inwestora zleca krok 4 (ocena ryzyka, 30–50 s) od razu po krokach 1–3,
-- a cron tick 'analysis-pipeline-tick' zostaje siatką bezpieczeństwa:
--  • co 5 minut zamiast co 15 (kwalifikacja nowych wniosków w kodzie nadal
--    co 15 minut — ticki :00, :15, :30, :45),
--  • limit pg_net 240 s zamiast 20 s — przy 20 s wołający rozłączał się w
--    trakcie oceny ryzyka i wynik nie był zapisywany przez kolejne ticki
--    (tick pilnuje budżetu: po 150 s nie zaczyna nowej pracy).
-- Zmieniamy tylko istniejące zadanie (adres i nagłówki zostają jak w bazie).
-- Idempotentne: ponowne uruchomienie ustawia te same wartości.
DO $$
DECLARE
  j record;
  newcmd text;
BEGIN
  FOR j IN SELECT jobid, command FROM cron.job WHERE jobname = 'analysis-pipeline-tick' LOOP
    IF j.command ILIKE '%timeout_milliseconds%' THEN
      newcmd := regexp_replace(
        j.command,
        'timeout_milliseconds\s*:=\s*[0-9]+',
        'timeout_milliseconds := 240000'
      );
    ELSE
      newcmd := regexp_replace(j.command, '\)([^)]*)$', ', timeout_milliseconds := 240000)\1');
    END IF;
    PERFORM cron.alter_job(j.jobid, schedule := '*/5 * * * *', command := newcmd);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'analysis-pipeline-tick reschedule failed: %', SQLERRM;
END $$;
