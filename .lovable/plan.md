
# Agent omnichannel: Messenger + Instagram + Email

Cel: Jeden agent ElevenLabs (text mode, ten sam co voicebot) odpisuje 24/7 na FB Messengerze, Instagram DM i mailach. Przyjmuje załączniki, parsuje je, uzupełnia `leads.application_data`, prowadzi rozmowę aż do kompletu danych, wysyła link do wniosku. Wszystko ląduje w `lead_communications` przy danym leadzie.

## Architektura

```text
Messenger/IG DM ──┐
                  ├──► /api/public/meta-messenger-webhook ──┐
Email + załączniki ┘                                        │
                  ──► /api/public/inbound-email-webhook ────┤
                                                            ▼
                                          match lead (email>tel>PSID/sender)
                                                            │
                                                            ▼
                                            log do lead_communications (in)
                                                            │
                                                            ▼
                                       ElevenLabs Text Agent (conversation API)
                                       + tool calls: update_lead_data, send_application_link
                                                            │
                                                            ▼
                                       wysyłka odpowiedzi (FB/IG Send API / email)
                                            + log (out)
```

## Co zrobię w kodzie

### 1. DB (migracja)
- `lead_communications`: dodaj kolumny `attachments jsonb`, `elevenlabs_conversation_id text`, `thread_external_id text` (do utrzymania kontekstu rozmowy per kanał per lead).
- `leads`: dodaj `messenger_psid text`, `instagram_igsid text`, indexy.

### 2. Server lib
- `src/lib/elevenlabs-text-agent.server.ts` — wywołanie ElevenLabs Text Conversation API z systemowym promptem, historią z `lead_communications`, tools:
  - `update_lead_data({field, value})` → patchuje `leads.application_data`
  - `send_application_link()` → generuje/zwraca `return_link`
  - `mark_ready_for_human()` (zostaje na wszelki wypadek, ale prompt instruuje pełną autonomię)
- `src/lib/meta-send.server.ts` — Graph API `me/messages` (Messenger + IG, ten sam endpoint, różny recipient).
- `src/lib/attachments.server.ts` — pobieranie URL załącznika → upload do bucket `documents` pod `leads/{lead_id}/{filename}` → metadane + `document--parse_document`-ekwiwalent (Lovable AI multimodal) do wyciągnięcia danych (dowód, wyciąg, KW).

### 3. Webhooki
- `src/routes/api/public/meta-messenger-webhook.ts` — GET (verify_token handshake) + POST (X-Hub-Signature-256 HMAC, obsługa `messaging` i `instagram` entries, wiadomości tekstowe + `attachments` typu image/file).
- `src/routes/api/public/inbound-email-webhook.ts` — przyjmuje payload od Resend Inbound (multipart, `from`, `subject`, `text`, `html`, `attachments[]`).

### 4. Admin UI
- W `admin.leady-all.$id.tsx` w zakładce Komunikacja: render dymków Messenger/IG/Email + miniatury załączników + link do pobrania z `documents` bucketu.

## Co potrzebuję od Ciebie (Meta + email inbound)

### Meta (Messenger + Instagram)
1. Aplikacja na developers.facebook.com (Business type), produkt **Messenger** + **Instagram Graph API**.
2. Połącz Facebook Page → Instagram Business Account → aplikacja.
3. Wygeneruj **Page Access Token** (long-lived).
4. W ustawieniach Webhooków podaj:
   - Callback URL: `https://app.financeyou.pl/api/public/meta-messenger-webhook`
   - Verify Token: dowolny string (zapiszę go jako `META_WEBHOOK_VERIFY_TOKEN`)
   - Subskrybuj eventy: `messages`, `messaging_postbacks`, `message_reactions`, `instagram` → `messages`.
5. App Secret już masz (`META_APP_SECRET`) — używam do HMAC.

Sekrety do dodania: `META_PAGE_ACCESS_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `META_IG_ACCOUNT_ID` (opcjonalnie do disambiguacji).

### Email inbound z załącznikami
Lovable Emails (Resend pod spodem) **nie wspiera inbound parsing**. Opcje:
- **A. Resend Inbound** (preview, w trakcie roll-outu) — najprościej, ten sam dashboard.
- **B. Mailgun Routes** — sprawdzony, parsuje MIME + załączniki, posta na nasz webhook.
- **C. Cloudflare Email Routing → Worker → nasz endpoint** — darmowe, ale więcej setupu.

Rekomenduję **B (Mailgun)** dla pewności inbound + załączniki. Trzeba: konto Mailgun, dodać domenę `inbox.financeyou.pl` (MX), Route: `match_recipient("kontakt@inbox.financeyou.pl") → forward("https://app.financeyou.pl/api/public/inbound-email-webhook")`.

Sekret: `MAILGUN_WEBHOOK_SIGNING_KEY` (do weryfikacji HMAC).

### ElevenLabs Text Agent
W panelu ElevenLabs utwórz osobnego agenta typu **Text** (albo użyj istniejącego voicebota — jeśli ma włączony text mode). System prompt zbuduję ja, Ty wkleisz. Potrzebuję `ELEVENLABS_TEXT_AGENT_ID`.

## Kolejność wdrożenia
1. Migracja DB (kolumny attachments/psid/igsid).
2. Lib (text-agent, meta-send, attachments).
3. Webhooki Meta + Email + sekrety.
4. UI komunikacji w panelu leada.
5. Smoke test: napisz na Page → sprawdź lead + odpowiedź + log.

## Pytania blokujące
- Mailgun OK czy wolisz Resend Inbound (poczekamy aż wypuszczą) / Cloudflare?
- Czy używamy istniejącego voicebot-agenta EL w trybie text, czy tworzysz nowego dedykowanego do DMów?
- Domena inbound: `kontakt@financeyou.pl` (wymaga przekierowania MX) czy subdomena typu `kontakt@inbox.financeyou.pl` (zalecane — bez konfliktu z obecnym MX)?
