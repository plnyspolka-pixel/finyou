
ALTER TABLE public.meta_lead_forms
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_assigned_user ON public.meta_lead_forms(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_user ON public.clients(assigned_user_id);

-- Security: ukryj PII klientów dla anonimowych odwiedzających w publicznych propozycjach
REVOKE SELECT (client_name, client_email, client_phone) ON public.loan_proposals FROM anon;
