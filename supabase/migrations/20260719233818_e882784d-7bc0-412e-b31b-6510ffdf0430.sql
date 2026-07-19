CREATE TABLE IF NOT EXISTS public.crbr_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nip text NOT NULL UNIQUE,
  krs text,
  nazwa_spolki text,
  forma_organizacyjna text,
  beneficjenci jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_response jsonb,
  error_code text,
  error_message text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crbr_cache_nip ON public.crbr_cache(nip);
CREATE INDEX IF NOT EXISTS idx_crbr_cache_expires ON public.crbr_cache(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crbr_cache TO authenticated;
GRANT ALL ON public.crbr_cache TO service_role;

ALTER TABLE public.crbr_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crbr_cache_staff_all" ON public.crbr_cache;
CREATE POLICY "crbr_cache_staff_all" ON public.crbr_cache
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role));

CREATE OR REPLACE FUNCTION public.crbr_cache_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_crbr_cache_updated_at ON public.crbr_cache;
CREATE TRIGGER trg_crbr_cache_updated_at
  BEFORE UPDATE ON public.crbr_cache
  FOR EACH ROW EXECUTE FUNCTION public.crbr_cache_touch_updated_at();

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS aml_status text,
  ADD COLUMN IF NOT EXISTS aml_checked_at timestamptz;
