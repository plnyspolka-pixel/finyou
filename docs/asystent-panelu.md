# Asystent panelu — tekstowy bot administratora

Czat, z którego administrator prowadzi bieżącą robotę bez klikania po
zakładkach: pyta o dane, liczy, poprawia rekordy, zagląda w kod i dostaje link
do właściwej strony panelu. Model: Claude (Anthropic), z narzędziami po stronie
serwera.

## Gdzie jest

| Miejsce                                                     | Co widać                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Pulpit `/admin`                                             | pełna karta „Asystent panelu” (sekcja nad licznikami lejka)          |
| Każda inna podstrona `/admin/*`                             | pływający przycisk „Asystent” w prawym dolnym rogu (można powiększyć) |
| Ustawienia (zębatka w nagłówku czatu)                       | model, uprawnienia narzędzi, prompt systemowy, log wywołań narzędzi   |

Rozmowa jest **wspólna dla wszystkich instancji** — id aktywnej konwersacji
trzymamy w cache React Query (`["ai-admin-current-conv"]`) i w `localStorage`
(`fy_admin_bot_conv`), więc wątek zaczęty na pulpicie kontynuujesz w launcherze
na innej stronie. Historia rozmów: ikona zegara w nagłówku czatu.

Dostęp: tylko rola `administrator` — sprawdzane w każdej server function
(`assertAdmin`) oraz w RPC bazodanowych (`exec_admin_*`). Operator ani
księgowość nie widzą asystenta.

## Architektura

| Element                                        | Plik                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| Komponent czatu + ustawienia + zakładka pamięci | `src/components/admin/admin-bot.tsx`                   |
| Pływający launcher (layout `/admin`)           | `src/components/admin/admin-bot-launcher.tsx`           |
| Server functions (czat, historia, ustawienia)  | `src/lib/ai-admin.functions.ts`                         |
| Pętla agentowa, narzędzia, wywołanie Anthropic | `src/lib/ai-admin.server.ts`                            |
| Lista dopuszczonych modeli                     | `src/lib/ai-admin.models.ts`                            |
| Karta na pulpicie                              | `src/routes/admin.index.tsx`                             |
| Montaż launchera                               | `src/routes/admin.tsx` (slot `footer` w `PanelShell`)   |

Tabele (migracje `supabase/migrations/20260602160132_*.sql` oraz
`20260809120000_ai_admin_memory.sql`): `ai_admin_settings` (singleton),
`ai_admin_conversations` (+ `summary`, `summarized_message_count`),
`ai_admin_messages` (+ indeks pełnotekstowy na treści), `ai_admin_audit_log`,
`ai_admin_memory`.

Wymagane sekrety: `ANTHROPIC_API_KEY` (czat), `ELEVENLABS_API_KEY` (dyktowanie
głosem — opcjonalne).

## Narzędzia bota

| Narzędzie              | Wymaga uprawnienia | Co robi                                                        |
| ---------------------- | ------------------ | -------------------------------------------------------------- |
| `remember`             | pamięć             | wpis do pamięci długotrwałej (istniejący tytuł = aktualizacja)  |
| `recall_memory`        | pamięć             | szukanie w pamięci poza zestawem wstrzykniętym do promptu       |
| `forget`               | pamięć             | archiwizacja wpisu (po id lub tytule)                          |
| `search_conversations` | —                  | szukanie po treści wszystkich dotychczasowych rozmów            |
| `query_database`       | odczyt bazy        | SELECT/WITH, max 200 wierszy                                   |
| `list_database_tables` | odczyt bazy        | tabele schemy `public` z liczbą kolumn                         |
| `describe_table`       | odczyt bazy        | kolumny (typ, NULL, default) + polityki RLS tabeli             |
| `mutate_database`      | zapis bazy         | INSERT/UPDATE/DELETE                                           |
| `execute_sql`          | odczyt lub zapis   | dowolne SQL (też DDL); bez operacji na rolach i ustawieniach   |
| `list_project_files`   | odczyt plików      | lista ścieżek (max 300)                                        |
| `read_project_file`    | odczyt plików      | treść pliku tekstowego (max 1 MB)                              |
| `search_project_files` | odczyt plików      | grep po repo: ścieżka + numer i treść linii (max 120 trafień)  |
| `write_project_file`   | zapis plików       | utworzenie/nadpisanie pliku (max 500 KB)                       |
| `delete_project_file`  | zapis plików       | usunięcie pliku                                                |
| `list_admin_pages`     | —                  | mapa panelu (`src/lib/admin-nav.ts`) — ścieżki, sekcje, opisy   |

Pliki z sekretami (`.env*`), `.git/` i `node_modules/` są zablokowane na
poziomie `safeFilePath`. Każde wywołanie narzędzia ląduje w
`ai_admin_audit_log` (podgląd: zakładka „Log narzędzi” w ustawieniach).

Uprawnienia (odczyt/zapis bazy, odczyt/zapis plików) przełącza się w
ustawieniach asystenta — wyłączenie działa natychmiast, bo pętla czyta je z
`ai_admin_settings` przy każdej turze.

## Pamięć długotrwała (baza wiedzy z rozmów)

Rozmowy były zapisywane od początku, ale każdy nowy wątek startował od zera.
Teraz z rozmów destylowana jest **trwała wiedza**, którą bot dostaje w każdej
kolejnej rozmowie.

**Co jest zapisywane** — tabela `ai_admin_memory`, pięć rodzajów wpisów:

| Rodzaj        | Co trzyma                                     | Przykład                                              |
| ------------- | --------------------------------------------- | ----------------------------------------------------- |
| `preferencja` | jak asystent ma pracować                      | „Raporty zawsze tabelą, bez wstępu"                   |
| `proces`      | jak w firmie przebiega czynność                | „Lead z kalkulatora: telefon w 15 min, potem SMS"     |
| `fakt`        | trwały fakt o firmie / danych                  | „Status `szukamy_inwestora` = wniosek u instytucji"   |
| `slownik`     | nazwa własna, skrót                            | „«karta» = karta oferty, nie płatnicza"               |
| `projekt`     | kontekst bieżącej roboty                       | „Trwa migracja windykacji na nowy moduł"              |

**Dwa sposoby dopisywania:**

1. **Bot sam w trakcie rozmowy** — narzędzie `remember`, gdy ustalasz sposób
   pracy, tłumaczysz proces albo mówisz „zapamiętaj". Potwierdza to w odpowiedzi.
2. **Destylacja po każdej turze** — `distillConversation` (model
   `claude-haiku-4-5`, temperatura 0) czyta nowe wiadomości wątku i wyciąga z
   nich trwałe wnioski + streszczenie rozmowy. Klient woła ją **po** otrzymaniu
   odpowiedzi i nie czeka na wynik, więc czat nie zwalnia; błąd destylacji nigdy
   nie wygląda jak błąd czatu.

**Jak wraca do rozmowy:** przy każdej turze `buildMemoryBlock` wstrzykuje do
promptu systemowego blok „PAMIĘĆ DŁUGOTRWAŁA" — do `memory_limit` wpisów
(domyślnie 40), sortowanych po priorytecie, potem po dacie zmiany. Do tego
dochodzi streszczenie bieżącego wątku (`ai_admin_conversations.summary`).
Licznik `uses` / `last_used_at` pokazuje, które wpisy naprawdę pracują.

**Higiena pamięci:**

- Jeden wpis na tytuł (unikalny indeks na `lower(title)`) — powtórka
  aktualizuje, nie duplikuje.
- Wpisy dodane ręcznie w panelu są `pinned` — destylacja ich nie nadpisuje.
- „Zapomniane" (`forget` / kosz w panelu) są archiwizowane, nie kasowane, i
  destylacja ich **nie wskrzesza** (`allowRevive: false`) — inaczej raz odrzucona
  wiedza wracałaby przy każdej rozmowie.
- Sprzeczność między pamięcią a tym, co mówisz teraz, rozstrzyga się na korzyść
  teraźniejszości — bot ma wtedy poprawić wpis.

**Panel:** zakładka „Pamięć" w ustawieniach asystenta — lista wpisów z
priorytetem i licznikiem użyć, filtr, edycja, kosz oraz ręczne dopisywanie.
W zakładce „Model i uprawnienia" jest przełącznik pamięci (wyłączenie nie kasuje
wpisów) i limit wpisów w prompcie.

## Jak działa tura

1. Wiadomość + załączniki → `sendAdminChat`.
2. Pętla agentowa (max 20 rund): Anthropic → `tool_use` → `runTool` → wynik
   wraca jako `tool_result`. Wiadomości i wyniki narzędzi zapisujemy do bazy
   **na bieżąco**, dlatego czat odpytuje historię co 2 s i pokazuje kolejne
   kroki, a nie tylko efekt końcowy.
3. Prompt systemowy = treść z `ai_admin_settings` + stały blok
   `RUNTIME_SYSTEM_SUFFIX` (`ai-admin.server.ts`): język polski, markdown,
   linki wewnętrzne w formacie `[Klienci](/admin/klienci)`, potwierdzanie
   nieodwracalnych operacji.

Linki ze ścieżką aplikacji renderują się jako nawigacja routera (bez
przeładowania) — zewnętrzne otwierają się w nowej karcie.

## Załączniki i głos

Spinacz przyjmuje pliki do 25 MB: tekstowe (wklejane do promptu), obrazy
(JPEG/PNG/GIF/WebP) i PDF (jako `document` Anthropica). Surowych danych
załączników nie trzymamy w bazie — w historii zostaje tylko nota z nazwą,
typem i rozmiarem. Mikrofon nagrywa głosówkę i przepisuje ją na tekst
(ElevenLabs `scribe_v2`, `pol`) do pola wiadomości — wysyłkę zawsze
zatwierdza administrator.
