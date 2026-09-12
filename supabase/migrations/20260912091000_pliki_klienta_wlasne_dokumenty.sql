-- Upload własnych dokumentów klienta (raport BIK) — domknięcie RLS na storage.
--
-- Objaw: w logach Postgresa seria „new row violates row-level security policy
-- for table objects" przy ręcznym dodawaniu pliku przez klienta. Upload leciał
-- z błędem, dokument nie zapisywał się w ogóle.
--
-- Przyczyna: raport BIK nie jest przypięty do wniosku — kluczem jest sam
-- użytkownik, więc ścieżka wygląda `documents/<user_id>/bik/...`. Polityka
-- `pliki_klienta_write` dopuszczała pod prefiksem `documents/` wyłącznie
-- drugi segment będący ID wniosku należącego do klienta (JOIN loan_applications
-- → clients). ID użytkownika nigdy nie spełni tego warunku, więc KAŻDY taki
-- upload leciał w 42501 — niezależnie od tego, ile razy klient próbował.
--
-- Naprawa: dodajemy gałąź „drugi segment = własny auth.uid()" do odczytu i
-- zapisu, oraz UPDATE/DELETE ograniczone do własnego katalogu (podmiana i
-- usunięcie raportu). Reszta polityki bez zmian — przepisujemy ją w całości,
-- bo CREATE POLICY nie umie „dodać warunku".
--
-- Stan bazowy: 20260719123238 (ostatnia wersja tych polityk).

-- ── Odczyt ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pliki_klienta_read ON storage.objects;
CREATE POLICY pliki_klienta_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      public.is_internal_staff(auth.uid())
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      OR (storage.foldername(name))[1] = (auth.uid())::text
      -- NOWE: własne dokumenty klienta niezwiązane z wnioskiem (np. raport BIK)
      OR (
        (storage.foldername(name))[1] IN ('property','documents')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
      OR (
        (storage.foldername(name))[1] IN ('property','documents','property_photos','property-photos')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      OR (
        public.has_role(auth.uid(), 'inwestor'::public.app_role)
        AND public.investor_has_full_access(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          WHERE (la.id)::text = (storage.foldername(name))[2]
            AND la.available_to_investors = true
            AND la.deleted_at IS NULL
        )
      )
      OR (
        (storage.foldername(name))[1] = 'templates'
        AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
        AND public.investor_has_full_access(auth.uid())
      )
      OR (storage.foldername(name))[1] = 'marketing'
    )
  );

-- ── Zapis ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pliki_klienta_write ON storage.objects;
CREATE POLICY pliki_klienta_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pliki-klienta'
    AND (
      public.is_internal_staff(auth.uid())
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      -- NOWE: własne dokumenty klienta niezwiązane z wnioskiem (np. raport BIK)
      OR (
        (storage.foldername(name))[1] IN ('property','documents')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
      OR (
        (storage.foldername(name))[1] IN ('property','documents')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      OR (storage.foldername(name))[1] = 'attachments'
    )
  );

-- ── Podmiana / usunięcie (tylko własny katalog; reszta jak było) ─────────────
DROP POLICY IF EXISTS pliki_klienta_update ON storage.objects;
CREATE POLICY pliki_klienta_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      public.is_internal_staff(auth.uid())
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      OR (
        (storage.foldername(name))[1] IN ('property','documents')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
    )
  );

DROP POLICY IF EXISTS pliki_klienta_delete ON storage.objects;
CREATE POLICY pliki_klienta_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      public.is_internal_staff(auth.uid())
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      OR (
        (storage.foldername(name))[1] IN ('property','documents')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
    )
  );
