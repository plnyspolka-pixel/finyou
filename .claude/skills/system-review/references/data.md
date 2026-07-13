# Data layer — Postgres / Supabase

## Schema
- [ ] Every foreign key is **actually** a foreign key with `ON DELETE` behaviour chosen deliberately.
      Financial rows should be `ON DELETE RESTRICT`, never `CASCADE`.
- [ ] Business uniqueness is a **unique constraint**, not application code.
      (e.g. one active loan per contract number; one payment per provider event id)
- [ ] Enums are DB enums or a check constraint — not free-text status columns.
- [ ] Nullable columns are nullable *on purpose*. `NULL` must mean one thing, documented.
- [ ] `created_at` / `updated_at` on every table, `DEFAULT now()`.
- [ ] Soft delete (`deleted_at`) rather than hard delete for anything a lawyer might ask about.

## Queries
- [ ] No N+1: a list view that renders 50 loans must not fire 50 queries. Check the Supabase client
      calls in loops / `.map(async ...)`.
- [ ] Every column used in a `WHERE`, `ORDER BY`, or join has an index — or a documented reason not to.
- [ ] Composite index column order matches query predicate order.
- [ ] `SELECT *` is not used to feed a list view. Fetch the columns the UI renders.
- [ ] Pagination is keyset (`WHERE id > last_id`) for anything that can grow past a few thousand rows,
      not `OFFSET`.

## Migrations
- [ ] Migration is **backwards compatible** with the currently deployed frontend (add column → deploy →
      backfill → switch reads → drop old column). Never drop-and-recreate.
- [ ] Backfills of large tables are batched, not one giant `UPDATE`.
- [ ] Every migration is reversible or explicitly marked as one-way with a reason.

## Supabase-specific
- [ ] RLS is **enabled on every table**. A table without RLS in a Supabase project is public.
      Verify with: `SELECT relname FROM pg_class WHERE relrowsecurity = false AND relkind = 'r';`
- [ ] RLS policies are tested, not assumed. Write a test that asserts user A cannot read user B's loan.
- [ ] `service_role` key is used **only** in Edge Functions / server, never shipped to the browser.
- [ ] Anything the frontend can call directly, an attacker can call directly with arbitrary params.
