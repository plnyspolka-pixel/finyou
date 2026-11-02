# Windykator AI A5 — inbound + outbound, bez Lovable

## Zakres

Ten moduł nie korzysta z usług Lovable, bramki `ai.gateway.lovable.dev` ani botów A1/A4.
Jeden agent `Finance You — Windykator AI 90 dni (A5)` działa w obu kierunkach na osobnym numerze:
- **Inbound**: numer w ElevenLabs → konfigurowany automatycznie webhook `/api/public/hooks/windykator-voice-init` → wyłącznie powiązane z opłaconą sprawą informacje (po zidentyfikowaniu rozmówcy), bez zakładania nowych zleceń.
- **Outbound**: opłacona sprawa `windykator_orders` → aktualne oświadczenie wierzyciela o saldzie → reguły i limity → bezpośrednie ElevenLabs `/v1/convai/twilio/outbound-call`.
- **Wynik rozmowy**: prywatny HMAC webhook `/api/public/windykator-voice-postcall` → `windykator_voice_calls` i `windykator_voice_events`; spór/zgłoszona zapłata/opt-out wstrzymują żądania.
- **Dane dokumentowe**: `document-ai.server.ts` wywołuje natywny Google Gemini `generateContent` z prywatnych dokumentów; **bez Lovable**.

## Konfiguracja serwera

Wymagane:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (już używane w Finance You).
- `ELEVENLABS_API_KEY` (bezpośrednie API ElevenLabs).
- `WINDYKATOR_VOICE_INIT_SECRET` (losowy ciąg min. 24 znaków, tylko serwer i tajny nagłówek agenta).
- `WINDYKATOR_VOICE_PUBLIC_BASE_URL=https://app.financeyou.pl` lub `https://financeyou.pl` — żadnych adresów Lovable.
- `GEMINI_API_KEY` lub `GOOGLE_GEMINI_API_KEY` — bezpośrednia analiza przedpłatna.

Przełączniki:
- `WINDYKATOR_VOICE_OUTBOUND_ENABLED=false` domyślnie. Włączyć wyłącznie po E2E i ocenie prawnej.
- `WINDYKATOR_AI_CHECKOUT_ENABLED=false` domyślnie (z pakietu startowego).

Wymagane SQL: `20261102122000_windykator_startowy.sql` z poprzedniego PR, a **następnie** nowa migracja `20261102144500_windykator_voice_a5.sql`. Nie zmieniaj starszej migracji po wdrożeniu.

## Uruchomienie bez Lovable

1. Ustaw sekrety wyłącznie w konfiguracji backendu Finance You.
2. Zastosuj migrację SQL.
3. Otwórz `/admin/windykator-voice`; użyj **Utwórz nowego agenta ElevenLabs**. Ta czynność tworzy agenta i dwa webhooki bezpośrednio przez API.
4. Przygotuj **nowy** numer Twilio importowany do ElevenLabs i wskaż jego `phone_number_id` w panelu. Nie przypisuj numeru A1/A4.
5. Test inbound: zadzwoń na numer A5 spoza rozpoznanej sprawy — agent nie ujawnia żadnych danych. Następnie test na rozpoznanym numerze.
6. Test outbound dla własnego numeru testowego, przy potwierdzonym saldzie, w godzinach 9–18 pn.–pt. Nie uruchamiaj akcji na rzeczywistych dłużnikach przed sprawdzeniem bezpieczeństwa.
7. Potwierdź na webhooku i w bazie stan `payment_reported`, `disputed` oraz `voice_opt_out` po wypowiedziach testowych; po ich otrzymaniu żaden kolejny telefon nie powinien zostać dopuszczony.

## Ograniczenia

- Moduł nie przyjmuje zleceń z rozmowy, SMS, CRM ani e-maila. Jedynym wejściem jest formularz sklepu.
- Agent nie zawiera ugód, nie wysyła pozwów ani nie zmienia samodzielnie salda.
- Podstawą komunikacji jest upoważnienie wierzyciela i odpowiednie podstawy przetwarzania danych osób trzecich.
- Automatyczna ocena tożsamości na podstawie rozmowy i numeru telefonu nie zastępuje mocnego uwierzytelnienia; nie wolno ujawniać długu osobom trzecim.
- Kod i panel nie dowodzą, że zewnętrzny agent został już utworzony w koncie ElevenLabs. To następuje dopiero po świadomym wywołaniu API z autoryzowanego backendu.
