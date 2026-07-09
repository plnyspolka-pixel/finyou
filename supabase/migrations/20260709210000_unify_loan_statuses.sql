-- Ujednolicenie statusów wniosków w CAŁYM serwisie.
-- Enum `public.loan_status` zawiera stare wartości pozostawione jako aliasy —
-- ten backfill mapuje istniejące dane na 9 kanonicznych statusów, zgodnie z
-- `src/lib/loan-status.ts` (LEGACY_STATUS_MAP). Dzięki temu żaden widok nie
-- pokazuje już surowego, starego statusu (np. „wyslany_do_inwestorow").

-- 1) Mapowanie starych wartości enuma na kanoniczne.
UPDATE public.loan_applications SET status = 'kompletowanie_danych'
  WHERE status IN ('w_trakcie_uzupelniania', 'braki_w_dokumentach');

UPDATE public.loan_applications SET status = 'kontakt'
  WHERE status IN ('do_kontaktu', 'w_follow_upie');

-- „wysłany do inwestorów" == „szukamy inwestora" (jeden, wspólny status).
UPDATE public.loan_applications SET status = 'szukamy_inwestora'
  WHERE status IN (
    'wniosek_kompletny', 'do_analizy', 'rokuje',
    'wyslany_do_inwestorow', 'oferta_od_inwestora', 'oferta_przekazana_klientowi'
  );

UPDATE public.loan_applications SET status = 'warunki_zaakceptowane'
  WHERE status = 'zaakceptowany_przez_klienta';

UPDATE public.loan_applications SET status = 'dokumenty_przygotowanie_umowy'
  WHERE status IN ('do_umowy', 'oczekuje_podpisania_umowy');

UPDATE public.loan_applications SET status = 'notariusz'
  WHERE status IN ('umowa_podpisana', 'oczekuje_ustanowienia_zabezpieczen');

UPDATE public.loan_applications SET status = 'zamkniete'
  WHERE status IN (
    'zabezpieczenia_ustanowione', 'dokumenty_dostarczone_do_inwestora',
    'oczekuje_wyplaty', 'wyplacony', 'wniosek_odrzucony',
    'nie_rokuje', 'zamkniety', 'archiwalny'
  );

-- 2) Reguła: numer KW + (zdjęcia nieruchomości ALBO dokumenty) => „szukamy inwestora".
--    Taki wniosek nie jest już nowym leadem — mamy komplet potrzebny inwestorowi.
UPDATE public.loan_applications la
SET status = 'szukamy_inwestora',
    available_to_investors = true,
    completeness_percent = 100,
    updated_at = now()
WHERE la.status IN ('nowy_lead', 'brak_kontaktu', 'kontakt', 'kompletowanie_danych')
  AND EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.loan_application_id = la.id
      AND p.land_register_number IS NOT NULL
      AND btrim(p.land_register_number) <> ''
  )
  AND (
    EXISTS (
      SELECT 1 FROM public.properties p2
      WHERE p2.loan_application_id = la.id
        AND p2.photos IS NOT NULL
        AND array_length(p2.photos, 1) > 0
    )
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.loan_application_id = la.id
    )
  );
