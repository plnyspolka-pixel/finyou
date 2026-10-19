# Flota agentów na wspólnej linii — recepcja, presale inwestora, windykacja

Jeden kanał kontaktu (telefon, czat, Messenger, Instagram, SMS, e-mail) i kilka
wyspecjalizowanych agentów ElevenLabs. Recepcja rozpoznaje, **kto** pisze lub
dzwoni i **czego potrzebuje**, zapisuje to i przełącza do specjalisty.
Specjaliści pracują na danych z systemu przez narzędzia z twardymi
zabezpieczeniami po stronie serwera.

## Agenty

| Klucz                    | Agent                                              | Model             | Głos       | Przełącza do                                     |
| ------------------------ | -------------------------------------------------- | ----------------- | ---------- | ------------------------------------------------ |
| `recepcja_glos`          | Finance You — recepcja (A0, głos)                  | gemini-2.5-flash  | Aleksandra | A1 intake, A2P głos, A3 panel, A4 głos           |
| `recepcja_tekst`         | Finance You — recepcja (A0, tekst)                 | gemini-2.5-flash  | —          | A1 intake, A2P tekst, A3 panel, A4T              |
| `inwestor_presale_glos`  | Finance You — presale inwestora (A2P, głos)        | claude-sonnet-4-6 | Aleksandra | A1 intake, A3 panel                              |
| `inwestor_presale_tekst` | Finance You — presale inwestora (A2P, tekst)       | claude-sonnet-4-6 | —          | A1 intake, A3 panel                              |
| `windykacja_glos`        | Finance You — windykacja (A4, głos, linia wspólna) | claude-sonnet-4-6 | Filip      | —                                                |
| `windykacja_tekst`       | Finance You — windykacja (A4T, tekst)              | claude-sonnet-4-6 | —          | —                                                |
| (istniejący) A1          | Finance You — przyjęcie wniosku (A1)               | bez zmian         | bez zmian  | —                                                |
| (istniejący) A3          | Finance You — panel inwestora (A3)                 | bez zmian         | bez zmian  | —                                                |

- Źródło prawdy: `src/lib/agent-fleet.ts` (agenty, narzędzia, przełączenia,
  konfiguracja dla API) oraz prompty: `src/lib/triage-agent-prompt.ts`,
  `src/lib/investor-presale-prompt.ts`, `src/lib/windykacja-text-agent-prompt.ts`,
  `src/lib/windykacja-agent-prompt.ts` (+ `WIND_INBOUND_APPENDIX`).
- Eksport gotowych konfiguracji: `bun scripts/agent-fleet-export.ts <katalog> <secret_id> [tool_ids.json] [agent_ids.json]`.
- Istniejące A2 (`/dla-inwestora`, tryb informacyjny) i telefon windykacyjny
  z panelu inwestora (`placeWindCollectionCall`, osobny agent z czystym
  `WIND_AGENT_PROMPT`) działają bez zmian.

## Dlaczego warianty głosowe i tekstowe są osobnymi agentami

Ten sam prompt-źródło, ale różne media: w głosie ujawnienie AI i nagrywania
w pierwszym zdaniu, liczby słowami, krótkie tury, poczta głosowa; w tekście
brak nagrywania, pismo zostaje (może je przeczytać sąd albo osoba trzecia),
rozmowa jest asynchroniczna, „STOP” kończy korespondencję. Osobne agenty dają
też osobny wybór modelu, limitów czasu i testów. Rozjazd treści wyklucza
generowanie obu wariantów z jednej funkcji.

## Rozpoznanie potrzeb (recepcja)

Sześć potrzeb (`TRIAGE_INTENTS`): nowe finansowanie, inwestowanie, trwający
wniosek, spłata umowy, inwestor z kontem, inne. Recepcja:

1. Po cichu woła `identify_caller` — sugerowana trasa wyznaczona po kontakcie
   z kanału (numer połączenia, nadawca wiadomości), bez danych osobowych.
   Numeru ani e-maila podanego w rozmowie nie sprawdza w bazie.
2. Słucha; przy niejednoznaczności zadaje pytanie rozstrzygające z dwiema
   opcjami („nowa pożyczka czy podpisana umowa?”).
3. `save_needs` z tym, co już wiadomo (żeby specjalista nie pytał drugi raz).
4. `transfer_to_agent` z jednym zdaniem zapowiedzi.

Recepcja nie podaje kwot, statusów ani numerów umów i nie potwierdza nawet,
że ktoś jest naszym klientem.

## Wspólny kanał tekstowy — trwała trasa wątku

Router wiadomości (`runAgentTurn`) otwiera nową rozmowę ElevenLabs przy
każdej wiadomości. Wbudowane przełączenie działa tylko w obrębie jednej
rozmowy, więc bez pamięci trasy recepcja rozpoznawałaby klienta od nowa przy
każdej wiadomości, a pożyczkobiorca potwierdzałby tożsamość przy każdym SMS-ie.

Rozwiązanie (`src/lib/agent-fleet-routing.server.ts`):

- wątek ma stały **podpisany** klucz (`thread_key`, HMAC z
  `AGENT_TOOLS_SECRET`) — sesja narzędzi żyje pod
  `thread:lead:<id>:<skrót nadawcy>`; klucz podrobiony albo cudzy jest
  ignorowany. Wątek to lead **razem z nadawcą uwierzytelnionym przez
  platformę** (sesja czatu, PSID Messengera / IGSID, numer nadawcy SMS, adres
  e-mail): lead dopasowuje się po kontakcie, który każdy może wpisać
  w formularzu, więc sam lead nie może nieść potwierdzonej tożsamości;
- numer nadawcy SMS / adres e-mail jedzie podpisany w kluczu i jest dla
  narzędzi kontaktem „z kanału” (jak caller-id);
- bez nadawcy z kanału (np. follow-up wysyłany przez system) flota się nie
  włącza — zostaje A1;
- trasę wybiera **kod** z potrzeby zapisanej przez recepcję (`needs.intent`);
- gdy recepcja rozpoznała potrzebę w tej turze, ta sama wiadomość od razu idzie
  do specjalisty (klient dostaje odpowiedź merytoryczną, nie „przekazuję…”);
- po 30 dniach ciszy wątek wraca do recepcji.

**Włączenie**: `voicebot_settings.agent_fleet = {"text_entry": "recepcja",
"agents": {...}}`. Bez tego router działa jak dotąd (A1). Każde niepowodzenie
floty = cichy powrót do A1.

## Narzędzia i bezpieczeństwo

Endpoint: `POST /api/public/agent-tools` (dotychczasowe narzędzia `fy_*` bez
zmian). Nowe narzędzia ElevenLabs mają nazwy `fy2_<narzędzie>__<klucz agenta>`
i wysyłają **stałe** `tool` oraz `agent_key` — model ani klient widgetu nie może
ich podmienić. Sekret jest w magazynie sekretów ElevenLabs
(`fy_agent_tools_secret`), nie jawnym tekstem w konfiguracji.

| Narzędzie                  | Agenty           | Tożsamość | Zapis | Co robi                                                                                   |
| -------------------------- | ---------------- | --------- | ----- | ----------------------------------------------------------------------------------------- |
| `identify_caller`          | wszystkie        | nie       | nie   | sugerowana trasa po kontakcie z kanału; bez danych osobowych                              |
| `verify_identity`          | A2P, A4, A4T     | —         | tak   | dowód w kodzie: imię i nazwisko + numer umowy albo kod SMS; 3 próby + limit per podmiot   |
| `send_verification_code`   | A2P, A4, A4T     | nie       | tak   | SMS z kodem na numer **z akt** (nigdy na numer podany w rozmowie), 3 kody / podmiot / dobę |
| `save_needs`               | A0, A2P          | nie       | tak   | rozpoznane potrzeby w sesji                                                               |
| `get_collection_case`      | A4, A4T          | **tak**   | nie   | akta konkretnej umowy: kwota na dziś z harmonogramu, etap, termin maks., opłaty z umowy   |
| `record_payment_promise`   | A4, A4T          | **tak**   | tak   | deklaracja wpłaty w aktach; termin po limicie etapu odrzucony                             |
| `record_call_note`         | A4, A4T          | częściowo | tak   | przed weryfikacją tylko neutralne rodzaje, oznaczone „Niezweryfikowane”                    |
| `get_payment_instructions` | A4, A4T          | **tak**   | nie   | wyłącznie rachunek z umowy, pogrupowany do dyktowania                                     |
| `lookup` / `describe_data` | A4, A4T          | per tabela| nie   | szeroki odczyt bazy przez allow-listę (niżej)                                             |
| `get_pricing`              | A2P              | nie       | nie   | cennik z bazy (`access_products`) — jedyne źródło cen                                     |
| `get_offer_teasers`        | A2P              | nie       | nie   | przykładowe karty spraw bez danych osobowych                                              |
| `get_investor_state`       | A2P              | **silna** | nie   | abonament, pakiet umów, kryteria, zlecenia, następny krok (po kodzie SMS)                 |
| `save_investor_needs`      | A2P              | nie       | tak   | potrzeby + kwalifikacja A/B/C; pisze tylko do leada „swojej” rozmowy                      |
| `request_investor_callback`| A2P              | nie       | tak   | prośba o kontakt — bez obietnicy terminu                                                  |
| `send_investor_registration_link` | A2P       | nie       | tak   | SMS z linkiem (albo link do czatu)                                                        |
| `search_knowledge`         | A0, A2P          | nie       | nie   | wiedza z `text_agent_knowledge` (RAG)                                                     |
| `get_process_overview`     | A2P, A4, A4T     | nie       | nie   | pewny opis procesu + lista „nigdy nie mów”                                                |

### Warstwy zabezpieczeń (`src/lib/agent-tools/`)

1. **Transport** — sekret porównywany w czasie stałym; zapisy i dane podmiotu
   tylko z nagłówkiem (nie `?token=`).
2. **Uprawnienia agenta** — każde narzędzie ma listę agentów; nieznany agent
   albo spoza listy = odmowa.
3. **Sesja jako źródło prawdy** (`agent_tool_sessions`) — identyfikatory
   z body/args to twierdzenia; zapytania zawęża serwer do podmiotu sesji.
   `identity_verified` podnosi wyłącznie `verify_identity` po sprawdzeniu dowodu
   w kodzie i zastępuje wtedy **cały** podmiot sesji (nic nie zostaje
   z kandydata). Klucz sesji nie jest wyprowadzany z telefonu ani e-maila.
4. **Model zaufania do kontaktu** — „kontakt z kanału” to tylko caller-id
   (`system__caller_id`) albo nadawca z podpisanego klucza wątku. Numer czy
   e-mail podany w rozmowie (`args`) nigdy nie wskazuje podmiotu, nie otwiera
   cudzego leada i nie jest celem SMS-a z kodem.
5. **Siła dowodu** — akta sprawy i konto inwestora: imię i nazwisko RAZEM
   z numerem umowy (firma: dodatkowo kontakt z kanału zgodny z aktami) albo kod
   SMS na numer z akt. Kontakt z kanału + nazwisko (co najmniej dwa człony)
   otwiera tylko dane leada / klienta. Nieudane dowody liczone także per
   podmiot (5 na dobę), więc nowa rozmowa nie zeruje zgadywania.
6. **Ważność** — potwierdzenie wygasa: rozmowa 2 h, wątek tekstowy 12 h.
7. **Allow-lista odczytu** (`safe-read.server.ts`) — tylko zadeklarowane tabele,
   tylko dozwolone kolumny, obowiązkowe zawężenie wiersza, limity wierszy.
   Kolumny wrażliwe (PESEL, NIP, rachunki, dowody, adresy, ocena wewnętrzna
   wniosku) nie są wymienione, więc nie istnieją dla agenta. Każdy zakres
   wymaga potwierdzonej tożsamości zgodnego rodzaju (sprawa → pożyczkobiorca,
   konto → inwestor). Bez wolnych tekstów zespołu (`wind_events.tresc`).
8. **Redakcja na wyjściu** — każdy wynik przechodzi `redactDeep`: klucze wrażliwe
   usunięte, PESEL / NIP / dowód (z sumami kontrolnymi), rachunki i karty
   maskowane nawet pod niewinnym kluczem; rachunek do spłaty z umowy
   przepuszczany tylko pod własnym kluczem (do dyktowania).
9. **Limity** — per rozmowa i narzędzie (np. weryfikacja 5/10 min, kod SMS 2/30 min).
10. **Audyt** — każda decyzja (także odmowa) w `agent_tool_calls`; odmowy także
   w `automation_events` (`agent_tool_denied`), bez cytatów z rozmowy.

Ścieżka legacy (`fy_*`, A1): lead rozmowy tylko z `lead_id` zmiennej albo
caller-id; numer / e-mail podany w rozmowie zakłada co najwyżej NOWEGO leada
(„możliwy duplikat”), nigdy nie odczytuje ani nie nadpisuje cudzego.

### Adaptacja do zmian w systemie i bazie

- `describe_data` liczy w locie przecięcie allow-listy z żywym schematem
  (PostgREST): usunięta kolumna znika z opisu i zapytań zamiast wywracać rozmowę.
- Ceny (`get_pricing`) czyta z `access_products`, status wniosku — ze słownika
  `loan-status`, zadłużenie — tym samym silnikiem co karta sprawy
  (`windDebtSnapshot`). Zmiana w systemie nie wymaga zmiany promptu.
- Synchronizacja floty jest idempotentna (porównanie odcisków konfiguracji).

## Windykacja na danych konkretnej umowy

Telefon wychodzący (z panelu) dostaje zmienne sprawy z góry. Na wspólnej linii
rozmówca dzwoni lub pisze sam, więc agent: `verify_identity` (imię i nazwisko +
numer umowy, a bez numeru — `send_verification_code` i kod) → `get_collection_case`
(umowa, harmonogram, wpłaty, opłaty z tabeli tej umowy, zabezpieczenia,
historia i pisma) → rozmowa według drabinki → `record_payment_promise`.
Zapis trafia do `wind_events` z `metadata.conversation_id` — w tej samej
konwencji, z której korzysta webhook po rozmowie i kolejny telefon
(`poprzednia_deklaracja`).

## Bezpiecznik zdrowia i życia

Wszystkie prompty floty: przy wzmiance o myślach samobójczych albo zagrożeniu
życia sprawa schodzi na bok i agent podaje 800 70 2222 (Centrum Wsparcia,
całodobowo), 116 123 i 112. `bot-contact-guard` przepuszcza te numery.

## Wdrożenie — kroki ręczne

1. Migracje `0034_agenci_narzedzia_sesje` (sesje, audyt, kody SMS, licznik
   nieudanych dowodów), `0035_agent_fleet` (drizzle → produkcja).
2. Deploy aplikacji — nowe narzędzia odpowiadają dopiero po wdrożeniu kodu
   (wcześniej endpoint zwraca „Nieznane narzędzie”).
3. `voicebot_settings.agent_fleet.agents` — identyfikatory agentów floty
   (lista w raporcie wdrożenia).
4. Telefon: przypisać numer +48 732 059 898 do `recepcja_glos` w ElevenLabs,
   gdy zespół zdecyduje o przełączeniu linii (dziś: „Agent Ania - odbiera”).
5. Tekst: `agent_fleet.text_entry = "recepcja"`, gdy zespół zdecyduje.
6. Post-call webhook workspace wskazuje dziś stary adres Lovable — sprawdzić,
   czy wyniki rozmów docierają do `app.financeyou.pl`.

## Testy

- Jednostkowe: `src/lib/agent-tools/*.test.ts`, `src/lib/agent-fleet-*.test.ts`.
- Konwersacyjne (ElevenLabs, symulacje z atrapami narzędzi):
  `docs/agents/scenariusze-testowe.md` i raport wyników.
