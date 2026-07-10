-- Backfill `properties.photos` ze zdjęć leżących wyłącznie w tabeli `documents`.
--
-- Wnioski złożone przez formularz landingowy zapisywały zdjęcia tylko do bucketu
-- Storage i tabeli `documents` (document_type = nazwa bucketu, np. `property_photos`),
-- a kolumna `properties.photos` pozostawała pusta. Miniaturki/galerie, które czytają
-- `properties.photos`, przez to nic nie pokazywały. Uzupełniamy je z dokumentów będących
-- faktycznymi zdjęciami nieruchomości (tylko obrazki, bez skanów typu ownership_deed/kw).
-- Nie nadpisujemy istniejących wartości.

UPDATE public.properties p
SET photos = sub.paths
FROM (
  SELECT d.loan_application_id,
         array_agg(d.file_path ORDER BY d.created_at) AS paths
  FROM public.documents d
  WHERE d.file_path IS NOT NULL
    AND d.document_type IN (
      'property_photos', 'zdjecie_nieruchomosci', 'zdjecia_nieruchomosci',
      'zdjecia_pomieszczen', 'zdjecia_bryly', 'zdjecia_lokalu', 'klient_upload'
    )
    AND d.file_path ~* '\.(jpg|jpeg|png|gif|webp|heic|bmp)$'
  GROUP BY d.loan_application_id
) sub
WHERE p.loan_application_id = sub.loan_application_id
  AND (p.photos IS NULL OR array_length(p.photos, 1) IS NULL OR array_length(p.photos, 1) = 0);
