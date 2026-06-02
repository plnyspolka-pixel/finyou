CREATE TABLE public.ai_landing_optimizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id uuid NOT NULL REFERENCES public.ai_landings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('variant','copy','settings','seo')),
  title text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_lift_pct numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected','superseded')),
  applied_variant_id uuid REFERENCES public.ai_landing_variants(id) ON DELETE SET NULL,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_landing_optimizations_landing ON public.ai_landing_optimizations(landing_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_landing_optimizations TO authenticated;
GRANT ALL ON public.ai_landing_optimizations TO service_role;

ALTER TABLE public.ai_landing_optimizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage optimizations"
ON public.ai_landing_optimizations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE TRIGGER trg_ai_landing_optimizations_updated
BEFORE UPDATE ON public.ai_landing_optimizations
FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();