CREATE OR REPLACE FUNCTION public.exec_admin_select(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Tylko administrator może wykonać tę operację';
  END IF;
  IF _sql !~* '^\s*(select|with)\s' THEN
    RAISE EXCEPTION 'Dozwolone tylko SELECT/WITH';
  END IF;
  IF _sql ~* '\;\s*(insert|update|delete|alter|drop|create|truncate|grant|revoke)' THEN
    RAISE EXCEPTION 'Wykryto wielokrotne zapytania — niedozwolone';
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(row_to_json(_q)), ''[]''::jsonb) FROM (%s) _q', _sql) INTO _result;
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.exec_admin_select(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.exec_admin_select(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.exec_admin_write(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Tylko administrator może wykonać tę operację';
  END IF;
  IF _sql ~* '\b(drop|truncate|alter\s+role|alter\s+system|create\s+role|drop\s+role|grant\s+all|revoke\s+all)\b' THEN
    RAISE EXCEPTION 'Niedozwolona operacja (DROP/TRUNCATE/ALTER ROLE itd.)';
  END IF;
  IF _sql !~* '\b(insert|update|delete)\b' THEN
    RAISE EXCEPTION 'Dozwolone tylko INSERT/UPDATE/DELETE';
  END IF;
  EXECUTE _sql;
  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN jsonb_build_object('rows_affected', _affected);
END;
$$;

REVOKE ALL ON FUNCTION public.exec_admin_write(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.exec_admin_write(text) TO authenticated, service_role;