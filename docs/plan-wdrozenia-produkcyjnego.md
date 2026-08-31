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

## Obszar 1 — Umowy inwestora (NDA, powierzenie danych, pośrednictwo finansowe)

### Cel

Każdy inwestor, który kupuje szkolenie **lub** dostaje dostęp do modułu z
ofertami, ma w systemie komplet trzech umów:

| Umowa | Kod (`agreement_kind`) |
| --- | --- |
| Umowa o zachowaniu poufności (NDA) | `nda` |
| Umowa powierzenia przetwarzania danych osobowych | `data_processing` |
| Umowa pośrednictwa finansowego | `financial_intermediation` |

Dane osobowe inwestora w umowach pochodzą z **zatwierdzonej weryfikacji
Didit** (nie z formularza), umowy generują się i archiwizują automatycznie w
folderze klienta, a firma ma trwały dowód zawarcia każdej z nich (forma
dokumentowa: kto, kiedy, z jakiego IP, jaka wersja treści, jaki hash pliku).

### Co już jest w repo (nie budujemy od zera)

- **Didit KYC/KYB** — pełna integracja: `src/lib/didit.server.ts` (klient REST
  + HMAC), `src/lib/didit.functions.ts`, webhook
  `supabase/functions/didit-webhook/index.ts`, tabela `didit_verifications`
  z pełnym `decision` (jsonb) — tam są dane z dokumentu tożsamości (imię,
  nazwisko, numer dokumentu, data urodzenia, adres). Doc: `docs/didit-kyc.md`.
- **Akceptacje umów** — wzorzec istnieje w module projektów:
  `project_module_acceptances` (`kind` już zawiera `nda`, `data_processing`;
  `UNIQUE (user_id, kind, version)`), egzekwowanie w
  `src/lib/projects/module-access.functions.ts` i
  `src/components/projects/module-gate.tsx`.
- **Generowanie dokumentów** — docxtemplater + pizzip:
  `src/lib/document-generator.functions.ts` (szablony w `document_templates`,
  wynik w `generated_documents.docx_path/pdf_path`) oraz deterministyczny
  silnik umowy pożyczki `src/lib/contract-engine/`.
- **Folder klienta** — jeden prywatny bucket `pliki-klienta`
  (`src/lib/storage-buckets.ts`), podpisywane URL-e, RLS.
- **Punkty triggera** — webhook płatności Tpay
  (`src/lib/access/webhook-core.server.ts`, post-processing po
  `process_access_payment_paid`) i aktywacja modułu projektów.

Brakuje wyłącznie: ekstrakcji danych osobowych z decyzji Didit do umów,
trzech szablonów umów, tabeli-rejestru zawartych umów inwestorskich i bramki
w przepływie inwestora.

### Do zbudowania

**1.1. Treści umów (zadanie właściciela + prawnika, blokujące).**
Trzy wzory umów w DOCX z placeholderami. Minimalny zestaw pól:
`{imie_nazwisko}`, `{numer_dokumentu}`, `{rodzaj_dokumentu}`, `{pesel_lub_data_urodzenia}`,
`{adres}`, `{email}`, `{telefon}`, `{data_zawarcia}`, `{wersja_umowy}`,
`{didit_session_id}`, `{data_weryfikacji_didit}`; dla firm (KYB) dodatkowo
`{nazwa_firmy}`, `{nip}`, `{reprezentant}`. Wzory wgrywane jak dotychczasowe
szablony do `document_templates` (nowe kody:
`nda_inwestor`, `powierzenie_danych_inwestor`, `posrednictwo_finansowe_inwestor`).
Wersjonowanie treści jak w `consent_documents` — każda zmiana treści to nowa
`version`, stare akceptacje pozostają ważne dla swojej wersji.

> Uwaga prawna (do potwierdzenia z obsługą prawną): NDA i umowa powierzenia
> mogą być zawarte w **formie dokumentowej** (akceptacja w panelu + trwały
> zapis) — art. 77² KC. Dla umowy pośrednictwa finansowego forma dokumentowa
> też zwykle wystarcza, ale przy tej umowie warto dodatkowo przewidzieć opcję
> kwalifikowanego e-podpisu (Autenti/mSzafir) jako etap 2 — w repo nie ma
> dziś żadnej integracji e-podpisu, więc etap 1 świadomie jej nie wymaga.

**1.2. Ekstrakcja danych osobowych z Didit.**
Nowa funkcja `extractDiditPersonalData(decision)` w `src/lib/didit.server.ts`
mapująca `didit_verifications.decision` (sekcje OCR/id_verification) na
płaską strukturę pól umowy + osobno wariant KYB. Snapshot tych danych
zapisujemy przy zawarciu umowy (patrz 1.4) — umowa ma odzwierciedlać stan z
chwili podpisania, nie „aktualny".

**1.3. Didit dla inwestora jako osoby (nie klienta AML).**
Dziś `didit_verifications` kluczuje po `aml_customer_id` (weryfikacje robione
przez inwestora *na jego klientach*) oraz po module projektów. Potrzebujemy
sesji, w której weryfikowany jest **sam inwestor**:

- moduł projektów już to robi (`project_module_access.kyc_status`) — dla
  inwestorów przechodzących przez projekty **reużywamy tej weryfikacji**;
- dla inwestorów kupujących sam dostęp/szkolenie: nowa server function
  `startInvestorSelfVerification` (w `didit.functions.ts`) tworząca sesję KYC
  z `vendor_data = 'investor:' + user_id`; webhook `didit-webhook` rozszerzyć
  o rozpoznanie tego prefiksu i zapis z `user_id` zamiast `aml_customer_id`
  (kolumna `user_id` już istnieje w tabeli).

**1.4. Rejestr umów — migracja `investor_agreements`.**

```sql
create table investor_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  agreement_kind text not null check (agreement_kind in
    ('nda','data_processing','financial_intermediation')),
  version text not null,
  status text not null default 'draft' check (status in ('draft','accepted','void')),
  didit_session_id text,                -- sesja, z której wzięto dane
  personal_data_snapshot jsonb not null, -- dane wstawione do umowy
  generated_document_id uuid references generated_documents(id),
  pdf_path text,                        -- pliki-klienta/<user_id>/umowy/...
  content_sha256 text,                  -- hash pliku PDF (dowód integralności)
  accepted_at timestamptz,
  accepted_ip inet,
  accepted_user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, agreement_kind, version)
);
```

RLS: właściciel czyta swoje, personel wewnętrzny (`is_internal_staff`)
wszystko; zapis wyłącznie przez server functions (service role). Wzorzec IP +
user-agent + data już istnieje w `access_payments.consents` — kopiujemy go.

**1.5. Przepływ (server functions w `src/lib/investor-agreements/`).**

1. `getInvestorAgreementsState` — czego brakuje danemu inwestorowi
   (weryfikacja Didit? które umowy niepodpisane w bieżącej wersji?).
2. `prepareInvestorAgreements` — po zatwierdzonym KYC: ekstrakcja danych,
   render trzech DOCX→PDF (istniejący pipeline `document-generator`),
   zapis do `pliki-klienta/<user_id>/umowy/<rok>/`, rekordy `draft`.
3. `acceptInvestorAgreement` — klient w panelu widzi pełną treść PDF,
   zaznacza akceptację → status `accepted`, `accepted_at/ip/user_agent`,
   `content_sha256`; potwierdzenie mailem (Resend, istniejący
   `resend-send.server.ts`) z załączonym PDF — mail jest dodatkowym śladem.
4. Komplet trzech `accepted` ⇒ flaga podobna do
   `investor_module_access_active`: SQL `investor_has_signed_agreements(user_id)`.

**1.6. Bramka (gdzie egzekwujemy).**

- **UI/routing**: w `src/routes/inwestor.tsx` — analogicznie do paywalla:
  inwestor z opłaconym dostępem, ale bez kompletu umów, jest przekierowany na
  nowy ekran `/inwestor/umowy` (kreator: weryfikacja Didit → podgląd 3 umów →
  akceptacje). Zakup szkolenia/dostępu **nie jest blokowany** — blokowany
  jest wgląd w dane ofert.
- **Server functions**: `assertInvestorFullAccess`
  (`src/lib/access/guards.server.ts`) rozszerzyć o warunek
  `investor_has_signed_agreements` — jedna zmiana pokrywa wszystkie RPC ofert.
- **RLS**: dopiąć warunek do `investor_has_full_access()` w SQL (wzorem
  migracji `20260719106000_investor_paywall_rls.sql` — wtedy działa też na
  poziomie bazy, bez dotykania każdej polityki osobno).
- **Trigger po płatności**: w post-processingu webhooka Tpay
  (`webhook-core.server.ts`) — mail „dokończ formalności" z linkiem do
  `/inwestor/umowy`, jeśli umowy niekompletne.
- Moduł projektów: obecne akceptacje `project_module_acceptances` zostają
  (dotyczą regulaminu modułu); docelowo NDA/powierzenie w module projektów
  wskazują na te same wzory, żeby nie utrzymywać dwóch treści NDA.

**1.7. Panel administratora.**
Nowa podstrona `/admin/umowy-inwestorow`: lista inwestorów × 3 umowy,
status, wersja, data/IP akceptacji, link do PDF (signed URL), filtr „brak
kompletu". To jest ekran „wykazania się" — jedno kliknięcie od dowodu.

### Checklista produkcyjna obszaru 1

- [ ] Treści 3 umów zatwierdzone przez prawnika, wgrane jako szablony DOCX.
- [ ] Migracje: `investor_agreements` + `investor_has_signed_agreements` + RLS.
- [ ] Rozszerzenie webhooka Didit o `vendor_data = investor:<user_id>`.
- [ ] Opublikowanie **produkcyjnych** workflowów Didit i podmiana ID
      (draftowe ID są w `docs/didit-kyc.md`; sekrety: `DIDIT_API_KEY`,
      `DIDIT_WORKFLOW_ID_KYC/KYB`, `DIDIT_WEBHOOK_SECRET`).
- [ ] Kreator `/inwestor/umowy` + bramka w guards + RLS.
- [ ] `/admin/umowy-inwestorow`.
- [ ] Test end-to-end na koncie testowym: zakup → KYC → 3 umowy → dostęp do
      ofert; sprawdzenie, że PDF-y leżą w `pliki-klienta/<user>/umowy/`.

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

Baza wiedzy RAG (`text_agent_knowledge`) → **Knowledge Base ElevenLabs**
per agent (eksport skryptem jednorazowym); tabelę zostawiamy do czasu
potwierdzenia jakości odpowiedzi, potem do wygaszenia.

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
  `runAgentTurn`. Decyzja w planie: Messenger/e-mail w etapie 1 przechodzą na
  te same webhook toole, ale wywoływane przez nasz istniejący router
  wiadomości, który woła agenta ElevenLabs przez **Agents API (tryb
  tekstowy)**; jeśli jakość/latencja zawiedzie — kanały async zostają na
  starym silniku do etapu 2 (fallback bez utraty funkcji).
- **Koszty**: ConvAI rozlicza się za minuty/sesje — przed pełnym
  przełączeniem chatu na stronie (duży wolumen anonimowych wejść) zmierzyć
  koszt na próbce; ewentualnie limit sesji dla niezalogowanych.
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

### Decyzje otwarte obszaru 4

1. Pełna lista kryteriów instytucji na start: tylko widełki kwotowe, czy od
   razu też region/typ nieruchomości? (Kwoty wystarczą na start — reszta
   dobudowywana bez zmiany architektury.)
2. Wartość globalnego progu score lokalizacji.
3. Czy start w trybie pełnego automatu, czy najpierw okres z zatwierdzaniem.

---

## Proponowana kolejność wdrożenia

| Faza | Zakres | Zależności |
| --- | --- | --- |
| 0 | Produkcyjne workflowy Didit (publikacja draftów, sekrety) — patrz `docs/didit-kyc.md`, sekcja „Do zrobienia" | — |
| 1 | Obszar 3 (status w panelu klienta) | — |
| 1b | Obszar 4 (auto-dystrybucja do instytucji) — niezależny, może iść równolegle | kryteria instytucji od właściciela |
| 2 | Obszar 1 (umowy inwestora) | faza 0 + treści umów od prawnika |
| 3 | Obszar 2, kroki 1–3 (agenty ElevenLabs, narzędzia, chat inwestora) | — |
| 4 | Obszar 2, kroki 4–6 (agent A1 na wszystkich kanałach klienta, panel inwestora, przegląd treści pod kątem obietnic kontaktu) | faza 1 (słownik statusów) |
| 5 | Obszar 2, krok 7 (wygaszenie botów Gemini w systemie głównym) | potwierdzona jakość + transkrypcje w `lead_communications` |

Decyzje otwarte (do rozstrzygnięcia przed odpowiednią fazą):

1. Czy umowa pośrednictwa finansowego wymaga kwalifikowanego e-podpisu, czy
   wystarcza forma dokumentowa (prawnik — blokuje fazę 2).
2. Czy kanały asynchroniczne (Messenger/e-mail) przechodzą na ElevenLabs w
   fazie 4, czy zostają na obecnym silniku do osobnej decyzji (koszt/jakość).
3. Budżet minutowy ElevenLabs dla anonimowego chatu na stronie (limit sesji?).
