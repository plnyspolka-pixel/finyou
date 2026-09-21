# Konektor MCP — Finance You w Claude.ai, ChatGPT i Claude Code

Aplikacja wystawia własny serwer MCP (Model Context Protocol) pod
`https://financeyou.pl/mcp`. Po dodaniu go jako konektora w Claude.ai, ChatGPT
albo Claude Code agent w czacie widzi leady, wnioski, oferty, korespondencję
(e-mail, Messenger, czat, SMS) i statystyki — logując się **własnym kontem
Finance You**. W torze między czatem a danymi jest wyłącznie financeyou.pl i
baza; Lovable dostarcza tylko bibliotekę (`@lovable.dev/mcp-js`), która
obsługuje protokół.

Uzupełnieniem jest **digest „co nowego"**: cron co 30 minut zbiera nowe
zdarzenia i — tylko gdy coś się wydarzyło — wysyła push oraz e-mail do zespołu.
To samo źródło danych ma narzędzie `get_updates_since`, więc w czacie można
zapytać „co nowego od 10:00?" i dostać ten sam raport na żądanie.

## Co jest w repo

| Element                                     | Plik                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Definicja serwera MCP (lista narzędzi)      | `src/lib/mcp/index.ts`                                                |
| Narzędzia (jedno na plik)                   | `src/lib/mcp/tools/*.ts`                                              |
| Helpery: klient z tokenem użytkownika, role | `src/lib/mcp/_helpers.ts`                                             |
| Trasy protokołu (generowane przez plugin)   | `src/routes/[.mcp]/*`, `src/routes/[.well-known]/*`                   |
| Strona zgody OAuth                          | `src/routes/[.]lovable.oauth.consent.tsx` (`/.lovable/oauth/consent`) |
| Manifest narzędzi (generowany)              | `.lovable/mcp/manifest.json`                                          |
| Raport „co nowego" (wspólny rdzeń)          | `src/lib/activity-digest.server.ts`                                   |
| Bieg digestu: okno, wysyłka, zapis          | `src/lib/activity-digest-run.server.ts`                               |
| Tick crona                                  | `src/routes/api/public/hooks/activity-digest-tick.ts`                 |
| Migracja: tabela biegów + cron              | `supabase/migrations/20260921150000_activity_digest.sql`              |
| Skrypt weryfikacji produkcji                | `scripts/check-mcp.ts`                                                |
| Testy                                       | `src/lib/activity-digest.test.ts`                                     |

Uwierzytelnienie: OAuth 2.1 z serwerem autoryzacji **Auth bazy** (issuer
`https://<projekt>.supabase.co/auth/v1`). Klient (Claude.ai / ChatGPT) rejestruje
się dynamicznie, użytkownik loguje się na stronie zgody, a każde wywołanie
narzędzia niesie token użytkownika — zapytania idą przez RLS, więc pośrednik
widzi swoje leady, a administrator wszystko. Narzędzia zespołowe dodatkowo
sprawdzają rolę `administrator` / `operator` (`isAdmin` w `_helpers.ts`).

## Podłączenie konektora

Adres serwera wszędzie ten sam: **`https://financeyou.pl/mcp`**. Logowanie
kontem administratora Finance You. Ścieżki w ustawieniach aplikacji zmieniają
się z czasem — szukaj „Connectors / Konektory".

**Claude.ai (web, desktop, aplikacja mobilna)** — plan Pro, Max, Team lub
Enterprise. Ustawienia → Konektory → „Dodaj własny konektor" → nazwa
„Finance You", adres jak wyżej → „Połącz" → logowanie i zgoda. W czacie włącz
konektor w menu „+" / narzędzia. Na planach Team/Enterprise konektor dodaje
administrator organizacji.

**Claude Code (terminal / web)** — `claude mcp add --transport http finance-you
https://financeyou.pl/mcp`, potem `/mcp` i logowanie. Na claude.ai/code konektor
dodany w Claude.ai jest widoczny od razu.

**ChatGPT** — plan Plus, Pro, Business lub Enterprise. Ustawienia → Konektory →
Zaawansowane → włącz „Tryb dewelopera" → „Utwórz" → nazwa, adres, autoryzacja
OAuth. Konektor włącza się w rozmowie w menu narzędzi (Developer mode).
ChatGPT może wołać także narzędzia zapisujące (`create_lead`,
`update_lead_status`, `log_lead_communication`, `send_chat_message`) — pyta o
potwierdzenie przed każdym zapisem.

Po dodaniu warto zacząć od: „Pokaż mój profil Finance You" (`get_my_profile`) —
potwierdza, że logowanie i role działają.

## Narzędzia zespołowe (administrator / operator)

| Narzędzie            | Co daje                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_updates_since`  | Raport „co nowego" w oknie `since`–`until`: nowe leady, wnioski, wiadomości przychodzące (wszystkie kanały), oferty inwestorów, odpowiedzi instytucji, opłacone dostępy. Liczniki pełne, listy do `limit` na sekcję, linki do panelu, `next_since` do kolejnego pytania. Bez `since` — ostatnia godzina; okno maks. 30 dni. |
| `list_inbox_threads` | Skrzynka: wątki z klientami i inwestorami, jeden wątek = jedna osoba (wszystkie kanały). Filtry: kanał, fraza, `only_awaiting_reply`, dni wstecz.                                                                                                                                                                           |
| `read_inbox_thread`  | Cała korespondencja z jedną osobą chronologicznie + dane leada.                                                                                                                                                                                                                                                             |

Wszystkie trzy są **tylko do odczytu** i korzystają z tej samej logiki, co
asystent panelu (`comms-agent.server.ts`) i digest. Wysyłkę maili/Messengera
przez konektor celowo pominięto — odpowiedzi wysyła się z panelu albo przez
asystenta panelu, który pokazuje treść przed wysłaniem.

Przykładowe pytania w czacie:

- „Co nowego na Finance You od 9:00?" → `get_updates_since`
- „Kto czeka na odpowiedź w skrzynce?" → `list_inbox_threads` z `only_awaiting_reply`
- „Pokaż całą rozmowę z Janem Kowalskim i zaproponuj odpowiedź" → `search_leads` + `read_inbox_thread`
- „Ile wniosków wpadło w tym tygodniu i z jakich źródeł?" → `get_updates_since` z `since` sprzed 7 dni

## Digest „co nowego" co 30 minut

Cron `activity-digest-tick` (`*/30 * * * *`) woła
`POST /api/public/hooks/activity-digest-tick`. Bieg:

1. Okno = od `until` ostatniego biegu (`activity_digest_runs`) do teraz;
   pierwszy bieg bierze ostatnie 30 min; po dłuższej przerwie cofa się
   maksymalnie 24 h.
2. Zbiera zdarzenia (jak `get_updates_since`).
3. Gdy nic nie ma — zapisuje pusty bieg (okno się przesuwa) i **nic nie wysyła**.
4. Gdy coś jest — push Web Push do operatorów i administratorów (jedno
   powiadomienie „Co nowego: 2 nowe leady, 3 wiadomości…", link do `/admin`)
   oraz e-mail z pełną listą i linkami do administratorów.
5. Zapisuje bieg: okno, liczniki, ile pushy i maili poszło, błędy.

Cisza nocna 22:00–7:00 (Europe/Warsaw): bieg jest pomijany, okno się nie
przesuwa, więc o 7:00 przychodzi jeden zbiorczy raport z nocy.

Konfiguracja (zmienne środowiska aplikacji, wszystkie opcjonalne):

| Zmienna                       | Domyślnie    | Znaczenie                                                                          |
| ----------------------------- | ------------ | ---------------------------------------------------------------------------------- |
| `ACTIVITY_DIGEST_CHANNELS`    | `push,email` | Kanały wysyłki; `push`, `email` albo `off`                                         |
| `ACTIVITY_DIGEST_EMAILS`      | —            | Adresaci maila po przecinku; bez tego — wszyscy administratorzy (`profiles.email`) |
| `ACTIVITY_DIGEST_QUIET_HOURS` | `22-7`       | Cisza nocna `HH-HH` w czasie warszawskim; `off` = bez ciszy                        |

Push wymaga skonfigurowanych kluczy VAPID (patrz
`docs/powiadomienia-push-operatora.md`) i włączonych powiadomień u odbiorcy;
bez nich push jest cicho pomijany, e-mail idzie normalnie. E-mail korzysta z
istniejącej wysyłki Resend (`LOVABLE_API_KEY` + `RESEND_API_KEY`).

Ręczne uruchomienie (omija ciszę nocną tylko z prywatnym `CRON_SECRET`):

```
curl -X POST "https://financeyou.pl/api/public/hooks/activity-digest-tick?force=1" \
  -H "x-cron-secret: $CRON_SECRET"
```

Historia biegów: tabela `activity_digest_runs` (administrator/operator mają
odczyt przez RLS), np. „Pokaż ostatnie biegi digestu" przez `query_database`
w asystencie panelu.

## Raport cykliczny bezpośrednio w czacie

Czat w Claude.ai ani ChatGPT sam nie odpytuje serwera — odpowiada, gdy piszesz.
Cykliczne pytanie o nowości z odpowiedzią w czacie daje **Routine w Claude
Code** (claude.ai/code → Routines / „Zaplanuj"): nowa sesja co N minut z
promptem i podpiętym konektorem. Warunki: konektor „Finance You" dodany w
Claude.ai (patrz wyżej); minimalny interwał to zwykle godzina.

Prompt do Routine (nowa sesja przy każdym uruchomieniu):

```
Użyj konektora Finance You. Wywołaj get_updates_since bez parametrów
(ostatnia godzina). Jeśli total = 0, zakończ bez raportu. W przeciwnym razie
napisz krótki raport po polsku: liczniki, potem lista pozycji z linkami
do panelu, na końcu „Do zrobienia" — wątki, które czekają na odpowiedź
(list_inbox_threads z only_awaiting_reply=true). Wyślij mi go jako
powiadomienie push.
```

Zadania cykliczne ChatGPT (Tasks) nie wołają własnych konektorów — tam raport
na żądanie działa, cykliczny nie. Dlatego cykliczność „co 30 min" realizuje
digest po stronie serwera (push + e-mail), a czat służy do obsługi: „pokaż
wątek, zaproponuj odpowiedź, zmień status".

## Weryfikacja produkcji (krok 1 wdrożenia)

Z dowolnego komputera z dostępem do internetu:

```
bun run scripts/check-mcp.ts
```

Skrypt sprawdza bez logowania dokładnie to, co robi Claude.ai / ChatGPT przy
dodawaniu konektora i przy każdym ❌ podpowiada, co włączyć:

1. `GET /.well-known/oauth-protected-resource` → JSON z `authorization_servers`
   (jeśli HTML/404 — na produkcji nie ma wersji z MCP; opublikuj aplikację).
2. Metadane serwera autoryzacji bazy → muszą zawierać `authorization_endpoint`,
   `token_endpoint` i **`registration_endpoint`** (dynamiczna rejestracja
   klientów). Jeśli brak: w panelu bazy Authentication → OAuth Server włącz
   serwer OAuth, ustaw adres zgody na
   `https://financeyou.pl/.lovable/oauth/consent` i włącz dynamiczną
   rejestrację klientów.
3. `POST /mcp` bez tokenu → `401` z nagłówkiem `WWW-Authenticate:
Bearer resource_metadata="…"`.
4. `/.lovable/oauth/consent` otwiera się (przekierowanie do logowania jest OK).

Ten sam skrypt przyjmuje inny adres jako argument (np. podgląd Lovable).

## Wdrożenie

1. Merge → publikacja aplikacji (trasy MCP i tick są w kodzie).
2. Migracja `20260921150000_activity_digest.sql` (tabela `activity_digest_runs`
   - cron `activity-digest-tick`). Cron woła adres bazowy projektu tak samo jak
     pozostałe ticki.
3. Opcjonalnie zmienne `ACTIVITY_DIGEST_*` (patrz wyżej). Nowych sekretów nie
   ma — tick używa `CRON_SECRET` / klucza publicznego jak reszta ticków.
4. `bun run scripts/check-mcp.ts` → wszystkie ✅.
5. Dodać konektor w Claude.ai / ChatGPT i zadać „Pokaż mój profil Finance You".
6. Po dodaniu konektora — opcjonalnie Routine w Claude Code (sekcja wyżej).

Po zmianie listy narzędzi w `src/lib/mcp/index.ts` manifest
`.lovable/mcp/manifest.json` odświeża plugin Vite przy buildzie
(`bun run build`); trasy `[.mcp]` i `[.well-known]` też są generowane — nie
edytować ręcznie.

## Dane osobowe i bezpieczeństwo

- Przez konektor do dostawcy modelu (Anthropic / OpenAI) trafiają dane
  klientów: imiona, telefony, treści rozmów, kwoty, w skrajnym razie numery
  KW i PESEL z załączników. Na planach Team/Enterprise obu dostawców jest
  umowa powierzenia (DPA) i dane nie służą do treningu; na planach
  indywidualnych trzeba wyłączyć uczenie na rozmowach w ustawieniach
  prywatności. Traktować jak każde inne powierzenie przetwarzania (rejestr,
  informacja w polityce prywatności).
- Konektor działa z uprawnieniami zalogowanej osoby (RLS + role). Konto
  administratora w czacie = pełny wgląd; do testów można użyć konta operatora.
- Narzędzia zespołowe są tylko do odczytu. Narzędzia zapisujące (status,
  notatka, nowy lead, wiadomość w czacie) istnieją od wcześniej i wymagają
  logowania; klienci MCP proszą o potwierdzenie przed zapisem.
- Tick digestu nie przyjmuje danych z zewnątrz — tylko sekret crona; `force`
  działa wyłącznie z prywatnym `CRON_SECRET`.
