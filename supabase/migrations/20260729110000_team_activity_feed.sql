-- =========================================================
-- ZESPÓŁ I AKTYWNOŚĆ (/admin/zespol-aktywnosc)
--
-- Dotychczas strona czytała wyłącznie tabelę audit_logs, do której
-- zapisywały tylko 2 miejsca w kodzie (zmiana statusu wniosku przez
-- admina i webhook płatności) — stąd "Brak zdarzeń". Realna aktywność
-- zespołu jest rozproszona po innych tabelach.
--
-- Ta migracja:
--  1) tworzy widok v_team_activity łączący realne źródła aktywności
--     (audit_logs, ręczna komunikacja z leadami, wgrane dokumenty,
--      oznaczenia leadów, decyzje o wnioskach),
--  2) dodaje funkcje RPC (tylko dla administratora):
--     get_team_activity(limit) i get_team_members(),
--  3) dodaje triggery zapisujące do audit_logs zmiany statusów
--     wniosków i leadów oraz zmiany przypisania leada — od teraz
--     każda taka zmiana trafia do dziennika automatycznie.
-- =========================================================

-- ---------- 1) Ujednolicony widok aktywności ----------
CREATE OR REPLACE VIEW public.v_team_activity AS
-- Dziennik audytu (statusy wniosków/leadów, płatności itd.)
SELECT
  'audit:' || a.id::text                       AS id,
  a.created_at                                 AS happened_at,
  a.user_id                                    AS user_id,
  'audyt'                                      AS event_type,
  CASE
    WHEN a.action = 'status_change' AND a.object_type IN ('loan_application', 'loan_applications')
      THEN 'Zmiana statusu wniosku'
    WHEN a.action = 'status_change' AND a.object_type = 'leads'
      THEN 'Zmiana statusu leada'
    WHEN a.action = 'assignment_change'
      THEN 'Zmiana przypisania leada'
    WHEN a.action = 'stripe_payment_succeeded'
      THEN 'Opłacona subskrypcja inwestora'
    ELSE a.action
  END                                          AS title,
  CASE
    WHEN a.action = 'status_change'
      THEN coalesce(a.previous_value->>'status', '?') || ' → ' || coalesce(a.new_value->>'status', '?')
    WHEN a.action = 'stripe_payment_succeeded'
      THEN 'Plan: ' || coalesce(a.new_value->>'plan', '?')
    ELSE left(coalesce(a.new_value::text, ''), 160)
  END                                          AS details,
  a.object_type                                AS object_type,
  a.object_id                                  AS object_id
FROM public.audit_logs a

UNION ALL

-- Ręczna komunikacja z leadami (notatki, telefony, odsłonięcie danych)
SELECT
  'comm:' || c.id::text,
  c.created_at,
  c.created_by,
  'komunikacja',
  CASE c.channel
    WHEN 'manual_note' THEN 'Notatka do leada'
    WHEN 'reveal'      THEN 'Podgląd danych leada'
    WHEN 'call'        THEN 'Rozmowa telefoniczna z leadem'
    WHEN 'sms'         THEN 'SMS do leada'
    WHEN 'email'       THEN 'E-mail do leada'
    ELSE 'Kontakt (' || c.channel || ')'
  END,
  coalesce(
    nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), ''),
    l.email, l.phone_raw, ''
  ) || CASE
    WHEN c.channel = 'manual_note' AND c.content IS NOT NULL
      THEN ' · ' || left(c.content, 140)
    ELSE ''
  END,
  'lead',
  c.lead_id
FROM public.lead_communications c
LEFT JOIN public.leads l ON l.id = c.lead_id
WHERE c.created_by IS NOT NULL

UNION ALL

-- Wgrane dokumenty
SELECT
  'doc:' || d.id::text,
  d.created_at,
  d.uploaded_by,
  'dokument',
  'Wgranie dokumentu',
  coalesce(d.file_name, '')
    || coalesce(' (' || nullif(d.document_type, '') || ')', ''),
  'loan_application',
  d.loan_application_id
FROM public.documents d
WHERE d.uploaded_by IS NOT NULL

UNION ALL

-- Oznaczenie leada jako nietrafiony
SELECT
  'leadmark:' || l.id::text,
  coalesce(l.updated_at, l.created_at),
  l.marked_by,
  'lead',
  'Oznaczenie leada jako nietrafiony',
  coalesce(
    nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), ''),
    l.email, l.phone_raw, ''
  ) || coalesce(' · ' || nullif(l.marked_bad_reason, ''), ''),
  'lead',
  l.id
FROM public.leads l
WHERE l.marked_by IS NOT NULL

UNION ALL

-- Decyzje w sprawie wniosków
SELECT
  'decision:' || la.id::text,
  coalesce(la.decision_at, la.updated_at),
  la.decision_by,
  'wniosek',
  'Decyzja w sprawie wniosku',
  coalesce(la.admin_decision, '')
    || coalesce(' · ' || nullif(la.decision_reason, ''), ''),
  'loan_application',
  la.id
FROM public.loan_applications la
WHERE la.decision_by IS NOT NULL;

-- Widok czyta tabele z pominięciem RLS (uprawnienia właściciela),
-- więc bezpośredni dostęp blokujemy — dane wychodzą wyłącznie przez
-- funkcje RPC z kontrolą roli administratora.
REVOKE ALL ON public.v_team_activity FROM PUBLIC;
REVOKE ALL ON public.v_team_activity FROM anon;
REVOKE ALL ON public.v_team_activity FROM authenticated;

-- ---------- 2) Funkcje RPC (tylko administrator) ----------
CREATE OR REPLACE FUNCTION public.get_team_activity(p_limit integer DEFAULT 500)
RETURNS TABLE (
  id text,
  happened_at timestamptz,
  user_id uuid,
  user_name text,
  user_email text,
  user_role text,
  event_type text,
  title text,
  details text,
  object_type text,
  object_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Brak uprawnień administratora';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.happened_at,
    v.user_id,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    p.email,
    (
      SELECT ur.role::text
      FROM public.user_roles ur
      WHERE ur.user_id = v.user_id
      ORDER BY CASE ur.role::text
        WHEN 'posrednik' THEN 1
        WHEN 'operator' THEN 2
        WHEN 'operator_wewnetrzny' THEN 3
        WHEN 'administrator' THEN 4
        ELSE 5
      END
      LIMIT 1
    ),
    v.event_type,
    v.title,
    v.details,
    v.object_type,
    v.object_id
  FROM public.v_team_activity v
  LEFT JOIN public.profiles p ON p.user_id = v.user_id
  WHERE v.user_id IS NULL
     OR EXISTS (
          SELECT 1 FROM public.user_roles ur2
          WHERE ur2.user_id = v.user_id
            AND ur2.role::text IN ('administrator', 'operator', 'operator_wewnetrzny', 'posrednik')
        )
  ORDER BY v.happened_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 500), 1000));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_members()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  roles text[],
  last_sign_in_at timestamptz,
  last_action_at timestamptz,
  actions_30d bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Brak uprawnień administratora';
  END IF;

  RETURN QUERY
  SELECT
    s.user_id,
    coalesce(
      nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      p.email, u.email
    ),
    coalesce(p.email, u.email),
    s.roles,
    u.last_sign_in_at,
    st.last_action_at,
    coalesce(st.a30, 0)
  FROM (
    SELECT ur.user_id, array_agg(DISTINCT ur.role::text) AS roles
    FROM public.user_roles ur
    WHERE ur.role::text IN ('administrator', 'operator', 'operator_wewnetrzny', 'posrednik')
    GROUP BY ur.user_id
  ) s
  LEFT JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
  LEFT JOIN LATERAL (
    SELECT
      max(v.happened_at) AS last_action_at,
      count(*) FILTER (WHERE v.happened_at > now() - interval '30 days') AS a30
    FROM public.v_team_activity v
    WHERE v.user_id = s.user_id
  ) st ON true
  ORDER BY u.last_sign_in_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_activity(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_team_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_activity(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_members() TO authenticated, service_role;

-- ---------- 3) Automatyczny zapis do audit_logs ----------
-- Od teraz zmiany statusów i przypisań są rejestrowane niezależnie od
-- tego, z którego miejsca w aplikacji (lub automatu) pochodzą.
-- auth.uid() = NULL oznacza działanie systemowe (automatyzacja).
CREATE OR REPLACE FUNCTION public.log_team_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'loan_applications' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.audit_logs (user_id, object_type, object_id, action, previous_value, new_value)
      VALUES (auth.uid(), 'loan_application', NEW.id, 'status_change',
              jsonb_build_object('status', OLD.status),
              jsonb_build_object('status', NEW.status));
    END IF;
  ELSIF TG_TABLE_NAME = 'leads' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.audit_logs (user_id, object_type, object_id, action, previous_value, new_value)
      VALUES (auth.uid(), 'leads', NEW.id, 'status_change',
              jsonb_build_object('status', OLD.status),
              jsonb_build_object('status', NEW.status));
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.audit_logs (user_id, object_type, object_id, action, previous_value, new_value)
      VALUES (auth.uid(), 'leads', NEW.id, 'assignment_change',
              jsonb_build_object('assigned_to', OLD.assigned_to),
              jsonb_build_object('assigned_to', NEW.assigned_to));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_loan_status ON public.loan_applications;
CREATE TRIGGER trg_audit_loan_status
  AFTER UPDATE OF status ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.log_team_audit();

DROP TRIGGER IF EXISTS trg_audit_lead_changes ON public.leads;
CREATE TRIGGER trg_audit_lead_changes
  AFTER UPDATE OF status, assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_team_audit();
