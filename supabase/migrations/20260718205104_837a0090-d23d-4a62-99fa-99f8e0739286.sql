
CREATE OR REPLACE FUNCTION public.dedup_leads()
RETURNS TABLE(merged_pairs int, remaining_leads bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pair RECORD;
  pairs_done int := 0;
BEGIN
  LOOP
    SELECT
      CASE WHEN a.created_at <= b.created_at THEN a.id ELSE b.id END AS keep_id,
      CASE WHEN a.created_at <= b.created_at THEN b.id ELSE a.id END AS drop_id
    INTO pair
    FROM leads a
    JOIN leads b ON a.id < b.id AND (
        (a.phone_normalized IS NOT NULL AND a.phone_normalized = b.phone_normalized)
     OR (a.email IS NOT NULL AND b.email IS NOT NULL AND lower(a.email) = lower(b.email))
    )
    LIMIT 1;

    EXIT WHEN pair IS NULL OR pair.keep_id IS NULL;

    UPDATE leads c SET
      first_name       = COALESCE(c.first_name, d.first_name),
      last_name        = COALESCE(c.last_name, d.last_name),
      email            = COALESCE(c.email, d.email),
      phone_raw        = COALESCE(c.phone_raw, d.phone_raw),
      phone_normalized = COALESCE(c.phone_normalized, d.phone_normalized),
      messenger_psid   = COALESCE(c.messenger_psid, d.messenger_psid),
      instagram_igsid  = COALESCE(c.instagram_igsid, d.instagram_igsid),
      meta_lead_id     = COALESCE(c.meta_lead_id, d.meta_lead_id),
      meta_form_id     = COALESCE(c.meta_form_id, d.meta_form_id),
      meta_campaign_id = COALESCE(c.meta_campaign_id, d.meta_campaign_id),
      google_ads_id    = COALESCE(c.google_ads_id, d.google_ads_id),
      utm_source       = COALESCE(c.utm_source, d.utm_source),
      utm_medium       = COALESCE(c.utm_medium, d.utm_medium),
      utm_campaign     = COALESCE(c.utm_campaign, d.utm_campaign),
      client_id        = COALESCE(c.client_id, d.client_id),
      loan_application_id = COALESCE(c.loan_application_id, d.loan_application_id),
      investor_id      = COALESCE(c.investor_id, d.investor_id),
      kw_number        = COALESCE(c.kw_number, d.kw_number),
      assigned_to      = COALESCE(c.assigned_to, d.assigned_to),
      source           = COALESCE(c.source, d.source),
      notes            = NULLIF(concat_ws(E'\n---\n', NULLIF(c.notes,''), NULLIF(d.notes,'')), ''),
      broker_notes     = NULLIF(concat_ws(E'\n---\n', NULLIF(c.broker_notes,''), NULLIF(d.broker_notes,'')), ''),
      application_data = COALESCE(d.application_data,'{}'::jsonb) || COALESCE(c.application_data,'{}'::jsonb),
      updated_at       = now()
    FROM leads d
    WHERE c.id = pair.keep_id AND d.id = pair.drop_id;

    UPDATE lead_communications     SET lead_id = pair.keep_id WHERE lead_id = pair.drop_id;
    UPDATE messenger_outbox        SET lead_id = pair.keep_id WHERE lead_id = pair.drop_id;
    UPDATE meta_capi_events        SET lead_id = pair.keep_id WHERE lead_id = pair.drop_id;
    UPDATE lead_attributions       SET lead_id = pair.keep_id WHERE lead_id = pair.drop_id;
    UPDATE lead_follow_up_schedule SET lead_id = pair.keep_id WHERE lead_id = pair.drop_id;
    UPDATE generated_documents     SET lead_id = pair.keep_id WHERE lead_id = pair.drop_id;

    DELETE FROM leads WHERE id = pair.drop_id;
    pairs_done := pairs_done + 1;

    IF pairs_done > 5000 THEN EXIT; END IF;
  END LOOP;

  RETURN QUERY SELECT pairs_done, (SELECT count(*) FROM leads);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dedup_leads() TO service_role;

SELECT * FROM public.dedup_leads();
