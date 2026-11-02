-- Storefront: standalone content purchases and auditable electronic agreements.
-- These tables are private to server functions (service_role only).
CREATE TABLE IF NOT EXISTS public.store_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_code text NOT NULL CHECK(document_code IN ('store_terms','store_dpa')),
  document_version text NOT NULL,
  document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}
  accepted_at timestamptz NOT NULL DEFAULT now(),
  auth_method text NOT NULL DEFAULT 'authenticated_session',
  ip inet,
  user_agent text,
  statements jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id,document_code,document_sha256)
);
CREATE INDEX IF NOT EXISTS store_legal_acceptances_user_idx ON public.store_legal_acceptances(user_id,accepted_at DESC);
ALTER TABLE public.store_legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_legal_acceptances FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.store_legal_acceptances TO service_role;

CREATE TABLE IF NOT EXISTS public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','pending','paid','failed','cancelled','review','refunded')),
  items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'),
  amount_grosz integer NOT NULL CHECK(amount_grosz > 0 AND amount_grosz <= 200000000),
  currency text NOT NULL DEFAULT 'PLN' CHECK(currency='PLN'),
  buyer jsonb NOT NULL,
  legal_snapshots jsonb NOT NULL,
  immediate_digital_delivery boolean NOT NULL DEFAULT false,
  provider_transaction_id text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_orders_user_idx ON public.store_orders(user_id,created_at DESC);
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.store_orders TO service_role;

CREATE TABLE IF NOT EXISTS public.store_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_kind text NOT NULL CHECK(item_kind IN ('lesson','document','course','kw')),
  item_id text NOT NULL,
  source_order_id uuid NOT NULL REFERENCES public.store_orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,item_kind,item_id)
);
CREATE INDEX IF NOT EXISTS store_entitlements_user_idx ON public.store_entitlements(user_id,item_kind);
ALTER TABLE public.store_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_entitlements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.store_entitlements TO service_role;

-- Only service_role can confirm verified Tpay payments and mint entitlements.
CREATE OR REPLACE FUNCTION public.finalize_store_paid_order(
  p_id uuid,
  p_transaction_id text,
  p_amount_grosz integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_item jsonb;
  v_kind text;
  v_item_id text;
BEGIN
  -- Invoker control is enforced by EXECUTE grants below; within
  -- SECURITY DEFINER, current_user would be the function owner.
  SELECT * INTO v_order FROM public.store_orders WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_order.status='paid' THEN
    RETURN v_order.provider_transaction_id = p_transaction_id;
  END IF;
  IF v_order.status NOT IN ('created','pending') OR
     v_order.amount_grosz <> p_amount_grosz OR
     (v_order.provider_transaction_id IS NOT NULL AND v_order.provider_transaction_id <> p_transaction_id)
  THEN RETURN false; END IF;
  IF jsonb_array_length(v_order.items)=0 OR jsonb_array_length(v_order.items)>60 THEN RETURN false; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_order.items) LOOP
    v_kind := v_item->>'kind'; v_item_id := v_item->>'id';
    IF v_kind NOT IN ('lesson','document','course','kw') OR length(coalesce(v_item_id,'')) < 2 THEN
      RAISE EXCEPTION 'Invalid store order items';
    END IF;
    INSERT INTO public.store_entitlements(user_id,item_kind,item_id,source_order_id)
      VALUES (v_order.user_id,v_kind,v_item_id,v_order.id)
      ON CONFLICT(user_id,item_kind,item_id) DO NOTHING;
  END LOOP;
  UPDATE public.store_orders SET status='paid',provider_transaction_id=p_transaction_id,paid_at=now(),updated_at=now()
    WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_store_paid_order(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_store_paid_order(uuid,text,integer) TO service_role;
),
  document_text text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  auth_method text NOT NULL DEFAULT 'authenticated_session',
  ip inet,
  user_agent text,
  statements jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id,document_code,document_sha256)
);
CREATE INDEX IF NOT EXISTS store_legal_acceptances_user_idx ON public.store_legal_acceptances(user_id,accepted_at DESC);
ALTER TABLE public.store_legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_legal_acceptances FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.store_legal_acceptances TO service_role;

CREATE TABLE IF NOT EXISTS public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','pending','paid','failed','cancelled','review','refunded')),
  items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'),
  amount_grosz integer NOT NULL CHECK(amount_grosz > 0 AND amount_grosz <= 200000000),
  currency text NOT NULL DEFAULT 'PLN' CHECK(currency='PLN'),
  buyer jsonb NOT NULL,
  legal_snapshots jsonb NOT NULL,
  immediate_digital_delivery boolean NOT NULL DEFAULT false,
  provider_transaction_id text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_orders_user_idx ON public.store_orders(user_id,created_at DESC);
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.store_orders TO service_role;

CREATE TABLE IF NOT EXISTS public.store_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_kind text NOT NULL CHECK(item_kind IN ('lesson','document','course','kw')),
  item_id text NOT NULL,
  source_order_id uuid NOT NULL REFERENCES public.store_orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,item_kind,item_id)
);
CREATE INDEX IF NOT EXISTS store_entitlements_user_idx ON public.store_entitlements(user_id,item_kind);
ALTER TABLE public.store_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_entitlements FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.store_entitlements TO service_role;

-- Only service_role can confirm verified Tpay payments and mint entitlements.
CREATE OR REPLACE FUNCTION public.finalize_store_paid_order(
  p_id uuid,
  p_transaction_id text,
  p_amount_grosz integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_item jsonb;
  v_kind text;
  v_item_id text;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Only service_role can confirm a store order';
  END IF;
  SELECT * INTO v_order FROM public.store_orders WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_order.status='paid' THEN
    RETURN v_order.provider_transaction_id = p_transaction_id;
  END IF;
  IF v_order.status NOT IN ('created','pending') OR
     v_order.amount_grosz <> p_amount_grosz OR
     (v_order.provider_transaction_id IS NOT NULL AND v_order.provider_transaction_id <> p_transaction_id)
  THEN RETURN false; END IF;
  IF jsonb_array_length(v_order.items)=0 OR jsonb_array_length(v_order.items)>60 THEN RETURN false; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_order.items) LOOP
    v_kind := v_item->>'kind'; v_item_id := v_item->>'id';
    IF v_kind NOT IN ('lesson','document','course','kw') OR length(coalesce(v_item_id,'')) < 2 THEN
      RAISE EXCEPTION 'Invalid store order items';
    END IF;
    INSERT INTO public.store_entitlements(user_id,item_kind,item_id,source_order_id)
      VALUES (v_order.user_id,v_kind,v_item_id,v_order.id)
      ON CONFLICT(user_id,item_kind,item_id) DO NOTHING;
  END LOOP;
  UPDATE public.store_orders SET status='paid',provider_transaction_id=p_transaction_id,paid_at=now(),updated_at=now()
    WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finalize_store_paid_order(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_store_paid_order(uuid,text,integer) TO service_role;
