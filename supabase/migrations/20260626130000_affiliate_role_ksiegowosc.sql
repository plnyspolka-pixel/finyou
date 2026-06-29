-- Rola księgowości dla modułu programu pośredników i rozliczeń.
-- ALTER TYPE ... ADD VALUE musi być w osobnej migracji (osobnej transakcji) zanim
-- nowa wartość enuma zostanie użyta w politykach RLS kolejnej migracji.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ksiegowosc';
