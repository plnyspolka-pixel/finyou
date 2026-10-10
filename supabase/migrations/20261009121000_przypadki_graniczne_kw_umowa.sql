-- Przypadki graniczne wniosek → KW → umowa (październik 2026).
--
-- pkt 3/9 — klient: aktualne nazwisko z CEIDG, poprzednie nazwiska, historia
--   zmian, zapamiętany wynik CEIDG (jeden dla modułu współwłaścicieli i analizy
--   ryzyka) oraz dedykowane, szyfrowane pola do umowy (dokument tożsamości,
--   rachunek do wypłaty — AES-256-GCM po stronie serwera, jak dane partnerów).
-- pkt 4 — nieruchomość: numer budynku/lokalu, przeznaczenie, źródło pól
--   uzupełnionych z działu I-O KW i rozbieżności z polami wpisanymi ręcznie.
-- pkt 8 — rejestr dokumentów: wersje ręcznie poprawionych plików.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS previous_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS name_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ceidg_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS ceidg_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS id_document_enc text,
  ADD COLUMN IF NOT EXISTS payout_account_enc text;

COMMENT ON COLUMN public.clients.previous_names IS
  'Poprzednie nazwiska klienta (np. po zmianie nazwiska wykrytej w CEIDG).';
COMMENT ON COLUMN public.clients.name_history IS
  'Historia zmian imienia/nazwiska: [{at, field, from, to, source, nip}].';
COMMENT ON COLUMN public.clients.ceidg_snapshot IS
  'Ostatni wynik CEIDG po NIP: {nip, checkedAt, activity} — wspólny dla współwłaścicieli i ryzyka.';
COMMENT ON COLUMN public.clients.id_document_enc IS
  'Dokument tożsamości (np. „dowód osobisty nr …”) — zaszyfrowany (enc:v1:…).';
COMMENT ON COLUMN public.clients.payout_account_enc IS
  'Rachunek do wypłaty pożyczki — zaszyfrowany (enc:v1:…).';

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS building_number text,
  ADD COLUMN IF NOT EXISTS unit_number text,
  ADD COLUMN IF NOT EXISTS usage text,
  ADD COLUMN IF NOT EXISTS field_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kw_sync jsonb;

COMMENT ON COLUMN public.properties.field_sources IS
  'Źródło pól uzupełnionych automatycznie, np. {"city": {"source": "kw_dzial_1o", "kw_number": "…"}}.';
COMMENT ON COLUMN public.properties.kw_sync IS
  'Ostatnie uzupełnienie z KW: {at, kw_number, filled[], conflicts[{field, current, kw}]}.';

ALTER TABLE public.generated_documents
  ADD COLUMN IF NOT EXISTS parent_document_id uuid REFERENCES public.generated_documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_reason text,
  ADD COLUMN IF NOT EXISTS content_sha256 text;

CREATE INDEX IF NOT EXISTS idx_generated_documents_parent
  ON public.generated_documents(parent_document_id);
