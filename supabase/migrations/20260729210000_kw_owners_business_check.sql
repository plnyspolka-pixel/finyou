-- Cache sprawdzenia działalności gospodarczej właścicieli z działu II KW (CEIDG),
-- per numer KW, TTL 7 dni. Tabela została pierwotnie utworzona przez agenta Lovable
-- bezpośrednio w bazie — migracja jest idempotentna, żeby zsynchronizować repo.
CREATE TABLE IF NOT EXISTS public.kw_owners_business_check (
  kw_number text PRIMARY KEY,
  payload jsonb NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kw_owners_business_check ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'kw_owners_business_check_staff_all'
      AND polrelid = 'public.kw_owners_business_check'::regclass
  ) THEN
    CREATE POLICY kw_owners_business_check_staff_all
      ON public.kw_owners_business_check
      FOR ALL TO authenticated
      USING (
        has_role(auth.uid(), 'administrator'::app_role)
        OR has_role(auth.uid(), 'operator'::app_role)
      )
      WITH CHECK (
        has_role(auth.uid(), 'administrator'::app_role)
        OR has_role(auth.uid(), 'operator'::app_role)
      );
  END IF;
END $$;
