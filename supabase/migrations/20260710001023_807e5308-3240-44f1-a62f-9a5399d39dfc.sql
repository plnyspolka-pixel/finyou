
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
  VALUES (_uid, 'operator'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'operator_wewnetrzny'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
   WHERE user_id = _uid AND role = 'klient'::public.app_role;

  UPDATE public.operator_invites
     SET used_at = now(), used_by_user_id = _uid
   WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
