CREATE TABLE public.ai_backlinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_domain text NOT NULL,
  source_url text NOT NULL,
  target_url text NOT NULL,
  anchor_text text,
  link_type text NOT NULL DEFAULT 'editorial' CHECK (link_type IN ('editorial','guest_post','directory','forum','comment','partnership','other')),
  dofollow boolean NOT NULL DEFAULT true,
  domain_authority integer,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','lost','pending','rejected')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  notes text,
  outreach_target_id uuid REFERENCES public.ai_outreach_targets(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_backlinks_status ON public.ai_backlinks(status);
CREATE INDEX idx_ai_backlinks_domain ON public.ai_backlinks(source_domain);

CREATE TABLE public.ai_linkbuilding_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_domain text NOT NULL,
  contact_hint text,
  strategy text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  expected_da integer,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','won','rejected','archived')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_lb_suggestions_status ON public.ai_linkbuilding_suggestions(status, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_backlinks TO authenticated;
GRANT ALL ON public.ai_backlinks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_linkbuilding_suggestions TO authenticated;
GRANT ALL ON public.ai_linkbuilding_suggestions TO service_role;

ALTER TABLE public.ai_backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_linkbuilding_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage backlinks"
ON public.ai_backlinks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE POLICY "admins manage lb suggestions"
ON public.ai_linkbuilding_suggestions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE TRIGGER trg_ai_backlinks_updated
BEFORE UPDATE ON public.ai_backlinks
FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();

CREATE TRIGGER trg_ai_lb_suggestions_updated
BEFORE UPDATE ON public.ai_linkbuilding_suggestions
FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();