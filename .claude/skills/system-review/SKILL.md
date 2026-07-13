---
name: system-review
description: Use when reviewing, optimizing, or extending the Finance You platform architecture — including performance issues, scaling questions, database schema changes, API design, caching, background jobs, reliability, or security. Triggers on requests like "why is this slow", "how should I structure this endpoint", "review this architecture", "will this scale", "is this safe", or before shipping any change that touches money, contracts, or borrower data.
---

# System Review — Finance You

Review architecture and code against the checklist below. **Do not lecture on theory.**
Point at concrete files/lines, state the risk, propose the smallest fix.

## How to use

1. Read `ARCHITECTURE.md` in the repo root (or ask the user for it if missing).
2. Run the relevant checklist section(s) below — not all of them, only what the task touches.
3. Output format for every finding:
   - **[SEV]** `path/to/file:line` — what's wrong → what breaks in production → minimal fix.
   - Severity: `CRITICAL` (money/data loss), `HIGH` (outage/security), `MED` (degradation), `LOW` (hygiene).
4. If a change touches money, contracts, or borrower PII → apply `references/money-rules.md` **always**.

## Bias for this codebase

Finance You is a **low-traffic, high-stakes** system. That inverts normal advice:

- Throughput almost never matters. **Correctness, auditability, and data integrity always do.**
- Do not propose Kafka, sharding, microservices, or read replicas unless there is a measured problem.
- Prefer boring: Postgres constraints, transactions, unique indexes, append-only logs.
- The expensive failure is not a slow page — it is a wrong interest calculation, a lost payment record,
  or a leaked KW/PESEL.

## Checklist index

| Section | Use when |
|---|---|
| `references/data.md` | schema changes, queries, migrations, slow reads |
| `references/money-rules.md` | anything touching loans, payments, interest, contracts, windykacja |
| `references/api.md` | Edge Functions, endpoints, external integrations (NBP, RCN, KW) |
| `references/reliability.md` | background jobs, retries, external API calls, cron, e-mail/SMS sending |
| `references/security.md` | auth, RLS, secrets, PII, file uploads, anything user-facing |
| `references/perf.md` | something is actually slow (only after measuring) |

## Rules of engagement

- **Measure before optimizing.** If the user says "it's slow", first ask for or find the actual
  timing/query plan. Never guess.
- **No premature abstraction.** Duplication is cheaper than the wrong abstraction here.
- **One change at a time.** Financial systems break silently; big-bang refactors hide the break.
- If you find a `CRITICAL`, say so first and stop adding features until it's acknowledged.
