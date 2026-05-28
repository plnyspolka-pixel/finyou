ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS nip text,
  ADD COLUMN IF NOT EXISTS regon text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Polska',
  ADD COLUMN IF NOT EXISTS land_register_number text,
  ADD COLUMN IF NOT EXISTS notes text;