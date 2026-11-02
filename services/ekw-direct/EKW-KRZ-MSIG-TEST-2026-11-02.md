# EKW vs KRZ vs oficjalny MSiG: test porównawczy – 2026-11-02

## Co sprawdzono

1. Metoda MSiG: odczyt publicznego endpointu przez standardowy HTTP klient `urllib`, sesja z cookie jar.
2. Metoda KRZ: diagnostyczne otwarcie urzędowej strony w Chromium/Playwright, obserwacja odpowiedzi sieciowych.
3. EKW: zamiast bezpośredniego formularza – oficjalny link `https://ekw.ms.gov.pl/eukw_ogol/KsiegiWieczyste` i redirect do `https://przegladarka-ekw.ms.gov.pl/eukw_prz/menu.do`; ponadto wejście do menu i formularza.
4. Żadnych numerów KW ani danych osobowych nie wysyłano. Brak prób obchodzenia blokad i CAPTCHA.

## Wynik empiryczny (GitHub Actions, Chromium + urllib)
Run: https://github.com/plnyspolka-pixel/finyou/actions/runs/41471933565

| Test | Status |
|---|---|
| Oficjalna strona MSiG (urllib) | 200 |
| Strona główna EKW (urllib / Chromium) | 200 |
| Oficjalny link do EKW z cookie jar (urllib) | 403 na przeglądarce |
| Menu przeglądarki EKW (urllib) | 403 |
| Kliknięcie oficjalnego przycisku EKW (Playwright) | 302 -> 302 -> 403 |
| Bezpośrednie menu przeglądarki EKW (Playwright) | 403 |
| Bezpośredni formularz EKW (Playwright) | 403 |

Przy odpowiedzi 403 z `przegladarka-ekw.ms.gov.pl` pojawiają się zasoby `/_Incapsula_Resource` (odpowiedź 200) – ślad ochrony Imperva. Formularz EKW nie pojawił się w żadnym teście.

Node `fetch` na tym runnerze zgłasza `TypeError` dla testowych URL-i przeglądarki EKW; to **nie jest** niezależny dowód HTTP 403. Dlatego wynik blokady opiera się na `urllib` i Chromium, które jawnie pokazały HTTP 403.

## Wniosek

- MSiG działa, ponieważ jego publiczna aplikacja udostępnia w praktyce pobieralny endpoint `/api/Monitor/Search`. Został wcześniej prześledzony w Playwright i zweryfikowany przez zwykły `fetch()`.
- KRZ również blokuje próby automatycznego otwarcia formularza HTTP 403. Wyszukiwanie przez indeks Google/DDG i płatne iMSiG nie zastępuje pełnego rejestru.
- **Nie stwierdzono analogicznego, dostępnego bez uwierzytelnienia endpointu EKW**, ponieważ ruch jest odrzucany przed wejściem do właściwej aplikacji. Nie wolno zgadywać endpointów ani deklarować sukcesu bez odczytu pełnej KW.
- Samo naprawienie adresu startowego nie rozwiązuje HTTP 403; przez poprawny link również jest blokada.
- Wymagana dalsza praca nad uprawnionym i stabilnym kanałem dostępu do aktualnej EKW. Po potwierdzeniu takiego kanału istniejący `kw_documents` i parsery Finance You mogą obsługiwać wynik bez płatnego pośrednika.

## Do produkcji?

**NIE.** Brak potwierdzonego odczytu jakiejkolwiek prawdziwej KW, brak porównania wzmianek, właścicieli i hipotek. Nie podmieniać źródła w Finance You i nie oznaczać niekompletnych wyników jako `ready`.

## Niezależny test z polskiego środowiska Firecrawl – 2 listopada 2026

Uruchomiono pojedynczą sesję na publicznej stronie startowej, w regionie PL (basic proxy), bez numeru KW i danych osobowych.
Kliknięto „Przeglądanie księgi wieczystej” jeden raz.

- Docelowy URL: `https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW?komunikaty=true&kontakt=true&okienkoSerwisowe=false`.
- Wynik: **Access Denied – Error 15**; formularz numeru KW nie jest renderowany.
- Serwis zabezpieczeń wyświetlił **Incident ID: 687000780244888120-346405549307270019**, czas `2026-11-02 16:00:42 UTC`; IP źródłowe 82.29.47.229; proxy 45.60.74.15 (ID 10687-100).
- To pokazuje filtr bezpieczeństwa przed rozpoczęciem operacji na KW; sam sygnał Error 15 nie identyfikuje konkretnej reguły.
- Sesja diagnostyczna została zatrzymana. Nie były podejmowane próby omijania blokad ani rozwiązywania CAPTCHA.
- Przygotowano szkic zgłoszenia do `ekw@ms.gov.pl`, niewysłany bez potwierdzenia użytkownika.
- Zautomatyzowane, ponawiane próby sieciowe GitHub Actions zostały ograniczone do ręcznego uruchamiania.

## Zmiany w adapterze po analizie

- Direct worker przechodzi przez oficjalną stronę główną i link, a nie bezpośrednio do głębokiego formularza.
- Wymagane jest pojawienie się prawdziwego formularza KW; blokada / iframe security nie są interpretowane jako „brak księgi”.
- W `kw-ekw-direct.server.ts` usunięto zwracanie dowolnego starego `fetched_at` jako świeżego wyniku: każdy nowy odczyt na żądanie wymaga ponownego capture.
- Wynik sprzed ponad 180 s nie może zostać uznany za świeży.
- Data `fetched_at` z workera opisuje zakończenie odczytu pięciu działów.
- Unit tests GitHub Actions przechodzą; wciąż brak pozytywnego prawdziwego odczytu EKW.
