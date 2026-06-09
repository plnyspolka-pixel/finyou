ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bank_account_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS bank_account_holder_ocr text,
  ADD COLUMN IF NOT EXISTS bank_account_document_path text;