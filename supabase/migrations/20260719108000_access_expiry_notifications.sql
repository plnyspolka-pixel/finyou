-- =====================================================================
-- 1. Rejestr wysłanych przypomnień o końcu dostępu (deduplikacja per okres).
-- 2. Nowi pośrednicy przy rejestracji dostają rolę 'posrednik' (nie 'operator').
-- 3. Cron: tick przypomnień o wygasającym dostępie.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.access_expiry_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('investor','broker')),
  kind text NOT NULL CHECK (kind IN ('d7','d3','d1','expired')),
  active_until timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, audience, kind, active_until)
);

GRANT SELECT ON public.access_expiry_notifications TO authenticated;
GRANT ALL ON public.access_expiry_notifications TO service_role;
ALTER TABLE public.access_expiry_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_expiry_notifications_admin_select ON public.access_expiry_notifications;
CREATE POLICY access_expiry_notifications_admin_select ON public.access_expiry_notifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR user_id = auth.uid());

-- ---------------------------------------------------------------------
-- handle_new_user: rejestracja jako pośrednik → rola 'posrednik'.
-- (Historycznie mapowano na 'operator', co dawało uprawnienia pracownicze.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sel text := lower(coalesce(NEW.raw_user_meta_data->>'signup_role',''));
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  _role := CASE
    WHEN _sel = 'inwestor' THEN 'inwestor'::public.app_role
    WHEN _sel IN ('posrednik','pośrednik','operator') THEN 'posrednik'::public.app_role
    ELSE 'klient'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  IF _role = 'inwestor'::public.app_role THEN
    BEGIN
      INSERT INTO public.investors (
        user_id, investor_type, first_name, last_name, email, subscription_status
      ) VALUES (
        NEW.id,
        'indywidualny',
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        NEW.email,
        'nieaktywny'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- Cron: przypomnienia o końcu dostępu (endpoint sam pilnuje okien i dedupu).
-- Ten sam base_url + apikey co pozostałe joby (patrz 20260707120000).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'access-expiry-tick') THEN
    PERFORM cron.unschedule('access-expiry-tick');
  END IF;
  PERFORM cron.schedule('access-expiry-tick', '0 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/access-expiry-tick', hdrs));
EXCEPTION WHEN OTHERS THEN
  -- Środowisko bez pg_cron/pg_net (np. lokalny shadow db) — pomiń planowanie.
  NULL;
END $$;
