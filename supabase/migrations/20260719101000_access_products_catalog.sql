-- =====================================================================
-- KATALOG PRODUKTÓW DOSTĘPU (jednorazowe płatności za czasowy dostęp).
-- Jednoznaczne kody produktów zastępują niejednoznaczne nazwy planów
-- ('podstawowy'/'rozszerzony'/'profesjonalny'). Ceny w groszach.
-- Frontend może czytać aktywne produkty, ale cena/czas trwania są zawsze
-- pobierane przez serwer z tej tabeli (zaufane źródło).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.access_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  audience text NOT NULL CHECK (audience IN ('investor','broker')),
  label text NOT NULL,
  duration_days int NOT NULL CHECK (duration_days > 0),
  amount_grosz bigint NOT NULL CHECK (amount_grosz > 0),
  currency text NOT NULL DEFAULT 'PLN',
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_access_products_updated ON public.access_products;
CREATE TRIGGER trg_access_products_updated BEFORE UPDATE ON public.access_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.access_products TO authenticated;
GRANT SELECT ON public.access_products TO anon; -- cennik jest publiczny (tylko aktywne — patrz RLS)
GRANT ALL ON public.access_products TO service_role;

ALTER TABLE public.access_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_products_public_select ON public.access_products;
CREATE POLICY access_products_public_select ON public.access_products
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS access_products_admin_all ON public.access_products;
CREATE POLICY access_products_admin_all ON public.access_products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator'))
  WITH CHECK (public.has_role(auth.uid(),'administrator'));

-- ---------------------------------------------------------------------
-- SEED: cztery aktywne produkty (ceny brutto w groszach).
-- ON CONFLICT DO NOTHING — późniejsze zmiany cen w panelu nie są nadpisywane.
-- ---------------------------------------------------------------------
INSERT INTO public.access_products (code, audience, label, duration_days, amount_grosz, currency, active, sort_order)
VALUES
  ('investor_access_30d',  'investor', 'Pełny dostęp inwestora — 30 dni',  30,  99900,  'PLN', true, 10),
  ('investor_access_365d', 'investor', 'Pełny dostęp inwestora — 365 dni', 365, 599900, 'PLN', true, 20),
  ('broker_access_30d',    'broker',   'Pełny dostęp pośrednika — 30 dni',  30,  49900, 'PLN', true, 10),
  ('broker_access_365d',   'broker',   'Pełny dostęp pośrednika — 365 dni', 365, 299900,'PLN', true, 20)
ON CONFLICT (code) DO NOTHING;
