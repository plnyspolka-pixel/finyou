SELECT cron.unschedule('daily-blog-6am-pl');
SELECT cron.schedule(
  'daily-blog-6am-pl',
  '0 4 * * *',
  $$SELECT net.http_post(
    url := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app/api/public/hooks/daily-blog-tick',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );$$
);