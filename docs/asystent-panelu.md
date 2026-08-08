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
| Komponent czatu + dialog ustawień              | `src/components/admin/admin-bot.tsx`                    |
| Pływający launcher (layout `/admin`)           | `src/components/admin/admin-bot-launcher.tsx`           |
| Server functions (czat, historia, ustawienia)  | `src/lib/ai-admin.functions.ts`                         |
| Pętla agentowa, narzędzia, wywołanie Anthropic | `src/lib/ai-admin.server.ts`                            |
| Lista dopuszczonych modeli                     | `src/lib/ai-admin.models.ts`                            |
| Karta na pulpicie                              | `src/routes/admin.index.tsx`                             |
| Montaż launchera                               | `src/routes/admin.tsx` (slot `footer` w `PanelShell`)   |

Tabele (migracja `supabase/migrations/20260602160132_*.sql` + późniejsze):
`ai_admin_settings` (singleton), `ai_admin_conversations`, `ai_admin_messages`,
`ai_admin_audit_log`.

Wymagane sekrety: `ANTHROPIC_API_KEY` (czat), `ELEVENLABS_API_KEY` (dyktowanie
głosem — opcjonalne).

## Narzędzia bota

| Narzędzie              | Wymaga uprawnienia | Co robi                                                        |
| ---------------------- | ------------------ | -------------------------------------------------------------- |
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
