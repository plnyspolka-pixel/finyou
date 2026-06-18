## Problem

W bazie jest 121 rozmów voicebota, z czego 77 wisi w statusie `w_trakcie` i **żadna nie ma zapisanego transkryptu, audio ani czasu trwania**. Webhook ElevenLabs (`/api/public/elevenlabs-webhook`) prawdopodobnie nie jest podpięty po stronie ElevenLabs lub jego ostatnie wywołania zawiodły. Dlatego panel `/admin/voicebot` pokazuje tylko: numer, status, próby, datę — bez treści rozmowy.

## Cel

1. Zacząć faktycznie zaciągać pełne dane każdej rozmowy z API ElevenLabs (transkrypt, audio, czas trwania, analiza, koszt) — niezależnie od webhooka.
2. Rozbudować `/admin/voicebot` o filtrowanie/wyszukiwarkę oraz podgląd każdej rozmowy: czas trwania, godziny, pełny transkrypt (user/agent w bańkach), odtwarzacz audio, analiza AI (sukces, podsumowanie, sentyment, koszt).
3. `/admin/klienci` już używa `LeadDetailView`, który renderuje rozmowy voicebota z transkryptem i audio z `lead_communications` — po wzbogaceniu danych zacznie to działać automatycznie, bez zmian w UI klienta.

## Backend

**Nowa funkcja `enrichVoicebotConversation(conversationId)`** w `src/lib/voicebot-enrich.server.ts`:
- `GET https://api.elevenlabs.io/v1/convai/conversations/{id}` z nagłówkiem `xi-api-key` (z `ELEVENLABS_API_KEY`).
- Pobiera: `status`, `metadata.call_duration_secs`, `metadata.start_time_unix_secs`, `metadata.cost`, `metadata.termination_reason`, `transcript` (tablica tur z `role`/`message`), `analysis.call_successful`, `analysis.transcript_summary`, `analysis.evaluation_criteria_results`, `audio_url` (lub osobny endpoint `/audio`).
- Aktualizuje `call_queue` (`status`, `started_at`, `finished_at`, `transcript` tekst, `result_summary`, `raw_result` JSON).
- Aktualizuje istniejący wpis w `lead_communications` (po `external_id = conversation_id`) lub dopisuje brakujące pola: `transcript`, `recording_url`, `duration_seconds`, `metadata.call_outcome`, `metadata.analysis`, `metadata.cost_credits`, `status` (Odebrana / Nieodebrana / itd.). Re-używa istniejącej logiki `classifyOutcome` (wyciągniętej z webhooka do osobnego helpera).

**Server function `enrichPendingVoicebotConversations()`** w `src/lib/voicebot.functions.ts`:
- Zabezpieczone `requireSupabaseAuth` + sprawdzenie roli administratora/operatora.
- Pobiera z `call_queue` rozmowy z `conversation_id IS NOT NULL` i (`status IN ('w_trakcie','wykonane')` lub `raw_result IS NULL`) z ostatnich 30 dni, max 50 na wywołanie.
- Dla każdej woła `enrichVoicebotConversation`. Zwraca podsumowanie `{ checked, updated, errors }`.

**Cron** (przez `supabase--insert`, NIE migracja — to dane runtime):
- `pg_cron` co 2 minuty woła nowy endpoint `/api/public/hooks/voicebot-enrich-tick`, który wywołuje powyższą logikę enrich (z `pg_try_advisory_lock` żeby nie nakładały się równoległe wywołania).

**Server function `getVoicebotConversation(callQueueId)`**: zwraca cały wiersz `call_queue` + powiązany `lead_communications` (po `external_id`). Używana w UI do rozwinięcia szczegółów.

## UI — `/admin/voicebot`

### Pasek statystyk (na górze nad kolejką)
4 kafelki dla okresu „dziś" i „7 dni" (toggle):
- Liczba rozmów
- % odebranych (`call_outcome = answered`)
- Średni czas trwania
- Łączny koszt (suma `metadata.cost_credits`)

### Pasek filtrów
- Wyszukiwarka po numerze i fragmencie transkryptu.
- Select `status` (oczekuje / w_trakcie / wykonane / nieodebrana / blad).
- Select `źródło` (meta_lead / wniosek_krok2 / manual / test).
- Range dat (od / do, domyślnie 7 dni).
- Przycisk „Odśwież z ElevenLabs" → woła `enrichPendingVoicebotConversations` z toastem `Zaktualizowano X / sprawdzono Y`.

### Lista rozmów
Każdy wiersz po lewej (jak teraz):
- Numer, źródło, próby, data utworzenia, ID konwersacji.

Po prawej dodatkowe pola, jeśli dostępne:
- Czas trwania (`mm:ss`), godzina start (Europe/Warsaw), wynik (badge `success` / `failure`), koszt w kredytach.
- Powiązany klient/wniosek (link do `/admin/klienci/{id}` lub `/admin/wnioski/{id}`) jeśli mamy `client_id` / `loan_application_id`.

Klik w wiersz → rozwija panel:
- Krótkie podsumowanie z `analysis.transcript_summary`.
- Odtwarzacz `<audio controls src={recording_url} />` jeśli jest.
- Pełny transkrypt jak w `LeadDetailView` — turny user/agent w bańkach (klient po prawej w `primary`, voicebot po lewej), z `whitespace-pre-wrap` i scrollem.
- Metadane: `disconnection_reason`, `call_successful`, `evaluation_criteria_results` w postaci listy.

### Drobne porządki
- Stała `STATUS_LABELS` rozszerzona o `nieodebrana`, `poczta_glosowa`, `wykonane`.
- Kolory badge'a poprawne dla każdego statusu.

## Pliki

**Nowe:**
- `src/lib/voicebot-enrich.server.ts` — fetch z ElevenLabs + classifyOutcome.
- `src/routes/api/public/hooks/voicebot-enrich-tick.ts` — endpoint cron.
- `src/components/admin/VoicebotConversationCard.tsx` — wiersz + rozwijany panel z transkryptem/audio/analizą.
- `src/components/admin/VoicebotStats.tsx` — pasek statystyk.

**Zmienione:**
- `src/lib/voicebot.functions.ts` — dodaje `enrichPendingVoicebotConversations`, `getVoicebotConversation`. Eksportuje też `listVoicebotConversations({ filters })` dla wyszukiwarki/filtrów po stronie serwera (zamiast czystego `supabase` z klienta) — żeby filtr po transkrypcie nie ciągnął wszystkiego do przeglądarki.
- `src/routes/admin.voicebot.tsx` — nowa lista, filtry, statystyki, przycisk „Odśwież z ElevenLabs".
- `src/routes/api/public/elevenlabs-webhook.ts` — wyekstrahowanie `classifyOutcome` do `voicebot-enrich.server.ts` (DRY), reszta bez zmian.

**Cron (przez `supabase--insert`, po wdrożeniu kodu):**
- `cron.schedule('voicebot-enrich-tick', '*/2 * * * *', ...)` strzelający do `https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app/api/public/hooks/voicebot-enrich-tick`.

## Czego NIE robię

- Nie ruszam `/admin/klienci` ani `LeadDetailView` — one już renderują rozmowy voicebota z `lead_communications`. Po wzbogaceniu danych transkrypt/audio pojawią się tam automatycznie.
- Nie zmieniam istniejącego webhooka po stronie ElevenLabs — enrich pull działa równolegle i jest odporny na brakujący webhook.
- Nie dodaję na razie osobnej strony szczegółów rozmowy — wystarczy rozwijany panel inline.
