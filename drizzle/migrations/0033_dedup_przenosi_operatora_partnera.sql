-- Strażnik pól wewnętrznych: przepuszcza wewnętrzne scalanie duplikatów
-- (flaga transakcyjna ustawiana tylko przez kod SECURITY DEFINER poniżej).
CREATE OR REPLACE FUNCTION public.loan_applications_block_internal_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role'
     OR coalesce(current_setting('app.internal_merge', true), '') = 'on'
     OR public.has_role(auth.uid(), 'administrator'::public.app_role)
     OR public.has_role(auth.uid(), 'operator'::public.app_role)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.admin_decision IS DISTINCT FROM OLD.admin_decision
     OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason
     OR NEW.decision_at IS DISTINCT FROM OLD.decision_at
     OR NEW.decision_by IS DISTINCT FROM OLD.decision_by
     OR NEW.initial_score IS DISTINCT FROM OLD.initial_score
     OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
     OR NEW.property_quality IS DISTINCT FROM OLD.property_quality
     OR NEW.location_quality IS DISTINCT FROM OLD.location_quality
     OR NEW.estimated_ltv IS DISTINCT FROM OLD.estimated_ltv
     OR NEW.assigned_operator IS DISTINCT FROM OLD.assigned_operator
     OR NEW.available_to_investors IS DISTINCT FROM OLD.available_to_investors
     OR NEW.visibility_level IS DISTINCT FROM OLD.visibility_level
     OR NEW.automation_status IS DISTINCT FROM OLD.automation_status
     OR NEW.automation_paused IS DISTINCT FROM OLD.automation_paused
     OR NEW.last_automation_error IS DISTINCT FROM OLD.last_automation_error
     OR NEW.webhook_status IS DISTINCT FROM OLD.webhook_status
     OR NEW.last_webhook_at IS DISTINCT FROM OLD.last_webhook_at
     OR NEW.aml_status IS DISTINCT FROM OLD.aml_status
     OR NEW.aml_checked_at IS DISTINCT FROM OLD.aml_checked_at
  THEN
    RAISE EXCEPTION 'Nie masz uprawnień do zmiany wewnętrznych pól wniosku.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Przy scaleniu duplikatu (merged_into_id: NULL -> wniosek docelowy) przenieś
-- przypisanie operatora/partnera i notatki pośrednika na wniosek docelowy.
-- Działa dla każdej ścieżki scalania, bo reaguje na zmianę merged_into_id.
CREATE OR REPLACE FUNCTION public.loan_merge_carry_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  can public.loan_applications%ROWTYPE;
  conflicts text[] := ARRAY[]::text[];
  note text;
  prev_flag text;
BEGIN
  IF NEW.merged_into_id IS NULL OR OLD.merged_into_id IS NOT DISTINCT FROM NEW.merged_into_id
     OR NEW.merged_into_id = NEW.id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO can FROM public.loan_applications WHERE id = NEW.merged_into_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF can.created_by_partner_user_id IS NOT NULL AND NEW.created_by_partner_user_id IS NOT NULL
     AND can.created_by_partner_user_id <> NEW.created_by_partner_user_id THEN
    conflicts := conflicts || format('created_by_partner_user_id: %s (duplikat) vs %s', NEW.created_by_partner_user_id, can.created_by_partner_user_id);
  END IF;
  IF can.assigned_operator IS NOT NULL AND NEW.assigned_operator IS NOT NULL
     AND can.assigned_operator <> NEW.assigned_operator THEN
    conflicts := conflicts || format('assigned_operator: %s (duplikat) vs %s', NEW.assigned_operator, can.assigned_operator);
  END IF;
  IF can.referred_by_partner_id IS NOT NULL AND NEW.referred_by_partner_id IS NOT NULL
     AND can.referred_by_partner_id <> NEW.referred_by_partner_id THEN
    conflicts := conflicts || format('referred_by_partner_id: %s (duplikat) vs %s', NEW.referred_by_partner_id, can.referred_by_partner_id);
  END IF;

  note := NULL;
  IF nullif(btrim(NEW.broker_notes), '') IS NOT NULL
     AND position(btrim(NEW.broker_notes) IN coalesce(can.broker_notes, '')) = 0 THEN
    note := format('[Scalono z wniosku %s] %s', NEW.id, btrim(NEW.broker_notes));
  END IF;
  IF array_length(conflicts, 1) > 0 THEN
    note := concat_ws(E'\n', note, format('[Scalenie z %s — konflikt przypisań, nie nadpisano] %s', NEW.id, array_to_string(conflicts, '; ')));
  END IF;

  prev_flag := coalesce(current_setting('app.internal_merge', true), '');
  PERFORM set_config('app.internal_merge', 'on', true);
  UPDATE public.loan_applications
  SET created_by_partner_user_id = coalesce(created_by_partner_user_id, NEW.created_by_partner_user_id),
      assigned_operator = coalesce(assigned_operator, NEW.assigned_operator),
      referred_by_partner_id = coalesce(referred_by_partner_id, NEW.referred_by_partner_id),
      broker_notes = CASE WHEN note IS NULL THEN broker_notes
                          ELSE concat_ws(E'\n\n', nullif(btrim(broker_notes), ''), note) END,
      updated_at = now()
  WHERE id = can.id;
  PERFORM set_config('app.internal_merge', prev_flag, true);

  IF array_length(conflicts, 1) > 0 THEN
    INSERT INTO public.audit_logs (object_type, object_id, action, previous_value, new_value)
    VALUES ('loan_application', can.id, 'dedup_merge_assignment_conflict',
            jsonb_build_object('duplicate_id', NEW.id,
                               'created_by_partner_user_id', NEW.created_by_partner_user_id,
                               'assigned_operator', NEW.assigned_operator,
                               'referred_by_partner_id', NEW.referred_by_partner_id),
            jsonb_build_object('created_by_partner_user_id', can.created_by_partner_user_id,
                               'assigned_operator', can.assigned_operator,
                               'referred_by_partner_id', can.referred_by_partner_id,
                               'conflicts', to_jsonb(conflicts)));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.loan_merge_carry_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_loan_merge_carry_assignment ON public.loan_applications;
CREATE TRIGGER trg_loan_merge_carry_assignment
  AFTER UPDATE OF merged_into_id ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.loan_merge_carry_assignment();

-- Backfill: aktywne wnioski docelowe uzupełniają puste pola z duplikatów
-- (tylko gdy duplikaty są zgodne; przy różnych wartościach nic nie zmieniamy).
SELECT set_config('app.internal_merge', 'on', true);
WITH agg AS (
  SELECT d.merged_into_id AS id,
    CASE WHEN count(DISTINCT d.created_by_partner_user_id) = 1 THEN min(d.created_by_partner_user_id::text)::uuid END AS cb,
    CASE WHEN count(DISTINCT d.assigned_operator) = 1 THEN min(d.assigned_operator::text)::uuid END AS op,
    CASE WHEN count(DISTINCT d.referred_by_partner_id) = 1 THEN min(d.referred_by_partner_id::text)::uuid END AS ref
  FROM public.loan_applications d
  WHERE d.merged_into_id IS NOT NULL
  GROUP BY d.merged_into_id
)
UPDATE public.loan_applications la
SET created_by_partner_user_id = coalesce(la.created_by_partner_user_id, agg.cb),
    assigned_operator = coalesce(la.assigned_operator, agg.op),
    referred_by_partner_id = coalesce(la.referred_by_partner_id, agg.ref),
    updated_at = now()
FROM agg
WHERE la.id = agg.id
  AND la.merged_into_id IS NULL
  AND ((la.created_by_partner_user_id IS NULL AND agg.cb IS NOT NULL)
    OR (la.assigned_operator IS NULL AND agg.op IS NOT NULL)
    OR (la.referred_by_partner_id IS NULL AND agg.ref IS NOT NULL));
SELECT set_config('app.internal_merge', '', true);