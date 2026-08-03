-- Pipeline YouTube: treść → scenariusz → render → publikacja (prompt SEO, moduł 5).
--
-- Architektura:
--   * video_pipeline: kolejka odcinków. Źródłem jest opublikowana treść
--     (artykuł bloga ai_seo_articles lub podstrona seo_location_pages).
--   * video-script-gen (server function): scenariusz 5–8 min (hook, 3–4
--     sekcje, CTA) + opis YT z linkiem do źródła + tagi + 3 tytuły.
--   * Render przez ADAPTER (src/lib/video-pipeline/render.server.ts —
--     implementacja HeyGen: ElevenLabs TTS → HeyGen avatar). Jeśli brak
--     kluczy w env, wpis kończy na script_ready (człowiek renderuje ręcznie).
--     ŻADNEGO mockowania renderu.
--   * Upload na YouTube przez ISTNIEJĄCY moduł youtube_publish_queue
--     (OAuth, refresh token w bazie) — krok za flagą env
--     VIDEO_PIPELINE_AUTO_UPLOAD, uruchamiany tickiem lub ręcznie z panelu.
--   * Po publikacji tick zapisuje youtube_video_id w źródle
--     (ai_seo_articles/seo_location_pages) — strona osadza film (embed).
--   * Logika: src/lib/video-pipeline/{core,render.server,server}.ts +
--     video-pipeline.functions.ts; panel /admin/video-pipeline;
--     tick /api/public/hooks/video-pipeline-tick (cron co godzinę).

CREATE TABLE IF NOT EXISTS public.video_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL DEFAULT 'blog'
    CHECK (source_type IN ('blog', 'location')),
  source_slug text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  script_md text,
  yt_title_options text[] NOT NULL DEFAULT '{}',
  yt_title text,                                -- wybrany tytuł (człowiek/1. opcja)
  yt_description text,
  yt_tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'script_ready', 'rendering', 'rendered',
                      'publish_queued', 'published', 'failed')),
  render_provider text,                         -- np. 'heygen'
  render_video_id text,                         -- id zadania u dostawcy
  video_url text,                               -- URL gotowego MP4
  youtube_queue_id uuid REFERENCES public.youtube_publish_queue(id) ON DELETE SET NULL,
  youtube_video_id text,
  last_error text,
  created_by uuid,
  script_generated_at timestamptz,
  rendered_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_slug)
);

CREATE INDEX IF NOT EXISTS idx_video_pipeline_status
  ON public.video_pipeline (status, created_at DESC);

DO $$
BEGIN
  CREATE TRIGGER trg_video_pipeline_touch_updated_at
    BEFORE UPDATE ON public.video_pipeline
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Embed opublikowanego filmu na stronie źródłowej.
ALTER TABLE public.ai_seo_articles
  ADD COLUMN IF NOT EXISTS youtube_video_id text;
ALTER TABLE public.seo_location_pages
  ADD COLUMN IF NOT EXISTS youtube_video_id text;

-- ── RLS: narzędzie wewnętrzne ───────────────────────────────────────────────
ALTER TABLE public.video_pipeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_pipeline_staff_read ON public.video_pipeline;
CREATE POLICY video_pipeline_staff_read ON public.video_pipeline
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

GRANT SELECT ON public.video_pipeline TO authenticated;
GRANT ALL ON public.video_pipeline TO service_role;

COMMENT ON TABLE public.video_pipeline IS
  'Pipeline YouTube (treść → scenariusz → render → publikacja). Render przez adapter (HeyGen); brak kluczy = stop na script_ready. Upload przez youtube_publish_queue za flagą env.';

-- ── Cron: tick co godzinę (poll renderów + sync publikacji) ─────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'video-pipeline-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('video-pipeline-tick', '30 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/video-pipeline-tick', hdrs));
END $$;
