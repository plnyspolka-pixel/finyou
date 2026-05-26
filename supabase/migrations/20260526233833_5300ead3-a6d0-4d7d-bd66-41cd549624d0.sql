DROP POLICY IF EXISTS offers_client_select ON public.investor_offers;
CREATE POLICY offers_client_select ON public.investor_offers FOR SELECT TO authenticated
USING (
  (offer_status = ANY (ARRAY['zlozona'::offer_status, 'wyslana_do_klienta'::offer_status, 'zaakceptowana_przez_klienta'::offer_status, 'odrzucona_przez_klienta'::offer_status]))
  AND EXISTS (
    SELECT 1 FROM loan_applications la JOIN clients c ON c.id = la.client_id
    WHERE la.id = investor_offers.loan_application_id AND c.user_id = auth.uid()
  )
);