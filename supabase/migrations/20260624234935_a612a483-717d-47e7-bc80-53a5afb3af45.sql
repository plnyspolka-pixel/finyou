
ALTER TABLE public.loan_proposals
  ADD COLUMN source_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL;

CREATE INDEX loan_proposals_source_app_idx ON public.loan_proposals (source_application_id);
