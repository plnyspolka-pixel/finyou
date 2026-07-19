-- Nowa rola aplikacyjna dla zewnętrznych partnerów (pośredników).
-- Sama wartość enuma musi być dodana w osobnej migracji (transakcji),
-- zanim kolejne migracje zaczną jej używać.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'posrednik';
