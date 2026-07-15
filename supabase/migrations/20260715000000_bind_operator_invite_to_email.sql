-- Bezpieczeństwo: dowiązanie realizacji zaproszenia operatora do adresu e-mail.
--
-- Dotychczas redeem_operator_invite() nadawało rolę `operator_wewnetrzny`
-- KAŻDEMU zalogowanemu użytkownikowi, który znał token (UUID) zaproszenia.
-- Przekazany/wyciekły link pozwalał więc dowolnemu kontu samodzielnie
-- podnieść uprawnienia do wewnętrznego operatora. Ta migracja wymusza, aby
-- adres e-mail w tokenie JWT wywołującego zgadzał się z adresem, na który
-- zaproszenie zostało wystawione (porównanie bez uwzględniania wielkości liter).

CREATE OR REPLACE FUNCTION public.redeem_operator_invite(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text := lower(nullif(auth.jwt() ->> 'email', ''));
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

  -- Dowiązanie do adresu: zaproszenie musi mieć e-mail i musi on odpowiadać
  -- zweryfikowanemu adresowi z JWT wywołującego.
  IF _inv.email IS NULL OR _email IS NULL OR lower(_inv.email) <> _email THEN
    RAISE EXCEPTION 'To zaproszenie zostało wystawione na inny adres e-mail';
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
