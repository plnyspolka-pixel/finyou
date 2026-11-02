-- Reproducible schema for standalone paid products. Existing production tables
-- predate this commit; CREATE TABLE IF NOT EXISTS preserves their data.
create table if not exists public.store_orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 status text not null default 'created'
   check (status in ('created','pending','paid','failed','cancelled','review','refunded')),
 items jsonb not null check (jsonb_typeof(items)='array'),
 amount_grosz integer not null check (amount_grosz > 0 and amount_grosz <= 200000000),
 currency text not null default 'PLN' check (currency='PLN'),
 buyer jsonb not null, legal_snapshots jsonb not null,
 immediate_digital_delivery boolean not null default false,
 provider_transaction_id text unique, paid_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists store_orders_user_idx on public.store_orders(user_id,created_at desc);
create table if not exists public.store_entitlements (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 item_kind text not null check (item_kind in ('lesson','document','course','kw')),
 item_id text not null,
 source_order_id uuid not null references public.store_orders(id),
 created_at timestamptz not null default now(),
 unique (user_id,item_kind,item_id)
);
create index if not exists store_entitlements_user_idx on public.store_entitlements(user_id,item_kind);
create table if not exists public.store_legal_acceptances (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 document_code text not null check (document_code in ('store_terms','store_dpa')),
 document_version text not null,
 document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
 document_text text not null,
 accepted_at timestamptz not null default now(),
 auth_method text not null default 'authenticated_session',
 ip inet,
 user_agent text,
 statements jsonb not null default '{}'::jsonb,
 unique(user_id,document_code,document_sha256)
);
create index if not exists store_legal_acceptances_user_idx on public.store_legal_acceptances(user_id,accepted_at desc);
alter table public.store_orders enable row level security;
alter table public.store_entitlements enable row level security;
alter table public.store_legal_acceptances enable row level security;
-- Access policies defined in subsequent migration 20261102173000.
