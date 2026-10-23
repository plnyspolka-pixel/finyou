# Storage migration export
# YouTube first comments
- [ ] Add per-track configuration, persistent idempotency and post-publication comments.
- [ ] Test success, failures, fallback and unchanged historical publications.

- [x] Apply isolated token table and restricted listing function.
- [x] Add token-protected server route without changing existing routes or data.
- [x] Verify security boundaries and pagination: 14 tests passed; running route returns 401 without token; build OK.
- [ ] Verify authorized export against real Storage: no token provisioned, and existing data must remain unchanged.
- [ ] Existing public-ranking security finding: blocked by owner's decision; no unrelated policy changes authorized.