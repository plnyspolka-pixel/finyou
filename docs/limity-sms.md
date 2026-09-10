# Limity SMS — jeden hamulec dla wszystkich automatów

## Problem

SMS-y wychodziły z kilku niezależnych torów, a każdy pilnował tylko siebie.
Jeden lead (np. testowy z Mety) dostawał tego samego dnia:

- „Za chwilę zadzwoni nasza asystentka głosowa Ania…" — przy **każdej** próbie
  telefonu (`maybeSendSms("before_call")`),
- SMS z magic linkiem („dokończ wniosek") od agenta ElevenLabs,
- SMS z kadencji follow-up (dzień 1),
- SMS z `ania-callbacks` — 2× dziennie, niezależnie od tego, czy telefon poszedł,
- ewentualnie SMS z `missing_info_follow_up` albo sobotnie przypomnienie.

Żaden tor nie sprawdzał też `clients.do_not_sms` (STOP) poza sobotnim cronem.

## Rozwiązanie

`src/lib/sms-guard.server.ts` — jeden hamulec wpięty w `sendSmsInternal`
(`src/lib/voicebot.functions.ts`), czyli w jedyne miejsce, przez które przechodzi
każda wysyłka SMS w systemie.

### Kategorie

| Kategoria        | Źródła                                                                                                                               | Zasady                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `critical`       | `phone_verification` (OTP), `panel_manual`, `windykacja`, `test`                                                                     | bez limitów                                                                                       |
| `conversational` | `sms_agent_reply` (odpowiedź na SMS klienta), `elevenlabs_agent` (SMS zamówiony w rozmowie)                                          | bez okna godzinowego; limit 8/24 h i blokada powtórki tej samej treści w 24 h (bezpiecznik pętli) |
| `automated`      | cała reszta: `meta_lead`, `follow_up_sms_*`, `ania_callback_sms`, `saturday_reminder`, `missing_info_follow_up`, zapowiedzi telefonu | pełny zestaw reguł ↓                                                                              |

Kategoria wynika ze źródła (`classifySmsSource`); wywołujące mogą ją podać wprost
parametrem `category` w `sendSmsInternal`.

### Reguły dla SMS-ów automatycznych

1. **STOP** — `clients.do_not_sms = true` blokuje wysyłkę.
2. **Okno** — 8:00–20:00 Europe/Warsaw, poniedziałek–sobota (niedziela: cisza).
3. **Dedup treści** — ta sama wiadomość nie poleci drugi raz w oknie 14 dni.
   Porównanie ignoruje URL-e, więc magic linki z różnymi tokenami liczą się jako
   ta sama treść.
4. **Limit dobowy** — maks. 1 SMS automatyczny na numer / 24 h.
5. **Limit tygodniowy** — maks. 3 SMS automatyczne na numer / 7 dni.

Pominięty SMS ląduje w `automation_events` (`automation_type: "twilio_sms"`,
`status: "skipped"`, `response_payload.blocked_by = "sms_guard"`) z powodem —
widać w panelu, dlaczego wiadomość nie poszła. `sendSmsInternal` zwraca wtedy
`{ ok: false, skipped: true, reason }`, więc kroki kadencji zamykają się jako
`skipped`, a nie `error` (nie wracają w kolejnych tickach).

### Strojenie bez zmiany kodu

Zmienne środowiskowe (wszystkie opcjonalne):

| Zmienna                          | Domyślnie |
| -------------------------------- | --------- |
| `SMS_AUTOMATED_MAX_PER_24H`      | `1`       |
| `SMS_AUTOMATED_MAX_PER_7D`       | `3`       |
| `SMS_CONVERSATIONAL_MAX_PER_24H` | `8`       |
| `SMS_DUPLICATE_WINDOW_DAYS`      | `14`      |
| `SMS_WINDOW_START_HOUR`          | `8`       |
| `SMS_WINDOW_END_HOUR`            | `20`      |

## Zmiana w `ania-callbacks`

Cron wysyłał SMS „proszę o kontakt" zawsze, także wtedy, gdy właśnie dzwonił —
i robił to 2× dziennie. Teraz SMS idzie **tylko wtedy, gdy telefon nie poszedł**
(throttle / quiet hours / błąd) i tylko gdy numer nie ma `do_not_sms`.

## Testy

`src/lib/sms-guard.test.ts` — pokrywa klasyfikację źródeł, normalizację treści
(magic linki), okno godzinowe, niedzielę, limity, STOP, pętlę konwersacyjną
i pełny scenariusz z reklamacji (lead z Mety nie dostaje serii SMS-ów).
