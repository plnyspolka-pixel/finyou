# Powiadomienia push dla operatora

Natychmiastowe powiadomienia Web Push o kluczowych zdarzeniach w systemie,
każde z linkiem prosto do miejsca w panelu, w którym można je obsłużyć.
Działają także przy zamkniętej karcie panelu (Chrome, Edge, Firefox, Safari;
na iOS wymagane dodanie strony do ekranu głównego).

## O czym powiadamiamy

| Zdarzenie | `event` | Link | Odbiorcy |
| --- | --- | --- | --- |
| Nowy lead (formularz, czat, Messenger, telefon) | `lead:new` | `/operator/leady/<id>` | operator + administrator |
| Nowy wniosek o pożyczkę (landing / pośrednik) | `loan_application:new` | `/operator/wnioski/<id>` | operator + administrator |
| Wiadomość przychodząca — czat na stronie | `comm:inbound:chat` | `/operator/czat` | operator + administrator |
| Wiadomość przychodząca — Messenger | `comm:inbound:messenger` | `/operator/messenger` | operator + administrator |
| Wiadomość przychodząca — e-mail | `comm:inbound:email` | `/operator/skrzynka` | operator + administrator |
| Wiadomość przychodząca — SMS / telefon / WhatsApp / czat inwestora | `comm:inbound:*` | `/operator/leady/<id>` | operator + administrator |
| Odpowiedź inwestora na rozesłaną ofertę | `offer:reply` | `/operator/oferty` | operator + administrator |
| Opłacony dostęp (Tpay) | `payment:paid` | `/admin/finanse` | administrator |

Wiadomości przychodzące są throttlowane per lead + kanał (3 min), żeby ożywiona
rozmowa nie zasypała operatora dziesiątkami powiadomień.

## Konfiguracja (jednorazowa)

1. Wygeneruj parę kluczy VAPID:

   ```
   bun run scripts/generate-vapid-keys.ts
   ```

2. Ustaw sekrety środowiska aplikacji (Lovable Cloud / wrangler secrets — NIE
   commituj do repo):

   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` — opcjonalnie, domyślnie `mailto:kontakt@financeyou.pl`

   Bez kluczy funkcja jest wyłączona: wysyłka jest cicho pomijana, a strona
   ustawień pokazuje operatorowi komunikat o brakującej konfiguracji.

3. Wykonaj migrację `supabase/migrations/20260819140000_operator_push_notifications.sql`
   (tabela `push_subscriptions`) i zregeneruj typy `Database`
   (`src/integrations/supabase/types.ts`) przy najbliższej okazji.

## Włączenie przez operatora

Panel operatora → **Powiadomienia** (`/operator/powiadomienia`) → przełącznik
„Powiadomienia włączone" → zgoda przeglądarki. Subskrypcja dotyczy jednej
przeglądarki na jednym urządzeniu — na telefonie trzeba włączyć osobno.
Przycisk „Wyślij powiadomienie testowe" dostarcza test tylko do subskrypcji
wywołującego.

## Architektura

- `src/lib/web-push.server.ts` — implementacja Web Push na czystym WebCrypto
  (szyfrowanie aes128gcm wg RFC 8291/8188 + VAPID wg RFC 8292). Bez zależności
  `web-push` (node:crypto/https), więc działa też na Cloudflare Workers.
  Poprawność szyfrowania przypina test `src/lib/web-push.test.ts` do wektora
  testowego z załącznika A RFC 8291.
- `src/lib/operator-push.server.ts` — dispatch: wybór odbiorców po rolach
  (`user_roles`), wysyłka do wszystkich subskrypcji, sprzątanie martwych
  endpointów (HTTP 404/410), throttling wiadomości przychodzących.
- `src/lib/push.functions.ts` — funkcje serwerowe: konfiguracja dla klienta,
  zapis/usunięcie subskrypcji (tylko role pracownicze), test.
- `src/hooks/use-push-notifications.ts` + `src/routes/operator.powiadomienia.tsx`
  — UI subskrypcji w panelu operatora.
- `public/push-sw.js` — service worker: pokazuje powiadomienie i po kliknięciu
  otwiera/ogniskuje kartę panelu na linku ze zdarzenia.
- Tabela `public.push_subscriptions` — RLS włączone bez polityk; dostęp
  wyłącznie przez funkcje serwerowe (service role).

## Punkty zaczepienia (gdzie powstają zdarzenia)

- `src/lib/lead-comms.server.ts` — `upsertLeadFromSource` (nowy lead)
  i `logLeadCommunication` (każda wiadomość przychodząca; przez ten helper
  przechodzą: czat na stronie, czat inwestora, Messenger/IG, e-maile inbound
  Resend/Mailgun, SMS, połączenia voicebota).
- `src/lib/landing-application.functions.ts` — nowy wniosek o pożyczkę.
- `src/lib/offer-replies.server.ts` — odpowiedź inwestora na ofertę.
- `src/lib/access/webhook-core.server.ts` — opłacona płatność Tpay.

Nowe zdarzenie dodaje się jedną funkcją:

```ts
const { sendOperatorPush } = await import("@/lib/operator-push.server");
await sendOperatorPush({
  event: "moje:zdarzenie",
  title: "Tytuł",
  body: "Szczegóły",
  url: "/operator/...",
});
```
