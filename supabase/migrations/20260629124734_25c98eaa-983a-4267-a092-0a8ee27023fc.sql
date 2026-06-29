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
    WHEN _sel IN ('posrednik','pośrednik','operator') THEN 'operator'::public.app_role
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