ALTER TABLE public.lead_magnets ADD COLUMN IF NOT EXISTS material_type text NOT NULL DEFAULT 'pdf';
ALTER TABLE public.lead_magnet_signups ADD COLUMN IF NOT EXISTS video_token_hash text;
ALTER TABLE public.lead_magnet_signups ADD COLUMN IF NOT EXISTS video_expires_at timestamptz;
ALTER TABLE public.lead_magnet_signups ADD COLUMN IF NOT EXISTS video_max_percent integer NOT NULL DEFAULT 0;
ALTER TABLE public.email_subscribers ADD COLUMN IF NOT EXISTS video_max_percent integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS lead_signup_video_hash_idx ON public.lead_magnet_signups(video_token_hash) WHERE video_token_hash IS NOT NULL;
CREATE OR REPLACE FUNCTION public.update_free_video_progress(p_signup uuid, p_percent integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN UPDATE public.lead_magnet_signups SET video_max_percent = greatest(video_max_percent, least(100, greatest(0, p_percent))) WHERE id = p_signup; UPDATE public.email_subscribers s SET video_max_percent = greatest(s.video_max_percent, least(100, greatest(0, p_percent))) FROM public.lead_magnet_signups l WHERE l.id=p_signup AND l.subscriber_id=s.id; END; $$;
REVOKE ALL ON FUNCTION public.update_free_video_progress(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_free_video_progress(uuid,integer) TO service_role;