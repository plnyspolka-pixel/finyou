# Reliability — jobs, retries, failure

## Background work
- [ ] Anything that can fail and must not be lost is a **queued job with a persisted row**, not a
      fire-and-forget `fetch` in a click handler. (Sending a wezwanie do zapłaty. Booking a payment.
      Triggering the calling agent.)
- [ ] Job rows have a status (`pending | running | done | failed | dead`), `attempts`, `last_error`,
      and `next_run_at`.
- [ ] Failed jobs after N attempts go to a **dead-letter state a human can see** — not silently gone.
      For windykacja, a silently dropped deadline is a legal problem, not a bug.
- [ ] Jobs are **idempotent**. Assume every job runs at least twice.

## Retries
- [ ] Exponential backoff with jitter. `1s, 2s, 4s, 8s...` plus randomness.
- [ ] Retries only on *transient* errors (timeout, 5xx, network). Never retry a 400 — it will fail forever.
- [ ] Max attempts is bounded and configured, not infinite.

## Scheduled work (cron)
- [ ] Cron jobs are **not** the source of truth. They reconcile; they don't compute.
      A cron that "updates overdue statuses" must be safe to run twice, and safe to *not* run for a day.
- [ ] Every cron has a heartbeat — if it stops running, someone finds out. A silent cron that died
      three weeks ago is how deadlines get missed.

## Observability (the part everyone skips)
- [ ] Structured logs with a correlation id per request/job.
- [ ] Errors go somewhere a human looks. `console.error` in an Edge Function is not monitoring.
- [ ] The three questions the system must be able to answer instantly:
      1. Did this specific borrower's e-mail actually send? When?
      2. Why is this loan's balance what it is? (event log, not a computed guess)
      3. What happened between the lead landing and the AI agent calling them?

## Smell list
- `setTimeout` used as a scheduler
- a job with no `attempts` counter
- a catch block that logs and continues as if nothing happened
- "we'll just re-run it manually if it fails"
