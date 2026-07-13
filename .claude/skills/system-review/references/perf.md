# Performance — only after measuring

## Rule zero
**Do not optimize anything you have not measured.** Ask for: the endpoint, the p95 latency, the
`EXPLAIN ANALYZE`, or the browser waterfall. If none exist, the first task is to get one.

## Order of investigation (cheapest cause first)
1. **N+1 query** — 90% of "the app is slow" in a Supabase/React app. Look for `.map(async)`.
2. **Missing index** — `EXPLAIN ANALYZE` shows `Seq Scan` on a big table.
3. **Over-fetching** — `SELECT *` + join pulling 200 columns to render 4.
4. **Synchronous external call** — an RCN/NBP call inside a render path.
5. **Unbounded list** — no pagination; loading all 4,000 loans to show 20.
6. **Frontend bundle** — only then. Code-split the heavy stuff (document generators, PDF libs, maps).

## Caching — where, in order of value here
| Layer | Cache what | TTL |
|---|---|---|
| App / DB | NBP reference rate | 24h |
| App / DB | RCN parcel geodata | permanent (immutable per parcel) |
| App | Generated schedules & documents | permanent (persist, never regenerate) |
| HTTP/CDN | Static assets, marketing pages | long, content-hashed |
| Client | React Query on list views | short (30–60s) |

**Do not cache**: loan balances, payment status, anything a user acts on. Stale money = wrong decisions.

## Cache failure modes (if you do add caching)
- **Stampede**: key expires, 500 requests hit the DB at once → add jitter to TTL + a rebuild lock.
- **Penetration**: repeated lookups of a key that never existed → cache the negative result too.
- **Avalanche**: everything expires simultaneously → never use a uniform TTL.

## What NOT to do in this system
- Read replicas, sharding, Kafka, microservices, service mesh, Redis cluster.
  This is a low-traffic system. These add failure modes and buy nothing.
  If someone (including me) proposes one, demand the number that justifies it first.
