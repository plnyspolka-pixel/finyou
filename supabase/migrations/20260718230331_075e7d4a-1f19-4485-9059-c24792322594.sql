
GRANT SELECT ON public.loan_applications TO anon;
GRANT SELECT ON public.properties TO anon;

CREATE POLICY "public_embed_loans_select" ON public.loan_applications
  FOR SELECT TO anon
  USING (status IN ('szukamy_inwestora','warunki_zaakceptowane','dokumenty_przygotowanie_umowy','notariusz','zamkniete'));

CREATE POLICY "public_embed_properties_select" ON public.properties
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = properties.loan_application_id
      AND la.status IN ('szukamy_inwestora','warunki_zaakceptowane','dokumenty_przygotowanie_umowy','notariusz','zamkniete')
  ));
