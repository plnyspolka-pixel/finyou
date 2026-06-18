## Cel

Dodać w panelu admina sekcję, w której można:
- włączyć / wyłączyć autopilota maili przypominających,
- ustawić własne wyrażenie cron (kiedy i jak często wysyłać),
- zobaczyć status: ostatni tick, ostatnia wysyłka, ile poszło dzisiaj.

Bez ręcznego grzebania w `cron.job` w bazie.

## Pomysł architektoniczny

Jeden, na stałe zarejestrowany cron w bazie strzela **co minutę** w jeden endpoint (`/api/public/hooks/loan-reminder-emails-tick`). Endpoint czyta nową tabelę `reminder_email_schedule` i sam decyduje, czy wysłać batch — porównując bieżący czas (Europe/Warsaw) z wyrażeniem cron zapisanym w bazie. Dzięki temu zmiana harmonogramu = jeden `UPDATE` z UI, bez `cron.schedule()`.

## Co powstanie

### 1. Tabela `reminder_email_schedule` (1 wiersz konfiguracji)
- `enabled` — włącznik master
- `cron_expression` — np. `0 8,20 * * 1-6` (8:00 i 20:00, pn–sob, czas Warszawa)
- `timezone` — `Europe/Warsaw`
- `last_tick_at`, `last_sent_at`, `last_result` (jsonb: ile wysłano, ile pominięto)
- RLS: SELECT/UPDATE tylko dla `administrator`.

### 2. Endpoint `/api/public/hooks/loan-reminder-emails-tick`
- Czyta wiersz konfiguracji.
- Jeśli `enabled = false` → zwraca `skipped: disabled`.
- Jeśli bieżąca minuta (Warszawa) **nie pasuje** do `cron_expression` → `skipped: not_due`.
- W przeciwnym razie wywołuje istniejące `runDailyReminderEmailsBatch()` i zapisuje wynik do `last_*`.
- Zabezpieczony: `pg_try_advisory_lock` po stronie SQL, żeby dwa równoległe ticki nie wystartowały batcha.

### 3. Jeden stały `pg_cron`
- Schedule `* * * * *` (co minutę), POST na endpoint powyżej.
- Po wdrożeniu wyczyść ewentualne stare wpisy cron `loan-reminder-emails` (zrobię SQL `cron.unschedule(...)` z poziomu migracji).

### 4. Panel admina (rozszerzenie `/admin/przypomnienia`)
- Karta "Autopilot maili":
  - przełącznik **Włącz / Wyłącz**,
  - pole tekstowe **Wyrażenie cron** + walidacja (parser `cron-parser`),
  - 3 presety jednym klikiem: `2× dziennie (8 i 20)`, `1× rano (9:00)`, `Co godzinę (test)`,
  - podgląd: "Następna wysyłka: za 14 min (jutro 08:00)",
  - statystyki: ostatni tick, ostatnia wysyłka, licznik wysłanych dzisiaj.
- Server fn `getReminderSchedule` / `updateReminderSchedule` z `requireSupabaseAuth` + `has_role('administrator')`.

## Detale techniczne

- Parser cron: `cron-parser` (npm, pure JS, działa na Workerze).
- Match minuty: porównujemy `parseExpression(cron, { tz: 'Europe/Warsaw' }).prev()` ≥ `last_tick_at`; jeśli tak — należy się wysyłka. To odporne na to, że cron co minutę nie zawsze trafia idealnie w `:00`.
- Zachowane: unique constraint `(loan_application_id, variant_id)` z poprzedniego kroku — pełna gwarancja braku duplikatów nawet przy złej konfiguracji cron.
- Limit 2/dzień, faza 1/2, godzina preferowana użytkownika — działa dalej jak dziś (logika w `runDailyReminderEmailsBatch` bez zmian).
- Sekret: endpoint pod `/api/public/*` (bez auth na publishedzie), `apikey: <ANON_KEY>` weryfikowany w handlerze.

## Pliki

Nowe:
- `supabase/migrations/<ts>_reminder_email_schedule.sql` — tabela + RLS + GRANT + seed (1 wiersz, `enabled=false`).
- `src/routes/api/public/hooks/loan-reminder-emails-tick.ts` — nowy endpoint.
- `src/lib/reminder-schedule.functions.ts` — `getReminderSchedule`, `updateReminderSchedule`.
- `src/components/admin/ReminderScheduleCard.tsx` — UI panelu.

Zmienione:
- `src/routes/admin.przypomnienia.tsx` — wstawienie nowej karty.
- Pojedyncza wstawka pg_cron przez `supabase--insert` (co minutę → tick endpoint), z `cron.unschedule()` poprzednich wpisów.

Stare:
- Dotychczasowy endpoint `/api/public/hooks/loan-reminder-emails` zostawiam (przyda się do ręcznego "wyślij teraz" w panelu).

## Pytanie

Potwierdź dwie rzeczy zanim wdrożę:
1. Czy obecny harmonogram (8:00 i 20:00, pn–sob) ma zostać jako **domyślny** po włączeniu, ale autopilot startuje **wyłączony**? (bezpieczniejsze — sam włączysz w UI gdy będziesz gotowy).
2. Czy mogę od razu **usunąć z `cron.job` wszystkie stare wpisy** strzelające w `loan-reminder-emails` i zostawić tylko nowy co-minutowy tick?