## Root cause — telefon do nowych leadów Meta DZIAŁA

Sprawdziłem cztery ścieżki, które wskazałeś. Wynik jednoznaczny — natychmiastowy telefon się odpala, wpis „📞 0" na liście klientów jest artefaktem UI, nie brakiem połączenia.

### Dowody z bazy

**1. `voicebot_settings` (id=1)**
- `call_trigger = "auto"` (nie „manual") — auto-tryb WŁĄCZONY.
- `agent_id`, `agent_phone_number_id` ustawione.
- `retry_count = 1`, `call_delay_seconds = 0`.

**2. `meta_lead_forms.voicebot_enabled` dla formularza tych leadów**
Wszystkie leady z listy pochodzą z `meta_form_id = 1334327965293205` („Do apki financeyou.pl 2026-06-09"). Ten formularz ma `voicebot_enabled = true`. (Wyłączony `voicebot_enabled = false` mają tylko dwa formularze INWESTORZY — inna publiczność, poza scope.)

**3. `placeOutboundCallInternal` — nie odrzuca cicho**
Sprawdziłem `call_queue` dla numerów telefonów 10 ostatnich meta-leadów. **Każdy meta-lead ma matching wpis w `call_queue` z `source = "meta_lead"` utworzony 0–1 s po insercie leada**:

```
14:33:04 Stanisław Skiba +48508508715 → call_queue 14:33:05 status=nieodebrana
14:20:04 kasia chojnacka +48607816100 → call_queue 14:20:05 status=poczta_glosowa
08:41:04 Dariusz Prinz   +48662831448 → call_queue 08:41:05 status=wykonane
07:21:08 Janusz Ciemiega +48609055313 → call_queue 07:21:08 status=nieodebrana
06:05:04 Mateusz         +48513214276 → call_queue 06:05:05 status=nieodebrana
21-07 14:55 Rafał Przywara  +48605869851 → 14:55:12 status=nieodebrana
21-07 12:05 Renata Kawecka  +48797755040 → 12:05:17 status=nieodebrana
21-07 11:13 Maria Kozioł    +48504014654 → 11:13:06 status=nieodebrana
21-07 10:40 Ella Zdun-C.    +48501525710 → 10:45:54 status=…
21-07 07:30 Maria           +48571924731 → 07:30 status=…
```

Wszystkie mają `source = meta_lead` (a nie `follow_up_call_*`), więc to natychmiastowe telefony z webhooka Meta, nie cron follow-up.

Odpowiednie `automation_events` typu `elevenlabs_outbound_call` też są `status = sent` z callSid + conversationId (14:33, 14:24, 14:20…). Żaden nie ma statusu „skipped" z powodu throttle / quiet hours / brakującego numeru w oknie meta-lead — obserwuję tylko `skipped throttled=true` przy follow-up 2/3, kiedy telefon meta-lead już poszedł te same 24 h wcześniej. To poprawne działanie throttle 24 h/numer.

**4. `automation_events` typu `meta_lead_capture` — 0 wpisów**
Ta ścieżka loguje wyłącznie w dwóch przypadkach: (a) gałąź `skipped` gdy `canCall === false`, (b) gałąź `error` w catch całego webhooka. Brak wpisów = nigdy nie wpadamy w gałąź „skipped" i nie ma exceptionów — zgadza się z tym, że wszystkie meta-leady dostają telefon.

## Co jest faktycznym problemem

Licznik „📞 0" przy leadzie na liście klientów liczy wiersze z tabeli `lead_communications`. Sprawdziłem — dla wszystkich 4 ostatnich meta-leadów `lead_communications` jest puste. `placeOutboundCallInternal` zapisuje rozmowę do `call_queue` + `automation_events`, ale **nie tworzy rekordu w `lead_communications`** dla źródła `meta_lead` (webhook zna `unifiedLeadId`, ale nie propaguje go do voicebota; sync tak samo). Dlatego skrzynka/historia leada pokazuje 0, mimo że telefon fizycznie wyszedł.

## Rekomendacja

Ścieżki telefonu **nie ruszamy** — działa zgodnie z konfiguracją i twoją regułą „nie zmieniaj celowych ustawień biznesowych". Jedyny realny bug to rozjazd licznika komunikacji.

Proponuję **drugi, wąski PR** (osobno, żeby nie mieszać z ścieżką telefonu), który:

1. W `placeOutboundCallInternal` doda opcjonalny parametr `leadId` (obok istniejącego `metaLeadId`) i, jeśli podany, zapisze wpis do `lead_communications` w momencie utworzenia `call_queue` (channel `phone`, direction `outbound`, kolumna łącząca z `call_queue.id`).
2. W obu wywołaniach z `meta-leads-webhook.ts` i `meta-leads-sync.server.ts` przekaże już posiadany `unifiedLeadId`.
3. Nic więcej — bez zmian logiki throttle, quiet hours, agentów, sekwencji.

To naprawi licznik „📞 0" retroaktywnie tylko dla nowych połączeń; dla starych trzeba by osobnego backfillu z `call_queue → lead_communications` (mogę dodać jako drugi krok, jeśli chcesz).

**Nic nie zmieniam do momentu twojej zgody.** Potwierdź jedno z:
- (A) tak, zrób PR z zapisem `lead_communications` z voicebota (bez backfillu),
- (B) tak + zrób też backfill starych meta_lead calls,
- (C) zostaw jak jest — telefon działa, licznik zignorujemy.
