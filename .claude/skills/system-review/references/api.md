# API & integrations

## Endpoint design (Edge Functions)
- [ ] Input is validated at the boundary with a schema (zod or equivalent). Never trust the client.
- [ ] The function returns typed, stable shapes. Errors are structured (`{code, message}`), not raw throws.
- [ ] Long work (>5s) does not happen in a request. It goes to a job. See `reliability.md`.
- [ ] Auth is checked **inside** the function, not only in the UI that calls it.
- [ ] No business logic lives only in the frontend. If the browser computes it, the browser can lie.

## External integrations (NBP, RCN/WFS, KW, e-mail, calling agent, Facebook Lead Ads)
- [ ] Every outbound call has an explicit **timeout**. A hanging RCN call must not hang a page.
- [ ] Every outbound call has **retry with exponential backoff + jitter** — and a cap.
- [ ] Failures are **degraded, not fatal**: if NBP is down, use the last cached reference rate and
      flag it as stale — do not block loan creation.
- [ ] Responses that are expensive and slow-changing (NBP rate, RCN geodata) are **cached** with a TTL
      and a documented staleness tolerance. NBP ref rate: cache 24h. RCN: cache indefinitely per parcel.
- [ ] The version-fallback pattern already used for RCN (WFS 2.0.0 → 1.1.0 → 1.0.0 → WMS) is fine, but
      it must **log which version succeeded** so degradation is visible.
- [ ] Circuit breaker on any integration that can be down for hours: after N failures, stop calling
      for M minutes and serve the degraded path immediately.

## Contracts with the outside world
- [ ] Inbound webhooks (Facebook leads, payment callbacks) verify a signature. An unsigned webhook
      endpoint is an open door.
- [ ] Inbound webhooks are idempotent by provider event id.
- [ ] Rate limit anything public-facing. A lead form endpoint will get spammed.

## Smell list
- `await fetch(...)` with no timeout
- a `try/catch` that swallows the error and returns success
- retry loop with no backoff (hammers a struggling service into staying down)
- external API called synchronously inside a page render
