-- Digest „co nowego" dla zespołu: stan biegów + cron co 30 minut.
-- Tick: /api/public/hooks/activity-digest-tick (src/lib/activity-digest-run.server.ts).
-- To samo źródło danych ma narzędzie MCP `get_updates_since` (Claude.ai / ChatGPT).

CREATE TABLE IF NOT EXISTS public.activity_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  since timestamptz NOT NULL,
  until timestamptz NOT NULL,
  total integer NOT NULL DEFAULT 0,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  push_sent integer NOT NULL DEFAULT 0,
  email_sent integer NOT NULL DEFAULT 0,
  error text
);

CREATE INDEX IF NOT EXISTS activity_digest_runs_until_idx
  ON public.activity_digest_runs (until DESC);

ALTER TABLE public.activity_digest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_digest_runs_team_read" ON public.activity_digest_runs;
CREATE POLICY "activity_digest_runs_team_read"
  ON public.activity_digest_runs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

GRANT SELECT ON public.activity_digest_runs TO authenticated;
GRANT ALL ON public.activity_digest_runs TO service_role;

COMMENT ON TABLE public.activity_digest_runs IS
  'Digest „co nowego": każdy bieg ticka (okno since–until, liczniki, ile pushy/maili poszło). Koniec ostatniego biegu = początek następnego okna.';

-- ── Cron tick (pg_cron → endpoint; cisza nocna pilnowana w kodzie) ──────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'activity-digest-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co 30 minut; wysyłka tylko gdy w oknie coś się wydarzyło.
  PERFORM cron.schedule('activity-digest-tick', '*/30 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/activity-digest-tick', hdrs));
END $$;
