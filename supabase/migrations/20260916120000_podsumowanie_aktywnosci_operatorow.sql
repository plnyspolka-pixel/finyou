-- =========================================================
-- PODSUMOWANIE AKTYWNOŚCI OPERATORÓW (/admin/zespol-aktywnosc)
--
-- Strona „Zespół i aktywność" pokazywała surowy feed zdarzeń: żeby
-- odpowiedzieć na pytanie „ile ten operator zrobił w tym tygodniu",
-- trzeba było przewijać setki wpisów i liczyć w głowie. Ta migracja
-- dokłada warstwę zbiorczą — jeden wiersz na osobę, liczby w kolumnach.
--
-- Przy okazji domykamy dwie dziury w źródle danych:
--
--  1) Odpowiedzi wysyłane ręcznie ze skrzynki (e-mail, Messenger/IG,
--     czat) nie miały `lead_communications.created_by` — kto wysłał,
--     zapisuje się w `metadata->>'sent_by'` (tak samo rozpoznaje
--     człowieka od bota skrzynka w panelu). Widok filtrował po
--     `created_by IS NOT NULL`, więc cała ręczna korespondencja
--     znikała z aktywności zespołu. Teraz autorem zdarzenia jest
--     `coalesce(created_by, metadata->>'sent_by')`.
--
--  2) Feed rozróżniał zdarzenia wyłącznie po polskim tytule
--     („Notatka do leada" itd.). Do liczenia to za mało pewne, więc
--     widok dostaje kolumnę `activity_kind` — stabilny klucz, po
--     którym agreguje funkcja podsumowania i który nie zmieni się
--     przy poprawce literówki w etykiecie.
-- =========================================================

-- ---------- 1) Widok aktywności + activity_kind ----------
-- CREATE OR REPLACE VIEW dopuszcza tylko dopisanie kolumn na końcu,
-- więc kolejność pierwszych ośmiu zostaje bez zmian.
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
  a.object_id                                  AS object_id,
  CASE
    WHEN a.action = 'status_change'     THEN 'status'
    WHEN a.action = 'assignment_change' THEN 'przypisanie'
    ELSE 'inne'
  END                                          AS activity_kind
FROM public.audit_logs a

UNION ALL

-- Komunikacja z leadem wykonana przez człowieka: notatki, telefony,
-- odsłonięcia danych (`created_by`) oraz ręczne odpowiedzi ze skrzynki
-- (`metadata->>'sent_by'`). Wysyłki automatów nie mają ani jednego,
-- ani drugiego — i nadal do zespołu nie trafiają.
SELECT
  'comm:' || c.id::text,
  c.created_at,
  coalesce(
    c.created_by,
    CASE
      WHEN c.metadata->>'sent_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (c.metadata->>'sent_by')::uuid
    END
  ),
  'komunikacja',
  CASE c.channel
    WHEN 'manual_note'   THEN 'Notatka do leada'
    WHEN 'reveal'        THEN 'Podgląd danych leada'
    WHEN 'call'          THEN 'Rozmowa telefoniczna z leadem'
    WHEN 'sms'           THEN 'SMS do leada'
    WHEN 'email'         THEN 'E-mail do leada'
    WHEN 'messenger'     THEN 'Wiadomość Messenger/IG do leada'
    WHEN 'chat'          THEN 'Odpowiedź na czacie'
    WHEN 'chat_inwestor' THEN 'Odpowiedź na czacie inwestora'
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
  c.lead_id,
  CASE c.channel
    WHEN 'manual_note'   THEN 'notatka'
    WHEN 'reveal'        THEN 'podglad'
    WHEN 'call'          THEN 'telefon'
    WHEN 'sms'           THEN 'sms'
    WHEN 'email'         THEN 'email'
    WHEN 'messenger'     THEN 'messenger'
    WHEN 'chat'          THEN 'czat'
    WHEN 'chat_inwestor' THEN 'czat'
    ELSE 'inne'
  END
FROM public.lead_communications c
LEFT JOIN public.leads l ON l.id = c.lead_id
WHERE c.created_by IS NOT NULL
   OR c.metadata->>'sent_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

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
  d.loan_application_id,
  'dokument'
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
  l.id,
  'lead_nietrafiony'
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
  la.id,
  'decyzja'
FROM public.loan_applications la
WHERE la.decision_by IS NOT NULL;

-- Widok czyta tabele z pominięciem RLS (uprawnienia właściciela),
-- więc bezpośredni dostęp zostaje zablokowany — dane wychodzą wyłącznie
-- przez funkcje RPC z kontrolą roli administratora.
REVOKE ALL ON public.v_team_activity FROM PUBLIC;
REVOKE ALL ON public.v_team_activity FROM anon;
REVOKE ALL ON public.v_team_activity FROM authenticated;

-- ---------- 2) Indeksy pod okno czasowe ----------
-- Podsumowanie pyta o „ostatnie N dni" po całym widoku, a UNION ALL
-- przepycha warunek do gałęzi. Bez indeksu na samej dacie każda gałąź
-- kończy się seq scanem rosnącej tabeli — a o `statement timeout` na
-- `lead_communications` ten projekt już się potknął.
CREATE INDEX IF NOT EXISTS idx_leadcomm_created_at
  ON public.lead_communications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON public.audit_logs (user_id, created_at DESC);

-- ---------- 3) RPC: podsumowanie na osobę ----------
CREATE OR REPLACE FUNCTION public.get_operator_activity_summary(p_days integer DEFAULT 30)
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  roles text[],
  role_main text,
  calls bigint,
  sms bigint,
  emails bigint,
  messenger bigint,
  chats bigint,
  notes bigint,
  reveals bigint,
  documents bigint,
  status_changes bigint,
  assignments bigint,
  decisions bigint,
  lead_flags bigint,
  other bigint,
  total bigint,
  leads_touched bigint,
  active_days bigint,
  last_action_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_od timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'Brak uprawnień administratora';
  END IF;

  v_od := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));

  RETURN QUERY
  WITH osoby AS (
    SELECT ur.user_id, array_agg(DISTINCT ur.role::text) AS roles
    FROM public.user_roles ur
    WHERE ur.role::text IN ('administrator', 'operator', 'operator_wewnetrzny', 'posrednik')
    GROUP BY ur.user_id
  ),
  akt AS (
    SELECT v.user_id, v.activity_kind, v.happened_at, v.object_type, v.object_id
    FROM public.v_team_activity v
    WHERE v.user_id IS NOT NULL
      AND v.happened_at >= v_od
  )
  SELECT
    o.user_id,
    coalesce(
      nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      p.email, u.email
    ),
    coalesce(p.email, u.email),
    o.roles,
    (
      SELECT ur.role::text
      FROM public.user_roles ur
      WHERE ur.user_id = o.user_id
      ORDER BY CASE ur.role::text
        WHEN 'posrednik' THEN 1
        WHEN 'operator' THEN 2
        WHEN 'operator_wewnetrzny' THEN 3
        WHEN 'administrator' THEN 4
        ELSE 5
      END
      LIMIT 1
    ),
    coalesce(s.calls, 0),
    coalesce(s.sms, 0),
    coalesce(s.emails, 0),
    coalesce(s.messenger, 0),
    coalesce(s.chats, 0),
    coalesce(s.notes, 0),
    coalesce(s.reveals, 0),
    coalesce(s.documents, 0),
    coalesce(s.status_changes, 0),
    coalesce(s.assignments, 0),
    coalesce(s.decisions, 0),
    coalesce(s.lead_flags, 0),
    coalesce(s.other, 0),
    coalesce(s.total, 0),
    coalesce(s.leads_touched, 0),
    coalesce(s.active_days, 0),
    s.last_action_at,
    u.last_sign_in_at
  FROM osoby o
  LEFT JOIN auth.users u ON u.id = o.user_id
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE a.activity_kind = 'telefon')          AS calls,
      count(*) FILTER (WHERE a.activity_kind = 'sms')              AS sms,
      count(*) FILTER (WHERE a.activity_kind = 'email')            AS emails,
      count(*) FILTER (WHERE a.activity_kind = 'messenger')        AS messenger,
      count(*) FILTER (WHERE a.activity_kind = 'czat')             AS chats,
      count(*) FILTER (WHERE a.activity_kind = 'notatka')          AS notes,
      count(*) FILTER (WHERE a.activity_kind = 'podglad')          AS reveals,
      count(*) FILTER (WHERE a.activity_kind = 'dokument')         AS documents,
      count(*) FILTER (WHERE a.activity_kind = 'status')           AS status_changes,
      count(*) FILTER (WHERE a.activity_kind = 'przypisanie')      AS assignments,
      count(*) FILTER (WHERE a.activity_kind = 'decyzja')          AS decisions,
      count(*) FILTER (WHERE a.activity_kind = 'lead_nietrafiony') AS lead_flags,
      count(*) FILTER (WHERE a.activity_kind = 'inne')             AS other,
      count(*)                                                     AS total,
      -- Gałęzie widoku nazywają leada raz 'lead' (komunikacja), raz 'leads'
      -- (dziennik audytu) — liczymy oba, inaczej zmiany statusu leada
      -- nie policzyłyby się jako dotknięty lead.
      count(DISTINCT a.object_id) FILTER (
        WHERE a.object_type IN ('lead', 'leads') AND a.object_id IS NOT NULL
      )                                                            AS leads_touched,
      -- Dzień roboczy liczymy w strefie warszawskiej: zdarzenie o 23:30
      -- ma należeć do dnia, w którym operator faktycznie pracował.
      count(DISTINCT (a.happened_at AT TIME ZONE 'Europe/Warsaw')::date) AS active_days,
      max(a.happened_at)                                           AS last_action_at
    FROM akt a
    WHERE a.user_id = o.user_id
  ) s ON true
  ORDER BY coalesce(s.total, 0) DESC, u.last_sign_in_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_operator_activity_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operator_activity_summary(integer) TO authenticated, service_role;

ANALYZE public.lead_communications;
ANALYZE public.audit_logs;
