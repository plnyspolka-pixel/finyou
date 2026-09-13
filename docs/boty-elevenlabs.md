# Boty procesowe na ElevenLabs — architektura i wdrożenie

Decyzja właściciela: wszystkie boty procesowe działają jako agenty ElevenLabs
(jeden bot na etap procesu); w systemie głównym zostaje wyłącznie asystent
panelu admina (Anthropic) i deterministyczny agent kreatora umowy.

## Agenty

| Agent                                               | Rola                                                                     | Powierzchnie                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **A1 — przyjęcie wniosku** (`intake`)               | JEDEN bot prowadzi klienta od pierwszego kontaktu do kompletnego wniosku | chat na stronie, telefon (voicebot), widget w `/klient`, Messenger/IG, e-mail |
| **A2 — informacja dla inwestora** (`investor_info`) | pytania o platformę, cennik, FV                                          | chat na `/dla-inwestora`                                                      |
| **A3 — panel inwestora** (`investor_panel`)         | pomoc w panelu `/inwestor`                                               | widget w panelu                                                               |
| **A4 — windykacja**                                 | istniejący agent (`windykacja-call.functions`)                           | telefon                                                                       |

ID agentów: env (`ELEVENLABS_INTAKE_AGENT_ID` itd.) ma pierwszeństwo, potem
`voicebot_settings.intake_agent_id / investor_info_agent_id /
investor_panel_agent_id`. Tworzenie brakujących agentów: karta „Agenty
procesowe ElevenLabs" na `/admin/text-agent` (przez API, z promptami z tej
samej strony; A1 dostaje dokleję twardych zasad — zero obietnic kontaktu).

## Jak przełączają się kanały

- **Widgety (chat klienta, chat inwestora, panel inwestora)** — interfejs jest
  NASZ (polskie napisy, styl Finance You); agent ElevenLabs odpowiada przez
  serwer (`/api/public/chat-widget`, `/api/public/investor-chat-widget`,
  `sendInvestorAssistantMessage`). Osadzony `<elevenlabs-convai>` został
  usunięty — pokazywał obcy, angielski interfejs.
- **Rozmowa głosowa na stronie** — własne UI
  (`components/landing/voice-call-widget.tsx`) i własny klient WebSocket
  (`lib/voice-conversation.ts`: mikrofon → PCM16, odtwarzanie
  odpowiedzi, przerywanie). Podpisany URL sesji wydaje
  `POST /api/public/voice-session` (`surface`: `intake` albo `missing_info`;
  klucz API nie trafia do przeglądarki, limit 12 sesji/h/IP). Ten sam komponent
  obsługuje widget braków w panelu klienta.
- **Messenger / Instagram / e-mail / czat (router wiadomości)** —
  `runAgentTurn` najpierw próbuje tury tekstowej ElevenLabs
  (`elevenlabs-text-turn.server.ts`, WebSocket w trybie text-only, signed
  URL); każde niepowodzenie = cichy powrót do starego silnika (log
  `ElevenLabs turn fallback`). Wygaszenie starego silnika = usunięcie
  fallbacku, dopiero gdy logi pokażą stabilną ścieżkę ElevenLabs.
- **Telefon** — istniejący voicebot (`voicebot_settings.agent_id`); po
  scaleniu w A1 wpisz ID agenta intake również jako `agent_id`
  (i `document_reminder_agent_id`), żeby telefon prowadził ta sama Ania.
- **SMS (dwukierunkowy)** — webhook `/api/public/twilio-sms-inbound`
  (konfiguracja w Twilio: Messaging → A MESSAGE COMES IN, token
  `TWILIO_WEBHOOK_TOKEN`). Odpowiedzi lądują w `lead_communications`
  (pauza follow-upów działa automatycznie), STOP/WYPISZ ustawia
  `clients.do_not_sms`.

## Rozdzielenie kanałów (jeden agent, różne zasady)

Źródło prawdy: `src/lib/agent-channel-rules.ts`.

| Kanał (`channel`)                        | Czym się różni                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `voice_phone` — telefon                  | bez załączników, 1–2 zdania i pauza, powtarza kwoty/KW po kliencie, kieruje na wniosek na stronie i wysyła link SMS-em (`send_application_link`) |
| `voice_web` — rozmowa głosowa na stronie | jak telefon, ale klient jest już na stronie: zamiast SMS-a kieruje do formularza na ekranie                                                      |
| `chat` — czat na stronie                 | w oknie czatu NIE DA SIĘ przesłać zdjęć; dane zbiera w rozmowie, dokumenty przez wniosek na stronie                                              |
| `messenger` / `instagram`                | klient MOŻE przesyłać zdjęcia w rozmowie — komplet zbierany na czacie, bez linku do formularza                                                   |
| `email`                                  | pełna wiadomość z podpisem, załączniki przyjmowane, maks. dwa pytania                                                                            |
| `sms`                                    | dwa zdania, jeden link, bez zbierania dokumentów                                                                                                 |

Do tego wspólne `RAPPORT_RULES`: najpierw rozmowa, jedno pytanie na wiadomość,
najpierw odpowiedź na to, co powiedział klient, żadnego linku do wniosku na
starcie (PESEL, dochód i dokumenty na końcu, nie na początku).

Jak trafia do agentów:

- **Agenty ElevenLabs** — prompt A1 dostaje wszystkie zestawy reguł i wybiera
  po zmiennej `{{channel}}`; wartości domyślne zmiennych idą w
  `dynamic_variable_placeholders` (bez nich rozmowa bez `channel` by padła).
  Zmienne `channel`/`channel_label` ustawiają: widgety, `runAgentTurn`,
  webhook `hooks/elevenlabs-conversation-init` (telefon) i połączenia
  wychodzące voicebota.
- **Silnik tekstowy (fallback)** — `runAgentTurn` dokleja do promptu wyłącznie
  reguły bieżącego kanału (`channelRules`).
- **Aktualizacja istniejących agentów** — przycisk „Wyślij aktualne prompty do
  agentów" na `/admin/text-agent` (`syncElevenLabsAgentPrompts`). Bez niego
  zmiana promptu obejmuje tylko nowo tworzone agenty. Jeśli telefon dzwoni
  agentem innym niż A1 (`voicebot_settings.agent_id`), wynik synchronizacji to
  sygnalizuje — jego prompt żyje w konsoli ElevenLabs.

## Narzędzia agentów (webhook toole)

Jeden endpoint: `POST /api/public/agent-tools` (nagłówek
`X-Agent-Tools-Secret` = sekret `AGENT_TOOLS_SECRET`). Body:
`{"tool": "...", "lead_id"?|"phone"?|"email"?, "application_id"?, "args"?}`.

| Tool                     | Działanie                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update_lead_data`       | zapis danych wniosku (ten sam executor co dotychczasowe boty)                                                                                                                               |
| `send_application_link`  | magic link do panelu klienta                                                                                                                                                                |
| `mark_ready_for_human`   | flaga „gotowy do oceny" (NIE obiecujemy kontaktu)                                                                                                                                           |
| `request_invoice`        | prośba o FV dla księgowości (legacy — docelowo issue_invoice)                                                                                                                               |
| `get_application_status` | status wniosku słownikiem klienckim (to samo, co panel)                                                                                                                                     |
| `get_missing_info_brief` | brief braków (te same pytania co follow-upy)                                                                                                                                                |
| `issue_invoice`          | wystawienie FV: NIP (suma kontrolna) + nazwa z GUS; pozycja z cennika → od ręki (sales_invoices/KSeF/mail), dowolna kwota → szkic dla księgowości; dedup NIP+kwota+dzień, limit 3/dzień/NIP |

W konsoli ElevenLabs dopnij te toole do agentów (Tools → Webhook) i przekaż
`lead_id` z dynamic variables (widgety i router ustawiają `lead_id`,
`channel`, `first_name`, `email`, `phone`).

## Sekrety wymagane

| Sekret                 | Po co                                                 |
| ---------------------- | ----------------------------------------------------- |
| `ELEVENLABS_API_KEY`   | tworzenie agentów, signed URL, tryb tekstowy          |
| `AGENT_TOOLS_SECRET`   | autoryzacja webhook tooli (`/api/public/agent-tools`) |
| `TWILIO_WEBHOOK_TOKEN` | webhook SMS inbound (już używany przez voice)         |

## Wygaszanie starego silnika (ostatni krok)

Warunki: (1) agenty A1–A3 aktywne, (2) logi bez `ElevenLabs turn fallback`,
(3) transkrypcje/wiadomości widoczne w `lead_communications` (webhook
post-call już zapisuje). Wtedy: usunięcie ścieżki Gemini z `runAgentTurn`,
`text_agent_knowledge` → Knowledge Base ElevenLabs (eksport jednorazowy),
`/admin/text-agent` zostaje jako edytor promptów + linki do konsoli.
