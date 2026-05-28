-- 1. Prevent investors from escalating subscription/billing fields
DROP POLICY IF EXISTS investors_self_update ON public.investors;

CREATE POLICY investors_self_update
  ON public.investors
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.investors_block_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'administrator'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_active_until IS DISTINCT FROM OLD.subscription_active_until
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Nie masz uprawnień do zmiany pól subskrypcji/billingu.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS investors_block_privileged_updates_trg ON public.investors;
CREATE TRIGGER investors_block_privileged_updates_trg
  BEFORE UPDATE ON public.investors
  FOR EACH ROW
  EXECUTE FUNCTION public.investors_block_privileged_updates();

-- 2. Make storage buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('training-videos','property-photos');

-- 3. Training videos: role-based authenticated read
DROP POLICY IF EXISTS training_videos_public_read ON storage.objects;

CREATE POLICY training_videos_authenticated_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'training-videos'
    AND (
      public.has_role(auth.uid(), 'inwestor'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

-- 4. Property photos: scoped read/write
DROP POLICY IF EXISTS property_photos_public_read ON storage.objects;
DROP POLICY IF EXISTS property_photos_authenticated_write ON storage.objects;

CREATE POLICY property_photos_scoped_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      OR public.has_role(auth.uid(), 'inwestor'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.loan_applications la
        JOIN public.clients c ON c.id = la.client_id
        WHERE c.user_id = auth.uid()
          AND la.id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY property_photos_scoped_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.loan_applications la
        JOIN public.clients c ON c.id = la.client_id
        WHERE c.user_id = auth.uid()
          AND la.id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY property_photos_scoped_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
    )
  );

CREATE POLICY property_photos_scoped_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
    )
  );

-- 5. Lock down SECURITY DEFINER functions
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.increment_loan_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_loan_view(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role, supabase_auth_admin;