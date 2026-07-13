# Security & PII

Finance You handles PESEL, KW numbers, property addresses, income data, and signed contracts.
Under RODO this is a high-consequence dataset. Treat a leak as an existential risk, not a bug.

## Auth
- [ ] Authorization is enforced **server-side / in RLS**. Hiding a button is not access control.
- [ ] Roles are explicit (client / investor / broker / admin) and checked per-resource, not per-page.
- [ ] A broker cannot read another broker's leads. Test this, don't assume it.
- [ ] Admin actions are logged with actor + timestamp + before/after.

## Secrets
- [ ] No secret in the frontend bundle. Anything in a `VITE_*` / `NEXT_PUBLIC_*` var is public.
- [ ] Supabase `service_role`, Bedrock keys, SMTP creds, Facebook tokens: server-side only.
- [ ] Secrets are not in git. Check history, not just HEAD.
- [ ] Keys are rotatable — a compromised key must be replaceable without a code change.

## PII handling
- [ ] PESEL / dowód numbers: stored only if legally required, encrypted at rest, never logged,
      never returned to a frontend that doesn't need them.
- [ ] Logs are scrubbed of PII. A stack trace containing a PESEL is a reportable incident.
- [ ] File uploads (scans of documents, property photos) are in a **private** bucket with signed,
      short-lived URLs. A public Supabase storage bucket with contract scans is a catastrophe.
- [ ] Data retention: there is a documented answer to "when do we delete a rejected applicant's data?"

## The three classic web holes
- [ ] Injection: parameterized queries only. No string-built SQL, ever.
- [ ] XSS: no `dangerouslySetInnerHTML` on anything a user typed.
- [ ] IDOR: `/loan/123` — verify the caller owns loan 123 on the server. This is the #1 way these
      apps leak. Every single resource fetch by id.

## Encoding ≠ Encryption ≠ Tokenization
- Base64 is **not** security. If a PESEL is base64'd "for safety", that's a finding.
- Encryption = reversible with a key, for confidentiality.
- Tokenization = replace with a meaningless surrogate; the real value never enters the system.
  Use for card data if payments are ever added.
