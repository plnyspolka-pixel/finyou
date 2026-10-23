# Public Ania conversations
- [x] Keep one live session for text and voice; preserve agent mappings and reconnect visibly. Nine session tests passed.
- [x] Replace duplicate public launchers with one Ania window; desktop/mobile checked, two real A2 answers received in the same conversation ID. Existing preview-only hydration warning remains unrelated; live spoken interaction not verified with a real microphone.

# YouTube first comments
- [x] Add per-track configuration, persistent idempotency and post-publication comments.
- [x] Test success, failures, fallback and unchanged historical publications: 45 tests pass.
- [ ] Confirm live YouTube comment after deployment and next authorized upload; no existing films may be touched. Current channel OAuth grant not verified.

# Storage migration export
- [x] Apply isolated token table and restricted listing function.
- [x] Add token-protected server route without changing existing routes or data.
- [x] Verify security boundaries and pagination: 14 tests passed; running route returns 401 without token; build OK.
- [ ] Verify authorized export against real Storage: no token provisioned, and existing data must remain unchanged.
- [ ] Existing public-ranking security finding: blocked by owner's decision; no unrelated policy changes authorized.