UPDATE public.properties p
SET photos = sub.photo_paths
FROM (
  SELECT
    d.loan_application_id,
    array_agg(d.file_path ORDER BY d.created_at) AS photo_paths
  FROM public.documents d
  WHERE d.loan_application_id IN (
    '66fac338-5faa-495d-a8e0-86ace0483442'::uuid,
    '8749f8f1-ae62-48ff-8997-d41656f8857c'::uuid
  )
    AND d.document_type IN (
      'zdjecie_nieruchomosci',
      'zdjecia_nieruchomosci',
      'zdjecia_pomieszczen',
      'zdjecia_bryly',
      'zdjecia_lokalu',
      'klient_upload'
    )
    AND d.file_path IS NOT NULL
    AND COALESCE(d.file_name, d.file_path) ~* '\.(jpg|jpeg|png|gif|webp|heic|bmp)$'
  GROUP BY d.loan_application_id
) sub
WHERE p.loan_application_id = sub.loan_application_id;