-- Dwa osobne programy (decyzja właściciela 26–27.10.2026):
--  * PARTNER (program partnerski, /program-partnerski): zarabia WYŁĄCZNIE
--    1000 zł za nowego inwestora, który zarejestruje się z jego linku i kupi
--    abonament. „Nowy” i „tylko abonament” egzekwuje kod (pierwszy opłacony
--    abonament; okazje i odnowienia pomijane).
--  * POŚREDNIK (/dla-posrednika): konto bez opłat; zarabia WYŁĄCZNIE prowizję
--    od uruchomionej (wypłaconej) pożyczki klienta, którego przyprowadził:
--    50% wynagrodzenia Finance You (standardowo 7% kwoty) = 3,5% kwoty pożyczki.
-- Konto jest jednego rodzaju: affiliate_partners.partner_kind.

alter table public.affiliate_partners
  add column if not exists partner_kind text not null default 'partner'
    check (partner_kind in ('partner', 'broker'));

-- ── Reguły prowizji ────────────────────────────────────────────────────────
-- Partner: 1000 zł za abonament nowego inwestora, bez poziomów sieci.
update public.affiliate_commission_rules
set name = 'Partner — nowy inwestor kupił abonament — 1000 zł',
    basis_type = 'fixed_amount',
    fixed_amount = 1000,
    percent_rate = null,
    active = true,
    updated_at = now()
where event_type = 'investor_account_paid'
  and network_level = 1
  and product_id is null
  and settlement_type_filter is null;

insert into public.affiliate_commission_rules
  (name, active, event_type, network_level, basis_type, fixed_amount,
   requires_admin_approval, refund_window_days)
select 'Partner — nowy inwestor kupił abonament — 1000 zł', true, 'investor_account_paid', 1,
       'fixed_amount', 1000, true, 14
where not exists (
  select 1 from public.affiliate_commission_rules
  where event_type = 'investor_account_paid'
    and network_level = 1
    and product_id is null
    and settlement_type_filter is null
);

-- Pośrednik: 50% wynagrodzenia FY z uruchomionej pożyczki — tylko poziom 1.
update public.affiliate_commission_rules
set name = 'Pośrednik — uruchomiona pożyczka klienta — 50% wynagrodzenia FY (3,5% kwoty)',
    basis_type = 'percent_of_finance_you_fee',
    percent_rate = 50,
    fixed_amount = null,
    min_commission = null,
    max_commission = null,
    active = true,
    updated_at = now()
where event_type = 'client_funds_disbursed'
  and network_level = 1
  and product_id is null
  and settlement_type_filter is null;

insert into public.affiliate_commission_rules
  (name, active, event_type, network_level, basis_type, percent_rate,
   requires_admin_approval, refund_window_days)
select 'Pośrednik — uruchomiona pożyczka klienta — 50% wynagrodzenia FY (3,5% kwoty)', true,
       'client_funds_disbursed', 1, 'percent_of_finance_you_fee', 50, true, 14
where not exists (
  select 1 from public.affiliate_commission_rules
  where event_type = 'client_funds_disbursed'
    and network_level = 1
    and product_id is null
    and settlement_type_filter is null
);

update public.affiliate_commission_rules
set active = false,
    updated_at = now()
where (event_type in ('investor_account_paid', 'client_funds_disbursed') and network_level in (2, 3))
   or event_type = 'broker_account_paid';

-- ── Zdarzenie „uruchomiona pożyczka” — wyłącznie dla pośrednika ─────────────
-- Pośrednik, który przyprowadził klienta: autor wniosku (created_by_partner_user_id),
-- jawnie wskazany partner wniosku albo polecenie zapisane na profilu klienta.
-- Konta programu partnerskiego (partner_kind = 'partner') nie dostają prowizji
-- od pożyczek; ścieżka przez przypisanego operatora jest usunięta.
create or replace function public.affiliate_on_loan_disbursed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_partner uuid; v_amount numeric; v_fee numeric;
begin
  if new.status <> 'wyplacony' or old.status is not distinct from new.status then return new; end if;

  if new.created_by_partner_user_id is not null then
    select ap.id into v_partner from public.affiliate_partners ap
    where ap.user_id = new.created_by_partner_user_id and ap.partner_kind = 'broker'
    limit 1;
  end if;
  if v_partner is null and new.referred_by_partner_id is not null then
    select ap.id into v_partner from public.affiliate_partners ap
    where ap.id = new.referred_by_partner_id and ap.partner_kind = 'broker';
  end if;
  if v_partner is null and new.client_id is not null then
    select ap.id into v_partner
    from public.clients c
    join public.profiles p on p.user_id = c.user_id
    join public.affiliate_partners ap on ap.id = p.referred_by_partner_id
    where c.id = new.client_id and ap.partner_kind = 'broker'
    limit 1;
  end if;
  if v_partner is null then return new; end if;

  if exists (select 1 from public.affiliate_commission_events
    where application_id = new.id and event_type = 'client_funds_disbursed'
      and event_status not in ('cancelled','refunded','chargeback','fraud')) then return new; end if;

  v_amount := coalesce(new.accepted_loan_amount, new.loan_amount, 0);
  -- Standardowe wynagrodzenie Finance You: 7% kwoty uruchomionej pożyczki
  -- (FINANCE_YOU_FEE_PERCENT w kodzie). Pośrednik dostaje z tego 50% (reguła).
  v_fee := round(v_amount * 7 / 100);
  if new.referred_by_partner_id is distinct from v_partner then
    update public.loan_applications set referred_by_partner_id = v_partner where id = new.id;
  end if;
  insert into public.affiliate_commission_events
    (event_type, event_status, source_entity_type, source_entity_id, direct_partner_id,
     customer_id, application_id, loan_amount, finance_you_fee_amount, currency, occurred_at, confirmed_at)
  values
    ('client_funds_disbursed', 'confirmed', 'loan_application', new.id, v_partner,
     new.client_id, new.id, v_amount, v_fee, 'PLN', now(), now());
  return new;
end; $$;

drop trigger if exists trg_affiliate_loan_disbursed on public.loan_applications;
create trigger trg_affiliate_loan_disbursed
  after update of status on public.loan_applications
  for each row execute function public.affiliate_on_loan_disbursed();

-- ── Pośrednik bez bramki płatności — znika limit 5 ofert darmowego konta ────
drop trigger if exists trg_broker_offer_limit_insert on public.loan_applications;
drop trigger if exists trg_broker_offer_limit_undelete on public.loan_applications;
