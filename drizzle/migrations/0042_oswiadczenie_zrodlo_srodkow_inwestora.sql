-- Oświadczenie inwestora o źródle pochodzenia środków (AML) — krok 5
-- pipeline'u inwestora: po screeningu, PRZED doręczeniem pakietu, umowami
-- i Zleceniem (środki bezpieczeństwa finansowego stosuje się przed nawiązaniem
-- stosunków gospodarczych).
--
-- Podstawa: ustawa z dnia 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy
-- oraz finansowaniu terroryzmu — art. 34 ust. 1 pkt 4 lit. b (badanie źródła
-- pochodzenia wartości majątkowych w przypadkach uzasadnionych okolicznościami),
-- art. 34 ust. 3 (dokumentowanie środków), art. 43 ust. 4 (wysokie kwoty),
-- art. 44 ust. 1 pkt 2 (państwa trzecie wysokiego ryzyka), art. 46 ust. 2 pkt 2
-- (PEP), art. 41 (brak środka = brak relacji), art. 49 (przechowywanie 5 lat).
--
-- Kody źródeł, skal i flag ryzyka: src/lib/investor-plan/source-of-funds.ts.

-- ── 1. Historia oświadczeń — treść append-only, zmienialna wyłącznie decyzja ──
create table if not exists public.investor_source_of_funds_declarations (
  id uuid primary key default gen_random_uuid(),
  -- Celowo bez FK do auth.users / investors: dowód AML przechowujemy 5 lat
  -- (art. 49) także po usunięciu konta; pep_declarations działa tak samo.
  user_id uuid not null,
  investor_id uuid not null,
  -- kody z SOURCE_OF_FUNDS_CATEGORIES, np. {wynagrodzenie, oszczednosci}
  sources text[] not null check (cardinality(sources) > 0),
  other_description text,
  description text,
  funds_country char(2) not null default 'PL',
  planned_scale text not null
    check (planned_scale in ('do_100k','100k_500k','500k_1m','1m_5m','powyzej_5m')),
  -- {srodki_wlasne: true, legalne_pochodzenie: true, dokumenty_i_aktualizacja: true, truth_confirmed: true}
  statements jsonb not null,
  -- sygnały ryzyka policzone przy złożeniu (inne_zrodlo, srodki_obce,
  -- kraj_podwyzszonego_ryzyka, wysoka_skala); puste = krok zamknięty automatycznie
  risk_flags text[] not null default '{}'::text[],
  declaration_text_version text not null,
  declaration_text text not null,
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  channel text not null default 'investor_pipeline',
  -- decyzja compliance — jedyne pola zmienialne po zapisie
  review_status text not null default 'zlozone'
    check (review_status in ('zlozone','do_weryfikacji','zaakceptowane','do_uzupelnienia','odrzucone')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text
);

comment on table public.investor_source_of_funds_declarations is
  'Oświadczenia inwestorów o źródle pochodzenia środków (AML, art. 34 ust. 1 pkt 4 lit. b). Treść niezmienialna; compliance zmienia tylko review_*.';
comment on column public.investor_source_of_funds_declarations.review_status is
  'zlozone (bez sygnałów ryzyka) | do_weryfikacji (sygnały → analiza człowieka) | zaakceptowane | do_uzupelnienia (prośba o dokumenty, notatka widoczna dla inwestora) | odrzucone';
comment on column public.investor_source_of_funds_declarations.review_note is
  'Uzasadnienie decyzji compliance. Dla statusu do_uzupelnienia treść widzi inwestor (co ma dostarczyć).';

create index if not exists inv_sof_user_idx
  on public.investor_source_of_funds_declarations (user_id, signed_at desc);
create index if not exists inv_sof_investor_idx
  on public.investor_source_of_funds_declarations (investor_id, signed_at desc);
create index if not exists inv_sof_pending_idx
  on public.investor_source_of_funds_declarations (signed_at desc)
  where review_status = 'do_weryfikacji';

-- Treść oświadczenia jest dowodem dla kontroli GIIF: żadnych DELETE, a UPDATE
-- tylko pól decyzji compliance.
create or replace function public.investor_sof_declarations_guard()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'investor_source_of_funds_declarations: usuwanie zabronione (dowód AML, append-only)';
  end if;
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.investor_id <> old.investor_id
     or new.sources <> old.sources
     or new.other_description is distinct from old.other_description
     or new.description is distinct from old.description
     or new.funds_country <> old.funds_country
     or new.planned_scale <> old.planned_scale
     or new.statements <> old.statements
     or new.risk_flags <> old.risk_flags
     or new.declaration_text_version <> old.declaration_text_version
     or new.declaration_text <> old.declaration_text
     or new.signed_at <> old.signed_at
     or new.ip is distinct from old.ip
     or new.user_agent is distinct from old.user_agent
     or new.channel <> old.channel then
    raise exception 'investor_source_of_funds_declarations: treść oświadczenia jest niezmienialna — zmienia się wyłącznie decyzja compliance (review_*)';
  end if;
  return new;
end;
$$;

drop trigger if exists investor_sof_declarations_guard on public.investor_source_of_funds_declarations;
create trigger investor_sof_declarations_guard
  before update or delete on public.investor_source_of_funds_declarations
  for each row execute function public.investor_sof_declarations_guard();

-- ── 2. Stan kroku na profilu inwestora (jak screening_result) ───────────────
alter table public.investors
  add column if not exists sof_declaration_id uuid
    references public.investor_source_of_funds_declarations(id) on delete set null,
  add column if not exists sof_status text
    check (sof_status in ('zlozone','do_weryfikacji','zaakceptowane','do_uzupelnienia','odrzucone')),
  add column if not exists sof_declared_at timestamptz,
  add column if not exists sof_reviewed_at timestamptz;

comment on column public.investors.sof_status is
  'Status najnowszego oświadczenia o źródle środków. Krok pipeline''u zamykają zlozone i zaakceptowane; pozostałe blokują umowy i Zlecenie.';

-- ── 3. RLS: inwestor widzi własne oświadczenia, personel — wszystkie; zapis tylko serwer ──
alter table public.investor_source_of_funds_declarations enable row level security;

drop policy if exists inv_sof_own_or_staff_select on public.investor_source_of_funds_declarations;
create policy inv_sof_own_or_staff_select on public.investor_source_of_funds_declarations
  for select to authenticated
  using (user_id = auth.uid() or public.is_internal_staff(auth.uid()));

revoke all on public.investor_source_of_funds_declarations from anon;
grant select on public.investor_source_of_funds_declarations to authenticated;
grant all on public.investor_source_of_funds_declarations to service_role;

-- ── 4. Bramka pipeline'u: oświadczenie przed Zleceniem ─────────────────────
create or replace function public.investor_pipeline_complete(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.investor_legal_pack_complete(_user_id)
    and exists (
      select 1 from public.investors i
      where i.user_id = _user_id
        and i.lender_data_completed_at is not null
        and i.bank_account is not null
        and i.bank_account_confirmed_at is not null
        and i.screening_result = 'clear'
        and i.sof_status in ('zlozone','zaakceptowane')
    )
    and exists (
      select 1 from public.didit_verifications v
      where v.vendor_data = 'investor:' || _user_id::text
        and v.status = 'Approved'
    );
$$;

grant execute on function public.investor_pipeline_complete(uuid) to authenticated, service_role;
