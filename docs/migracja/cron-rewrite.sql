-- =====================================================================================
-- Przepisanie poleceń cronów w NOWEJ bazie (vkzndnaoxhdxrxlpntcb) na nowy adres hooków i nowy klucz anon.
-- Uruchamiać przez konektor Supabase jako postgres. Crony pozostają WYŁĄCZONE do momentu przełączenia.
--
-- Stan wyjściowy (kopia 1:1 z produkcji): 34 joby, 30 woła
--   https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app/api/public/hooks/<nazwa>
-- z nagłówkiem apikey = klucz anon STAREGO projektu (jqvepxhulxdnbwbogkhe). Klucz anon jest kluczem
-- publicznym (siedzi w bundlu frontendu), więc może stać w tym pliku.
--
-- Do uzupełnienia przed uruchomieniem: __NEW_HOOKS_BASE__ — adres nowego hostingu aplikacji
-- (np. https://app.financeyou.pl). Hooki aplikacji weryfikują nagłówek apikey względem klucza anon
-- projektu, dlatego klucz też jest podmieniany (nowy anon poniżej pochodzi z get_publishable_keys).
-- =====================================================================================

-- 1) Podgląd: które joby zostaną zmienione
select jobid, jobname, schedule, active,
       command like '%lovable.app%' as has_old_url,
       command like '%eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c%' as has_old_anon
from cron.job order by jobid;

-- 2) Przepisanie (idempotentne; joby bez starego adresu/klucza nie są dotykane)
do $$
declare r record; new_cmd text; n int := 0;
begin
  for r in select jobid, jobname, command from cron.job loop
    new_cmd := replace(r.command,
      'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app',
      '__NEW_HOOKS_BASE__');
    new_cmd := replace(new_cmd,
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrem5kbmFveGhkeHJ4bHBudGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODUyNzIsImV4cCI6MjEwNzE2MTI3Mn0.I06JyXwkqU9xdBHPMhr5SRvX-nn5QfYZAr1PdPaaxRw');
    if new_cmd <> r.command then
      perform cron.alter_job(job_id := r.jobid, command := new_cmd);
      n := n + 1;
    end if;
  end loop;
  raise notice 'zmieniono % job(ów)', n;
end $$;

-- 3) Kontrola: oba muszą zwrócić 0
select count(*) as still_old_url from cron.job where command like '%lovable.app%';
select count(*) as still_old_anon from cron.job where command like '%ImpxdmVweGh1bHhkbmJ3Ym9na2hlI%';

-- 4) Włączenie — DOPIERO przy przełączeniu, po wyłączeniu cronów w starej bazie (inaczej podwójne wysyłki).
--    Cztery joby czysto SQL-owe (dedup-leads-tick, dedup-loan-applications, purge-cron-history,
--    purge-cookie-consent-log) można włączyć wcześniej, bo działają tylko na nowej bazie.
-- select cron.alter_job(job_id := jobid, active := true) from cron.job where not active;
-- select jobname, active, schedule from cron.job order by jobid;
