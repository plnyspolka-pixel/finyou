
CREATE OR REPLACE FUNCTION public.increment_email_variant_sent(p_variant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.loan_reminder_email_variants SET sent_count = sent_count + 1 WHERE id = p_variant_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_email_variant_opened(p_variant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.loan_reminder_email_variants SET opened_count = opened_count + 1 WHERE id = p_variant_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_email_variant_clicked(p_variant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.loan_reminder_email_variants SET clicked_count = clicked_count + 1 WHERE id = p_variant_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_email_variant_sent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_email_variant_opened(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_email_variant_clicked(uuid) TO service_role;
