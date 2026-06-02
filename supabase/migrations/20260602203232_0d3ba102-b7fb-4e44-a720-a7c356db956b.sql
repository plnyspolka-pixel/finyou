
-- Treści zgód marketingowych/regulaminowych zarządzane przez administratora
CREATE TYPE public.consent_kind AS ENUM ('privacy', 'marketing', 'terms');

CREATE TABLE public.consent_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.consent_kind NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.consent_documents TO anon;
GRANT SELECT ON public.consent_documents TO authenticated;
GRANT ALL ON public.consent_documents TO service_role;

ALTER TABLE public.consent_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_docs_public_read_active"
  ON public.consent_documents FOR SELECT
  USING (is_active = true);

CREATE POLICY "consent_docs_admin_all"
  ON public.consent_documents FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER trg_consent_documents_updated
  BEFORE UPDATE ON public.consent_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Klient: regulamin + snapshot wersji zaakceptowanych zgód
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS consent_terms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS consents_accepted_at timestamptz;
