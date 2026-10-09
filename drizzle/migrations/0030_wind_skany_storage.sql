-- Windykacja: wgrywanie skanów do Storage przez inwestora.
--
-- Moduł zapisuje skany (umowa, dowody wpłat, potwierdzenia nadania i odbioru)
-- w pliki-klienta/windykacja/<auth.uid()>/<sprawa albo „nowa”>/plik
-- klientem użytkownika (routes/inwestor.windykacja.*). Polityka z migracji
-- 20260803120000_windykacja_simplified nie trafiła do bazy produkcyjnej,
-- a pliki_klienta_write wpuszcza do tego katalogu tylko personel — inwestor
-- dostawał błąd RLS przy wgraniu umowy.
--
-- Dostęp jak w module (requireInvestorPro): personel albo inwestor
-- z pełnym dostępem (abonament), i tylko do własnego katalogu.
DROP POLICY IF EXISTS pliki_klienta_windykacja_own ON storage.objects;
CREATE POLICY pliki_klienta_windykacja_own ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] = 'windykacja'
    AND (storage.foldername(name))[2] = (auth.uid())::text
    AND (
      public.is_internal_staff(auth.uid())
      OR (public.has_role(auth.uid(), 'inwestor'::public.app_role)
          AND public.investor_has_full_access(auth.uid()))
    )
  )
  WITH CHECK (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] = 'windykacja'
    AND (storage.foldername(name))[2] = (auth.uid())::text
    AND (
      public.is_internal_staff(auth.uid())
      OR (public.has_role(auth.uid(), 'inwestor'::public.app_role)
          AND public.investor_has_full_access(auth.uid()))
    )
  );
