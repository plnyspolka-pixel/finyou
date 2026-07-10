-- Multi-use operator invites
ALTER TABLE public.operator_invites
  ADD COLUMN IF NOT EXISTS max_uses integer,
  ADD COLUMN IF NOT EXISTS uses_count integer NOT NULL DEFAULT 0;

-- Preserve current single-use behavior for existing invites
UPDATE public.operator_invites SET max_uses = 1 WHERE max_uses IS NULL;

-- Redemption honoring uses_count / max_uses (NULL = unlimited)
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

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'operator_wewnetrzny'::public.app_role)
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

-- Details reflect remaining capacity
CREATE OR REPLACE FUNCTION public.get_operator_invite(_token uuid)
 RETURNS TABLE(is_valid boolean, email text, expires_at timestamp with time zone, used boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (i.expires_at > now() AND (i.max_uses IS NULL OR i.uses_count < i.max_uses)) AS is_valid,
    i.email,
    i.expires_at,
    (i.max_uses IS NOT NULL AND i.uses_count >= i.max_uses) AS used
  FROM public.operator_invites i
  WHERE i.token = _token
  LIMIT 1;
$function$;

-- Create a fresh 7-day, unlimited-use invite
INSERT INTO public.operator_invites (expires_at, max_uses, note)
VALUES (now() + interval '7 days', NULL, 'Link wielokrotnego użytku (7 dni)');
