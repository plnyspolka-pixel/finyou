CREATE POLICY loans_client_insert ON public.loan_applications
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = loan_applications.client_id AND c.user_id = auth.uid()));