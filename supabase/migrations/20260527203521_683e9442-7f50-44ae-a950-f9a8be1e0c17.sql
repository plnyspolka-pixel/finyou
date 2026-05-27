ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pesel text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS bank_account text;

ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS nip text;

-- Allow client to insert own clients row (needed when creating profile first time)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND policyname='clients_self_insert') THEN
    CREATE POLICY clients_self_insert ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='investors' AND policyname='investors_self_insert') THEN
    CREATE POLICY investors_self_insert ON public.investors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;