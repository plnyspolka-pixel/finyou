-- =====================================================================
-- WYŁĄCZNOŚĆ NA PRZYPIĘTY LEAD (2 DNI, ODNAWIALNA)
--
-- Przypięcie leada (leads.assigned_to) daje partnerowi wyłączność przez
-- 2 dni (leads.claim_expires_at). Każda kolejna akcja robocza posiadacza
-- (odsłonięcie kontaktu, notatka, klik połączenia) odnawia okno o kolejne
-- 2 dni. Bez działania w oknie lead wraca do wspólnej puli — widzą go
-- znów wszyscy partnerzy, a pierwszy, który wykona akcję, przejmuje
-- przypięcie (dotychczasowemu znika z „Moich leadów").
--
-- Reguły spójne w RLS i triggerze:
--  - lead trzymany na wyłączność = assigned_to ustawione ORAZ
--    (claim_expires_at IS NULL LUB claim_expires_at > now());
--    claim_expires_at IS NULL przy ustawionym assigned_to oznacza trwałe
--    przypisanie ręczne (admin) — nieprzejmowalne przez partnerów,
--  - partner widzi lead z puli, gdy: wniosek nierozpoczęty ORAZ (lead
--    nieprzypięty LUB przypięty do niego LUB wyłączność wygasła).
-- =====================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

-- ---------------------------------------------------------------------
-- BACKFILL — przypięcia partnerów z poprzedniej migracji dostają okno
-- liczone od ich ostatniej akcji na leadzie (mogło już wygasnąć — wtedy
-- lead od razu jest z powrotem w puli).
-- ---------------------------------------------------------------------
UPDATE public.leads l
   SET claim_expires_at = la.last_at + interval '2 days'
  FROM (
    SELECT lc.lead_id, lc.created_by, max(lc.created_at) AS last_at
    FROM public.lead_communications lc
    WHERE lc.lead_id IS NOT NULL
      AND lc.created_by IS NOT NULL
      AND (
        (lc.channel = 'call' AND lc.direction = 'outbound')
        OR lc.channel IN ('manual_note', 'reveal')
      )
    GROUP BY lc.lead_id, lc.created_by
  ) la
 WHERE l.id = la.lead_id
   AND l.assigned_to = la.created_by
   AND l.claim_expires_at IS NULL
   AND NOT public.is_internal_staff(l.assigned_to)
   AND public.is_external_partner(l.assigned_to);

-- ---------------------------------------------------------------------
-- Przypięcie / odnowienie / przejęcie przy akcji partnera.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_claim_lead_on_partner_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (NEW.channel = 'call' AND NEW.direction = 'outbound')
    OR NEW.channel IN ('manual_note', 'reveal')
  ) THEN
    RETURN NEW;
  END IF;
  -- Tylko partner zewnętrzny; personel wewnętrzny nie przypina leadów
  -- swoimi notatkami/telefonami.
  IF public.is_internal_staff(NEW.created_by)
     OR NOT public.is_external_partner(NEW.created_by) THEN
    RETURN NEW;
  END IF;

  UPDATE public.leads
     SET assigned_to = NEW.created_by,
         claim_expires_at = now() + interval '2 days'
   WHERE id = NEW.lead_id
     AND (
       assigned_to IS NULL                                   -- wolny → przypięcie
       OR assigned_to = NEW.created_by                       -- posiadacz → odnowienie
       OR (claim_expires_at IS NOT NULL
           AND claim_expires_at <= now())                    -- wygasła wyłączność → przejęcie
     );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- Widoczność leada z puli dla danego partnera (RLS lead_communications
-- i leads korzystają z tej samej reguły).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_pool_visible(_lead_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id
      AND l.application_started_at IS NULL
      AND (
        l.assigned_to IS NULL
        OR l.assigned_to = _uid
        OR (l.claim_expires_at IS NOT NULL AND l.claim_expires_at <= now())
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.lead_pool_visible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_pool_visible(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS: leads — wyłączność w puli partnerskiej.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS leads_partner_pool_select ON public.leads;
CREATE POLICY leads_partner_pool_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    application_started_at IS NULL
    AND public.is_external_partner(auth.uid())
    AND (
      assigned_to IS NULL
      OR assigned_to = auth.uid()
      OR (claim_expires_at IS NOT NULL AND claim_expires_at <= now())
    )
  );

-- ---------------------------------------------------------------------
-- RLS: lead_communications — ta sama reguła widoczności.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS leadcomm_partner_pool_select ON public.lead_communications;
CREATE POLICY leadcomm_partner_pool_select ON public.lead_communications
  FOR SELECT TO authenticated
  USING (
    public.is_external_partner(auth.uid())
    AND lead_id IS NOT NULL
    AND public.lead_pool_visible(lead_id, auth.uid())
  );

DROP POLICY IF EXISTS leadcomm_partner_pool_insert ON public.lead_communications;
CREATE POLICY leadcomm_partner_pool_insert ON public.lead_communications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_external_partner(auth.uid())
    AND created_by = auth.uid()
    AND channel IN ('call', 'manual_note', 'reveal')
    AND lead_id IS NOT NULL
    AND public.lead_pool_visible(lead_id, auth.uid())
  );

-- Stara funkcja bez kontekstu użytkownika — już nieużywana.
DROP FUNCTION IF EXISTS public.lead_in_open_pool(uuid);
