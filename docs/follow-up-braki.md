# Moduł „Follow-up braków" (wnioski niekompletne / do korekty)

Piąty silnik follow-up w Finance You. W odróżnieniu od pozostałych (generyczny
drip 120 szablonów, nurture „Ania", nudge czatowy AI, SMS sobotni) ten moduł
pyta klienta **kierunkowo o konkretne rzeczy, których brakuje do kompletnego
wniosku** — po polsku, bez AI, deterministycznie.

## Co dopytuje (brief braków)

Brief liczony jest per wniosek z czterech źródeł (w tej kolejności priorytetu):

1. **Dane podstawowe** — `evaluateApplicationCore()`
   (`src/lib/application-completeness.ts`): imię i nazwisko, kontakt, kwota,
   poprawny numer KW, zdjęcia/dokumenty.
2. **Pytania z analizy KW** — nierozwiązane znaleziska najnowszej analizy
   (`kw_land_register_analyses.result_json` + najświeższy stan z
   `kw_finding_resolutions`). Do klienta trafia gotowy `clientMessage` /
   `expectedFromClient` z silnika reguł oraz lista `requestedDocuments`.
   Obejmuje w szczególności:
   - **wysokość długu na hipotece** (dział IV — reguły R-CLTV,
     R-SECOND-RANK-CERT: zaświadczenie wierzyciela o saldzie i warunkach spłaty),
   - **zgody współwłaścicieli** (dział II — reguła R-COOWNERS: do ustanowienia
     hipoteki potrzebna jest zgoda WSZYSTKICH współwłaścicieli nieruchomości).
     Brane są tylko znaleziska o statusie STOP / WSTRZYMANE /
     WARUNKOWO_DOPUSZCZALNE ze stanem UNRESOLVED lub DOCUMENTS_REQUESTED.
3. **Fallback współwłaścicieli** — gdy analiza KW nie była jeszcze uruchomiona,
   ale `coowner_registry_checks` wykrył w dziale II więcej niż jeden podmiot,
   klient dostaje pytanie o zgodę wszystkich współwłaścicieli.
4. **Brakujące dokumenty wg typu nieruchomości** — `computeLoanProgress()`
   (`src/lib/loan-progress.ts`, wymagania z `property-documents.ts`).

Brief ma stabilny hash zestawu braków — gdy braki się zmienią (np. pojawi się
nowe pytanie z KW), następna wysyłka jest przyspieszana.

## Kto jest obejmowany

Wnioski w statusach kanonicznych: `brak_kwoty`, `brak_kw`,
`brak_zdjec_dokumentow`, `kontakt`, `kompletowanie_danych` oraz
`szukamy_inwestora` z niepustym briefem (klasa „do korekty" z
`/admin/wnioski-niekompletne`).

**Celowo poza modułem:** `nowy_lead` i `brak_kontaktu` — te obsługuje nurture
„Ania" (`lead_follow_up_schedule`) i drip mailowy 120 szablonów. Dzięki temu
klient nie dostaje dwóch równoległych scenariuszy mailowych.

## Kanały i zasady wysyłki

Rotacja e-mail → SMS → Messenger (start rotacji przesuwa się z numerem próby,
pierwszy dostępny kanał wygrywa):

- **E-mail** — `sendResendEmail()` (auto-branding, suppression guard). Pomijany,
  gdy `do_not_email`, `reminder_email_unsubscribed`, albo drip 120 szablonów
  wysłał maila w ostatnich 20 h (jeden scenariusz mailowy naraz). Stopka z
  linkiem wypisu: `/email/unsubscribe?m=<send_id>`.
- **SMS** — `sendSmsInternal()` (Twilio); okno 8:00–20:00 pon–sob; pomijany przy
  `do_not_sms`.
- **Messenger/Instagram** — wiersz w kolejce `messenger_outbox` (wysyła ją
  istniejący `follow-up-tick`). **Tylko gdy okno 24 h Meta jest otwarte**
  (inbound klienta na Messengerze/IG w ostatniej dobie) — `meta-send.server.ts`
  wysyła `messaging_type: RESPONSE`, więc poza oknem wiadomość i tak by nie
  doszła.

Zasady wspólne:

- okno modułu 7:00–21:00 pon–sob (Europe/Warsaw); cron co 30 min,
- kadencja: start od razu, potem +2/+3/+4/+7/+7/+14/+14/+30… dni, maks. 12 prób,
- **pauza 24 h po każdej odpowiedzi klienta** (inbound dowolnym kanałem) — nie
  wciskamy się w trwającą rozmowę,
- respektowane: `automation_paused`, `suppressed_emails`, pauza ręczna w panelu,
- log każdej wysyłki w `lead_communications` + snapshot briefu w
  `missing_info_follow_up_sends`.

## Elementy

| Element                       | Ścieżka                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| Brief (czysta logika + testy) | `src/lib/missing-info-follow-up/brief.ts`                               |
| Treści per kanał              | `src/lib/missing-info-follow-up/templates.ts`                           |
| Silnik (enrollment + wysyłka) | `src/lib/missing-info-follow-up/engine.server.ts`                       |
| Server functions panelu       | `src/lib/missing-info-follow-up/missing-info-follow-up.functions.ts`    |
| Cron tick                     | `src/routes/api/public/hooks/missing-info-follow-up-tick.ts`            |
| Panel admina                  | `/admin/follow-up-braki` (`src/routes/admin.follow-up-braki.tsx`)       |
| Migracja (tabele + cron)      | `supabase/migrations/20260730120000_missing_info_follow_up.sql`         |
| Rejestr silników              | `src/lib/follow-up-config.ts` (`FOLLOW_UP_ENGINES`, key `missing-info`) |

Tabele: `missing_info_follow_ups` (stan per wniosek: brief, kadencja, pauza)
oraz `missing_info_follow_up_sends` (log wysyłek, snapshot briefu, wypis).

## Panel admina

`/admin/follow-up-braki`: lista wniosków z badge'ami braków (dane / KW /
współwłaściciele / dokument), licznikiem prób i terminem następnej wysyłki;
akcje: pauza/wznowienie, „wyślij teraz", podgląd dokładnych treści e-mail/SMS/
Messenger i historii wysyłek.

## Agent głosowy „Ania — uzupełnia braki" (ElevenLabs)

Agent Conversational AI `agent_6501kysgcj34ff5byqst6z4b9bfz` (nadpisywalny env
`VITE_ELEVENLABS_MISSING_INFO_AGENT_ID`) jest osadzony w panelu klienta
(`/klient`) jako embeddable widget z CDN — komponent
`src/components/client/missing-info-voice-agent.tsx`. Karta + dymek pokazują
się TYLKO, gdy brief braków wniosku klienta jest niepusty
(`getMyMissingInfoBrief` w `missing-info-follow-up.functions.ts`).

Brief trafia do agenta atrybutem `dynamic-variables` w tej samej konwencji
nazw co telefoniczny webhook `elevenlabs-conversation-init` (`first_name`,
`missing_documents`, `missing_documents_count`, `missing_step`) plus
`missing_questions` — pełne pytania punkt po punkcie, więc jeden prompt agenta
obsługuje i telefon, i widget. Treści follow-upów (e-mail) wspominają
o możliwości rozmowy z Anią w panelu.

Świadomie użyto widgetu CDN zamiast `@elevenlabs/react`: build produkcyjny
instaluje zależności bunem z `bun.lock` przypiętym do rejestru Lovable, więc
dodanie zależności npm bez aktualizacji bun.lock wywróciłoby build.

## Znane ograniczenia / decyzje

- Messenger poza oknem 24 h Meta jest pomijany (wymagałoby to tagów
  `HUMAN_AGENT`/`MESSAGE_TAG` w `meta-send.server.ts` i zgód Meta — do
  rozważenia osobno).
- SMS „STOP" nie jest jeszcze parsowany automatycznie (opt-out SMS przez
  `clients.do_not_sms` ustawiane ręcznie/voicebotem) — treść SMS informuje o
  możliwości wypisu.
- `ELIGIBLE_STATUSES_FOR_REMINDERS` w `loan-progress.server.ts` zawiera głównie
  statusy legacy (drip/telefony łapią de facto tylko `nowy_lead`). Ten moduł
  celowo NIE korzysta z tej listy; jej naprawa to osobna decyzja, bo włączyłaby
  masowo pozostałe silniki dla nowych statusów.
