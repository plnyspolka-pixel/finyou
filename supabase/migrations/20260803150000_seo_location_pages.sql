-- Programmatic SEO — podstrony lokalizacyjne /pozyczki/[slug] (prompt SEO, moduł 1).
--
-- Architektura:
--   * Treść generowana serwerowo z danych referencyjnych (geo_units +
--     geo_unit_location_metrics, data_version gus-2021-1) i zapisywana jako
--     GOTOWY snapshot (jsonb `content`) w tej tabeli. Dzięki temu publiczna
--     strona czyta wyłącznie tę tabelę anon key'em — tabele referencyjne
--     pozostają za RLS staff-only (twarde ograniczenie nr 1).
--   * Brak metryk dla miasta = strona nie powstaje (zasada spec §16/§24 —
--     żadnego fabrykowania danych). Walidacja w src/lib/seo-location/core.ts.
--   * Publikacja partiami ~10/tydzień przez pg_cron (naturalne tempo
--     indeksacji); generator (TOP 50 miast wg ludności) uruchamiany hookiem
--     /api/public/hooks/seo-location-seed.
--   * Logika: src/lib/seo-location/{core,server}.ts,
--     hooki: /api/public/hooks/seo-location-seed, seo-location-publish-tick,
--     strony: src/routes/pozyczki.index.tsx, pozyczki.$slug.tsx.

CREATE TABLE IF NOT EXISTS public.seo_location_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  teryt text NOT NULL UNIQUE,
  geo_unit_id uuid REFERENCES public.geo_units(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  meta_title text NOT NULL,
  meta_description text NOT NULL,
  -- Snapshot treści: {city, intro[], market{}, how{}, faq[], nearby[], dataVersion}
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_loc_pages_status
  ON public.seo_location_pages (status, generated_at);

DO $$
BEGIN
  CREATE TRIGGER trg_seo_loc_pages_touch_updated_at
    BEFORE UPDATE ON public.seo_location_pages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Publiczny odczyt WYŁĄCZNIE opublikowanych stron (anon + authenticated).
-- Kadra (administrator/operator) widzi też drafty. Zapisy tylko service_role
-- (generator w server functions).
ALTER TABLE public.seo_location_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seo_loc_pages_public_read ON public.seo_location_pages;
CREATE POLICY seo_loc_pages_public_read ON public.seo_location_pages
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS seo_loc_pages_staff_read ON public.seo_location_pages;
CREATE POLICY seo_loc_pages_staff_read ON public.seo_location_pages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

GRANT SELECT ON public.seo_location_pages TO anon, authenticated;
GRANT ALL ON public.seo_location_pages TO service_role;

COMMENT ON TABLE public.seo_location_pages IS
  'Programmatic SEO: podstrony /pozyczki/[miasto] generowane z danych GUS/TERYT. Publiczny odczyt tylko status=published; zapis tylko service_role.';

-- ── Cron: publikacja partii ~10 draftów raz w tygodniu ──────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'seo-location-publish-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Poniedziałek 06:00 UTC — publikacja do 10 najstarszych draftów.
  PERFORM cron.schedule('seo-location-publish-tick', '0 6 * * 1', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/seo-location-publish-tick', hdrs));
END $$;
