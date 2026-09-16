# Wypis z korespondencji — „Wypisz mnie", STOP i strażnik „dość to dość"

Dotyczy poczty (Resend, Mailgun, kolejka Lovable) oraz kanałów Meta
(Messenger, Instagram Direct). SMS-y mają własny hamulec — `docs/limity-sms.md`.

## Problem (poczta)

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
adres". Czyste reguły (bez bazy, testowalne) siedzą w `src/lib/opt-out.ts`.

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

Reguła jest czysta i przetestowana: `decideSend` w `opt-out.ts`
(testy: `src/lib/opt-out.test.ts`).

### 4. Panel

`Marketing → Email → Wypisani` pokazuje w jednym miejscu adresy e-mail oraz
profile Messengera/Instagrama (po imieniu i nazwisku leada, nie po PSID) —
z kanałem, powodem, źródłem i cytatem z wiadomości klienta. Przycisk **Odblokuj** cofa pomyłkowy wypis: wpis na liście blokad zostaje jako
ślad (tabela jest append-only), ale dostaje znacznik `unblocked_at`, który
strażnik czyta jako „już nie blokuje". Do świadomej decyzji operatora.

## Messenger i Instagram

Ten sam problem był na kanałach Meta: `bot-loop-guard` rozpoznawał **boty**
(pętle, lawiny, ping-pong), ale nie rozpoznawał **człowieka, który prosi
o spokój**. Klient pisał „dajcie mi spokój", a nudge z `follow-up-tick` szedł
dalej, bo nic tego nie zapisywało.

- **Odpowiednik stopki.** Messenger nie ma stopki, więc wiadomości **proaktywne**
  (kolejka `messenger_outbox`, nudge'e z `follow-up-tick`) dostają dopisek
  „Napisz STOP, jeśli nie chcesz więcej wiadomości." — `withOptOutHint`
  w `messenger-opt-out.server.ts`. Odpowiedzi w trwającej rozmowie i wiadomości
  pisane ręcznie przez operatora dopisku nie dostają: klient właśnie z nami
  rozmawia.
- **Rozpoznanie odmowy.** Ten sam `detectOptOut` co w poczcie, wzbogacony
  o potoczne zwroty, którymi ludzie odmawiają na czacie („dajcie mi spokój",
  „odczepcie się", „zablokuję to konto"). Samo „STOP" też działa.
- **Wpięcie.** `handleInboundChannelOptOut` na początku
  `shouldSkipMessengerAutoReply` — przed wszystkimi heurystykami botowymi,
  więc obejmuje też odpowiedzi pod komentarzami na fanpage'u (publiczna
  odpowiedź + private reply). Wiadomość zostaje zalogowana w skrzynce, agent
  milczy, lead dostaje status `wymaga_kontaktu`.
- **Blokada wysyłki.** `canSendMetaMessage` w `sendMetaMessage`, czyli
  w jedynym miejscu, przez które wychodzi każda wiadomość Meta.
- **Kaskada na inne kanały.** „Dość" napisane na Messengerze wycisza też e-mail
  (pełny `applyOptOut`) i SMS-y (`clients.do_not_sms`) tego samego leada.
  Klient prosi o spokój od nas, a nie od jednej aplikacji. Telefonów nie
  ruszamy — „przestańcie pisać" to nie to samo co „nie dzwońcie".

### Kategorie na kanałach Meta

| Kategoria       | Co to jest                                                         | Wypis klienta | Twarda blokada |
| --------------- | ------------------------------------------------------------------ | ------------- | -------------- |
| `automated`     | agent, nudge'e follow-up, kolejka outbox, odpowiedzi na komentarze | blokuje       | blokuje        |
| `transactional` | wiadomość napisana ręcznie przez operatora w panelu                | przepuszcza   | blokuje        |

Wyciszenia **techniczne** z `bot-loop-guard` (`bot_detected`, `loop_detected`)
działają tu jak zwykły wypis: automat milczy, ale człowiek z panelu może
napisać. To heurystyki, a nie decyzja klienta — nie mogą zamykać drogi
operatorowi.

## Czego to NIE robi

- Nie blokuje telefonów. Wypis wycisza pisanie (poczta, Messenger/Instagram,
  SMS przez `clients.do_not_sms`), ale `do_not_call` zostaje decyzją operatora.
- Nie rusza SMS-owego hamulca poza flagą STOP — limity i okna godzinowe opisuje
  `docs/limity-sms.md`.
- Private reply pod komentarzem (`sendPrivateReplyToComment`) adresuje Meta po
  `comment_id`, więc nie zna PSID i nie sprawdza listy blokad sam z siebie —
  chroni go strażnik wyżej, w `shouldSkipMessengerAutoReply`.
- Nie kasuje danych klienta. Żądanie RODO ustawia twardą blokadę i flaguje leada
  do obsługi przez człowieka — usunięcie danych zostaje decyzją operatora.
- Nie wysyła maila z potwierdzeniem wypisu. Klient prosił o ciszę, więc dostaje
  ciszę; potwierdzenie widzi na stronie po kliknięciu linku.
