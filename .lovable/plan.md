# Unifikacja leadów + historia komunikacji

## Cel

Jeden rekord = jeden lead (pożyczkowy lub inwestorski) z pełnym zbiorem danych: dane osobowe, krok wniosku, dokumenty, oferty, **oraz cała historia komunikacji** (rozmowy ElevenLabs, SMS, email, Messenger) w jednym miejscu w panelu admina.

## Zakres bazy

**Nowa tabela `leads`** (zunifikowana, zastępuje `clients` + `loan_applications` + `meta_leads`):
- `id`, `type` (`pozyczkowy` | `inwestorski`), `status`, `source` (`meta_ads` | `google_ads` | `landing` | `sheets` | `manual` | `voicebot`)
- Dane osobowe: imię, nazwisko, email, telefon (raw + normalized), zgody
- Pola wniosku pożyczkowego (kwota, cel, nieruchomość, zatrudnienie itd. — wszystko jako kolumny lub `application_data jsonb`)
- `current_form_step`, `return_link_token`, `return_link`
- `meta_lead_id`, `meta_form_id`, `meta_campaign_id`, `google_ads_id` (źródłowe ID kampanii)
- `user_id` (opcjonalne — jeśli lead się zarejestrował)
- `created_at`, `updated_at`, `assigned_to`

**Nowa tabela `lead_communications`** (zunifikowany log):
- `id`, `lead_id`, `channel` (`voicebot_call` | `sms` | `email` | `messenger` | `manual_note`)
- `direction` (`inbound` | `outbound`)
- `subject`, `content` (treść / transkrypcja)
- `transcript jsonb` (pełna rozmowa ElevenLabs — turn-by-turn)
- `recording_url`, `duration_seconds`
- `external_id` (call_sid, message_sid, elevenlabs_conversation_id)
- `metadata jsonb` (status, koszt, agent_id itp.)
- `created_at`

**Migracja danych:** skrypt który przeniesie istniejące `clients` + `loan_applications` + `meta_leads` → `leads`, oraz `contact_events` + transkrypcje ElevenLabs → `lead_communications`. Stare tabele zostają (deprecated) — usuniemy w kolejnym kroku po weryfikacji.

## Kod do przepisania

1. **Webhooki źródeł leadów** (zapis do `leads` zamiast 3 tabel):
   - `api/public/meta-leads-webhook.ts`
   - Webhook Google Ads (jeśli jest)
   - Endpoint landingu (`api/public/loan-application.ts`)
   - Import z Google Sheets (`GoogleSheetsLeadsPanel`)

2. **ElevenLabs webhook** (`api/public/elevenlabs-webhook.ts`):
   - Po zakończonej rozmowie zapis pełnej transkrypcji + recording_url + duration do `lead_communications` z `channel: voicebot_call`
   - Match leada po `phone_normalized`

3. **Voicebot trigger** (`voicebot.functions.ts`):
   - `placeOutboundCallInternal` zapisuje wpis `outbound voicebot_call` w `lead_communications` od razu po inicjacji (status: `initiated`), aktualizowany webhookiem po zakończeniu

4. **SMS** (`sendSmsInternal`): zapis do `lead_communications` (`channel: sms`)

5. **Email** (`mailing.functions.ts` + `resend-webhook`): zapis wysłanych i przychodzących do `lead_communications`

6. **Messenger** — nowy webhook `api/public/messenger-webhook.ts` (placeholder, podłączymy jak będzie integracja)

7. **`/klient`** — czyta z `leads` zamiast `loan_applications + clients`

8. **`/wniosek/$token`** — match po `leads.return_link_token`

## Panel admina (uproszczenie)

**Sidebar — zostaje:**
- Pulpit
- **Leady** (jedna lista, filtr: typ pożyczkowy/inwestorski, status, źródło) — zastępuje obecne *Leady*, *Klienci*, *Wnioski*
- Oferty
- Voicebot, Mailing, Marketing, Integracje, AI, Ustawienia (bez zmian)

**Sidebar — znika:**
- Klienci, Wnioski (osobne), Dokumenty (osobny widok), Follow-up (widoczne w karcie leada)

**Karta leada (`/admin/leady/$id`)** — zakładki:
- **Dane** — wszystko co widzi klient na `/klient` (5 kroków wniosku), edytowalne
- **Dokumenty** — lista plików leada
- **Komunikacja** — chronologiczny feed: rozmowy voicebota (z transkrypcją + odtwarzaczem nagrania), SMS-y, maile, Messenger, notatki ręczne. Filtr po kanale.
- **Oferty** — oferty inwestorów przypięte do leada
- **Akcje** — zmiana statusu, przypisanie, ręczne zadzwoń/SMS/email

## Kolejność wykonania

1. Migracja SQL: utworzenie `leads` + `lead_communications` + indeksy + RLS + GRANT-y
2. Skrypt migracyjny danych (INSERT z `clients`/`loan_applications`/`meta_leads` → `leads`)
3. Przepisanie webhooków źródeł leadów na `leads`
4. Przepisanie ElevenLabs/SMS/email handlerów na zapis do `lead_communications`
5. Nowa lista admina `/admin/leady` (zunifikowana) + nowa karta leada z zakładką **Komunikacja**
6. Usunięcie z sidebara: Klienci, Wnioski, Dokumenty, Follow-up
7. Aktualizacja `/klient` i `/wniosek/$token` na nowy schemat

## Co zachowuję bez zmian

- Voicebot (silnik, ElevenLabs, Twilio) — tylko zmiana miejsca zapisu transkrypcji
- Cały moduł Inwestorzy (osobny flow, ale leady inwestorskie też trafiają do tabeli `leads` z `type=inwestorski`)
- Marketing/AI/Integracje
- Schemat ofert, dokumentów (pliki zostają w `documents` bucket, tylko relacja `lead_id` zamiast `loan_application_id`)

## Uwagi techniczne

- Stare tabele `clients`, `loan_applications`, `meta_leads`, `contact_events` **nie są usuwane w tej iteracji** — zostają jako backup. Usuniemy po Twoim potwierdzeniu że nowa struktura działa.
- `documents.loan_application_id` → dodajemy `documents.lead_id`, backfill, stary FK zostaje (deprecated).
- RLS: admin (`has_role administrator`) widzi wszystko; klient widzi tylko swojego leada po `user_id`.

Po Twoim OK lecę z migracją SQL i całą resztą.
