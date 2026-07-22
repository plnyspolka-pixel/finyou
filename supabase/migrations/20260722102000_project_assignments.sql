-- === Przypisania projektów do inwestorów + atomowe funkcje RPC ===
--
-- Przypisanie jest czasowe (24 h + jednorazowe przedłużenie o 12 h, maks. 36 h),
-- indywidualne i w danym momencie może istnieć tylko JEDNO aktywne przypisanie
-- projektu (partial-unique index + blokada wiersza projektu w RPC).
-- Wszystkie przejścia statusów wykonują funkcje SECURITY DEFINER wywoływane
-- WYŁĄCZNIE przez service_role (server functions) — czas serwera jest jedynym
-- źródłem prawdy, a operacje są idempotentne.

CREATE TABLE IF NOT EXISTS public.project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.investment_projects (id),
  project_version int NOT NULL DEFAULT 1,
  investor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'created', 'opened', 'extended', 'interested', 'rejected',
    'expired', 'cancelled_by_admin', 'cancelled_project_update'
  )),
  match_score numeric,
  assignment_reason text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  opened_at timestamptz,
  extended_at timestamptz,
  extended_until timestamptz,
  decision_at timestamptz,
  decision_type text,
  -- termin złożenia propozycji po wyrażeniu zainteresowania (domyślnie 48 h)
  proposal_deadline_at timestamptz,
  closed_at timestamptz,
  closed_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Jedno aktywne przypisanie projektu naraz ('interested' wciąż blokuje projekt).
CREATE UNIQUE INDEX IF NOT EXISTS project_assignments_single_active
  ON public.project_assignments (project_id)
  WHERE status IN ('created', 'opened', 'extended', 'interested');

CREATE INDEX IF NOT EXISTS project_assignments_investor_idx
  ON public.project_assignments (investor_id, status);
CREATE INDEX IF NOT EXISTS project_assignments_expiry_idx
  ON public.project_assignments (expires_at)
  WHERE status IN ('created', 'opened', 'extended');
CREATE INDEX IF NOT EXISTS project_assignments_proposal_deadline_idx
  ON public.project_assignments (proposal_deadline_at)
  WHERE status = 'interested';

-- RLS: inwestor czyta WYŁĄCZNIE własne przypisania; zapisy tylko server-side.
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_assignments_owner_select ON public.project_assignments;
CREATE POLICY project_assignments_owner_select ON public.project_assignments
  FOR SELECT TO authenticated
  USING (investor_id = auth.uid() OR public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS project_assignments_staff_write ON public.project_assignments;
CREATE POLICY project_assignments_staff_write ON public.project_assignments
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.project_assignments TO authenticated;
GRANT ALL ON public.project_assignments TO service_role;

DROP TRIGGER IF EXISTS project_assignments_touch ON public.project_assignments;
CREATE TRIGGER project_assignments_touch
  BEFORE UPDATE ON public.project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.project_module_touch_updated_at();

-- Dedupe przypomnień (12h/3h/30m przed wygaśnięciem, terminy propozycji itd.)
CREATE TABLE IF NOT EXISTS public.project_assignment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.project_assignments (id) ON DELETE CASCADE,
  kind text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, kind)
);
ALTER TABLE public.project_assignment_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_assignment_notifications_staff ON public.project_assignment_notifications;
CREATE POLICY project_assignment_notifications_staff ON public.project_assignment_notifications
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
GRANT SELECT ON public.project_assignment_notifications TO authenticated;
GRANT ALL ON public.project_assignment_notifications TO service_role;

-- ===========================================================================
-- Pomocnik audytu wywoływany z funkcji RPC.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.project_module_audit(
  _actor uuid, _subject uuid, _entity_type text, _entity_id text,
  _action text, _prev text, _new text, _reason text, _details jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  INSERT INTO public.project_module_audit_log
    (actor_id, subject_user_id, entity_type, entity_id, action, previous_status, new_status, reason, details)
  VALUES (_actor, _subject, _entity_type, _entity_id, _action, _prev, _new, _reason, COALESCE(_details, '{}'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.project_module_audit(uuid, uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_module_audit(uuid, uuid, text, text, text, text, text, text, jsonb) TO service_role;

-- ===========================================================================
-- Atomowe utworzenie przypisania. Blokuje wiersz projektu i tuż przed insertem
-- ponownie sprawdza: status projektu, zdjęcie, brak aktywnego przypisania,
-- status inwestora, limit aktywnych kart. Zwraca id przypisania albo NULL,
-- gdy projektu nie da się przypisać (np. sprzątnął go równoległy claim).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.project_claim_assignment(
  _project_id uuid,
  _investor_id uuid,
  _score numeric,
  _reason text,
  _created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s public.project_module_settings%ROWTYPE;
  proj public.investment_projects%ROWTYPE;
  access_status text;
  access_expiry timestamptz;
  active_count int;
  new_id uuid;
  new_expires timestamptz;
BEGIN
  SELECT * INTO s FROM public.project_module_settings WHERE id = 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Status inwestora sprawdzany w tej samej transakcji.
  SELECT status, access_expires_at INTO access_status, access_expiry
    FROM public.project_module_access WHERE user_id = _investor_id;
  IF access_status IS DISTINCT FROM 'approved_investor' THEN RETURN NULL; END IF;
  IF access_expiry IS NOT NULL AND access_expiry < now() THEN RETURN NULL; END IF;

  -- Limit aktywnych kart.
  SELECT count(*) INTO active_count FROM public.project_assignments
    WHERE investor_id = _investor_id AND status IN ('created', 'opened', 'extended');
  IF active_count >= s.max_active_assignments THEN RETURN NULL; END IF;

  -- Blokada wiersza projektu — dwóch inwestorów nie dostanie tego samego projektu.
  SELECT * INTO proj FROM public.investment_projects
    WHERE id = _project_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF proj.status <> 'available_internal_pool' THEN RETURN NULL; END IF;
  IF proj.main_photo_path IS NULL OR NOT proj.photo_approved THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_assignments
    WHERE project_id = _project_id AND status IN ('created', 'opened', 'extended', 'interested')
  ) THEN RETURN NULL; END IF;

  new_expires := now() + make_interval(hours => s.assignment_hours);
  INSERT INTO public.project_assignments
    (project_id, project_version, investor_id, status, match_score, assignment_reason,
     assigned_at, expires_at, created_by)
  VALUES
    (_project_id, proj.version, _investor_id, 'created', _score, _reason,
     now(), new_expires, COALESCE(_created_by, _investor_id))
  RETURNING id INTO new_id;

  UPDATE public.investment_projects
    SET status = 'temporarily_assigned', last_assigned_at = now(), updated_by = _created_by
    WHERE id = _project_id;

  PERFORM public.project_module_audit(
    COALESCE(_created_by, _investor_id), _investor_id, 'assignment', new_id::text,
    'assignment_created', 'available_internal_pool', 'temporarily_assigned', _reason,
    jsonb_build_object('project_id', _project_id, 'match_score', _score, 'expires_at', new_expires));

  RETURN new_id;
END $fn$;
REVOKE ALL ON FUNCTION public.project_claim_assignment(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_claim_assignment(uuid, uuid, numeric, text, uuid) TO service_role;

-- ===========================================================================
-- Otwarcie karty (pierwsze wyświetlenie) — idempotentne.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.project_assignment_open(
  _assignment_id uuid, _investor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE a public.project_assignments%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.project_assignments WHERE id = _assignment_id FOR UPDATE;
  IF NOT FOUND OR a.investor_id <> _investor_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF a.status IN ('opened', 'extended', 'interested') THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already');
  END IF;
  IF a.status <> 'created' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_active');
  END IF;
  IF a.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;
  UPDATE public.project_assignments
    SET status = 'opened', opened_at = COALESCE(opened_at, now())
    WHERE id = _assignment_id;
  RETURN jsonb_build_object('ok', true, 'code', 'ok');
END $fn$;
REVOKE ALL ON FUNCTION public.project_assignment_open(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_assignment_open(uuid, uuid) TO service_role;

-- ===========================================================================
-- Jednorazowe przedłużenie o `extension_hours` (domyślnie 12 h). Druga próba
-- jest odrzucana. Musi nastąpić przed wygaśnięciem. Limituje też liczbę
-- przedłużonych aktywnych przypisań inwestora (max_extended_assignments).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.project_assignment_extend(
  _assignment_id uuid, _investor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a public.project_assignments%ROWTYPE;
  s public.project_module_settings%ROWTYPE;
  extended_count int;
  new_expires timestamptz;
BEGIN
  SELECT * INTO s FROM public.project_module_settings WHERE id = 1;
  SELECT * INTO a FROM public.project_assignments WHERE id = _assignment_id FOR UPDATE;
  IF NOT FOUND OR a.investor_id <> _investor_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF a.extended_at IS NOT NULL OR a.status = 'extended' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_extended');
  END IF;
  IF a.status NOT IN ('created', 'opened') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_active');
  END IF;
  IF a.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;
  SELECT count(*) INTO extended_count FROM public.project_assignments
    WHERE investor_id = _investor_id AND status = 'extended';
  IF extended_count >= s.max_extended_assignments THEN
    RETURN jsonb_build_object('ok', false, 'code', 'extension_limit');
  END IF;

  new_expires := a.expires_at + make_interval(hours => s.extension_hours);
  UPDATE public.project_assignments
    SET status = 'extended', extended_at = now(), extended_until = new_expires,
        expires_at = new_expires
    WHERE id = _assignment_id;

  PERFORM public.project_module_audit(
    _investor_id, _investor_id, 'assignment', _assignment_id::text,
    'assignment_extended', a.status, 'extended', NULL,
    jsonb_build_object('project_id', a.project_id, 'expires_at', new_expires));

  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'expires_at', new_expires);
END $fn$;
REVOKE ALL ON FUNCTION public.project_assignment_extend(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_assignment_extend(uuid, uuid) TO service_role;

-- ===========================================================================
-- Decyzja inwestora: 'interested' | 'rejected'. Idempotentna (powtórne
-- kliknięcie tej samej decyzji zwraca ok/already). Po wygaśnięciu serwer
-- odrzuca akcję. Odrzucenie natychmiast zwalnia projekt do puli (bez
-- automatycznego przesłania kolejnej osobie); zainteresowanie blokuje projekt
-- (initial_interest) i otwiera termin na propozycję.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.project_assignment_decide(
  _assignment_id uuid, _investor_id uuid, _decision text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a public.project_assignments%ROWTYPE;
  s public.project_module_settings%ROWTYPE;
  proj public.investment_projects%ROWTYPE;
  review_triggered boolean := false;
  deadline timestamptz;
BEGIN
  IF _decision NOT IN ('interested', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_decision');
  END IF;
  SELECT * INTO s FROM public.project_module_settings WHERE id = 1;
  SELECT * INTO a FROM public.project_assignments WHERE id = _assignment_id FOR UPDATE;
  IF NOT FOUND OR a.investor_id <> _investor_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  -- Idempotencja podwójnego kliknięcia.
  IF a.status = _decision THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already');
  END IF;
  IF a.status NOT IN ('created', 'opened', 'extended') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_active');
  END IF;
  IF a.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  -- Blokada projektu w tej samej transakcji (spójny stan projekt+przypisanie).
  SELECT * INTO proj FROM public.investment_projects WHERE id = a.project_id FOR UPDATE;

  IF _decision = 'rejected' THEN
    UPDATE public.project_assignments
      SET status = 'rejected', decision_at = now(), decision_type = 'rejected',
          closed_at = now(), closed_reason = 'rejected_by_investor'
      WHERE id = _assignment_id;

    IF proj.status = 'temporarily_assigned' THEN
      IF proj.rejection_count + 1 >= s.rejection_review_threshold THEN
        review_triggered := true;
        UPDATE public.investment_projects
          SET status = 'under_review', rejection_count = rejection_count + 1
          WHERE id = proj.id;
      ELSE
        UPDATE public.investment_projects
          SET status = 'available_internal_pool', rejection_count = rejection_count + 1
          WHERE id = proj.id;
      END IF;
    END IF;

    PERFORM public.project_module_audit(
      _investor_id, _investor_id, 'assignment', _assignment_id::text,
      'assignment_rejected', a.status, 'rejected', NULL,
      jsonb_build_object('project_id', a.project_id, 'review_triggered', review_triggered));

    RETURN jsonb_build_object('ok', true, 'code', 'ok', 'review_triggered', review_triggered);
  END IF;

  -- interested
  deadline := now() + make_interval(hours => s.proposal_hours);
  UPDATE public.project_assignments
    SET status = 'interested', decision_at = now(), decision_type = 'interested',
        proposal_deadline_at = deadline
    WHERE id = _assignment_id;
  IF proj.status = 'temporarily_assigned' THEN
    UPDATE public.investment_projects SET status = 'initial_interest' WHERE id = proj.id;
  END IF;

  PERFORM public.project_module_audit(
    _investor_id, _investor_id, 'assignment', _assignment_id::text,
    'assignment_interested', a.status, 'interested', NULL,
    jsonb_build_object('project_id', a.project_id, 'proposal_deadline_at', deadline));

  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'proposal_deadline_at', deadline);
END $fn$;
REVOKE ALL ON FUNCTION public.project_assignment_decide(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_assignment_decide(uuid, uuid, text) TO service_role;

-- ===========================================================================
-- Wygaszanie (cron co kilka minut). Idempotentne — filtr statusów + blokady
-- SKIP LOCKED gwarantują, że to samo przypisanie nie zostanie zamknięte dwa
-- razy nawet przy równoległych uruchomieniach. Zwraca listy zamkniętych
-- przypisań do wysyłki powiadomień przez warstwę aplikacji.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.project_expire_assignments()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s public.project_module_settings%ROWTYPE;
  rec record;
  proj public.investment_projects%ROWTYPE;
  expired_ids uuid[] := '{}';
  proposal_expired_ids uuid[] := '{}';
  review_project_ids uuid[] := '{}';
BEGIN
  SELECT * INTO s FROM public.project_module_settings WHERE id = 1;

  -- 1) Karty bez decyzji po terminie (24 h / 36 h po przedłużeniu).
  FOR rec IN
    SELECT id, project_id, investor_id FROM public.project_assignments
    WHERE status IN ('created', 'opened', 'extended') AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.project_assignments
      SET status = 'expired', closed_at = now(), closed_reason = 'no_decision_before_deadline'
      WHERE id = rec.id AND status IN ('created', 'opened', 'extended');
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT * INTO proj FROM public.investment_projects WHERE id = rec.project_id FOR UPDATE;
    IF proj.status = 'temporarily_assigned' THEN
      IF proj.rejection_count + 1 >= s.rejection_review_threshold THEN
        UPDATE public.investment_projects
          SET status = 'under_review', rejection_count = rejection_count + 1
          WHERE id = proj.id;
        review_project_ids := review_project_ids || proj.id;
      ELSE
        UPDATE public.investment_projects
          SET status = 'available_internal_pool', rejection_count = rejection_count + 1
          WHERE id = proj.id;
      END IF;
    END IF;

    PERFORM public.project_module_audit(
      NULL, rec.investor_id, 'assignment', rec.id::text,
      'assignment_expired', NULL, 'expired', 'no_decision_before_deadline',
      jsonb_build_object('project_id', rec.project_id));
    expired_ids := expired_ids || rec.id;
  END LOOP;

  -- 2) Zainteresowania bez złożonej propozycji po terminie (domyślnie 48 h).
  FOR rec IN
    SELECT a.id, a.project_id, a.investor_id FROM public.project_assignments a
    WHERE a.status = 'interested'
      AND a.proposal_deadline_at IS NOT NULL
      AND a.proposal_deadline_at < now()
      AND NOT EXISTS (
        SELECT 1 FROM public.project_proposals p
        WHERE p.assignment_id = a.id AND p.status NOT IN ('draft', 'withdrawn')
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.project_assignments
      SET status = 'expired', closed_at = now(), closed_reason = 'proposal_deadline_missed'
      WHERE id = rec.id AND status = 'interested';
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT * INTO proj FROM public.investment_projects WHERE id = rec.project_id FOR UPDATE;
    IF proj.status = 'initial_interest' THEN
      IF proj.rejection_count + 1 >= s.rejection_review_threshold THEN
        UPDATE public.investment_projects
          SET status = 'under_review', rejection_count = rejection_count + 1
          WHERE id = proj.id;
        review_project_ids := review_project_ids || proj.id;
      ELSE
        UPDATE public.investment_projects
          SET status = 'available_internal_pool', rejection_count = rejection_count + 1
          WHERE id = proj.id;
      END IF;
    END IF;

    PERFORM public.project_module_audit(
      NULL, rec.investor_id, 'assignment', rec.id::text,
      'assignment_expired', 'interested', 'expired', 'proposal_deadline_missed',
      jsonb_build_object('project_id', rec.project_id));
    proposal_expired_ids := proposal_expired_ids || rec.id;
  END LOOP;

  RETURN jsonb_build_object(
    'expired', to_jsonb(expired_ids),
    'proposal_expired', to_jsonb(proposal_expired_ids),
    'review_projects', to_jsonb(review_project_ids));
END $fn$;
REVOKE ALL ON FUNCTION public.project_expire_assignments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_expire_assignments() TO service_role;

-- ===========================================================================
-- Operacje administratora: ręczne anulowanie i wyjątkowe przedłużenie
-- (z powodem). Zamknięcie wszystkich aktywnych przypisań projektu przy
-- wycofaniu / zmianie istotnych parametrów.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.project_admin_cancel_assignment(
  _assignment_id uuid, _admin_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a public.project_assignments%ROWTYPE;
  proj public.investment_projects%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.project_assignments WHERE id = _assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'not_found'); END IF;
  IF a.status NOT IN ('created', 'opened', 'extended', 'interested') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_active');
  END IF;

  UPDATE public.project_assignments
    SET status = 'cancelled_by_admin', closed_at = now(),
        closed_reason = COALESCE(_reason, 'cancelled_by_admin')
    WHERE id = _assignment_id;

  SELECT * INTO proj FROM public.investment_projects WHERE id = a.project_id FOR UPDATE;
  IF proj.status IN ('temporarily_assigned', 'initial_interest') THEN
    UPDATE public.investment_projects SET status = 'available_internal_pool', updated_by = _admin_id
      WHERE id = proj.id;
  END IF;

  PERFORM public.project_module_audit(
    _admin_id, a.investor_id, 'assignment', _assignment_id::text,
    'assignment_cancelled_by_admin', a.status, 'cancelled_by_admin', _reason,
    jsonb_build_object('project_id', a.project_id));
  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'investor_id', a.investor_id);
END $fn$;
REVOKE ALL ON FUNCTION public.project_admin_cancel_assignment(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_admin_cancel_assignment(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.project_admin_extend_assignment(
  _assignment_id uuid, _admin_id uuid, _hours int, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  a public.project_assignments%ROWTYPE;
  new_expires timestamptz;
BEGIN
  IF _hours IS NULL OR _hours <= 0 OR _hours > 24 * 14 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_hours');
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'reason_required');
  END IF;
  SELECT * INTO a FROM public.project_assignments WHERE id = _assignment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'not_found'); END IF;

  IF a.status IN ('created', 'opened', 'extended') THEN
    new_expires := GREATEST(a.expires_at, now()) + make_interval(hours => _hours);
    UPDATE public.project_assignments SET expires_at = new_expires WHERE id = _assignment_id;
  ELSIF a.status = 'interested' THEN
    new_expires := GREATEST(COALESCE(a.proposal_deadline_at, now()), now())
      + make_interval(hours => _hours);
    UPDATE public.project_assignments SET proposal_deadline_at = new_expires WHERE id = _assignment_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'not_active');
  END IF;

  PERFORM public.project_module_audit(
    _admin_id, a.investor_id, 'assignment', _assignment_id::text,
    'assignment_admin_extended', a.status, a.status, _reason,
    jsonb_build_object('project_id', a.project_id, 'hours', _hours, 'new_deadline', new_expires));
  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'new_deadline', new_expires);
END $fn$;
REVOKE ALL ON FUNCTION public.project_admin_extend_assignment(uuid, uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_admin_extend_assignment(uuid, uuid, int, text) TO service_role;

-- Zamyka wszystkie aktywne przypisania projektu (wycofanie projektu albo
-- zmiana istotnych parametrów → nowa wersja). Zwraca inwestorów do powiadomienia.
CREATE OR REPLACE FUNCTION public.project_release_assignments(
  _project_id uuid, _closed_reason text, _actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  rec record;
  investor_ids uuid[] := '{}';
  new_status text;
BEGIN
  new_status := CASE
    WHEN _closed_reason = 'project_update' THEN 'cancelled_project_update'
    ELSE 'cancelled_by_admin'
  END;
  FOR rec IN
    SELECT id, investor_id, status FROM public.project_assignments
    WHERE project_id = _project_id AND status IN ('created', 'opened', 'extended', 'interested')
    FOR UPDATE
  LOOP
    UPDATE public.project_assignments
      SET status = new_status, closed_at = now(), closed_reason = _closed_reason
      WHERE id = rec.id;
    PERFORM public.project_module_audit(
      _actor, rec.investor_id, 'assignment', rec.id::text,
      'assignment_cancelled', rec.status, new_status, _closed_reason,
      jsonb_build_object('project_id', _project_id));
    investor_ids := investor_ids || rec.investor_id;
  END LOOP;
  RETURN jsonb_build_object('investors', to_jsonb(investor_ids));
END $fn$;
REVOKE ALL ON FUNCTION public.project_release_assignments(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_release_assignments(uuid, text, uuid) TO service_role;
