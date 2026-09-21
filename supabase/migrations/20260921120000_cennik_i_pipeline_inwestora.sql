-- =====================================================================
-- CENNIK INWESTORA (Podstawowy / PRO) + JEDEN PIPELINE ONBOARDINGU.
--
-- Cennik:
--  • Podstawowy — 0 zł. Konto przechodzi pełny pipeline i składa Zlecenia;
--    pojedynczą okazję (wyłączność + raport + harmonogram + kontakt)
--    inwestor wykupuje osobno (produkt `investor_okazja_unlock`).
--  • PRO — 3 000 zł brutto / 180 dni (`investor_pro_180d`) + opłata sukcesu
--    5% kwoty udzielonej pożyczki. Okazje bez opłat jednostkowych, Akademia,
--    kalkulator compliance, AML, windykacja AI, nielimitowane raporty,
--    pierwszeństwo wyboru ofert.
--
-- Pipeline (sekwencyjnie, egzekwowane też w SQL):
--  dane pożyczkodawcy → rachunek do spłaty → KYC (Didit) → screening list
--  sankcyjnych (Dilisense) → doręczenie pakietu → umowa ramowa → NDA → RODO
--  → Zlecenie.
--
-- UWAGA PRAWNA: opłata sukcesu 5% obciąża Inwestora, co jest sprzeczne z
-- § 7 Umowy ramowej v5 („usługa nieodpłatna dla Inwestora"). Naliczanie jest
-- domyślnie WSTRZYMANE (`investor_success_fees.status = 'wstrzymana'`) do
-- czasu aktywacji Umowy ramowej v6 — patrz docs/cennik-inwestora.md.
-- =====================================================================

-- ── 1. Katalog produktów: rodzaj, pakiet i opłata sukcesu ───────────────────
alter table public.access_products
  add column if not exists kind text not null default 'access'
    check (kind in ('access','unlock')),
  add column if not exists tier text
    check (tier in ('podstawowy','pro')),
  add column if not exists success_fee_bps int not null default 0
    check (success_fee_bps between 0 and 10000);

-- Odblokowanie pojedynczej okazji nie ma okresu ważności — dotychczasowy
-- CHECK (duration_days > 0) zastępujemy warunkowym.
alter table public.access_products alter column duration_days drop not null;
alter table public.access_products drop constraint if exists access_products_duration_days_check;
alter table public.access_products drop constraint if exists access_products_duration_chk;
alter table public.access_products add constraint access_products_duration_chk check (
  (kind = 'access' and duration_days is not null and duration_days > 0)
  or (kind = 'unlock' and duration_days is null)
);

-- Historyczne pakiety inwestora (999 zł / 5 999 zł) dawały pełny dostęp, więc
-- wciąż aktywne uprawnienie z takiego zakupu traktujemy jako PRO — nikt nie
-- traci modułów, za które już zapłacił.
update public.access_products set tier = 'pro' where audience = 'investor' and tier is null;

-- Stary cennik inwestora (999 zł / 5 999 zł) schodzi ze sprzedaży. Rekordy
-- zostają — historyczne płatności i faktury muszą mieć do czego się odwołać.
update public.access_products
  set active = false
  where code in ('investor_access_30d','investor_access_365d');

insert into public.access_products
  (code, audience, label, duration_days, amount_grosz, currency, active, sort_order, kind, tier, success_fee_bps)
values
  ('investor_pro_180d', 'investor', 'Pakiet PRO inwestora — 6 miesięcy', 180, 300000, 'PLN', true, 10, 'access', 'pro', 500),
  ('investor_okazja_unlock', 'investor', 'Okazja na wyłączność — raport, harmonogram i kontakt', null, 150000, 'PLN', true, 20, 'unlock', 'podstawowy', 0)
on conflict (code) do update set
  label = excluded.label,
  duration_days = excluded.duration_days,
  amount_grosz = excluded.amount_grosz,
  active = excluded.active,
  sort_order = excluded.sort_order,
  kind = excluded.kind,
  tier = excluded.tier,
  success_fee_bps = excluded.success_fee_bps;

-- ── 1b. Rejestr dokumentów: czy wersja dopuszcza opłaty od Inwestora ───────
-- Umowa ramowa v5 (§ 7) mówi wprost, że usługa jest dla Inwestora nieodpłatna.
-- Dopóki aktywna wersja ma `false`, opłata sukcesu PRO jest tylko rejestrowana
-- (status `wstrzymana`) — nigdy fakturowana.
alter table public.legal_documents
  add column if not exists allows_investor_fees boolean not null default false;

comment on column public.legal_documents.allows_investor_fees is
  'true tylko dla wersji umowy dopuszczającej wynagrodzenie Finance You od Inwestora (Pakiet PRO).';

-- ── 2. Profil inwestora: dane pożyczkodawcy i rachunek do spłaty ───────────
alter table public.investors
  add column if not exists lender_data_completed_at timestamptz,
  add column if not exists lender_lookup_source text,
  add column if not exists lender_lookup_at timestamptz,
  add column if not exists bank_account_bank_name text,
  add column if not exists bank_account_confirmed_at timestamptz;

comment on column public.investors.bank_account is
  'Rachunek pożyczkodawcy do spłaty pożyczki (NRB/IBAN, bez separatorów). Obowiązkowy krok pipeline''u.';
comment on column public.investors.lender_lookup_source is
  'Źródło danych firmy: gus, krs albo reczne.';

-- ── 3. Screening list sankcyjnych inwestora (Dilisense, nie Didit) ─────────
create table if not exists public.investor_screenings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_kind text not null default 'osoba' check (subject_kind in ('osoba','podmiot')),
  subject_name text not null,
  dob text,
  query jsonb not null default '{}'::jsonb,
  raw_result jsonb,
  total_hits int not null default 0,
  result text not null check (result in
    ('clear','possible_match','manual_review','confirmed_sanctions_match','pep_review_required')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists inv_screen_user_idx
  on public.investor_screenings (user_id, created_at desc);

alter table public.investors
  add column if not exists screening_id uuid references public.investor_screenings(id) on delete set null,
  add column if not exists screening_result text
    check (screening_result in
      ('clear','possible_match','manual_review','confirmed_sanctions_match','pep_review_required')),
  add column if not exists screening_updated_at timestamptz;

alter table public.investor_screenings enable row level security;

-- Surowe trafienia widzi wyłącznie personel; inwestor dostaje sam werdykt
-- z `investors.screening_result`.
drop policy if exists inv_screen_staff_all on public.investor_screenings;
create policy inv_screen_staff_all on public.investor_screenings
  for all to authenticated
  using (public.is_internal_staff(auth.uid()))
  with check (public.is_internal_staff(auth.uid()));

grant select on public.investor_screenings to authenticated;
grant all on public.investor_screenings to service_role;

-- ── 4. Zakup okazji na wyłączność (pakiet Podstawowy) ──────────────────────
alter table public.access_payments
  add column if not exists unlock_match_id uuid references public.investor_order_matches(id) on delete set null;

create table if not exists public.investor_opportunity_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.investor_order_matches(id) on delete cascade,
  payment_id uuid references public.access_payments(id) on delete set null,
  amount_grosz bigint not null check (amount_grosz >= 0),
  source text not null default 'platnosc' check (source in ('platnosc','pakiet_pro','admin')),
  unlocked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (match_id)
);
create index if not exists inv_unlock_user_idx
  on public.investor_opportunity_unlocks (user_id, unlocked_at desc);

alter table public.investor_opportunity_unlocks enable row level security;

drop policy if exists inv_unlock_own_select on public.investor_opportunity_unlocks;
create policy inv_unlock_own_select on public.investor_opportunity_unlocks
  for select to authenticated
  using (user_id = auth.uid() or public.is_internal_staff(auth.uid()));

grant select on public.investor_opportunity_unlocks to authenticated;
grant all on public.investor_opportunity_unlocks to service_role;

-- ── 5. Opłata sukcesu PRO (5% kwoty udzielonej pożyczki) ───────────────────
create table if not exists public.investor_success_fees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.investor_order_matches(id) on delete cascade,
  loan_amount_pln numeric not null check (loan_amount_pln > 0),
  fee_bps int not null check (fee_bps between 0 and 10000),
  fee_grosz bigint not null check (fee_grosz >= 0),
  -- 'wstrzymana' dopóki Umowa ramowa dopuszczająca odpłatność (v6) nie jest
  -- aktywna; naliczenie jest wtedy tylko zapisem księgowym bez wezwania.
  status text not null default 'wstrzymana'
    check (status in ('wstrzymana','naliczona','zafakturowana','oplacona','anulowana')),
  legal_basis text,
  invoice_id uuid references public.sales_invoices(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id)
);
create index if not exists inv_fee_user_idx
  on public.investor_success_fees (user_id, created_at desc);

drop trigger if exists trg_investor_success_fees_updated on public.investor_success_fees;
create trigger trg_investor_success_fees_updated before update on public.investor_success_fees
  for each row execute function public.set_updated_at();

alter table public.investor_success_fees enable row level security;

drop policy if exists inv_fee_own_select on public.investor_success_fees;
create policy inv_fee_own_select on public.investor_success_fees
  for select to authenticated
  using (user_id = auth.uid() or public.is_internal_staff(auth.uid()));

grant select on public.investor_success_fees to authenticated;
grant all on public.investor_success_fees to service_role;

-- ── 6. Pakiet inwestora (podstawowy / pro) ─────────────────────────────────
create or replace function public.investor_tier(_user_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.is_internal_staff(_user_id) then 'pro'
    when exists (
      select 1
      from public.access_entitlements e
      join public.access_products p on p.id = e.last_product_id
      where e.user_id = _user_id
        and e.audience = 'investor'
        and e.active_until > now()
        and p.tier = 'pro'
    ) then 'pro'
    else 'podstawowy'
  end;
$$;

grant execute on function public.investor_tier(uuid) to authenticated, service_role;

-- ── 7. Bramka pipeline'u: komplet kroków przed Zleceniem ───────────────────
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
    )
    and exists (
      select 1 from public.didit_verifications v
      where v.vendor_data = 'investor:' || _user_id::text
        and v.status = 'Approved'
    );
$$;

grant execute on function public.investor_pipeline_complete(uuid) to authenticated, service_role;

-- ── 8. Płatność za odblokowanie okazji w `process_access_payment_paid` ─────
-- Produkt `kind = 'unlock'` NIE przedłuża dostępu — zamyka zakup jednej
-- okazji. Reszta (idempotencja, weryfikacja kwoty, blokady) bez zmian.
CREATE OR REPLACE FUNCTION public.process_access_payment_paid(
  _payment_id uuid,
  _paid_amount_grosz bigint,
  _provider_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pay public.access_payments%ROWTYPE;
  v_prod public.access_products%ROWTYPE;
  v_ent public.access_entitlements%ROWTYPE;
  v_from timestamptz;
  v_until timestamptz;
  v_first_purchase boolean := false;
BEGIN
  SELECT * INTO v_pay FROM public.access_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  IF v_pay.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', v_pay.status = 'paid', 'alreadyProcessed', true,
      'status', v_pay.status,
      'reason', CASE WHEN v_pay.status = 'paid' THEN NULL ELSE 'payment_' || v_pay.status END,
      'grantedFrom', v_pay.granted_from, 'grantedUntil', v_pay.granted_until,
      'userId', v_pay.user_id, 'audience', v_pay.audience
    );
  END IF;

  SELECT * INTO v_prod FROM public.access_products WHERE id = v_pay.product_id;
  IF NOT FOUND THEN
    UPDATE public.access_payments
      SET failure_reason = 'product_not_found', needs_review = true
      WHERE id = _payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'product_not_found');
  END IF;

  IF _paid_amount_grosz IS DISTINCT FROM v_pay.expected_amount_grosz THEN
    UPDATE public.access_payments
      SET failure_reason = format('amount_mismatch: expected %s, paid %s',
                                  v_pay.expected_amount_grosz, _paid_amount_grosz),
          paid_amount_grosz = _paid_amount_grosz,
          needs_review = true
      WHERE id = _payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  END IF;

  IF _provider_transaction_id IS NOT NULL
     AND v_pay.provider_transaction_id IS NOT NULL
     AND v_pay.provider_transaction_id <> _provider_transaction_id THEN
    UPDATE public.access_payments
      SET failure_reason = 'transaction_id_mismatch', needs_review = true
      WHERE id = _payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'transaction_id_mismatch');
  END IF;

  -- Zakup jednej okazji: bez uprawnienia czasowego, bez dotykania investors.
  IF v_prod.kind = 'unlock' THEN
    IF v_pay.unlock_match_id IS NULL THEN
      UPDATE public.access_payments
        SET failure_reason = 'unlock_match_missing', needs_review = true
        WHERE id = _payment_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'unlock_match_missing');
    END IF;

    -- Odblokowanie jest unikalne po match_id. Gdyby mimo bramek w aplikacji
    -- wpłynęła druga płatność za tę samą okazję, zapisujemy ją jako opłaconą,
    -- ale oznaczamy do wyjaśnienia (zwrot) — pieniądze nie giną po cichu.
    INSERT INTO public.investor_opportunity_unlocks
      (user_id, match_id, payment_id, amount_grosz, source)
    VALUES (v_pay.user_id, v_pay.unlock_match_id, v_pay.id, _paid_amount_grosz, 'platnosc')
    ON CONFLICT (match_id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM public.investor_opportunity_unlocks u
      WHERE u.match_id = v_pay.unlock_match_id AND u.payment_id = v_pay.id
    ) THEN
      UPDATE public.access_payments
        SET needs_review = true,
            failure_reason = 'unlock_already_owned: okazja odblokowana wcześniej — do zwrotu'
        WHERE id = _payment_id;
    END IF;

    UPDATE public.access_payments
      SET status = 'paid',
          paid_amount_grosz = _paid_amount_grosz,
          provider_transaction_id = COALESCE(provider_transaction_id, _provider_transaction_id),
          granted_from = now(),
          granted_until = now(),
          processed_at = now()
      WHERE id = _payment_id;

    RETURN jsonb_build_object(
      'ok', true, 'alreadyProcessed', false, 'kind', 'unlock',
      'matchId', v_pay.unlock_match_id,
      'userId', v_pay.user_id, 'audience', v_pay.audience,
      'grantedFrom', now(), 'grantedUntil', now(), 'firstPurchase', false
    );
  END IF;

  SELECT * INTO v_ent FROM public.access_entitlements
  WHERE user_id = v_pay.user_id AND audience = v_pay.audience
  FOR UPDATE;

  IF FOUND AND v_ent.active_until IS NOT NULL AND v_ent.active_until > now() THEN
    v_from := v_ent.active_until;
  ELSE
    v_from := now();
    v_first_purchase := NOT FOUND;
  END IF;
  v_until := v_from + make_interval(days => v_prod.duration_days);

  IF FOUND THEN
    UPDATE public.access_entitlements
      SET active_from = CASE
            WHEN active_until IS NULL OR active_until <= now() THEN now()
            ELSE active_from
          END,
          active_until = v_until,
          last_product_id = v_prod.id,
          last_payment_id = v_pay.id
      WHERE id = v_ent.id;
  ELSE
    INSERT INTO public.access_entitlements
      (user_id, audience, active_from, active_until, last_product_id, last_payment_id)
    VALUES (v_pay.user_id, v_pay.audience, now(), v_until, v_prod.id, v_pay.id);
  END IF;

  UPDATE public.access_payments
    SET status = 'paid',
        paid_amount_grosz = _paid_amount_grosz,
        provider_transaction_id = COALESCE(provider_transaction_id, _provider_transaction_id),
        granted_from = v_from,
        granted_until = v_until,
        processed_at = now(),
        failure_reason = NULL
    WHERE id = _payment_id;

  IF v_pay.audience = 'investor' THEN
    UPDATE public.investors
      SET subscription_status = 'aktywny',
          subscription_active_until = v_until,
          subscription_source = 'tpay',
          updated_at = now()
      WHERE user_id = v_pay.user_id;
    IF NOT FOUND THEN
      INSERT INTO public.investors (user_id, investor_type, subscription_status, subscription_active_until, subscription_source)
      VALUES (v_pay.user_id, 'indywidualny', 'aktywny', v_until, 'tpay');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'alreadyProcessed', false, 'kind', 'access',
    'grantedFrom', v_from, 'grantedUntil', v_until,
    'userId', v_pay.user_id, 'audience', v_pay.audience,
    'firstPurchase', v_first_purchase
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_access_payment_paid(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_access_payment_paid(uuid, bigint, text) TO service_role;

-- ── 9. Dostęp do pełnych danych okazji ─────────────────────────────────────
-- PRO widzi każdą swoją okazję; Podstawowy dopiero po wykupieniu odblokowania.
create or replace function public.investor_can_open_match(_user_id uuid, _match_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.investor_tier(_user_id) = 'pro'
    or exists (
      select 1 from public.investor_opportunity_unlocks u
      where u.match_id = _match_id and u.user_id = _user_id
    );
$$;

grant execute on function public.investor_can_open_match(uuid, uuid) to authenticated, service_role;
