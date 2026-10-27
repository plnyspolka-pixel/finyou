-- Rola uczestnika programu partnerskiego (polecanie inwestorów) — osobne konto
-- i osobny panel niż pośrednik. Wartość enuma w osobnej migracji (transakcji),
-- zanim kolejne migracje zaczną jej używać.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';
