-- Digital PR — półautomat z człowiekiem w pętli (prompt SEO, moduł 4).
--
-- Architektura:
--   * pr_opportunities: okazje medialne z monitoringu RSS/newsów (cron co 6h,
--     hook /api/public/hooks/pr-monitor-tick) + deduplikacja po dedupe_hash.
--   * pr-draft (server function): generuje draft komentarza eksperckiego
--     (podpis: Filip Bielak, Prezes Zarządu Finance You). Draft NIE zawiera
--     liczb spoza naszych tabel referencyjnych — brakujące dane dostają
--     placeholder [DO UZUPEŁNIENIA].
--   * Panel /admin/pr-media: Zatwierdź i wyślij (Resend) / Odrzuć.
--     WYSYŁKA WYŁĄCZNIE PO KLIKNIĘCIU CZŁOWIEKA — żadnej auto-wysyłki.
--   * pr_outreach_log: log każdej wysyłki + tracking odpowiedzi przez
--     webhook Resend (delivered/opened/clicked/bounced) po resend_id.
--   * Logika: src/lib/pr/{core,monitor.server,draft.server}.ts +
--     src/lib/pr.functions.ts.

CREATE TABLE IF NOT EXISTS public.pr_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                     -- nazwa feedu/wydawcy
  url text NOT NULL,
  dedupe_hash text NOT NULL UNIQUE,         -- znormalizowany URL (pr/core.ts)
  topic text NOT NULL,                      -- tytuł artykułu / temat okazji
  snippet text,
  matched_phrases text[] NOT NULL DEFAULT '{}',
  article_published_at timestamptz,
  deadline timestamptz,                     -- opcjonalny termin (zapytania dziennikarzy)
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'drafted', 'approved', 'sent', 'rejected')),
  -- Draft maila (uzupełniany przez pr-draft, edytowalny w panelu przed wysyłką).
  draft_subject text,
  draft_body text,
  draft_generated_at timestamptz,
  recipient_email text,                     -- uzupełnia człowiek w panelu
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_opportunities_status
  ON public.pr_opportunities (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pr_outreach_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.pr_opportunities(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  resend_id text,                           -- id z Resend (join dla webhooka)
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied', 'failed')),
  error text,
  sent_by uuid,                             -- auth.uid() klikającego
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_outreach_log_opportunity
  ON public.pr_outreach_log (opportunity_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_outreach_log_resend
  ON public.pr_outreach_log (resend_id);

DO $$
BEGIN
  CREATE TRIGGER trg_pr_opportunities_touch_updated_at
    BEFORE UPDATE ON public.pr_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER trg_pr_outreach_log_touch_updated_at
    BEFORE UPDATE ON public.pr_outreach_log
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS: narzędzie wewnętrzne — odczyt kadra, zapisy przez service_role ─────
ALTER TABLE public.pr_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_outreach_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr_opportunities_staff_read ON public.pr_opportunities;
CREATE POLICY pr_opportunities_staff_read ON public.pr_opportunities
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

DROP POLICY IF EXISTS pr_outreach_log_staff_read ON public.pr_outreach_log;
CREATE POLICY pr_outreach_log_staff_read ON public.pr_outreach_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

GRANT SELECT ON public.pr_opportunities TO authenticated;
GRANT SELECT ON public.pr_outreach_log TO authenticated;
GRANT ALL ON public.pr_opportunities TO service_role;
GRANT ALL ON public.pr_outreach_log TO service_role;

COMMENT ON TABLE public.pr_opportunities IS
  'Digital PR: okazje medialne z monitoringu RSS (cron 6h). Wysyłka wyłącznie ręcznie z panelu /admin/pr-media.';
COMMENT ON TABLE public.pr_outreach_log IS
  'Digital PR: log wysyłek outreach (Resend) + statusy dostarczenia z webhooka.';

-- ── Cron: monitoring co 6 godzin ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'pr-monitor-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('pr-monitor-tick', '0 */6 * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/pr-monitor-tick', hdrs));
END $$;
