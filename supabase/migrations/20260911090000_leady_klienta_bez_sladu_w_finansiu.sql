-- === Leady klientów zewnętrznych nie zostawiają śladu w Finance You ===
-- Leady z kampanii prowadzonych dla klientów (np. wynajem szalunków) nie mogą
-- pojawiać się nigdzie w systemie Finance You: ani jako leady pożyczkowe, ani
-- jako klienci, ani w `meta_leads`. Trafiają wyłącznie do panelu klienta.
--
-- Do ochrony przed wysłaniem tego samego leada dwa razy (webhook i synchronizacja
-- to dwie niezależne drogi wejścia) potrzebny jest ślad — ale wyłącznie techniczny:
-- identyfikator leada w Meta, bez imienia, telefonu i adresu e-mail.

CREATE TABLE IF NOT EXISTS public.client_lead_forwards (
  meta_lead_id text PRIMARY KEY,
  meta_form_id text NOT NULL,
  forwarded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'wyslany',
  error text
);

COMMENT ON TABLE public.client_lead_forwards IS
  'Rejestr leadów przekazanych do paneli klientów zewnętrznych. Wyłącznie identyfikatory techniczne — żadnych danych osobowych. Służy do ochrony przed dublowaniem wysyłki, nie jest listą leadów.';

GRANT SELECT ON public.client_lead_forwards TO authenticated;
GRANT ALL ON public.client_lead_forwards TO service_role;

ALTER TABLE public.client_lead_forwards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clf_staff_select ON public.client_lead_forwards;
CREATE POLICY clf_staff_select ON public.client_lead_forwards
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS client_lead_forwards_form_idx
  ON public.client_lead_forwards (meta_form_id, forwarded_at DESC);
