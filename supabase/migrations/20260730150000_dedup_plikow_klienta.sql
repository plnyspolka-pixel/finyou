-- Deduplikacja zdjęć i plików klienta po TREŚCI (SHA-256).
--
-- Te same pliki trafiały do systemu wielokrotnie: ponowne wysyłki maili z tym
-- samym załącznikiem (cytowane wątki, retry webhooka), re-send na Messengerze,
-- dwukrotne wgranie tego samego zdjęcia w formularzu / panelu. Każda kopia
-- dostawała unikalną ścieżkę w Storage (stempel czasowy + losowy sufiks),
-- więc dotychczasowa deduplikacja po ścieżce niczego nie łapała.
--
-- Wprowadzamy:
--   1) documents.content_hash — SHA-256 (hex) treści pliku, zapisywany przy
--      każdym nowym wpisie; pozwala pomijać duplikaty na poziomie rekordów.
--   2) rejestr client_file_hashes — mapowanie hash → istniejąca ścieżka
--      w buckecie `pliki-klienta`, per wniosek (loan_application_id) lub per
--      lead. Uploader sprawdza rejestr PRZED wgraniem i przy trafieniu zwraca
--      istniejącą ścieżkę zamiast tworzyć kolejną kopię binarki.

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_loan_content_hash
  ON public.documents (loan_application_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.client_file_hashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT,
  byte_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (loan_application_id IS NOT NULL OR lead_id IS NOT NULL)
);

-- Unikalność per zakres (wniosek / lead). Kolumny zakresu są nullable, stąd
-- indeksy częściowe — duplikat kończy się 23505, które aplikacja ignoruje
-- (dedup jest best-effort; wyścig dwóch równoległych uploadów jest nieszkodliwy,
-- bo przegrany po prostu zostawia już istniejący wpis).
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_file_hashes_app
  ON public.client_file_hashes (loan_application_id, content_hash)
  WHERE loan_application_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_file_hashes_lead
  ON public.client_file_hashes (lead_id, content_hash)
  WHERE lead_id IS NOT NULL AND loan_application_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_file_hashes_path
  ON public.client_file_hashes (storage_path);

ALTER TABLE public.client_file_hashes ENABLE ROW LEVEL SECURITY;

-- Polityki odbijają dostęp do public.documents: staff wszystko, pośrednik
-- w obrębie własnych wniosków, klient w obrębie swojego wniosku.
DROP POLICY IF EXISTS client_file_hashes_staff_all ON public.client_file_hashes;
CREATE POLICY client_file_hashes_staff_all ON public.client_file_hashes
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS client_file_hashes_partner_own ON public.client_file_hashes;
CREATE POLICY client_file_hashes_partner_own ON public.client_file_hashes
  FOR ALL TO authenticated
  USING (public.partner_owns_application(client_file_hashes.loan_application_id, auth.uid()))
  WITH CHECK (public.partner_owns_application(client_file_hashes.loan_application_id, auth.uid()));

DROP POLICY IF EXISTS client_file_hashes_client_access ON public.client_file_hashes;
CREATE POLICY client_file_hashes_client_access ON public.client_file_hashes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan_applications la
    JOIN public.clients c ON c.id = la.client_id
    WHERE la.id = client_file_hashes.loan_application_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan_applications la
    JOIN public.clients c ON c.id = la.client_id
    WHERE la.id = client_file_hashes.loan_application_id AND c.user_id = auth.uid()
  ));
