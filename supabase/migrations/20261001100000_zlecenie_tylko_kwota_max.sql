-- Zlecenie (Zał. 7) ma jeden parametr: kwotę maksymalną (amount_pln).
-- Okres, minimalny zysk i termin ważności przestają być zbierane — kolumny
-- zostają (dane historyczne), ale nie są już wymagane.
alter table public.investor_orders alter column max_period_months drop not null;
alter table public.investor_orders alter column min_annual_yield drop not null;
alter table public.investor_orders alter column validity_days drop not null;
