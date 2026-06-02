-- Extend event_type to support engagement events
ALTER TABLE public.ai_landing_events DROP CONSTRAINT ai_landing_events_event_type_check;
ALTER TABLE public.ai_landing_events ADD CONSTRAINT ai_landing_events_event_type_check
  CHECK (event_type = ANY (ARRAY['view','cta_click','lead','scroll_25','scroll_50','scroll_75','scroll_100','click','time_on_page']));

-- Helpful index for engagement queries
CREATE INDEX IF NOT EXISTS idx_ai_landing_events_type ON public.ai_landing_events (landing_id, event_type);