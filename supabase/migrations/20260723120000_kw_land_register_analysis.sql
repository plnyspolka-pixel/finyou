-- Moduł „Analiza księgi wieczystej" — persystencja.
--
-- Analiza jest powtarzalna: dla tego samego snapshotu KW (kw_documents.fetched_at)
-- i tej samej wersji reguł wynik deterministyczny jest identyczny. Ponowne
-- pobranie KW tworzy nowy snapshot i nową analizę — historia jest zachowana.
--
-- Znaleziska są przechowywane w znormalizowanym snapshocie (result_json). Stany
-- rozwiązania i override trafiają do audytowalnej tabeli kw_finding_resolutions
-- (insert-only: kto, kiedy, co i dlaczego zmienił).

-- ── Tabela analiz KW ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kw_land_register_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kw_number text NOT NULL,
  loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  ruleset_version text NOT NULL,
  overall_status text NOT NULL,
  -- Referencja do snapshotu treści KW (moment pobrania z EKW/CMD).
  snapshot_fetched_at timestamptz,
  active_mention_count integer NOT NULL DEFAULT 0,
  unresolved_finding_count integer NOT NULL DEFAULT 0,
  -- Pełny, deterministyczny wynik analizy (znaleziska, priorytet, LTV, źródła).
  result_json jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kw_analyses_kw_number ON public.kw_land_register_analyses (kw_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kw_analyses_application ON public.kw_land_register_analyses (loan_application_id, created_at DESC);

-- ── Audyt rozwiązywania alertów / override ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kw_finding_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.kw_land_register_analyses(id) ON DELETE CASCADE,
  finding_id text NOT NULL,
  resolution_state text NOT NULL,
  note text,
  -- Ręczny override wyłącznie z uzasadnieniem.
  is_override boolean NOT NULL DEFAULT false,
  override_justification text,
  extracted_fields jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kw_finding_res_analysis ON public.kw_finding_resolutions (analysis_id, finding_id, changed_at DESC);

-- Override musi mieć uzasadnienie.
ALTER TABLE public.kw_finding_resolutions
  ADD CONSTRAINT kw_finding_res_override_reason
  CHECK (NOT is_override OR (override_justification IS NOT NULL AND length(btrim(override_justification)) > 0));

-- ── RLS: dostęp tylko dla administratora i operatora ─────────────────────────
ALTER TABLE public.kw_land_register_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kw_finding_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY kw_analyses_read ON public.kw_land_register_analyses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

CREATE POLICY kw_analyses_write ON public.kw_land_register_analyses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

CREATE POLICY kw_finding_res_read ON public.kw_finding_resolutions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

CREATE POLICY kw_finding_res_write ON public.kw_finding_resolutions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

COMMENT ON TABLE public.kw_land_register_analyses IS 'Wyniki modułu analizy KW (deterministyczne, wersjonowane regułami).';
COMMENT ON TABLE public.kw_finding_resolutions IS 'Audytowalna historia rozwiązywania alertów i override analizy KW.';
