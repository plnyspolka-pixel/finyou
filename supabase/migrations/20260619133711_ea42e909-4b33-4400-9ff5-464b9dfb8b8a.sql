
-- Rozszerzenie document_templates
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS template_file_path text,
  ADD COLUMN IF NOT EXISTS audience text[] DEFAULT ARRAY['administrator','operator','inwestor']::text[],
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Tabela wygenerowanych dokumentów
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  template_slug text,
  template_name text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  investor_offer_id uuid REFERENCES public.investor_offers(id) ON DELETE SET NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  commission_amount numeric(12,2),
  commission_added_to_costs boolean DEFAULT false,
  docx_path text,
  pdf_path text,
  file_size_bytes integer,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_documents TO authenticated;
GRANT ALL ON public.generated_documents TO service_role;

ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gen_docs_admin_all" ON public.generated_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "gen_docs_operator_all" ON public.generated_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'operator'));

CREATE POLICY "gen_docs_investor_own" ON public.generated_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'inwestor') AND created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'inwestor') AND created_by = auth.uid());

CREATE TRIGGER trg_gen_docs_updated_at
  BEFORE UPDATE ON public.generated_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_gen_docs_lead ON public.generated_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_gen_docs_loan ON public.generated_documents(loan_application_id);
CREATE INDEX IF NOT EXISTS idx_gen_docs_creator ON public.generated_documents(created_by);

-- RLS na document_templates — czytanie dla 3 ról wg audience
DROP POLICY IF EXISTS "doc_templates_read_by_audience" ON public.document_templates;
CREATE POLICY "doc_templates_read_by_audience" ON public.document_templates
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator')
    OR (public.has_role(auth.uid(), 'operator') AND 'operator' = ANY(audience))
    OR (public.has_role(auth.uid(), 'inwestor') AND 'inwestor' = ANY(audience))
  );

-- Storage policies dla bucketu documents - folder templates (read przez 3 role) + generated (read własne/operator/admin)
DROP POLICY IF EXISTS "documents_templates_read" ON storage.objects;
CREATE POLICY "documents_templates_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'templates'
    AND (
      public.has_role(auth.uid(), 'administrator')
      OR public.has_role(auth.uid(), 'operator')
      OR public.has_role(auth.uid(), 'inwestor')
    )
  );

DROP POLICY IF EXISTS "documents_generated_rw" ON storage.objects;
CREATE POLICY "documents_generated_rw" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'generated'
    AND (
      public.has_role(auth.uid(), 'administrator')
      OR public.has_role(auth.uid(), 'operator')
      OR public.has_role(auth.uid(), 'inwestor')
    )
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'generated'
    AND (
      public.has_role(auth.uid(), 'administrator')
      OR public.has_role(auth.uid(), 'operator')
      OR public.has_role(auth.uid(), 'inwestor')
    )
  );
