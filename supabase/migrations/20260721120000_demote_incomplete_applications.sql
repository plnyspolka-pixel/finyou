-- Porządek między leadem a wnioskiem: usuń z „kompletnych wniosków" sprawy bez
-- podstawowych wymaganych danych.
--
-- Tło: wcześniejsze bulk-migracje (20260709210000_unify_loan_statuses.sql:39-62
-- oraz 20260718110000_odzyskaj_dane_zgubione_przy_dedup.sql) promowały wnioski
-- do statusu 'szukamy_inwestora' / available_to_investors = true / 100%
-- kompletności WYŁĄCZNIE na podstawie obecności JAKIEGOKOLWIEK tekstu w polu KW
-- + zdjęć/dokumentów. Nie sprawdzały prawdziwego imienia i nazwiska klienta,
-- kontaktu (telefon/e-mail), kwoty pożyczki ani POPRAWNOŚCI numeru KW (np.
-- śmieć „PRZESŁANY"). W efekcie w widoku „Kompletne" i w marketplace inwestora
-- lądowały anonimowe wnioski, do których nie da się zadzwonić.
--
-- Ta migracja cofa takie wnioski do 'kompletowanie_danych' i zdejmuje flagę
-- dopuszczenia do inwestorów. Definicja „podstawowych danych" jest zgodna z
-- src/lib/application-completeness.ts (jedyne źródło prawdy w kodzie).
--
-- Zakres bezpieczeństwa: NIE ruszamy spraw z aktywną/zamkniętą transakcją
-- (warunki_zaakceptowane, dokumenty_przygotowanie_umowy, notariusz, zamkniete) —
-- tam deal już się toczy i cofanie statusu mogłoby go zaburzyć.

UPDATE public.loan_applications la
SET
  available_to_investors = false,
  status = CASE WHEN la.status = 'szukamy_inwestora' THEN 'kompletowanie_danych' ELSE la.status END,
  completeness_percent = 0,
  updated_at = now()
WHERE (la.available_to_investors = true OR la.status = 'szukamy_inwestora')
  AND la.status NOT IN (
    'warunki_zaakceptowane', 'dokumenty_przygotowanie_umowy', 'notariusz', 'zamkniete'
  )
  AND NOT (
    -- (1) prawdziwe imię i nazwisko klienta (nie placeholder ze stuba leada)
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = la.client_id
        AND btrim(coalesce(c.first_name, '')) <> ''
        AND btrim(coalesce(c.last_name, '')) <> ''
        AND lower(btrim(c.first_name)) NOT IN (
          'z leada', 'lead', '(brak nazwiska)', '(brak imienia)',
          'brak nazwiska', 'brak imienia', '—', '-', 'brak'
        )
        AND lower(btrim(c.last_name)) NOT IN (
          'z leada', 'lead', '(brak nazwiska)', '(brak imienia)',
          'brak nazwiska', 'brak imienia', '—', '-', 'brak'
        )
    )
    -- (2) kontakt: telefon LUB e-mail
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = la.client_id
        AND (btrim(coalesce(c.phone, '')) <> '' OR btrim(coalesce(c.email, '')) <> '')
    )
    -- (3) kwota pożyczki
    AND coalesce(la.loan_amount, 0) > 0
    -- (4) numer KW zawierający realny numer księgi (7-8 cyfr) — odrzuca „PRZESŁANY"
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.loan_application_id = la.id
        AND upper(coalesce(p.land_register_number, '')) ~ '[0-9]{7,8}'
    )
    -- (5) media: zdjęcia nieruchomości ALBO dokumenty
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
    )
  );
