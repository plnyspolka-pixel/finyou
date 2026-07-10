## Cel
Nowa rola i panel `/operator` — identyczny funkcjonalnie jak `/posrednik`, ale bez publicznej rejestracji. Konta zakładane wyłącznie z jednorazowego linku wygenerowanego przez administratora. Istniejący `/posrednik` (rola `operator`) zostaje dla partnerów zewnętrznych z publiczną rejestracją.

## Krok 1 — Backend: nowa rola + tabela zaproszeń
Migracja:
- Dodać wartość `operator_wewnetrzny` do enuma `app_role`.
- Nowa tabela `public.operator_invites`: `token` (uuid unique), `email` (nullable), `created_by`, `expires_at` (domyślnie `now() + 7 days`), `used_at`, `used_by_user_id`, timestamps.
- GRANT + RLS: administrator może SELECT/INSERT/UPDATE/DELETE; zaproszenie odczytywane publicznie tylko po tokenie przez SECURITY DEFINER funkcję `get_operator_invite(_token uuid)` (zwraca tylko status + email, bez wrażliwych danych).
- Funkcja `redeem_operator_invite(_token uuid)` SECURITY DEFINER: sprawdza że token istnieje, nie wygasł, nie wykorzystany, wywołujący ma sesję → wpisuje rolę `operator_wewnetrzny` do `user_roles`, znaczy invite jako użyty.
- Rozszerzyć `defaultPathForRoles` i `handle_new_user` (nie autonadaje operator_wewnetrzny — zawsze klient dopóki nie zredeemuje tokenu).

## Krok 2 — Panel `/operator`
- Nowy plik `src/routes/operator.tsx` — kopia `src/routes/posrednik.tsx`, `PanelShell` z `title="Panel operatora"`, `allow={["operator_wewnetrzny","administrator"]}`, te same grupy nav ale z linkami do `/operator/*`.
- Podstrony jako cienkie route’y re-eksportujące te same komponenty co `/posrednik/*` (leady, moje-leady, wniosek, wnioski, oferta-wewnetrzna, skrzynka, profil, wnioski.$id).
- Rola operator_wewnetrzny widzi te same dane co operator (leady bez opiekuna + własne). Zmienić RLS `loan_applications`/`leads`/`clients`/etc. tak, żeby polityki dla `operator` obejmowały też `operator_wewnetrzny` — najczystsze przez helper `is_broker_role(uid)` w funkcji SQL.

## Krok 3 — Zapraszanie
- W panelu admina nowa podstrona `src/routes/admin.operatorzy.tsx`: lista aktywnych/wykorzystanych zaproszeń + przycisk „Wygeneruj link”. Po utworzeniu wyświetla pełny URL `https://<origin>/operator/rejestracja?token=<uuid>` z przyciskiem „Kopiuj”.
- Server function `createOperatorInvite` (auth + role admin check).
- Nowy publiczny route `src/routes/operator.rejestracja.tsx`: waliduje token przez `get_operator_invite`, pokazuje formularz email+hasło (lub Google), po sign-up wywołuje `redeem_operator_invite`, przekierowuje do `/operator`.
- Rejestracja publiczna `posrednicy/rejestracja` **nie jest ruszana**.

## Krok 4 — Nawigacja i drobiazgi
- Dodać wpis „Operatorzy wewnętrzni” w sidebarze admina (grupa Konfiguracja).
- `defaultPathForRoles`: jeśli role zawiera `operator_wewnetrzny` (a nie ma admina) → `/operator`.
- Zabezpieczyć /operator i /operator/rejestracja przed dostępem bez tokenu / bez roli (redirect na `/logowanie`).

## Notatki techniczne
- Enum extension w Postgresie musi być w osobnym migration statement (nie w tej samej transakcji co użycie wartości) — split na dwie migracje lub `ALTER TYPE ... ADD VALUE` na początku.
- Wszystkie istniejące polityki RLS z warunkiem `has_role(uid,'operator')` trzeba rozszerzyć o `has_role(uid,'operator_wewnetrzny')` — zrobię przez helper funkcyjny, żeby nie przepisywać dziesiątek policies. Sprawdzę które tabele tego wymagają przed migracją.
- Zero zmian w komponentach `/posrednik` — nowe route’y reużywają dokładnie te same komponenty (import), więc utrzymanie jednego zestawu logiki.