DO $$
DECLARE
  app_ids uuid[];
BEGIN
  SELECT array_agg(la.id) INTO app_ids
  FROM loan_applications la
  LEFT JOIN clients c ON c.id = la.client_id
  WHERE la.source = 'przykladowy'
     OR (c.first_name ILIKE 'Filip' AND c.last_name ILIKE 'Bielak')
     OR (c.first_name ILIKE 'Ewa' AND c.last_name ILIKE 'Kuczera')
     OR (c.first_name ILIKE 'Alina' AND c.last_name ILIKE 'Stacho%');

  IF app_ids IS NULL THEN RETURN; END IF;

  DELETE FROM properties WHERE loan_application_id = ANY(app_ids);
  DELETE FROM documents WHERE loan_application_id = ANY(app_ids);
  DELETE FROM investor_offers WHERE loan_application_id = ANY(app_ids);
  DELETE FROM offer_distributions WHERE loan_application_id = ANY(app_ids);
  DELETE FROM loan_applications WHERE id = ANY(app_ids);
END $$;