-- Program partnerski przywrócony (decyzja właściciela 26.10.2026):
--  1) 1000 zł za każdego nowego inwestora, który kupi dostęp — jedna stawka,
--     bez prowizji sieciowej (poziomy 2 i 3 dla inwestora wyłączone).
--     „Nowy” egzekwuje kod (pierwszy opłacony dostęp danej osoby).
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

drop trigger if exists trg_broker_offer_limit_insert on public.loan_applications;
drop trigger if exists trg_broker_offer_limit_undelete on public.loan_applications;
