ALTER TABLE public.meta_lead_forms
  ADD COLUMN IF NOT EXISTS assigned_role public.app_role NOT NULL DEFAULT 'klient';