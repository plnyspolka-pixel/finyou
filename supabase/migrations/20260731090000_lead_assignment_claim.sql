-- =====================================================================
-- PRZYDZIAŁ LEADÓW DO POŚREDNIKÓW / OPERATORÓW-PARTNERÓW ("Moje leady")
--
-- Lead zostaje przypisany do partnera (leads.assigned_to) w momencie jego
-- pierwszej akcji roboczej na leadzie:
--   - odsłonięcie numeru telefonu / adresu e-mail / kanału Messenger
--     (channel 'reveal'),
--   - zapisanie notatki (channel 'manual_note'),
--   - klik połączenia (channel 'call', outbound).
-- Pierwszy się liczy — przypisania nie nadpisujemy. Akcje personelu
-- wewnętrznego nie przypinają leada (przypisania robią jawnie w adminie).
--
-- Trigger na lead_communications zamiast rozsiewania logiki po kodzie:
-- działa dla każdej ścieżki zapisu (panel pośrednika, dialog wyniku
-- rozmowy, przyszłe integracje).
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to
  ON public.leads (assigned_to)
  WHERE assigned_to IS NOT NULL;

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
     SET assigned_to = NEW.created_by
   WHERE id = NEW.lead_id
     AND assigned_to IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leadcomm_claim_lead ON public.lead_communications;
CREATE TRIGGER leadcomm_claim_lead
  AFTER INSERT ON public.lead_communications
  FOR EACH ROW EXECUTE FUNCTION public.trg_claim_lead_on_partner_action();

-- ---------------------------------------------------------------------
-- BACKFILL — najwcześniejsza akcja robocza partnera przypina lead
-- (o ile admin nie przypisał go wcześniej ręcznie).
-- ---------------------------------------------------------------------
WITH first_action AS (
  SELECT DISTINCT ON (lc.lead_id) lc.lead_id, lc.created_by
  FROM public.lead_communications lc
  WHERE lc.lead_id IS NOT NULL
    AND lc.created_by IS NOT NULL
    AND (
      (lc.channel = 'call' AND lc.direction = 'outbound')
      OR lc.channel IN ('manual_note', 'reveal')
    )
    AND NOT public.is_internal_staff(lc.created_by)
    AND public.is_external_partner(lc.created_by)
  ORDER BY lc.lead_id, lc.created_at ASC
)
UPDATE public.leads l
   SET assigned_to = fa.created_by
  FROM first_action fa
 WHERE l.id = fa.lead_id
   AND l.assigned_to IS NULL;
