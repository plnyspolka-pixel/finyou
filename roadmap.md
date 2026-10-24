# Public Ania conversations
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

# Zaproszenia Trustpilot po lead magnecie
- [x] Ukryta kopia do adresu AFS w mailu z linkiem przy pierwszym zapisie na materiał; pole `bcc` w wysyłce Resend; karta Trustpilot w /admin/integracje (adres tylko z domeny invite.trustpilot.com, przełącznik dla lead magnetów). Testy: 5 nowych, 70 przeszło razem z pakietem lead magnetów; lint i Prettier czyste.
- [ ] Wpisać adres AFS z Trustpilot Business i włączyć integrację; potwierdzić pierwsze zaproszenie w panelu Trustpilot po realnym pobraniu. Limit zaproszeń planu Free nieweryfikowany.
- [x] Widżet TrustBox (Review Collector) w sekcji „Opinie” na stronie głównej i link do profilu w stopce; identyfikator profilu odczytany z publicznej strony Trustpilot. Testy komponentu: 3.
- [ ] Po pierwszych opiniach i ewentualnym planie płatnym przełączyć sekcję na szablon z treścią opinii (Carousel).
