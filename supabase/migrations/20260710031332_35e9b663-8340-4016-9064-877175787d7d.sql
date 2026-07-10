
DO $$
DECLARE
  app_ids uuid[] := ARRAY['4cdbde40-2a06-4e8c-89b1-770acfc77740','66d194a4-0120-497d-9eeb-cde13bd2227e']::uuid[];
  client_ids uuid[];
BEGIN
  SELECT array_agg(client_id) INTO client_ids FROM loan_applications WHERE id = ANY(app_ids);
  DELETE FROM offer_distributions WHERE loan_application_id = ANY(app_ids);
  DELETE FROM investor_offers WHERE loan_application_id = ANY(app_ids);
  DELETE FROM documents WHERE loan_application_id = ANY(app_ids);
  DELETE FROM properties WHERE loan_application_id = ANY(app_ids);
  DELETE FROM loan_applications WHERE id = ANY(app_ids);
  DELETE FROM clients WHERE id = ANY(client_ids);
END $$;
