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

| Kategoria        | Źródła                                                                                                                                                                   | Zasady                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `critical`       | `phone_verification` (OTP), `panel_manual`, `windykacja`, `test`                                                                                                         | bez limitów                                                                                       |
| `conversational` | `sms_agent_reply` (odpowiedź na SMS, który klient sam wysłał)                                                                                                            | bez okna godzinowego; limit 8/24 h i blokada powtórki tej samej treści w 24 h (bezpiecznik pętli) |
| `automated`      | cała reszta: `lead_welcome`, `meta_lead`, `follow_up_sms_*`, `ania_callback_sms`, `saturday_reminder`, `missing_info_follow_up`, `elevenlabs_agent`, zapowiedzi telefonu | pełny zestaw reguł ↓                                                                              |

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

## Jeden SMS na wejściu leada

Nowy lead z Mety dostaje **dokładnie jedną** wiadomość:

```
Finance You: pozyczki pod zastaw nieruchomosci juz od 1,79% - kliknij: https://financeyou.pl/s/ab3x9k
```

- bez polskich znaków — z diakrytykami Twilio koduje SMS jako UCS-2 (70 znaków
  na segment zamiast 160) i jedna wiadomość rozbiłaby się na dwie,
- link jest krótki (`financeyou.pl/s/<kod>`), a nie surowym adresem
  `…supabase.co/auth/v1/verify?token=…`, który zajmował kilka segmentów, wyglądał
  jak phishing i wygasał po ~godzinie,
- adres docelowy rozwiązujemy dopiero **przy kliknięciu**: gdy znamy maila
  klienta, generujemy wtedy świeży magic link (link z SMS-a działa więc też po
  kilku dniach); bez maila idziemy na `/wniosek/<token>`.

Wysyłka: `src/lib/lead-welcome-sms.server.ts` (`sendLeadWelcomeSms`), wołana
z webhooka Mety i z pull-syncu — idempotentnie per numer, **przed** telefonem
Ani. Dzięki temu hamulec (1 SMS automatyczny / 24 h) odcina tego dnia zapowiedź
rozmowy, SMS agenta ElevenLabs i pierwszy krok kadencji.

Gdy lead wpadnie poza oknem (noc, niedziela), SMS nie ginie — ląduje
w `lead_follow_up_schedule` (`channel: "sms"`, `step_index: 0`,
`metadata.kind: "lead_welcome"`) i wychodzi, gdy okno się otworzy.

Kadencja SMS-owa zaczyna się teraz od **3. dnia** (`smsDays`
w `follow-up-plan.server.ts`), bo dzień 1 obsługuje SMS powitalny.

### Krótkie linki

Tabela `short_links` (migracja `20260910120000_short_links.sql`) + route
`/s/$code` (`src/routes/s.$code.ts`). Kod ma 6 znaków z alfabetu bez mylących
par (`0/O`, `1/l/I`). Każde kliknięcie podbija `click_count` i `last_clicked_at`
— widać, które SMS-y realnie działają.

Prefiksy w aplikacji: `/l/<slug>` to landing page, `/r/<kod>` to linki kampanii
marketingowych, `/s/<kod>` to linki z SMS-ów.

## Telefony: jeden na dobę, zapowiedź tylko przed pierwszym

Zgłoszenie „chodziłem po stronie i znowu dostałem SMS i telefon" miało dwie
przyczyny w torze telefonicznym:

1. **Throttle nie widział zakończonych rozmów.** Filtr brzmiał
   `status in ("w_trakcie", "wykonane")`, a webhook ElevenLabs zamyka rozmowę
   statusem `zakonczona` / `nieodebrana` / `poczta_glosowa` / `blad`. Telefon
   znikał z pola widzenia hamulca w chwili, w której się kończył. Teraz liczymy
   po `started_at` (ustawianym tylko przy realnym wybraniu numeru), więc
   placeholdery z kolejki niczego nie blokują, a odbyte rozmowy — blokują.
2. **`auto_retry` co 20 minut.** Nieodebrany telefon planował kolejny za 20 min
   (busy 25, poczta 45, błąd 60), przy limicie 6 prób — stąd seria od 9:15 do
   11:15. Odstęp to teraz doba (+5 min ponad próg throttle'a), limit 6 prób
   zostaje.

Do tego zniknął wyjątek `ania_callback` („2× dziennie, min. 5 h") — obowiązuje
**jeden telefon na dobę na numer, z każdego źródła** (poza `source: "test"`
z panelu). Ten sam filtr po `started_at` poprawiono w cronie `ania-callbacks`
i w dedupie `calculator-followup`.

Zapowiedź „za chwilę zadzwoni Ania" wychodzi wyłącznie przed **pierwszym**
telefonem na dany numer (`hasEverBeenCalled`). Przy kolejnych podejściach nic
nie wnosiła, a klient dostawał ją raz po raz.

## Zmiana w `ania-callbacks`

Cron wysyłał SMS „proszę o kontakt" zawsze, także wtedy, gdy właśnie dzwonił —
i robił to 2× dziennie. Teraz SMS idzie **tylko wtedy, gdy telefon nie poszedł**
(throttle / quiet hours / błąd) i tylko gdy numer nie ma `do_not_sms`.

## Testy

`src/lib/sms-guard.test.ts` — pokrywa klasyfikację źródeł, normalizację treści
(magic linki), okno godzinowe, niedzielę, limity, STOP, pętlę konwersacyjną
i pełny scenariusz z reklamacji (lead z Mety nie dostaje serii SMS-ów).

`src/lib/lead-welcome-sms.test.ts` — treść SMS-a powitalnego (jeden segment
GSM-7, oferta + link), kody krótkich linków i dowód, że po SMS-ie powitalnym nic
innego tego dnia nie przejdzie.
