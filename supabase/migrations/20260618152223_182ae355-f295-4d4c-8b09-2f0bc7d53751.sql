
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
  IF NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Tylko administrator może wykonać tę operację';
  END IF;
  -- Twarda blokada operacji niszczących uprawnienia / role / system
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
