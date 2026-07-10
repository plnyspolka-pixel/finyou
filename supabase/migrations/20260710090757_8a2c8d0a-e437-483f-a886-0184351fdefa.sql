-- Ensure everyone with operator_wewnetrzny also has plain operator
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'operator'::public.app_role
FROM public.user_roles
WHERE role = 'operator_wewnetrzny'::public.app_role
ON CONFLICT (user_id, role) DO NOTHING;

-- Remove operator_wewnetrzny assignments
DELETE FROM public.user_roles WHERE role = 'operator_wewnetrzny'::public.app_role;

-- Update invite redemption to only grant 'operator'
CREATE OR REPLACE FUNCTION public.redeem_operator_invite(_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF _inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Link wygasł';
  END IF;
  IF _inv.max_uses IS NOT NULL AND _inv.uses_count >= _inv.max_uses THEN
    RAISE EXCEPTION 'Link został już wykorzystany';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'operator'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
   WHERE user_id = _uid AND role = 'klient'::public.app_role;

  UPDATE public.operator_invites
     SET uses_count = uses_count + 1,
         used_at = CASE
           WHEN max_uses IS NOT NULL AND uses_count + 1 >= max_uses THEN now()
           ELSE used_at
         END,
         used_by_user_id = COALESCE(used_by_user_id, _uid)
   WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;