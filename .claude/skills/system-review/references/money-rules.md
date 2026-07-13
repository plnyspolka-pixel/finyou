# Money rules — non-negotiable

Applies to: loans, disbursements, repayments, interest, commission, penalties, windykacja, contracts.

## Representation
- [ ] Money is **never** a float. `NUMERIC(14,2)` in Postgres, integer grosze or Decimal in code.
- [ ] Every amount carries a currency, even if it's always PLN today.
- [ ] Rounding rule is explicit and applied **once**, at the last step — never mid-calculation.
- [ ] Interest rate stored as the *formula inputs* (NBP ref rate + spread), not just the resolved %.
      The resolved % must be snapshotted on the contract at signing and never recomputed retroactively.

## Immutability / audit
- [ ] Financial events are **append-only**. Never `UPDATE` a payment or a schedule row — insert a
      correcting event. (This is already the rule for the windykacja event registry — apply it everywhere.)
- [ ] Every event row has: `created_at`, `created_by`, `source` (system | user | import), and a
      reason/comment field.
- [ ] Contract documents (DOCX/PDF) generated for a client are stored **as generated**, hashed, and
      never regenerated for display. What the client signed is what we show.
- [ ] Schedule (harmonogram) is generated once and persisted. It is not recomputed on page load.

## Idempotency
- [ ] Any operation that creates money movement (disbursement, repayment booking, fee charge) accepts
      an **idempotency key** and is safe to call twice. A double-click must not create two payments.
- [ ] Webhooks / callbacks from banks or payment providers are deduplicated by provider event id.

## Transactions
- [ ] Multi-table money writes are in a **single DB transaction**. No "insert payment, then update
      balance" outside a transaction.
- [ ] Balance is either (a) derived from the event log on read, or (b) a materialized column updated
      *in the same transaction* as the event. Never a cron job.
- [ ] Concurrent updates to the same loan use `SELECT ... FOR UPDATE` or an optimistic version column.

## Legal / regulatory (Polish context)
- [ ] Non-consumer status of the borrower is recorded and evidenced on the contract, not assumed.
- [ ] MPKK / statutory limits: computed and shown as a **reference indicator**, not silently enforced.
      If the product exceeds them, the system must surface the "zasady współżycia społecznego" risk
      warning to the investor — this is a required output, not optional UI polish.
- [ ] Fictitious-delivery (doręczenie fikcyjne) clause applicability is a stored flag per contract,
      not hardcoded.
- [ ] Any date used in a deadline calculation (wypowiedzenie, wezwanie, przedawnienie) is stored with
      timezone and the source event that started the clock.

## Smell list — flag on sight
- `parseFloat` / `Number()` on an amount
- `.toFixed(2)` used as the rounding strategy
- interest recomputed on render
- a payment row being `UPDATE`d
- a cron job that "recalculates balances"
- `Math.round` anywhere near money
