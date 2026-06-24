
CREATE TABLE public.loan_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name text,
  client_email text,
  client_phone text,
  note text,
  amount numeric NOT NULL,
  months integer NOT NULL,
  annual_rate numeric NOT NULL,
  commission_pct numeric NOT NULL DEFAULT 0,
  commission_pln numeric NOT NULL DEFAULT 0,
  max_payment numeric NOT NULL DEFAULT 0,
  nominal_rata numeric NOT NULL DEFAULT 0,
  capped_rata numeric NOT NULL DEFAULT 0,
  balloon numeric NOT NULL DEFAULT 0,
  total_interest numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  total_to_repay numeric NOT NULL DEFAULT 0,
  schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_proposals TO authenticated;
GRANT SELECT, INSERT ON public.loan_proposals TO anon;
GRANT ALL ON public.loan_proposals TO service_role;

ALTER TABLE public.loan_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public proposals are visible to everyone"
  ON public.loan_proposals FOR SELECT
  USING (is_public = true);

CREATE POLICY "Anyone can create a proposal"
  ON public.loan_proposals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owner or admin can update"
  ON public.loan_proposals FOR UPDATE
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Owner or admin can delete"
  ON public.loan_proposals FOR DELETE
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER update_loan_proposals_updated_at
  BEFORE UPDATE ON public.loan_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX loan_proposals_created_at_idx ON public.loan_proposals (created_at DESC);
CREATE INDEX loan_proposals_public_idx ON public.loan_proposals (is_public, status, created_at DESC);
