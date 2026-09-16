# Wypis mailowy — stopka „Wypisz mnie" i strażnik „dość to dość"

## Problem

1. **Nie było jak się wypisać.** Link „Wypisz mnie" w stopce pojawiał się tylko
   wtedy, gdy wywołujący sam podał `unsubscribeUrl` — robiły to dwa silniki
   (drip przypomnień i follow-up braków). Kampanie marketingowe dostawały od AI
   copy z placeholderem `{{unsubscribe_url}}`, którego nikt nie podstawiał, więc
   do klientów szedł martwy link. Nagłówków `List-Unsubscribe` nie było wcale —
   Gmail i Outlook nie pokazywały przycisku wypisu, a jedyną drogą odbiorcy
   zostawało „zgłoś jako spam".
2. **„Dość" nie działało.** Kilka razy klient napisał wprost, żeby przestać do
   niego pisać — i nic się nie działo, bo wypis był możliwy wyłącznie kliknięciem
   w link. Automaty (drip, follow-up braków, kampanie, auto-odpowiedzi agenta)
   pisały dalej. Kampanie marketingowe w ogóle nie sprawdzały listy blokad —
   `sendViaResend` omijał `suppressed_emails`, tak samo jak kolejka Lovable
   i tor Mailgun.

## Rozwiązanie

`src/lib/email-unsubscribe.server.ts` — jedno miejsce, które generuje link
wypisu, wykonuje wypis i odpowiada na pytanie „czy wolno wysłać maila na ten
adres". Czyste reguły (bez bazy, testowalne) siedzą w `src/lib/email-opt-out.ts`.

### 1. Stopka i nagłówki w każdym mailu

Każda wysyłka przez `sendResendEmail`, `sendViaResend` i `sendMailgunEmail`:

- dostaje trwały token wypisu adresu (`email_unsubscribe_tokens`, jeden na
  adres) i link `\<baseUrl\>/email/unsubscribe?t=<token>` w stopce,
- dostaje nagłówki `List-Unsubscribe` + `List-Unsubscribe-Post`
  (one-click, RFC 8058) — klient pocztowy pokazuje własny przycisk wypisu,
- podstawia `{{unsubscribe_url}}` w treści (copy z AI) prawdziwym linkiem.

Stopka `wrapBrandedEmail` **zawsze** mówi, jak przestać dostawać wiadomości —
jeśli linku nie udało się wygenerować, podaje drogę przez odpowiedź („odpisz
słowem »wypisz mnie«"), którą i tak rozpoznaje strażnik.

Punkty wypisu:

| Wejście                               | Obsługa                                        |
| ------------------------------------- | ---------------------------------------------- |
| `?t=<token>` — stopka każdego maila   | `src/routes/email.unsubscribe.tsx`             |
| one-click z Gmaila/Outlooka (POST)    | `src/routes/api/public/email/unsubscribe.ts`   |
| `?s=` / `?m=` — starsze linki z dripu | `src/routes/email.unsubscribe.tsx` (bez zmian) |
| skarga spam / `email.unsubscribed`    | `src/routes/api/public/resend-webhook.ts`      |
| odpowiedź mailem („dość")             | strażnik, niżej                                |

### 2. Strażnik „dość to dość"

`detectOptOut` (PL + EN) analizuje temat i **własną treść** odpowiedzi — cytowana
historia wątku jest odcinana (`stripQuotedReply`), inaczej nasza własna stopka
„Wypisz mnie" w cytacie wyglądałaby na rezygnację klienta.

Wpięcie: `handleInboundOptOut` w `email-guard.server.ts`, wywoływane w obu
webhookach poczty przychodzącej (Resend i Mailgun) **zanim** wiadomość pójdzie
gdziekolwiek dalej — również przed routingiem odpowiedzi inwestora na ofertę.
Wiadomość zostaje zalogowana na leadzie, ale żaden automat już nie odpisuje,
a lead dostaje status `wymaga_kontaktu`.

Wypis (`applyOptOut`) jest wpisywany od razu we wszystkie tory:

- `suppressed_emails` (lista blokad czytana przed każdą wysyłką),
- `clients.do_not_email`,
- `loan_applications.reminder_email_unsubscribed` (drip + follow-up braków),
- `email_subscribers.status = 'unsubscribed'` (kampanie),
- `comms_suppressions` (wspólna tabela kanałów),
- notatka na leadzie + wpis w `automation_events` (operator widzi powód i cytat).

### 3. Kategorie wysyłki

| Kategoria       | Co to jest                                                                                            | Zwykły wypis | Twarda blokada |
| --------------- | ----------------------------------------------------------------------------------------------------- | ------------ | -------------- |
| `automated`     | domyślna: marketing, przypomnienia, follow-upy, auto-odpowiedzi, dystrybucja ofert                    | blokuje      | blokuje        |
| `transactional` | mail z umowy albo odpowiedź na akcję klienta: dostęp po płatności, dokumenty, harmonogram, windykacja | przepuszcza  | blokuje        |

Twarda blokada powstaje przy skardze „to spam" oraz przy powołaniu się na RODO,
cofnięciu zgody czy groźbie skargi do UODO/UOKiK. Techniczne powody (`bounce`,
`loop_detected`, `bot_detected`, `repeated_content`) blokują wszystko, tak jak
wcześniej.

Reguła jest czysta i przetestowana: `decideEmailSend` w `email-opt-out.ts`
(testy: `src/lib/email-opt-out.test.ts`).

### 4. Panel

`Marketing → Email → Wypisani` pokazuje zablokowane adresy z powodem, źródłem
i cytatem z wiadomości klienta. Przycisk **Odblokuj** cofa pomyłkowy wypis: wpis na liście blokad zostaje jako
ślad (tabela jest append-only), ale dostaje znacznik `unblocked_at`, który
strażnik czyta jako „już nie blokuje". Do świadomej decyzji operatora.

## Czego to NIE robi

- Nie blokuje SMS-ów ani telefonów — to osobny hamulec (`docs/limity-sms.md`,
  `clients.do_not_sms`, `do_not_call`). Wypis mailowy dotyczy tylko poczty.
- Nie kasuje danych klienta. Żądanie RODO ustawia twardą blokadę i flaguje leada
  do obsługi przez człowieka — usunięcie danych zostaje decyzją operatora.
- Nie wysyła maila z potwierdzeniem wypisu. Klient prosił o ciszę, więc dostaje
  ciszę; potwierdzenie widzi na stronie po kliknięciu linku.
