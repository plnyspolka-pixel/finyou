# Plan pracy przed wdrożeniem produkcyjnym

Trzy obszary do domknięcia przed wejściem na produkcję, w kolejności ważności
uzgodnionej z właścicielem:

1. **Umowy inwestora** — NDA + umowa powierzenia danych osobowych + umowa
   pośrednictwa finansowego: generowane automatycznie z danymi potwierdzonymi
   przez Didit, akceptowane przed dostępem do modułu ofert / szkoleń,
   archiwizowane w folderze klienta z pełnym śladem dowodowym.
2. **Boty w ElevenLabs** — wszystkie boty obsługujące proces składania wniosku
   i obsługę wniosków przez inwestorów instytucjonalnych przeniesione do
   ElevenLabs jako osobne agenty per etap procesu, zorkiestrowane; boty
   procesowe znikają z systemu głównego.
3. **Status wniosku w profilu klienta** — klient („ryba") po zalogowaniu zawsze
   widzi aktualny status swojego wniosku.

Plan opiera się na faktycznym stanie repo (ścieżki i tabele zweryfikowane).
Każdy obszar ma: co już jest, co budujemy, migracje, punkty zaczepienia w
kodzie i checklistę wdrożeniową.

---

## Obszar 1 — Umowy inwestora (pakiet FY-LEGAL-2026-09-04, paczka prawnika v5)

> **Zmiana architektury (2026-09-04):** właściciel dostarczył paczkę
> kancelaryjną `Paczka_Inwestor_v5.zip`. Zastępuje ona wcześniejszy plan
> „NDA + powierzenie + pośrednictwo z placeholderami" — obowiązuje model:
> **Ramowa umowa pośrednictwa finansowego (02, v5)** → **NDA i zakaz
> obchodzenia (01, v5)** → **Umowa udostępniania i ochrony danych osobowych
> (03, v4, Moduł A)** → **Formularz Zlecenia (Załącznik nr 7)** → cykl
> per Projekt (teaser → Karta Leada → Karta Transferu → Ujawnienie →
> rezerwacja 24 h + 12 h). Kanoniczne DOCX + `MANIFEST.sha256` leżą w
> `docs/legal/paczka-inwestor-v5/`.

### Etap U1 — ZROBIONE (uśpione do przeglądu kancelarii)

Zaimplementowane i wdrożone; pakiet startuje z `legal_documents.active=false`
(inwestor widzi „pakiet w przygotowaniu"), aktywacja jednym przyciskiem w
`/admin/umowy-inwestorow` **dopiero po potwierdzeniu przeglądu kancelarii**.

- **Migracja `20260904120000_investor_legal_pack.sql`**: rejestr
  `legal_documents` (kod, wersja, tytuł, SHA-256 pliku DOCX, pełny tekst,
  DOCX w base64 do doręczeń, `active`), `investors.entity_variant`
  (osoba_fizyczna/jdg/osoba_prawna) + `is_consumer`,
  `investor_agreement_acceptances` (ślad audytowy per § 4 ust. 2 / Zał. 5:
  wersja + hash, snapshot komparycji, oświadczenia, metoda uwierzytelnienia,
  IP + urządzenie, id doręczenia, sesja Didit; `UNIQUE (user, code,
  version)`), `legal_deliveries` (doręczenia na trwałym nośniku),
  `investor_orders` (Zlecenia: kwota ± 15 %, maks. okres, min. zysk roczny,
  ważność 30/60/90 dni, statusy złożone/przyjęte/wykonane/wygasłe/cofnięte/
  odmowa, wybór konsumencki per Zlecenie), RPC
  `investor_legal_pack_complete(user)` + RLS (właściciel / personel).
- **Server functions** `src/lib/investor-agreements/legal-pack.functions.ts`:
  stan pakietu, pełne treści, identyfikacja strony (wariant + Konsument),
  doręczenie pakietu e-mailem z załącznikami DOCX (trwały nośnik — dla
  Konsumenta obowiązkowe PRZED akceptacją Umowy ramowej, § 15 ust. 1),
  akceptacja w wymuszonej kolejności ramowa → NDA → RODO z potwierdzeniem
  e-mail (wersja + SHA-256), Formularz Zlecenia za bramką RPC (komplet 1–5),
  cofnięcie Zlecenia, panel admina (aktywacja pakietu, dziennik akceptacji,
  decyzje o Zleceniach: przyjęcie z limitem 3 jednocześnie przyjętych i
  terminem ważności / odmowa z powodem; leniwe wygaszanie po terminie).
- **Weryfikacja tożsamości samego inwestora**:
  `extractDiditPersonalData(decision)` w `src/lib/didit.server.ts` +
  `src/lib/investor-agreements/didit-self.functions.ts`
  (`vendor_data = investor:<user_id>`, reużycie aktywnej sesji, dane
  potwierdzone trafiają do snapshotu komparycji przy każdej akceptacji).
- **UI**: kreator `/inwestor/umowy` (kroki 1–5 + Formularz Zlecenia + lista
  Zleceń; **żaden checkbox nie startuje zaznaczony** — § 15 ust. 7,
  egzekwowane też serwerowo `z.literal(true)`), ścieżka dostępna bez
  subskrypcji (subskrypcja daje „możliwość składania Zleceń", nie dostęp do
  umów) oraz `/admin/umowy-inwestorow` (dokumenty + hashe + aktywacja,
  dziennik akceptacji, decyzje o Zleceniach z SLA 2 dni roboczych).
- **Forma dokumentowa** (decyzja właściciela): akceptacja w panelu + trwały
  nośnik e-mail; kwalifikowany e-podpis to świadomie etap późniejszy.

**Uwagi dla właściciela (nie do pominięcia):**

1. W treściach dokumentów prawnik zaszył na sztywno `plnyspolka@gmail.com`
   i tel. `889 888 700` — każda zmiana tych danych wymaga NOWEJ wersji
   dokumentu od kancelarii (zmienia się hash).
2. Aktywacja pakietu = przycisk w `/admin/umowy-inwestorow`, dopiero po
   przeglądzie kancelarii (w szczególności: sekwencyjne przedstawianie tego
   samego Projektu kolejnym zleceniodawcom i Kara Obejściowa wobec
   Konsumenta — pkt 4 uwag wdrożeniowych paczki).
3. Sekrety Didit produkcyjne (`DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`)
   trzeba skopiować z konsoli Didit do Lovable — workflowy produkcyjne są
   już opublikowane (KYC `1612939d…`, KYB `c7f1dde1…`).

### Etap U2 — DO ZROBIENIA (pełny cykl Zlecenie–Projekt)

1. **Teaser per Zlecenie** — generowanie teasera wyłącznie dla pary
   Projekt–Zlecenie (system NIE może mieć ścieżki teasera bez numeru
   Zlecenia — uwaga wdrożeniowa nr 2 paczki).
2. **Karta Leada (Załącznik nr 1)** per para Projekt–Zlecenie: pola
   Nr Zlecenia, Parametry, Przyjęcie/Dopasowanie; akceptacja Karty Leada
   PRZED Ujawnieniem Identyfikującym; dla Konsumenta odrębne, logowane
   uzgodnienie Kary Obejściowej.
3. **Rezerwacje**: wyłączność 24 h (+12 h przedłużenia) wobec innych
   zleceniodawców; dziennik: przyjęcie Zlecenia, Dopasowanie, przypisanie
   Projektu, rezerwacja, decyzja, przekazanie do kolejnego Zlecenia —
   każde z datą i wersją dokumentów.
4. **Karta Transferu Danych** (Moduł RODO) zatwierdzana per Projekt przed
   Ujawnieniem; **Załącznik nr 6** (dyspozycja Klienta + klauzula
   prowizyjna) przy wypłacie — Prowizja Klientowska 7 % / min 5000 zł na
   rachunek Finance You najpóźniej z pierwszą wypłatą.
5. **Internetowa funkcja odstąpienia** dla Konsumenta (wzór — Załącznik
   nr 4) + obsługa 14-dniowego biegu terminu per Zlecenie.
6. **Przystąpienia spółek** do NDA (Załącznik nr 1 NDA) dla podmiotów
   innych niż Inwestor.
7. **Język systemu i marketingu**: wymienić każde „dostęp do Projektów /
   spraw / okazji" na „możliwość składania Zleceń" (§ 5 ust. 7);
   subskrypcja = bramka składania Zleceń.
8. Stary plan `investor_agreements`/`agreement_kind` (nda, data_processing,
   financial_intermediation) jest NIEAKTUALNY — nie implementować.

### Checklista produkcyjna obszaru 1

- [x] Kanoniczne DOCX + manifest SHA-256 w repo.
- [x] Migracja pakietu + RLS + RPC (wdrożona na produkcję, pakiet uśpiony).
- [x] Kreator `/inwestor/umowy` + `/admin/umowy-inwestorow`.
- [x] Ekstrakcja danych Didit + samoweryfikacja inwestora.
- [ ] Sekrety Didit produkcyjne w Lovable (właściciel, z konsoli).
- [ ] Przegląd kancelarii → aktywacja pakietu przyciskiem.
- [ ] Etap U2 (cykl Zlecenie–Projekt, pkt 1–7 wyżej).
- [ ] Test end-to-end na koncie testowym po aktywacji.

---

## Obszar 2 — Boty procesowe w ElevenLabs (per etap procesu, zorkiestrowane)

### Zasada podziału

Do ElevenLabs przenosimy **boty procesowe** — te, które rozmawiają z klientem
lub inwestorem w ramach procesu wniosku. W systemie głównym zostają narzędzia
wewnętrzne i silniki deterministyczne:

| Bot dziś | Gdzie jest | Decyzja |
| --- | --- | --- |
| Chat klienta na stronie (zbieranie wniosku) | `src/routes/api/public/chat-widget.ts` → `runAgentTurn` (Gemini przez Lovable Gateway) | **→ ElevenLabs** |
| Chat inwestora instytucjonalnego (`/dla-inwestora`) | `src/routes/api/public/investor-chat-widget.ts` (Gemini) | **→ ElevenLabs** |
| Asystent panelu inwestora (Klub Inwestora) | `src/lib/investor-assistant.functions.ts` (Gemini) | **→ ElevenLabs** |
| Voicebot „Ania" (telefon, nowe leady) | już ElevenLabs (`voicebot.functions.ts`) | zostaje — scala się z agentem przyjęcia wniosku (A1) |
| „Ania — uzupełnia braki" (widget w `/klient`) | już ElevenLabs (`missing-info-voice-agent.tsx`) | zostaje — scala się z agentem przyjęcia wniosku (A1) |
| Windykacja (telefony do dłużników) | już ElevenLabs (`windykacja-call.functions.ts`) | zostaje — osobny agent (A4) |
| Asystent panelu **admina** | `src/lib/ai-admin.server.ts` (Anthropic, 22 narzędzia) | **zostaje w systemie** — decyzja właściciela: narzędzie wewnętrzne administratora, nie bot procesowy |
| Agent umowy (kreator umowy pożyczki) | `src/lib/contract-engine/umowa-agent.functions.ts` (Gemini Pro) | **zostaje** — to generator danych do deterministycznego silnika umowy, nie rozmowa z klientem; przenoszenie do ElevenLabs pogorszyłoby kontrolę nad treścią umowy |
| Follow-up braków / drip / nurture | `src/lib/missing-info-follow-up/` itd. | zostaje — silniki deterministyczne (nie boty), ale podpinamy je do agentów (patrz orkiestracja) |

### Docelowa mapa agentów ElevenLabs

Decyzja właściciela: **jeden bot przyjmuje wniosek i obsługuje klienta do
momentu przyjęcia kompletnego wniosku** — na wszystkich kanałach. Osobne
agenty zostają tam, gdzie proces i rozmówca są inne (inwestor, windykacja).

| # | Agent | Zakres | Kanały |
| --- | --- | --- | --- |
| A1 | **Przyjęcie wniosku** | od pierwszego kontaktu do kompletnego wniosku (`nowy_lead` → `kompletowanie_danych`): krótka rozmowa, zebranie danych i dokumentów, dopytanie o braki; scala dzisiejszego voicebota „Ania", widget braków i chat na stronie | chat na stronie, telefon, widget w `/klient`, Messenger/IG, e-mail |
| A2 | **Informacja / onboarding inwestora** | pytania o platformę, cennik, faktura proforma (`request_invoice`) | chat na `/dla-inwestora` |
| A3 | **Obsługa wniosków inwestora** | pomoc w panelu: teasery, składanie ofert, dokumenty, statusy dystrybucji | chat w `/inwestor` |
| A4 | **Windykacja** | istniejący agent | telefon |

### Zasady rozmowy agenta A1 (twarde reguły promptu)

Ustalenie właściciela — do zapisania wprost w prompcie i w szablonach
follow-upów:

- **Bot NIE obiecuje, że „skontaktuje się analityk"** ani żadnego oddzwonienia.
- Rozmowa jest krótka: zebrać dane, podziękować, ustawić oczekiwania.
- Komunikat po przyjęciu wniosku: *„Jeśli wniosek spotka się z zainteresowaniem
  inwestora, otrzyma Pan/Pani konkretną ofertę finansową. Brak oferty i brak
  pytań oznacza, że wniosek na razie nie spotkał się z zainteresowaniem."*
- Człowiek (analityk) odzywa się wyłącznie z własnej inicjatywy firmy — gdy
  wniosek jest interesujący — i wtedy klient dostaje od razu konkretną ofertę
  lub konkretne pytania. Bot o tym informuje, ale tego nie obiecuje.
- Ta sama zasada obowiązuje w szablonach follow-upów braków
  (`src/lib/missing-info-follow-up/templates.ts`), mailach drip i opisach
  statusów w panelu (obszar 3) — do przejrzenia jednorazowo pod kątem
  obietnic kontaktu.
- `mark_ready_for_human` zostaje jako narzędzie, ale oznacza „wniosek gotowy
  do oceny", nie „klient czeka na telefon".

### Orkiestracja

1. **Routing wejściowy**: o tym, który agent odbiera rozmowę, decyduje
   kontekst kanału (strona klienta → A1, `/dla-inwestora` → A2, panel
   inwestora → A3, kampania windykacyjna → A4). Istniejący webhook
   `elevenlabs-conversation-init.ts` wstrzykuje dynamic variables; mapa
   kanał/agent w nowym module `src/lib/elevenlabs-agents.ts` (ID przez env).
2. **Handoff**: między A2 i A3 (inwestor anonimowy → zalogowany) natywny
   **agent transfer** ElevenLabs; A1 nie potrzebuje transferów — prowadzi
   klienta przez cały intake sam, a stan etapu dostaje w dynamic variables.
3. **Wspólny kontekst**: dynamic variables w konwencji już używanej przez
   telefon i widget braków (`first_name`, `missing_documents`,
   `missing_step`, `missing_questions` — patrz `docs/follow-up-braki.md`) +
   `loan_status`, `application_id`. Jedna konwencja dla wszystkich czterech
   agentów.

### Narzędzia agentów (server tools)

Dzisiejsze narzędzia bota tekstowego (`update_lead_data`,
`send_application_link`, `mark_ready_for_human`, `request_invoice` w
`elevenlabs-text-agent.server.ts`) stają się **webhook toolami ElevenLabs**:

- nowy zestaw endpointów `src/routes/api/public/agent-tools/*` (TanStack API
  routes, jak istniejące hooki), uwierzytelnienie sekretem w nagłówku +
  HMAC — wzorzec z `elevenlabs-webhook.ts` już to robi;
- endpointy wołają **te same** funkcje serwerowe co dziś (zapis do
  `leads`/`loan_applications`, `lead_communications`), więc dane w bazie
  wyglądają identycznie jak przy botach obecnych;
- do tego narzędzie odczytu statusu (`get_application_status` — reuse
  `describeLoanStatusForAgent` z voicebota) i odczytu briefu braków
  (`getMyMissingInfoBrief`).

**Wystawianie FV na żądanie (nowe narzędzie `issue_invoice`).**
Dziś narzędzie `request_invoice` (bot instytucjonalny) tylko zapisuje prośbę
w leadzie i flaguje go dla księgowości (`status: wymaga_kontaktu`) — fakturę
wystawia człowiek w module `operator-invoices`. Cała maszyneria do
automatu już istnieje i jest używana przy płatnościach Tpay:
`ensureInvoiceForAccessPayment` (`src/lib/access/invoice.server.ts`) —
rekord `sales_invoices`, XML i wysyłka **KSeF** (`src/lib/ksef/`), mail z
fakturą (Resend), dane firmy z GUS po NIP (`BIR_API_KEY`). Zmiana:

1. Nowa funkcja serwerowa `issueInvoiceOnDemand` — reużywa ten sam pipeline
   (numeracja, `sales_invoices`, KSeF, mail), wejście: NIP (dane firmy
   dociągane z GUS — bot nie przepisuje adresu ze słuchu), e-mail, pozycja,
   kwota.
2. Narzędzie `issue_invoice` dla agentów A2 (instytucjonalny) i A3 (panel
   inwestora) jako webhook tool; `request_invoice` znika.
3. **Bezpieczniki** (FV to dokument księgowy — błąd wymaga korekty):
   - automatycznie od ręki: pozycje z cennika (`access_products`) i kwoty
     powiązane z płatnością widoczną w systemie;
   - dowolna kwota/pozycja podana w rozmowie → faktura w statusie „szkic",
     księgowość zatwierdza jednym kliknięciem (spójnie z trybem rozruchowym
     auto-dystrybucji), bot informuje: „faktura zostanie wysłana po
     zatwierdzeniu przez księgowość";
   - walidacja NIP (suma kontrolna + GUS), dedup (ta sama prośba dwa razy =
     jedna FV), limit dzienny na rozmówcę, pełny log w rozmowie i na fakturze
     (`issued_via: agent`).

Baza wiedzy RAG (`text_agent_knowledge`) → **Knowledge Base ElevenLabs**
per agent (eksport skryptem jednorazowym); tabelę zostawiamy do czasu
potwierdzenia jakości odpowiedzi, potem do wygaszenia.

### SMS dwukierunkowy (rejestrowanie odpowiedzi na SMS-y)

Dziś SMS-y tylko wychodzą (2 124 od czerwca: VI 496 / VII 1 095 / VIII 533,
z numeru Twilio `voicebot_settings.sms_from = +48 732 059 898`) — odpowiedzi
klientów przepadają. Numer jest prawdziwym numerem Twilio, więc odbiór jest
możliwy; wzorzec webhooka Twilio z weryfikacją podpisu już istnieje
(`src/routes/api/public/twilio-voice.ts`, `twilio-recording.ts`).

1. Konsola Twilio: na numerze SMS webhook „A message comes in" → nowy
   endpoint `src/routes/api/public/twilio-sms-inbound.ts` (walidacja
   `X-Twilio-Signature`).
2. Endpoint dopasowuje nadawcę do leada (`normalizePolishPhone` → `leads`)
   i zapisuje wiadomość do `lead_communications` (`channel: sms`,
   `direction: inbound`) — od razu widoczna w skrzynce panelu i dla
   asystenta admina.
3. Efekty automatyczne po samym zapisie:
   - **pauza follow-upów 24 h** — silniki już pauzują po inboundzie
     dowolnym kanałem; dziś odpowiedź SMS tego nie robi, bo jej nie widzimy;
   - **opt-out**: parsowanie „STOP"/„WYPISZ" → `clients.do_not_sms`
     (zamyka znany brak z `docs/follow-up-braki.md`);
   - **SMS jako kanał agenta A1** — odpowiedź klienta SMS-em może obsłużyć
     ten sam agent przyjęcia wniosku (tryb tekstowy), jak Messenger.
4. Do sprawdzenia przy wdrożeniu: czy numer ma w Twilio włączony odbiór SMS
   (inbound capability).

### Migracja i wygaszanie botów w systemie głównym

Kolejność (każdy krok osobno wdrażalny i odwracalny):

1. Utworzenie 4 agentów w koncie ElevenLabs + mapa `elevenlabs-agents.ts`
   (ID przez env, wzorem `VITE_ELEVENLABS_MISSING_INFO_AGENT_ID`); prompt A1
   z twardymi regułami rozmowy (sekcja wyżej).
2. Endpointy `agent-tools/*` + testy (vitest, wzorem istniejących testów lib).
3. Przełączenie **chatu inwestora instytucjonalnego** (A2) — najmniejsze
   ryzyko, bot czysto informacyjny. Widget: komponent `<elevenlabs-convai>`
   z CDN — **nie** `@elevenlabs/react`, bo build produkcyjny stoi na
   przypiętym `bun.lock` (ta sama decyzja co przy widgecie braków,
   opisana w `docs/follow-up-braki.md`).
4. Przełączenie chatu klienta na stronie na A1; scalenie promptów voicebota
   „Ania" i widgetu braków w tego samego agenta A1 (telefon + widget
   wskazują nowe ID w `voicebot_settings` / env).
5. Asystent Klubu Inwestora (A3) w panelu `/inwestor`.
6. Przegląd szablonów follow-upów, dripów i treści statusów pod kątem
   obietnic kontaktu analityka — ujednolicenie komunikatu „oferta albo brak
   zainteresowania".
7. Wygaszenie: usunięcie ścieżki Gemini z `chat-widget.ts`,
   `investor-chat-widget.ts`, `investor-assistant.functions.ts`; wygaszenie
   `runAgentTurn`; `text_agent_settings`/`text_agent_knowledge` → readonly,
   ekran `/admin/text-agent` zamieniony na linki do konsoli ElevenLabs +
   podgląd logów rozmów.

Historia rozmów: ElevenLabs webhook post-call (istniejący
`elevenlabs-webhook.ts`) zapisuje transkrypcje do `lead_communications`, żeby
skrzynka panelu i asystent admina dalej widziały całość korespondencji —
**to jest warunek konieczny wygaszenia**, inaczej panel traci wgląd w rozmowy.

### Ryzyka obszaru 2

- **Okno Meta 24 h / e-mail**: ElevenLabs ConvAI to chat/głos w czasie
  rzeczywistym; kanały asynchroniczne (Messenger, e-mail) dziś obsługuje
  `runAgentTurn`. **Decyzja właściciela: wszystkie kanały przechodzą na
  ElevenLabs od razu** — Messenger/e-mail przez nasz istniejący router
  wiadomości wołający agenta ElevenLabs w trybie tekstowym (Agents API).
- **Koszty — zbadane na produkcji (31.08.2026)**: chat na stronie ma **zero
  zapisanych rozmów** od uruchomienia (~30.07), chat inwestora i asystent
  Klubu Inwestora również zero. Realny ruch botów to voicebot (614/1372/633
  połączeń w VI/VII/VIII — już na ElevenLabs, więc to obecna baza kosztowa)
  i Messenger (~90 leadów, ~500–600 wiadomości przychodzących miesięcznie).
  Ryzyko kosztowe anonimowego chatu jest dziś teoretyczne — limitów nie
  budujemy na start, wystarczy prosty bezpiecznik (max długość rozmowy
  anonimowej) i obserwacja po wdrożeniu. Osobny wniosek produktowy: widget
  chatu jest zamontowany na landingu, ale nikt z niego nie korzysta —
  do przyjrzenia się widoczności/zachęcie niezależnie od migracji.
- **Bezpieczeństwo narzędzi**: endpointy `agent-tools/*` mają uprawnienia
  zapisu do leadów — sekret + HMAC + rate limit + walidacja `conversation_id`
  po stronie ElevenLabs API zanim wykonamy zapis.

---

## Obszar 3 — Status wniosku w profilu klienta

### Co już jest

Panel `/klient` istnieje (`src/routes/klient.index.tsx`) i pokazuje
**postęp** (checklista braków: `ProgressChecklist`, `NextStepCard`, źródło:
`getMyLoanProgress` w `src/lib/my-loan.functions.ts` +
`computeLoanProgress`), ale celowo nie pokazuje **statusu procesu**
(`loan_applications.status`). Etykiety statusów istnieją tylko po stronie
admina/pośrednika. Kanoniczny cykl życia: 12 statusów w
`src/lib/loan-status.ts` (jedyne źródło prawdy, z mapą legacy).

### Do zbudowania

1. **Słownik klienta** w `src/lib/loan-status.ts`:
   `CLIENT_STATUS_LABELS` + `CLIENT_STATUS_DESCRIPTIONS` — język klienta,
   bez żargonu operacyjnego, np. `szukamy_inwestora` → „Twój wniosek jest
   przedstawiany inwestorom", `dokumenty_przygotowanie_umowy` →
   „Przygotowujemy umowę". Statusy operacyjne, których klient nie powinien
   rozróżniać (`brak_kwoty`/`brak_kw`/`brak_zdjec_dokumentow`), zlewają się
   w jeden widok „Uzupełnij dane wniosku" ze wskazaniem braków z istniejącej
   checklisty.
2. **Rozszerzenie `getMyLoanProgress`** o `status` (znormalizowany przez
   `normalizeLoanStatus`) i o oś czasu — nowa tabela
   `loan_status_history (application_id, from_status, to_status, changed_at,
   changed_by)` zasilana triggerem na `loan_applications.status` (trigger
   łapie też zmiany z `apply_loan_auto_status()`; RLS: klient widzi historię
   swojego wniosku).
3. **UI**: karta „Status wniosku" na górze `/klient` (w
   `klient.index.tsx`) — duży aktualny status + opis + pozioma oś etapów
   (4 kroki klienckie: Wniosek → Kompletowanie → Szukamy inwestora →
   Umowa i wypłata) + data ostatniej zmiany. Checklista braków zostaje pod
   spodem bez zmian.
4. **Powiadomienia**: przy zmianie statusu wpis do istniejących powiadomień
   klienta (`/klient/powiadomienia`) + e-mail przez istniejący
   `resend-send.server.ts` (szablon per status; wysyłka tylko dla statusów
   „widocznych" dla klienta, żeby nie spamować przy przejściach
   operacyjnych).
5. **Spójność z botami (obszar 2)**: agent A1 i narzędzie
   `get_application_status` korzystają z tego samego słownika
   `CLIENT_STATUS_LABELS` — klient słyszy w rozmowie to samo, co widzi w
   panelu.
6. **Bez obietnic kontaktu**: opisy statusów trzymają się zasady z obszaru 2 —
   np. `szukamy_inwestora`: „Wniosek jest przedstawiany inwestorom. Jeśli
   spotka się z zainteresowaniem, otrzymasz konkretną ofertę finansową" —
   żadnego „skontaktuje się z Tobą analityk".

Ten obszar jest najtańszy i niezależny od pozostałych — można go wdrożyć
pierwszy jako szybki, widoczny efekt.

---

## Obszar 4 — Automatyczna dystrybucja kompletnych wniosków do instytucji

### Cel

Każdy **kompletny** wniosek z przynajmniej sensownym potencjałem
lokalizacyjnym leci **automatycznie** do inwestorów instytucjonalnych —
z zachowaniem kryteriów każdej instytucji (np. Korona: tylko do 350 tys. zł;
JanVest: tylko powyżej 100 tys. zł).

### Co już jest

- **Ręczna dystrybucja działa w całości** —
  `src/lib/offer-distribution.functions.ts`: wysyłka e-mail do wszystkich lub
  wybranych `investors` (`investor_type = 'instytucjonalny'`, `is_active`),
  karta wniosku `/karta/<token>`, odpowiedzi instytucji wracają aliasem
  `oferta+<distribution_id>@` prosto na kartę; jest dedup („nie wysyłaj
  drugi raz do instytucji, która już dostała ten temat").
- **Kompletność wniosku** — `computeLoanProgress` + brief braków
  (`missing-info-follow-up/brief.ts`); status `szukamy_inwestora`.
- **Scoring lokalizacji 0–100** — `src/lib/location-scoring/` +
  `property-analysis/location-score.server.ts` (neutralny wynik 40 przy braku
  danych).
- **Brakuje**: kryteriów per instytucja i jakiegokolwiek automatu wysyłki —
  dziś dystrybucję odpala ręcznie admin.

### Do zbudowania

1. **Kryteria per instytucja** — tabela `investor_distribution_criteria`:
   `investor_id`, `min_amount`, `max_amount`, `auto_send_enabled`,
   opcjonalnie na przyszłość: województwa, typy nieruchomości, własny próg
   score. Seed od właściciela: Korona `max_amount = 350 000`, JanVest
   `min_amount = 100 000`. Edycja w panelu admina przy liście instytucji.
2. **Kwalifikacja wniosku** — funkcja `isEligibleForAutoDistribution`:
   wniosek kompletny (pusty brief braków) **i** score lokalizacji ≥ próg
   globalny (konfigurowalny w ustawieniach, propozycja startowa: 40 =
   „przynajmniej neutralny") **i** status `szukamy_inwestora`.
3. **Silnik auto-dystrybucji** — cron tick (wzorem
   `missing-info-follow-up-tick`): bierze świeżo zakwalifikowane wnioski,
   dobiera instytucje, których widełki kwotowe obejmują kwotę wniosku,
   i wysyła **istniejącym pipeline'em** `offer-distribution` (dedup działa
   bez zmian). Znacznik `auto` vs `manual` na `offer_distributions`.
4. **Bezpieczniki** — globalny wyłącznik w ustawieniach, limit dzienny
   wysyłek, log decyzji (dlaczego wniosek poszedł / nie poszedł i do kogo);
   opcja trybu rozruchowego „do zatwierdzenia jednym kliknięciem" zanim
   puścimy pełny automat.
5. **Panel** — zakładka w `/admin/dystrybucja`: kolejka auto-wysyłek,
   historia (wniosek → instytucje → powód dopasowania), wnioski
   niekwalifikujące się z powodem (niekompletny / score za niski).

### Agent korespondencji z instytucjami (orkiestrator maili przychodzących)

Kryteria instytucji są **dynamiczne** — instytucje mailem zawieszają
przyjmowanie wniosków, ogłaszają promocje, zmieniają warunki. Do tego w
wątkach o konkretne wnioski zadają pytania, które dziś człowiek ręcznie
przenosi do klienta i z powrotem. Ten ruch robiony był dotąd ręcznie
(forward dokumentów do wielu instytucji, przepisywanie pytań) i przez bota
admina — teraz ma go robić agent automatycznie.

Realne kategorie wiadomości (z dotychczasowej skrzynki):

1. **Prośba o uzupełnienie** — „prosimy o więcej danych", „proszę o numer
   telefonu do klienta", „dane w poprzednim mailu są niewidoczne" (najczęstsze).
2. **Oferta z warunkami** — kwota, rata, okres, sposób zabezpieczenia.
3. **Odmowa z powodem** — np. „z uwagi na lokalizację nie zabezpieczymy się".
4. **Zmiana statusu/kryteriów instytucji** — zawieszenie przyjmowania
   wniosków, promocje, zmiana widełek.
5. Automatyczne potwierdzenia rejestracji (do zignorowania/odnotowania).

**Jak działa (pętla):**

1. **Wejście**: każda odpowiedź instytucji już ląduje w
   `offer_distribution_messages` (alias `oferta+<id>@`, inbound webhook
   Resend/Mailgun — `src/lib/offer-replies.server.ts`). Agent obserwuje nowe
   wiadomości inbound (cron tick lub hook po zapisie).
2. **Klasyfikacja + ekstrakcja** (LLM, server-side): kategoria jak wyżej;
   dla pytań — lista konkretnych pytań/braków; dla ofert — sparowane warunki;
   dla zmian kryteriów — co się zmienia i od kiedy.
3. **Zmiany kryteriów** → aktualizacja `investor_distribution_criteria`
   (nowe pola: `accepting_applications`, `paused_until`, `notes`) — na start
   jako propozycja do zatwierdzenia jednym kliknięciem w panelu, z pełnym
   logiem; zawieszona instytucja wypada z auto-dystrybucji natychmiast.
4. **Pytania o wniosek** → agent scala pytania od wielu instytucji
   (deduplikacja — dwie instytucje pytające o to samo = jedno pytanie do
   klienta), tłumaczy na język klienta i wysyła **preferowanym kanałem
   klienta** (ostatnio używany/wskazany kanał z `lead_communications`)
   istniejącym rdzeniem `comms-agent.server.ts` (e-mail / SMS / Messenger /
   czat) — tym samym, którego używa bot admina. Pytania zasilają też brief
   braków, więc follow-upy braków dopominają się odpowiedzi automatycznie.
5. **Odpowiedź klienta** → agent formatuje i odsyła w wątkach **wszystkich
   zainteresowanych instytucji** (`comms_reply_offer_thread` / alias
   dystrybucji), z załącznikami jeśli klient je dosłał.
6. **Oferty i odmowy** → odnotowane na wniosku (odmowa z powodem = sygnał do
   analizy; oferta = powiadomienie operatora/admina i klienta zgodnie z
   zasadą „konkretna oferta albo cisza" z obszaru 2).

**Stan i widoczność**: tabela `institution_qa_threads` (wniosek, pytanie,
instytucje pytające, status: `zadane_klientowi` / `odpowiedziane` /
`przekazane_instytucjom`, znaczniki czasu) + zakładka na karcie wniosku w
panelu admina; każdy krok agenta logowany, wysyłki wyglądają w bazie jak
ręczne (ten sam rdzeń comms).

**Bezpieczniki**: treść maili instytucji traktowana jako dane (nigdy jako
polecenia dla agenta); zmiany kryteriów zawsze z logiem i na start z
zatwierdzeniem; limit wysyłek do klienta (nie częściej niż raz dziennie
scalone pytania, chyba że klient właśnie odpowiedział); żadnych obietnic
wobec klienta poza przekazaniem pytań/oferty.

### Decyzje podjęte (właściciel, 31.08.2026)

1. **Tryb startu auto-dystrybucji**: rozruch z zatwierdzaniem jednym
   kliknięciem (wysyłka wniosków i zmiany kryteriów z maili); pełny automat
   po okresie próbnym.
2. **Próg score lokalizacji**: 40 — przynajmniej neutralny (wniosek bez
   danych geo przechodzi).
3. **Skrzynka agenta korespondencji**: wyłącznie aliasy systemowe
   `oferta+<id>@financeyou.pl` — od wdrożenia cały ruch z instytucjami idzie
   przez system; prywatna skrzynka poza zakresem.
4. Kryteria instytucji na start: widełki kwotowe (Korona ≤ 350 tys.,
   JanVest > 100 tys.) + statusy zawieszenia; kolejne kryteria dopisywane w
   miarę jak instytucje je zgłaszają (mailem → agent korespondencji).

---

## Obszar 5 — Automatyczny pipeline analityczny + spójny raport na karcie oferty

### Cel

Każdy wniosek z potencjałem lokalizacyjnym **powyżej 50** automatycznie
przechodzi pełny pipeline: **pobranie KW → właściciele → analiza KW →
analiza ryzyka**, a wyniki składają się w **jeden spójny raport z podziałem
na działy**, którym karta oferty (`/karta/<token>`) prezentuje się odbiorcy
czytelnie i ładnie.

### Co już jest (wszystkie ogniwa istnieją, brak orkiestracji)

| Ogniwo | Moduł |
| --- | --- |
| Pobranie treści KW | `src/lib/kw-fetch.server.ts` (CMD KW Engine, cache `kw_documents`) + `kw-ensure.ts` (dowozi do „ready", ~45 s/polling) |
| Właściciele | `src/lib/coowners/` (analiza działu II, KRS, `coowner_registry_checks`) |
| Analiza KW | `src/lib/kw-analysis/` (silnik reguł, znaleziska → `kw_land_register_analyses`) |
| Analiza ryzyka | `src/lib/risk-assessment/` (exit liquidity, forced sale, CEIDG, benchmark, korespondencja, lokalizacja) |
| Karta oferty | `src/routes/karta.$token.tsx` — już renderuje sekcje KW; anonimizacja wg `visibility_level` |
| PDF oferty | `src/lib/offer-pdf.ts` |

Każde ogniwo odpalane jest dziś **ręcznie z panelu**, każde z osobnym
widokiem wyników.

### Do zbudowania

1. **Orkiestrator** — tabela `analysis_pipeline_runs` (wniosek, krok,
   status per krok: `pending/running/done/error`, znaczniki czasu, koszt) +
   cron tick (wzorem pozostałych ticków). Kroki sekwencyjnie: KW →
   właściciele → analiza KW → ryzyko (kolejne kroki zależą od treści KW).
   Retry z backoffem; błąd kroku nie blokuje raportu — dział dostaje status
   „nie udało się pobrać" zamiast dziury.
2. **Trigger** (decyzja właściciela): wniosek **kompletny** (pusty brief
   braków) z poprawnym numerem KW + score lokalizacji **> 50** — pipeline
   nie rusza dla wniosków niekompletnych (niższe koszty pobrań KW).
   Odpala się raz; ponownie tylko przy zmianie numeru KW albo ręcznie z
   panelu. Uwaga na koszty CMD KW Engine — licznik pobrań w runie.
3. **Raport zbiorczy** — `loan_offer_reports` (jsonb, wersjonowany):
   jeden dokument z działami:
   1. **Podsumowanie oferty** — kwota, cel, zabezpieczenie, LTV, status;
   2. **Nieruchomość i lokalizacja** — typ, adres (wg anonimizacji), score
      lokalizacji z uzasadnieniem;
   3. **Księga wieczysta** — działy I–IV, znaleziska analizy z kolorami
      statusów (STOP / warunkowe / OK);
   4. **Właściciele i zgody** — kto w dziale II, wymagane zgody
      współwłaścicieli;
   5. **Analiza ryzyka** — sygnały i wskaźniki (płynność wyjścia, wartość
      wymuszonej sprzedaży, CEIDG, rozbieżności z korespondencji);
   6. **Dokumenty** — co dostarczone / czego brakuje.
4. **Karta oferty — przeprojektowanie prezentacji**: te same dane co w
   raporcie, jeden spójny układ działów (nawigacja po sekcjach, badge'y
   statusów, czytelna typografia), zachowana anonimizacja wg
   `visibility_level`; eksport PDF z tego samego raportu (rozbudowa
   `offer-pdf.ts`) — instytucja dostaje kartę online i może pobrać PDF.
5. **Spięcie z obszarem 4**: auto-dystrybucja (próg 40) wysyła kartę
   wzbogaconą o raport, jeśli pipeline (próg 50) już się wykonał; dla
   wniosków 40–50 karta pokazuje wersję podstawową. Dwa progi celowo różne —
   do ewentualnego wyrównania po okresie próbnym.

### Decyzja podjęta (właściciel, 31.08.2026)

Pipeline odpala się **dopiero po skompletowaniu wniosku** — nie dla
niekompletnych wniosków z samym numerem KW (priorytet: niższe koszty
pobrań KW). Wpisane w warunek triggera powyżej.

---

## Proponowana kolejność wdrożenia

| Faza | Zakres | Zależności |
| --- | --- | --- |
| 0 | Produkcyjne workflowy Didit (publikacja draftów, sekrety) — patrz `docs/didit-kyc.md`, sekcja „Do zrobienia" | — |
| 1 | Obszar 3 (status w panelu klienta) | — |
| 1b | Obszar 4 (auto-dystrybucja do instytucji) — niezależny, może iść równolegle | kryteria instytucji od właściciela |
| 1c | Obszar 5 (pipeline analityczny + raport na karcie oferty) — najlepiej przed pełnym automatem dystrybucji, żeby instytucje dostawały wzbogacone karty | — |
| 2 | Obszar 1 (umowy inwestora) | faza 0 + treści umów od prawnika |
| 3 | Obszar 2, kroki 1–3 (agenty ElevenLabs, narzędzia, chat inwestora) | — |
| 4 | Obszar 2, kroki 4–6 (agent A1 na wszystkich kanałach klienta, panel inwestora, przegląd treści pod kątem obietnic kontaktu) | faza 1 (słownik statusów) |
| 5 | Obszar 2, krok 7 (wygaszenie botów Gemini w systemie głównym) | potwierdzona jakość + transkrypcje w `lead_communications` |

Decyzje podjęte przez właściciela (31.08.2026):

1. **Umowy — forma dokumentowa** dla wszystkich trzech umów (akceptacja w
   panelu po weryfikacji Didit, pełny ślad: data, IP, hash PDF); do
   potwierdzenia z prawnikiem, e-podpis ewentualnie później.
2. **Treści umów**: przygotowujemy robocze projekty z placeholderami danych
   Didit — właściciel przekazuje je prawnikowi do weryfikacji.
3. **Kanały asynchroniczne** (Messenger/e-mail): wszystko od razu na
   ElevenLabs, bez okresu przejściowego na starym silniku.
4. Limity chatu anonimowego: bez limitów na start (zerowe użycie chatu na
   produkcji — patrz Ryzyka obszaru 2); prosty bezpiecznik + obserwacja.
5. Auto-dystrybucja: rozruch z zatwierdzaniem, próg score 40, tylko aliasy
   systemowe (szczegóły w obszarze 4).

## Stan implementacji (31.08.2026, branch `claude/production-deployment-plan-54zocm`)

| Obszar | Stan |
| --- | --- |
| Obszar 3 — status wniosku w panelu klienta | **ZROBIONE**: karta statusu + oś 4 etapów + historia (`loan_status_history`) + e-mail przy zmianie (tick co 15 min) |
| Obszar 4 — auto-dystrybucja | **ZROBIONE**: kryteria instytucji (seed Korona/JanVest), kolejka propozycji z zatwierdzaniem, panel `/admin/auto-dystrybucja`, cron |
| Obszar 4 — agent korespondencji | **ZROBIONE**: klasyfikacja maili, propozycje zmian kryteriów (1 kliknięcie), pętla pytania→klient→odpowiedź→instytucje |
| Obszar 5 — pipeline analityczny | **ZROBIONE**: KW→właściciele→analiza KW→ryzyko dla kompletnych wniosków ze score>50; sekcja analityczna na karcie oferty |
| Obszar 2 — boty ElevenLabs | **ZROBIONE (kod)**: SMS dwukierunkowy, agenty A1–A3 (tworzenie z `/admin/text-agent`), webhook toole (`/api/public/agent-tools`), `issue_invoice`, przełącznik widgetów, kanały async przez turę tekstową z fallbackiem — patrz `docs/boty-elevenlabs.md`; wygaszenie starego silnika po stabilizacji logów |
| Obszar 1 — umowy inwestora | **Etap U1 WDROŻONY (uśpiony)** — paczka prawnika v5 w systemie, aktywacja po przeglądzie kancelarii; Etap U2 (cykl Zlecenie–Projekt) do zrobienia |

Kroki wdrożeniowe po merge'u: zastosować migracje `20260831*` (supabase db
push / panel), ustawić sekrety `AGENT_TOOLS_SECRET` (+ istniejące ElevenLabs/
Twilio), w Twilio dopiąć webhook SMS inbound, w konsoli ElevenLabs dopiąć
webhook toole do utworzonych agentów.
