---
name: system-review
description: Comprehensive system review of the finyou app — architecture, code quality, security, Supabase schema/RLS, payments, and dependencies. Use when the user asks for a "system review", "przegląd systemu", full audit, health check, or a pre-release review of the codebase (or a subset of it).
---

# System Review

Run a structured, evidence-based review of this codebase and produce a prioritized report. This is a **read-and-report** skill by default: investigate, cite `file:line`, rank by severity. Only make changes if the user explicitly asks you to fix findings.

## Stack context (finyou)

Know what you're reviewing before you start:

- **Frontend**: TanStack Start + React 19 + TypeScript, Tailwind v4, shadcn/ui (`src/components/ui`), TanStack Router (`src/routes`) & Query. Deployed via Cloudflare (`wrangler.jsonc`, `@cloudflare/vite-plugin`).
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions). Migrations in `supabase/migrations/`, edge functions in `supabase/functions/` (e.g. `tpay-proxy`, `rcn-proxy`). Client wiring in `src/integrations/supabase`.
- **Domains**: multi-role broker/lending platform — roles include admin, broker (pośrednik), client, inwestor, affiliate, accounting/księgowość. Feature areas map to `src/components/*` (admin, affiliate, broker, client, inwestor, blog, inbox/messenger, document-creator, loan-doc-wizard, wniosek, property-analysis) and `src/lib/*` (accounting, affiliate, invoicing, ksef, mcp, property-analysis, uploads).
- **Money & compliance**: Stripe + tpay payments, Polish KSeF e-invoicing (`src/lib/ksef`, `src/lib/invoicing`). Treat these paths as high-risk.
- **Integrations**: Lovable (`src/integrations/lovable`, `.lovable/`), MCP routes (`src/routes/[.mcp]`, `src/lib/mcp`), Resend/email (`src/lib/email-templates`), Firecrawl.
- **Tests**: Vitest (`vitest.config.ts`, `src/test`). Lint: `eslint .`. Format: Prettier.

## Scope

Default to the **whole repo**. If the user narrows it ("just the payments code", "review the affiliate module", "review my branch diff"), restrict to that and say so in the report. For a diff-scoped review, base it on `git diff` against the default branch rather than re-auditing untouched code.

## Workflow

Create a todo list from the dimensions below, then work through them. For anything non-trivial, spread independent investigation across subagents (`Agent` / `Explore`) — one per dimension — and synthesize. Prefer `Grep`/`Glob`/`Read` over shell `cat`/`find`.

### 1. Orient
- Read `package.json`, `vite.config.ts`, `tsconfig.json`, `supabase/config.toml`, `.env*` names (never print secret values), and any `docs/` / `.lovable/memory` notes.
- Skim the route tree and `src/lib` to map features to code. Note the newest migrations to understand current schema state.

### 2. Review dimensions

**Security & auth (highest priority for this app)**
- **RLS**: every table exposed to the client must have Row Level Security enabled with policies scoped to the right role/owner. Grep migrations for `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `SECURITY DEFINER`. Flag tables with no policy, overly-broad `USING (true)`, or role checks that trust client-supplied values.
- **Secrets**: no service-role keys, Stripe/tpay secrets, or API keys in client code or committed `.env`. Client may only hold the Supabase anon key + public config. Grep for `service_role`, `SUPABASE_SERVICE`, `sk_live`, `sk_test`, hardcoded tokens.
- **Edge functions**: verify auth on every function, validate input, don't leak internal errors, and keep secrets server-side. Check `tpay-proxy` / `rcn-proxy` handle signatures/callbacks safely.
- **Payments**: webhook signature verification (Stripe/tpay), idempotency, amounts computed server-side (never trust client amounts), and access control on payment/subscription mutations.
- **Auth flows**: role assignment and elevation paths, session handling, and any admin-only action reachable without an admin check.
- **Input validation**: Zod schemas at trust boundaries (forms, API routes, MCP endpoints, file uploads). Flag unvalidated `req`/`params` reaching the DB.
- **XSS/injection**: `dangerouslySetInnerHTML`, `docxtemplater`/markdown/PDF rendering of user content, and any string-built SQL.

**Correctness & bugs**
- Money math (interest, `777`/mortgage calculators, invoicing totals, VAT/KSeF) — off-by-one, rounding, float vs integer-cents, currency assumptions.
- React 19 / hooks: missing deps, stale closures, effects that should be queries, unstable keys.
- Async & error handling: unhandled rejections, swallowed errors, missing loading/error states in Query usage.
- Date/timezone handling (`date-fns`, cron via `cron-parser`, `schedule_automation_crons`).

**Architecture & data model**
- Schema coherence across ~150 migrations: unified statuses (see `unify_loan_statuses`), FK integrity, indexes on hot query paths, drift between migrations and `src/integrations/supabase` types.
- Feature-to-code boundaries; duplicated logic that belongs in `src/lib`; god components.
- MCP surface (`src/routes/[.mcp]`, `src/lib/mcp`) — what it exposes and to whom.

**Quality & maintainability**
- Run `eslint .` and report real issues (not noise). Check TypeScript strictness and `any` escape hatches at boundaries.
- Test coverage on the risky paths above; note untested money/RLS logic.
- Dead code, `tmp-*.ts` scripts at repo root, TODO/FIXME/HACK density.

**Dependencies & config**
- Outdated or risky deps, duplicate/conflicting versions (note the `entities` override, `pnpm` block despite bun/npm lockfiles — flag lockfile strategy confusion: `bun.lock` + `package-lock.json` both present).
- Build/deploy config sanity (`wrangler.jsonc`, vite config, env var wiring).

### 3. Verify before reporting
For each candidate finding, confirm it against the actual code — open the file, check the surrounding logic, and rule out that a guard exists elsewhere. Discard anything you can't substantiate. A short, correct report beats a long, speculative one. For high-severity security claims, be adversarial: try to prove yourself wrong first.

## Report format

Output a Markdown report. Order findings by severity, most severe first.

```
# System Review — <scope> — <date>

## Summary
<2–4 sentences: overall health, biggest risks, what's solid.>

## Findings

### 🔴 Critical / 🟠 High / 🟡 Medium / 🔵 Low  (group by severity)
- **[area] Title** — `path/to/file.ts:42`
  - What: <the issue, concretely>
  - Impact: <what breaks / who's exposed>
  - Fix: <specific, minimal remediation>

## What's working well
<brief — genuine strengths, so the report is balanced>

## Suggested next steps
<ordered, actionable — what to tackle first>
```

Severity guide: **Critical** = exploitable now / data loss / money leak (e.g. table without RLS, unverified payment webhook, leaked secret). **High** = serious bug or security gap needing a guard. **Medium** = correctness/maintainability risk. **Low** = polish, style, minor cleanup.

## Wrap-up

- Present the report in your final message (and offer to write it to `docs/system-review-<date>.md` if the user wants it persisted).
- Do **not** commit or change code unless asked. If the user then asks you to fix findings, address them highest-severity-first and verify each fix.
- State plainly what you did and did not cover (e.g. "did not run the full test suite", "RLS reviewed from migrations, not against a live DB").
