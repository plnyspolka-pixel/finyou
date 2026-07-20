-- =====================================================================
-- DARMOWE KONTO INWESTORA.
--  - przeglądanie ofert: zdjęcia + zanonimizowana treść KW (przez bezpieczne
--    funkcje serwerowe — bez otwierania pełnych tabel),
--  - limity (okno kroczące 365 dni, wyłącznie dla kwot ≤ 255 550 zł):
--    maks. 5 złożonych ofert i maks. 2 zawarte pożyczki; kwoty POWYŻEJ progu
--    — bez limitu liczby,
--  - maksymalne oprocentowanie = odsetki maksymalne (art. 359 §2¹ KC),
--    egzekwowane w funkcji serwerowej na podstawie bieżącej stopy NBP,
--  - trzy darmowe lekcje Akademii Inwestora.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Wykorzystanie limitów darmowego konta (okno 365 dni, kwoty ≤ progu).
--    „Zawarta pożyczka" = oferta zaakceptowana przez klienta.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.free_investor_usage(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_threshold constant numeric := 255550;
  v_offers int := 0;
  v_loans int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id
     AND NOT (public.has_role(auth.uid(),'administrator') OR public.is_internal_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;

  SELECT count(*) INTO v_offers
  FROM public.investor_offers io
  JOIN public.investors i ON i.id = io.investor_id
  WHERE i.user_id = _user_id
    AND io.submitted_at IS NOT NULL
    AND io.submitted_at >= now() - interval '365 days'
    AND io.offer_status <> 'szkic'
    AND COALESCE(io.proposed_amount, 0) <= v_threshold;

  SELECT count(*) INTO v_loans
  FROM public.investor_offers io
  JOIN public.investors i ON i.id = io.investor_id
  WHERE i.user_id = _user_id
    AND io.offer_status = 'zaakceptowana_przez_klienta'
    AND COALESCE(io.client_decision_at, io.updated_at) >= now() - interval '365 days'
    AND COALESCE(io.proposed_amount, 0) <= v_threshold;

  RETURN jsonb_build_object(
    'offersLast365', v_offers,
    'loansLast365', v_loans,
    'offerLimit', 5,
    'loanLimit', 2,
    'thresholdPln', v_threshold
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.free_investor_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.free_investor_usage(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. RLS: inwestor widzi WŁASNE oferty także bez płatnego dostępu
--    (darmowe konto składa oferty w ramach limitu). Zapisy pozostają
--    bramkowane: płatny — przez politykę ALL, darmowy — przez funkcję
--    serwerową (service_role) z limitami.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS offers_investor_own_select ON public.investor_offers;
CREATE POLICY offers_investor_own_select ON public.investor_offers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Darmowe lekcje Akademii Inwestora.
-- ---------------------------------------------------------------------
ALTER TABLE public.training_videos
  ADD COLUMN IF NOT EXISTS free_lesson boolean NOT NULL DEFAULT false;

-- Oznacz istniejące lekcje po tytule (bez duplikowania), a brakujące dodaj.
UPDATE public.training_videos SET free_lesson = true
WHERE lower(title) IN (
  lower('Wprowadzenie do rynku pożyczek pod hipotekę'),
  lower('Interpretacja wyłączeń z ustawy o kredycie konsumenckim'),
  lower('Aspekty prawne udzielania pożyczek')
);

INSERT INTO public.training_videos (title, description, category, is_published, sort_order, free_lesson)
SELECT t.title, t.description, 'Podstawy', true, t.sort_order, true
FROM (VALUES
  ('Wprowadzenie do rynku pożyczek pod hipotekę',
   'Darmowa lekcja: jak działa rynek pożyczek zabezpieczonych hipoteką i jaka jest w nim rola inwestora.', 1),
  ('Interpretacja wyłączeń z ustawy o kredycie konsumenckim',
   'Darmowa lekcja: kiedy pożyczka prywatna nie podlega ustawie o kredycie konsumenckim i co to oznacza dla inwestora.', 2),
  ('Aspekty prawne udzielania pożyczek',
   'Darmowa lekcja: umowa pożyczki, zabezpieczenia i odsetki maksymalne — ramy prawne dla inwestora prywatnego.', 3)
) AS t(title, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.training_videos tv WHERE lower(tv.title) = lower(t.title)
);

-- Katalog lekcji: darmowe lekcje widoczne dla każdego konta inwestora.
DROP POLICY IF EXISTS training_viewers_select ON public.training_videos;
CREATE POLICY training_viewers_select ON public.training_videos
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND (
      public.is_internal_staff(auth.uid())
      OR (public.has_role(auth.uid(),'inwestor') AND public.investor_has_full_access(auth.uid()))
      OR public.broker_has_paid_access(auth.uid())
      OR (free_lesson = true AND public.has_role(auth.uid(),'inwestor'))
    )
  );

-- Pliki wideo darmowych lekcji: dostęp dla każdego inwestora.
DROP POLICY IF EXISTS training_videos_free_lesson_read ON storage.objects;
CREATE POLICY training_videos_free_lesson_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'training-videos'
    AND public.has_role(auth.uid(),'inwestor')
    AND EXISTS (
      SELECT 1 FROM public.training_videos tv
      WHERE tv.free_lesson = true
        AND tv.is_published = true
        AND tv.file_path = storage.objects.name
    )
  );
