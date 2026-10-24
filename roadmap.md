# Public Ania conversations
- [ ] Ania test corrections: merge provider placeholders, personalized investor greeting, text filler filtering, caller-scoped loan purpose tools, callback evaluation; tests and approved publish.
- [x] Update shared identity rules without editing stored prompts; 22 tests pass. Only A1/A2 synchronized and verified by ElevenLabs readback; all stored prompt rows unchanged. Approved publication scheduled; completion not yet confirmed.
- [x] Route public Ania entries through A0; preserve contextual panel agents and brand investor assistant Ania. Seven tests passed; real A2P transfers verified on home and /dla-inwestora with one socket and unchanged conversation ID. /dla-inwestorow does not exist in this repository. Provider-generated greetings can recur; prompts/voices untouched. No production publication; real microphone unverified.
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
# Investor leads & Ania tools (rebuilt 2026-10-24)
- [x] Per-form lead role (Admin → Meta Ads → Formularze → Rola leada; fallback by name „inwest”); investor leads skip loan application/borrower SMS/cadence, get investor SMS + A2P voice call. New leads only, no backfill.
- [x] Messenger: investor → A2P text, unrecognized → A0, borrowers unchanged. Lead context variables passed to calls and text turns.
- [x] A3 tools (OTP + own account state) attached; borrower tool removed; panel passes investor_id + session token.
- [x] schedule_investor_callback for A2P voice/text, real queue entries within calling rules.
- [ ] Live Meta lead / phone / SMS test after publication (needs a real form submission).
