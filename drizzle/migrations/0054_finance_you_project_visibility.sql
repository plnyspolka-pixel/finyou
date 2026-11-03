-- Projekty pożyczkowe są dostępne inwestycyjnie wyłącznie dla konta Finance You
-- (zatwierdzone konto spółki oraz role administrator + inwestor).
-- Dane firmy wpisywane samodzielnie w profilu nie nadają uprawnień.

CREATE SCHEMA IF NOT EXISTS finance_you_private;
REVOKE ALL ON SCHEMA finance_you_private FROM PUBLIC, anon, authenticated;

-- Jednorazowe wskazanie konta spółki: NIP i KRS muszą być zgodne, a konto
-- musi mieć obie role. Późniejsze edycje profilu NIE zmieniają tej listy.
CREATE TABLE IF NOT EXISTS public.finance_you_project_viewers (
  user_id uuid PRIMARY KEY,
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_you_project_viewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_you_project_viewers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_you_project_viewers TO authenticated;
GRANT ALL ON public.finance_you_project_viewers TO service_role;
DROP POLICY IF EXISTS finance_you_project_viewers_select ON public.finance_you_project_viewers;
CREATE POLICY finance_you_project_viewers_select ON public.finance_you_project_viewers
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_internal_staff(auth.uid()));
INSERT INTO public.finance_you_project_viewers (user_id)
SELECT DISTINCT i.user_id FROM public.investors i
WHERE i.user_id IS NOT NULL
  AND regexp_replace(coalesce(i.nip,''),'[^0-9]','','g') = '7010611803'
  AND regexp_replace(coalesce(i.krs,''),'[^0-9]','','g') = '0000635207'
  AND public.has_role(i.user_id, 'administrator'::public.app_role)
  AND public.has_role(i.user_id, 'inwestor'::public.app_role)
ON CONFLICT (user_id) DO NOTHING;
DO $check$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.finance_you_project_viewers) THEN
    RAISE EXCEPTION 'Nie znaleziono zatwierdzonego konta inwestora Finance You; migracja przerwana';
  END IF;
END $check$;

CREATE TABLE IF NOT EXISTS finance_you_private.suspended_offer_card_tokens (
  loan_application_id uuid PRIMARY KEY,
  offer_card_token text NOT NULL,
  suspended_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE finance_you_private.suspended_offer_card_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_you_private.suspended_offer_card_tokens FROM PUBLIC, anon, authenticated;

-- Istniejące linki tracą ważność, a tokeny zostają w prywatnym archiwum.
INSERT INTO finance_you_private.suspended_offer_card_tokens (loan_application_id, offer_card_token)
SELECT id, offer_card_token FROM public.loan_applications WHERE offer_card_token IS NOT NULL
ON CONFLICT (loan_application_id) DO NOTHING;
UPDATE public.loan_applications SET offer_card_token = NULL WHERE offer_card_token IS NOT NULL;
UPDATE public.auto_distribution_settings SET enabled = false, daily_send_limit = 0
WHERE enabled IS TRUE OR daily_send_limit <> 0;

CREATE OR REPLACE FUNCTION finance_you_private.block_external_offer_card_tokens()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $fn$
BEGIN
  IF NEW.offer_card_token IS NOT NULL THEN
    RAISE EXCEPTION 'Publiczne karty projektów są wyłączone' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION finance_you_private.block_external_offer_card_tokens() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS finance_you_block_external_offer_cards ON public.loan_applications;
CREATE TRIGGER finance_you_block_external_offer_cards
  BEFORE INSERT OR UPDATE OF offer_card_token ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION finance_you_private.block_external_offer_card_tokens();

CREATE OR REPLACE FUNCTION finance_you_private.guard_investor_order_project()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $fn$
DECLARE owner_id uuid;
BEGIN
  IF NEW.status IN ('dopasowane','teaser','karta_leada','rezerwacja','transakcja') THEN
    SELECT user_id INTO owner_id FROM public.investor_orders WHERE id = NEW.order_id;
    IF owner_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.finance_you_project_viewers WHERE user_id=owner_id)
       OR NOT public.has_role(owner_id, 'administrator'::public.app_role)
       OR NOT public.has_role(owner_id, 'inwestor'::public.app_role) THEN
      RAISE EXCEPTION 'Projekty inwestycyjne są dostępne wyłącznie dla Finance You' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION finance_you_private.guard_investor_order_project() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS finance_you_order_project_guard ON public.investor_order_matches;
CREATE TRIGGER finance_you_order_project_guard
  BEFORE INSERT OR UPDATE OF order_id, status ON public.investor_order_matches
  FOR EACH ROW EXECUTE FUNCTION finance_you_private.guard_investor_order_project();

CREATE OR REPLACE FUNCTION finance_you_private.guard_project_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $fn$
BEGIN
  IF NEW.status IN ('created','opened','extended','interested') AND (
    NOT EXISTS (SELECT 1 FROM public.finance_you_project_viewers WHERE user_id=NEW.investor_id)
    OR NOT public.has_role(NEW.investor_id, 'administrator'::public.app_role)
    OR NOT public.has_role(NEW.investor_id, 'inwestor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Projekty inwestycyjne są dostępne wyłącznie dla Finance You' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION finance_you_private.guard_project_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS finance_you_project_assignment_guard ON public.project_assignments;
CREATE TRIGGER finance_you_project_assignment_guard
  BEFORE INSERT OR UPDATE OF investor_id, status ON public.project_assignments
  FOR EACH ROW EXECUTE FUNCTION finance_you_private.guard_project_assignment();

-- RLS jest warstwą dodatkową wobec kontroli w serwerze. Nie ograniczamy
-- odczytu własnych wniosków przez pożyczkobiorców ani własnych spraw pośrednika.
DROP POLICY IF EXISTS finance_you_projects_only ON public.investor_order_matches;
CREATE POLICY finance_you_projects_only ON public.investor_order_matches AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS finance_you_projects_only ON public.investor_order_events;
CREATE POLICY finance_you_projects_only ON public.investor_order_events AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS finance_you_projects_only ON public.project_assignments;
CREATE POLICY finance_you_projects_only ON public.project_assignments AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS finance_you_projects_only ON public.project_proposals;
CREATE POLICY finance_you_projects_only ON public.project_proposals AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS finance_you_projects_only ON public.project_info_requests;
CREATE POLICY finance_you_projects_only ON public.project_info_requests AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS finance_you_projects_only ON public.offer_distributions;
CREATE POLICY finance_you_projects_only ON public.offer_distributions AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS finance_you_projects_only ON public.investor_offers;
CREATE POLICY finance_you_projects_only ON public.investor_offers AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    public.is_internal_staff(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.loan_applications la JOIN public.clients c ON c.id = la.client_id
      WHERE la.id = investor_offers.loan_application_id AND c.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.investor_can_view_application(_user_id uuid, _application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT public.has_role(_user_id, 'administrator'::public.app_role)
    AND public.has_role(_user_id, 'inwestor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.finance_you_project_viewers WHERE user_id=_user_id)
    AND public.investor_legal_pack_complete(_user_id)
    AND (
      EXISTS (SELECT 1 FROM public.investor_order_matches m JOIN public.investor_orders o ON o.id = m.order_id
              WHERE m.application_id = _application_id AND o.user_id = _user_id AND m.status IN ('rezerwacja','transakcja'))
      OR EXISTS (SELECT 1 FROM public.investor_offers io JOIN public.investors i ON i.id = io.investor_id
                 WHERE io.loan_application_id = _application_id AND i.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.offer_distributions d JOIN public.investors i ON i.id = d.investor_id
                 WHERE d.loan_application_id = _application_id AND i.user_id = _user_id AND d.distribution_status NOT IN ('szkic','gotowe_do_wysylki'))
    );
$fn$;

CREATE OR REPLACE FUNCTION public.investor_has_disclosed_match(_user_id uuid, _application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT public.has_role(_user_id, 'administrator'::public.app_role)
    AND public.has_role(_user_id, 'inwestor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.finance_you_project_viewers WHERE user_id=_user_id)
    AND EXISTS (SELECT 1 FROM public.investor_order_matches m JOIN public.investor_orders o ON o.id = m.order_id
                WHERE m.application_id = _application_id AND o.user_id = _user_id
                  AND m.status IN ('rezerwacja','transakcja') AND m.disclosed_at IS NOT NULL);
$fn$;

CREATE OR REPLACE FUNCTION public.investor_offer_teasers()
RETURNS TABLE(id uuid, match_id uuid, order_id uuid, project_ref text, match_status text, created_at timestamptz,
              loan_amount numeric, preferred_period_months integer, annual_investor_rate numeric, estimated_ltv numeric,
              property_type text, city text, voivodeship text, estimated_value numeric, area_sqm numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT la.id, m.id, o.id, m.project_ref, m.status, la.created_at, la.loan_amount,
         la.preferred_period_months, la.annual_investor_rate, la.estimated_ltv,
         p.property_type::text, p.city, p.voivodeship, p.estimated_value, p.area_sqm
  FROM public.investor_orders o
  JOIN public.investor_order_matches m ON m.order_id=o.id
  JOIN public.loan_applications la ON la.id=m.application_id
  LEFT JOIN LATERAL (SELECT * FROM public.properties pp WHERE pp.loan_application_id=la.id ORDER BY pp.created_at ASC LIMIT 1) p ON true
  WHERE auth.uid() IS NOT NULL
    AND public.has_role(auth.uid(), 'administrator'::public.app_role)
    AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.finance_you_project_viewers WHERE user_id=auth.uid())
    AND o.user_id=auth.uid() AND o.status='przyjete'
    AND m.status IN ('dopasowane','teaser','karta_leada','rezerwacja','transakcja')
    AND la.deleted_at IS NULL
  ORDER BY m.created_at DESC;
$fn$;

CREATE OR REPLACE FUNCTION public.investor_kw_analysis_summary(_application_id uuid)
RETURNS TABLE(application_id uuid, legal_risk_score integer, risk_flags jsonb, investor_summary text, analysis_warning text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT ka.application_id, ka.legal_risk_score, to_jsonb(ka.risk_flags), ka.investor_summary, ka.analysis_warning
  FROM public.kw_analysis ka JOIN public.loan_applications la ON la.id=ka.application_id
  WHERE ka.application_id=_application_id AND la.available_to_investors=true
    AND la.visibility_level='zanonimizowane'::public.visibility_level AND la.deleted_at IS NULL
    AND public.has_role(auth.uid(),'inwestor'::public.app_role)
    AND public.has_role(auth.uid(),'administrator'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.finance_you_project_viewers WHERE user_id=auth.uid())
    AND public.investor_has_full_access(auth.uid());
$fn$;

REVOKE EXECUTE ON FUNCTION public.investor_has_disclosed_match(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.investor_offer_teasers() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.investor_kw_analysis_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investor_has_disclosed_match(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.investor_offer_teasers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.investor_kw_analysis_summary(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.project_claim_assignment(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_assignment_open(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_assignment_decide(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_assignment_extend(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_claim_assignment(uuid,uuid,numeric,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_assignment_open(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_assignment_decide(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_assignment_extend(uuid,uuid) TO service_role;
