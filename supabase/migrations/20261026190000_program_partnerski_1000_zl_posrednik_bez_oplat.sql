-- Program partnerski przywrócony (decyzja właściciela 26.10.2026):
--  1) Partner zarabia WYŁĄCZNIE na abonamencie poleconego inwestora:
--     1000 zł za każdego nowego inwestora, który kupi abonament — jedna
--     stawka, bez prowizji sieciowej (poziomy 2 i 3 wyłączone). „Nowy”
--     i „tylko abonament” egzekwuje kod (pierwszy opłacony abonament).
--     Prowizje za zrealizowane tematy (wypłata środków klientowi) i za konta
--     pośredników są wycofane: reguły nieaktywne, trigger od wypłat zdjęty.
--  2) Pośrednik bez bramki płatności — znika limit 5 ofert darmowego konta.

update public.affiliate_commission_rules
set name = 'Nowy inwestor kupił dostęp — 1000 zł',
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
select 'Nowy inwestor kupił dostęp — 1000 zł', true, 'investor_account_paid', 1,
       'fixed_amount', 1000, true, 14
where not exists (
  select 1 from public.affiliate_commission_rules
  where event_type = 'investor_account_paid'
    and network_level = 1
    and product_id is null
    and settlement_type_filter is null
);

update public.affiliate_commission_rules
set active = false,
    updated_at = now()
where event_type = 'investor_account_paid'
  and network_level in (2, 3);

update public.affiliate_commission_rules
set active = false,
    updated_at = now()
where event_type in ('client_funds_disbursed', 'broker_account_paid');

drop trigger if exists trg_affiliate_loan_disbursed on public.loan_applications;

drop trigger if exists trg_broker_offer_limit_insert on public.loan_applications;
drop trigger if exists trg_broker_offer_limit_undelete on public.loan_applications;
