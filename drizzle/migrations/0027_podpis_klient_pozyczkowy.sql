-- =====================================================================
-- PODPIS DOKUMENTOWY — KLIENT POŻYCZKOWY
--
-- Koperta może być powiązana z klientem (clients) i wnioskiem
-- (loan_applications); podpisujący może być klientem z systemu
-- (signer_kind = 'klient', client_id). Klient zalogowany w /klient widzi
-- swoje dokumenty do podpisu i podpisane (dopasowanie po koncie, po
-- client_id albo po adresie e-mail — wtedy wiersz jest „przejmowany”).
-- =====================================================================

alter table public.esign_envelopes
  add column if not exists client_id uuid,
  add column if not exists loan_application_id uuid,
  add column if not exists generated_document_id uuid;

create index if not exists esign_envelopes_client_idx
  on public.esign_envelopes (client_id) where client_id is not null;
create index if not exists esign_envelopes_application_idx
  on public.esign_envelopes (loan_application_id) where loan_application_id is not null;

alter table public.esign_signers
  add column if not exists client_id uuid;
create index if not exists esign_signers_client_idx
  on public.esign_signers (client_id) where client_id is not null;
create index if not exists esign_signers_email_idx
  on public.esign_signers (lower(email));

alter table public.esign_signers drop constraint if exists esign_signers_signer_kind_check;
alter table public.esign_signers
  add constraint esign_signers_signer_kind_check
  check (signer_kind in ('zewnetrzny', 'inwestor', 'personel', 'klient'));

-- RLS: klient (konto powiązane z clients.user_id) widzi koperty, w których
-- podpisuje — po client_id albo po koncie.
drop policy if exists esign_envelopes_read on public.esign_envelopes;
create policy esign_envelopes_read on public.esign_envelopes
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_internal_staff(auth.uid())
    or exists (
      select 1 from public.esign_signers s
      where s.envelope_id = esign_envelopes.id
        and (
          s.user_id = auth.uid()
          or exists (select 1 from public.clients c where c.id = s.client_id and c.user_id = auth.uid())
        )
    )
  );

drop policy if exists esign_signers_read on public.esign_signers;
create policy esign_signers_read on public.esign_signers
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_internal_staff(auth.uid())
    or exists (select 1 from public.clients c where c.id = esign_signers.client_id and c.user_id = auth.uid())
    or exists (
      select 1 from public.esign_envelopes e
      where e.id = esign_signers.envelope_id and e.created_by = auth.uid()
    )
  );

notify pgrst, 'reload schema';
