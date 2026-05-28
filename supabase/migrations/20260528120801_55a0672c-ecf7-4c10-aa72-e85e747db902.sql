
ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'osoba_fizyczna',
  ADD COLUMN IF NOT EXISTS krs text,
  ADD COLUMN IF NOT EXISTS regon text,
  ADD COLUMN IF NOT EXISTS legal_form text,
  ADD COLUMN IF NOT EXISTS pesel text,
  ADD COLUMN IF NOT EXISTS representative_first_name text,
  ADD COLUMN IF NOT EXISTS representative_last_name text,
  ADD COLUMN IF NOT EXISTS representative_role text;

ALTER TABLE public.investors
  ADD CONSTRAINT investors_entity_type_check
  CHECK (entity_type IN ('osoba_fizyczna','firma'));
