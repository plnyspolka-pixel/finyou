# Finance You — bezpłatny lokalny kolektor otwartej księgi EKW (eksperymentalny)

Cel: wyeliminować koszt dostawcy danych **tam, gdzie użytkownik ma dopuszczony dostęp do urzędowej przeglądarki**. Rozszerzenie Chrome/Edge nie wymaga CMD, EasyMKW, Apify ani odpłatnego API.

## Instalacja (Windows, Chrome / Edge)

1. Pobierz gałąź `feat/ekw-direct-browser-adapter` repo Finance You albo wykonaj `git pull`.
2. Chrome: `chrome://extensions` (Edge: `edge://extensions`), włącz **Tryb dewelopera**.
3. Wybierz **Załaduj rozpakowane**, wskaż folder `finyou/tools/ekw-browser-collector`.
4. Otwórz oficjalną przeglądarkę **bezpośrednio w zwykłej przeglądarce**, wyszukaj legalnie posiadaną KW i wybierz **aktualną treść** oraz **Dział I-O**.
5. Kliknij ikonę rozszerzenia, wpisz numer i wybierz „Zbierz pięć działów”.
6. Otrzymasz lokalny plik `FinanceYou-EKW-*.json` (dane osobowe; przechowuj bezpiecznie).

## Status i ograniczenia

- **Nie jest to produkcyjny, autonomiczny crawler.** Wymaga wcześniejszego otwarcia księgi przez użytkownika i kliknięcia rozszerzenia.
- Bez żadnych proxy, obchodzenia CAPTCHA, fałszowania identyfikacji ani automatycznego wznowienia po 403.
- Jeśli sam portal EKW odrzuca użytkownika, rozszerzenie **nie uzyska treści** i nie jest zamiennikiem dozwolonego dostępu.
- Pięć działów jest zbieranych kolejno z `#contentDzialu`; parser wymaga potwierdzenia nagłówka każdego działu. Aktualny układ HTML ministerstwa może wymagać dostosowania selektorów.
- Jeżeli brakuje nawet jednego działu, **nie powstanie plik wyjściowy**.
- Nie łączy się z Finance You i nie wysyła danych do żadnego endpointu. Dodatkowy importer serwerowy i audyt porównawczy muszą być wdrożone osobno.
- Samo zebranie pięciu działów nie dowodzi kompletnego odczytu wzmianek ani zgodności z aktualną treścią urzędową. **Nie używać w automatycznej decyzji pożyczkowej bez przetestowanego porównania.**
- Nie działa jako monitoring automatyczny co godzinę/dzień ani dla masowych odczytów.

## Testy

```sh
node --test tools/ekw-browser-collector/core.test.mjs
node --check tools/ekw-browser-collector/popup.js
```

Dane z bieżącej karty EKW nie są udostępniane aplikacji automatycznie. Plik JSON jest materiałem do porównania i późniejszej bezpiecznej integracji.
