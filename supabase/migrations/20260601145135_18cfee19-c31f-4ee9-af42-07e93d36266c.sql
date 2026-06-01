CREATE TABLE public.kw_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kw_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  okladka text,
  dzial_1o text,
  dzial_1s text,
  dzial_2 text,
  dzial_3 text,
  dzial_4 text,
  ordered_at timestamptz,
  fetched_at timestamptz,
  last_error text,
  ordered_by uuid,
  bill_in integer,
  bill_out integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kw_documents TO authenticated;
GRANT ALL ON public.kw_documents TO service_role;

ALTER TABLE public.kw_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read KW documents"
ON public.kw_documents
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER kw_documents_set_updated_at
BEFORE UPDATE ON public.kw_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX kw_documents_status_idx ON public.kw_documents(status);