-- =====================================================================
-- ROLA 'posrednik' DLA PARTNERÓW ZEWNĘTRZNYCH:
--  - istniejący aktywni partnerzy dostają rolę 'posrednik' (bez masowego
--    usuwania historycznych ról — audyt poniżej),
--  - widok dla administratora: konta partnerskie, które nadal mają
--    historyczną rolę 'operator'.
-- =====================================================================

-- Aktywni partnerzy → rola 'posrednik' (idempotentnie).
INSERT INTO public.user_roles (user_id, role)
SELECT ap.user_id, 'posrednik'::public.app_role
FROM public.affiliate_partners ap
WHERE ap.user_id IS NOT NULL
  AND ap.status = 'active'
ON CONFLICT (user_id, role) DO NOTHING;

-- Widok audytowy: partnerzy z historyczną rolą 'operator' (do ręcznego
-- przeglądu przez administratora; nie usuwamy ról automatycznie).
CREATE OR REPLACE VIEW public.partner_operator_role_audit
WITH (security_invoker = true)
AS
SELECT
  ap.id            AS partner_id,
  ap.user_id,
  ap.status        AS partner_status,
  ap.first_name,
  ap.last_name,
  ap.company_name,
  ap.email,
  ur.created_at    AS operator_role_granted_at,
  EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ap.user_id AND ur2.role = 'posrednik'::public.app_role
  ) AS has_posrednik_role
FROM public.affiliate_partners ap
JOIN public.user_roles ur ON ur.user_id = ap.user_id AND ur.role = 'operator'::public.app_role
WHERE ap.user_id IS NOT NULL;

-- Widok jest security_invoker — dostęp wynika z RLS tabel bazowych
-- (affiliate_partners/user_roles: administrator widzi wszystko).
GRANT SELECT ON public.partner_operator_role_audit TO authenticated;
