-- Bramka EasyMKW dla treści KW: kolumny cache, stan limitu CMD i RPC
-- pilnujące pojedynczego zamówienia na księgę. Zmiany były już zastosowane
-- bezpośrednio na żywej bazie (przez Lovable) — wszystko poniżej jest
-- idempotentne i na zmigrowanej bazie nie robi nic.

ALTER TABLE public.kw_documents
  ADD COLUMN IF NOT EXISTS order_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_ordered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_order_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_block_reason text,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'kw_engine',
  ADD COLUMN IF NOT EXISTS easymkw_order_id uuid,
  ADD COLUMN IF NOT EXISTS easymkw_job_id uuid,
  ADD COLUMN IF NOT EXISTS easymkw_json jsonb,
  ADD COLUMN IF NOT EXISTS credits_spent integer NOT NULL DEFAULT 0;

-- Singleton ze stanem limitu dostawcy (blokada zamówień po wyczerpaniu limitu).
CREATE TABLE IF NOT EXISTS public.kw_quota_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  blocked_until timestamptz,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  usage_type text,
  limit_account integer,
  usage_account integer,
  limit_group integer,
  usage_group integer
);

INSERT INTO public.kw_quota_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.kw_quota_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'Staff can read kw quota state'
      AND polrelid = 'public.kw_quota_state'::regclass
  ) THEN
    CREATE POLICY "Staff can read kw quota state"
      ON public.kw_quota_state FOR SELECT
      USING (is_internal_staff(auth.uid()));
  END IF;
END $$;

-- Przyznaje (lub odmawia) prawa do złożenia zamówienia treści KW: pilnuje
-- globalnej blokady limitu, dedupu świeżych zamówień i maks. liczby prób
-- na księgę. Wołane z service role (SECURITY DEFINER, bez grantów dla anon).
CREATE OR REPLACE FUNCTION public.kw_claim_order(_kw text, _max_attempts integer DEFAULT 2, _ordered_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.kw_documents;
  blocked timestamptz;
BEGIN
  SELECT blocked_until INTO blocked FROM public.kw_quota_state WHERE id;
  IF blocked IS NOT NULL AND blocked > now() THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'quota_cooldown', 'blocked_until', blocked);
  END IF;

  INSERT INTO public.kw_documents (kw_number, status, ordered_at, ordered_by, order_attempts, first_ordered_at, last_order_at)
  VALUES (_kw, 'processing', now(), _ordered_by, 0, now(), now())
  ON CONFLICT (kw_number) DO NOTHING;

  SELECT * INTO r FROM public.kw_documents WHERE kw_number = _kw FOR UPDATE;

  IF r.status = 'ready' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'ready', 'attempts', r.order_attempts);
  END IF;

  IF r.order_blocked_at IS NOT NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'blocked', 'attempts', r.order_attempts,
                              'block_reason', r.order_block_reason);
  END IF;

  IF r.status = 'processing' AND r.last_order_at IS NOT NULL AND r.last_order_at > now() - interval '10 minutes' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'in_progress', 'attempts', r.order_attempts);
  END IF;

  IF r.order_attempts >= _max_attempts THEN
    UPDATE public.kw_documents
       SET order_blocked_at = COALESCE(order_blocked_at, now()),
           order_block_reason = COALESCE(order_block_reason, 'Wyczerpany limit ' || _max_attempts || ' zamówień tej księgi')
     WHERE kw_number = _kw;
    RETURN jsonb_build_object('granted', false, 'reason', 'limit_attempts', 'attempts', r.order_attempts,
                              'max_attempts', _max_attempts);
  END IF;

  UPDATE public.kw_documents
     SET order_attempts = order_attempts + 1,
         status = 'processing',
         ordered_at = now(),
         last_order_at = now(),
         first_ordered_at = COALESCE(first_ordered_at, now()),
         ordered_by = COALESCE(_ordered_by, ordered_by),
         last_error = NULL
   WHERE kw_number = _kw
   RETURNING * INTO r;

  RETURN jsonb_build_object('granted', true, 'attempt', r.order_attempts, 'max_attempts', _max_attempts);
END;
$function$;

-- ── Cron tick (pg_cron → endpoint; dociąga wyniki zamówień EasyMKW) ──────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'kw-easymkw-poll' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co 2 minuty; endpoint no-opuje, gdy nie ma zamówień w toku.
  PERFORM cron.schedule('kw-easymkw-poll', '*/2 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/kw-easymkw-poll', hdrs));
END $$;
