-- Zlecenie (Zał. 7): przełącznik Prowizji od Pożyczkobiorcy (prowizji Finance You).
--
-- Standardem jest Prowizja od Pożyczkobiorcy: 5 % Kwoty Udzielonej, nie mniej
-- niż 5 000 zł, bez VAT, potrącana z wypłaty (src/lib/contract-engine/fees.ts).
-- Przy składaniu Zlecenia osoba mająca JEDNOCZEŚNIE uprawnienia inwestora
-- i administratora (role „inwestor" i „administrator" w user_roles) może
-- prowizję wyłączyć — wtedy Projekty w wykonaniu tego Zlecenia wyceniamy bez
-- prowizji Finance You (kalkulator oferty pokazuje 0 zł, cała Kwota Udzielona
-- idzie do Klienta). Dla pozostałych inwestorów kolumna zawsze zostaje true
-- (serwer nadpisuje żądanie — submitInvestorOrder).
ALTER TABLE public.investor_orders
  ADD COLUMN IF NOT EXISTS fy_commission_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.investor_orders.fy_commission_enabled IS
  'Czy Projekty w wykonaniu tego Zlecenia obciąża Prowizja od Pożyczkobiorcy (prowizja Finance You, 5 %, min 5 000 zł, bez VAT, potrącana z wypłaty). false = prowizja wyłączona; ustawić może wyłącznie inwestor będący jednocześnie administratorem.';
