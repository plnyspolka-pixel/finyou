
-- Tabela zaproszeń
CREATE TABLE public.operator_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_invites TO authenticated;
GRANT ALL ON public.operator_invites TO service_role;

ALTER TABLE public.operator_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administrators manage operator invites"
  ON public.operator_invites
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE TRIGGER operator_invites_touch_updated_at
  BEFORE UPDATE ON public.operator_invites
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Publiczny lookup po tokenie (bez ujawniania e-maila kto go stworzył itd.)
CREATE OR REPLACE FUNCTION public.get_operator_invite(_token uuid)
RETURNS TABLE(is_valid boolean, email text, expires_at timestamptz, used boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (i.used_at IS NULL AND i.expires_at > now()) AS is_valid,
    i.email,
    i.expires_at,
    (i.used_at IS NOT NULL) AS used
  FROM public.operator_invites i
  WHERE i.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_operator_invite(uuid) TO anon, authenticated;

-- Realizacja zaproszenia — wywołujący musi być zalogowany
CREATE OR REPLACE FUNCTION public.redeem_operator_invite(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.operator_invites%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Musisz być zalogowany';
  END IF;

  SELECT * INTO _inv FROM public.operator_invites WHERE token = _token FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nieprawidłowy link zapraszający';
  END IF;
  IF _inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Link został już wykorzystany';
  END IF;
  IF _inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Link wygasł';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'operator_wewnetrzny'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Usuń rolę klient, jeśli była (świeżo zarejestrowany przez handle_new_user)
  DELETE FROM public.user_roles
   WHERE user_id = _uid AND role = 'klient'::public.app_role;

  UPDATE public.operator_invites
     SET used_at = now(), used_by_user_id = _uid
   WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_operator_invite(uuid) TO authenticated;
