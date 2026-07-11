-- === MAPOWANIE KORESPONDENCJI Z INWESTORAMI DO WNIOSKÓW ===
--
-- Odpowiedzi mailowe instytucji/inwestorów na wysłane oferty były dotąd
-- traktowane jak nowe leady pożyczkowe (a nawet dostawały auto-odpowiedź
-- klienckiego agenta AI). Nie istniało żadne powiązanie zwrotne
-- korespondencja ↔ inwestor ↔ wniosek.
--
-- Ten plik dodaje relacyjne kolumny na lead_communications, żeby każdy
-- mail (wychodząca oferta i przychodząca odpowiedź) mógł być trwale
-- przypisany do konkretnego wniosku i inwestora.

ALTER TABLE public.lead_communications
  ADD COLUMN IF NOT EXISTS loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS investor_id uuid REFERENCES public.investors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leadcomm_loan_app
  ON public.lead_communications(loan_application_id, created_at DESC)
  WHERE loan_application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leadcomm_investor
  ON public.lead_communications(investor_id, created_at DESC)
  WHERE investor_id IS NOT NULL;
