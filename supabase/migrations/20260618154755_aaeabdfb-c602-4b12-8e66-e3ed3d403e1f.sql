CREATE OR REPLACE FUNCTION public.exec_admin_select(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Tylko administrator może wykonać tę operację';
  END IF;
  IF _sql !~* '^\s*(select|with)\s' THEN
    RAISE EXCEPTION 'Dozwolone tylko SELECT/WITH';
  END IF;
  IF _sql ~* '\;\s*(insert|update|delete|alter|drop|create|truncate|grant|revoke)' THEN
    RAISE EXCEPTION 'Wykryto wielokrotne zapytania — niedozwolone';
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(row_to_json(_q)), ''[]''::jsonb) FROM (%s) _q', regexp_replace(_sql, ';\s*$', '')) INTO _result;
  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.exec_admin_write(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _affected integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Tylko administrator może wykonać tę operację';
  END IF;
  IF _sql ~* '\b(alter\s+role|alter\s+system|create\s+role|drop\s+role|create\s+user|drop\s+user)\b' THEN
    RAISE EXCEPTION 'Niedozwolona operacja (role/system)';
  END IF;
  IF _sql !~* '\b(insert|update|delete)\b' THEN
    RAISE EXCEPTION 'Dozwolone tylko INSERT/UPDATE/DELETE';
  END IF;
  EXECUTE _sql;
  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN jsonb_build_object('rows_affected', _affected);
END;
$$;

CREATE OR REPLACE FUNCTION public.exec_admin_any(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _affected integer;
  _is_select boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Tylko administrator może wykonać tę operację';
  END IF;
  IF _sql ~* '\b(alter\s+role|alter\s+system|create\s+role|drop\s+role|create\s+user|drop\s+user)\b' THEN
    RAISE EXCEPTION 'Niedozwolona operacja (role/system)';
  END IF;
  _is_select := _sql ~* '^\s*(select|with)\s';
  IF _is_select THEN
    EXECUTE format('SELECT coalesce(jsonb_agg(row_to_json(_q)), ''[]''::jsonb) FROM (%s) _q', regexp_replace(_sql, ';\s*$', '')) INTO _result;
    RETURN jsonb_build_object('kind','rows','rows',_result);
  ELSE
    EXECUTE _sql;
    GET DIAGNOSTICS _affected = ROW_COUNT;
    RETURN jsonb_build_object('kind','exec','rows_affected',_affected);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.exec_admin_select(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.exec_admin_write(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.exec_admin_any(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.exec_admin_select(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exec_admin_write(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exec_admin_any(text) TO authenticated, service_role;