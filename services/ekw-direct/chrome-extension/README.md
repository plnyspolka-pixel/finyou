# Finance You — EKW w zwykłym Chrome (eksperyment)

**Cel**: przetestować odczyt bieżących działów KW w *zwykłym Chrome użytkownika* z już otwartą aktualną treścią, bez CMD, bez opłat za pobranie i bez oddzielnego headless Playwright.

## Uruchomienie na Windows

1. `cd $HOME\finyou\services\ekw-direct; git pull`
2. W Chrome otwórz `chrome://extensions/`.
3. Włącz **Tryb programisty** i **Załaduj rozpakowane**.
4. Wskaż katalog `C:\Users\plnys\finyou\services\ekw-direct\chrome-extension`.
5. Otwórz urzędowe EKW, wybierz znaną KW, wejdź w **aktualną treść księgi** (nie tylko formularz wyszukiwania).
6. Otwórz ikonę **Finance You – EKW Local Capture**, kliknij **Zapisz pięć działów do pliku JSON**.
7. Rozszerzenie przełącza zakładki i próbuje zachować każdy dział. Plik zostanie zapisany lokalnie przez Chrome.

## Ograniczenia (ważne)

- NIE jest to działający automat bezobsługowy. Użytkownik musi otworzyć daną KW; nie ma obejścia CAPTCHA, blokad HTTP 403 ani uwierzytelnienia.
- Gdy zwykłe Chrome również ma blokadę portalu, **ten wariant nie zadziała**. Nie próbuj zwiększać ruchu w odpowiedzi na blokadę.
- Selekcja tabel oparta o `#contentDzialu` i przyciski `Dział I-O / I-Sp / II / III / IV`. Portal może zmienić układ; należy skonfrontować wynik z oficjalną stroną, również **wzmianki, właścicieli, udziały, hipoteki, wierzycieli, daty**. Nie ma testu end-to-end na realnej KW.
- Każdy wynik zawiera `completeness: NOT_VERIFIED`, `manualReviewRequired: true`. Nie zapisujemy automatycznie `kw_documents.status='ready'`; nie używamy pliku do automatycznej decyzji kredytowej.
- Rozszerzenie **nie kontaktuje się z API Finance You, CMD ani innym serwerem**, poza nawigacją samej urzędowej strony przez Chrome.
- Pozyskane dane są przez czas wykonywania operacji w pamięci sesji rozszerzenia Chrome, a potem w **lokalnym** pliku JSON. Plik może zawierać dane osobowe; chroń go i usuń po wykorzystaniu zgodnie z polityką retencji.
- Wymagane są faktycznie dostępna urzędowa strona, zgodny sposób użycia, właściwa podstawa przetwarzania danych i indywidualna weryfikacja dokładności.
- Ten kod jest testowy, nie jest urzędowym odpisem ani API Ministerstwa.

## Mechanizm

Manifest V3, `chrome.scripting.executeScript` na dopuszczonym hostcie, ograniczone uprawnienia; uruchamianie zakładek po kolei z kontrolą ograniczeń; ekstrakcja wyłącznie statycznego HTML i tekstu kontenera; nie wysyła PESEL-i ani treści KW do ChatGPT, GitHub czy Apify.

## Co sprawdzić przy pierwszym działającym numerze

1. Czy po kliknięciu każdego przycisku treść rzeczywiście odpowiada właściwemu działowi.
2. Czy każda wzmianka i jej stan są czytelne.
3. Czy dział II zawiera wszystkich właścicieli i wszystkie udziały.
4. Czy dział IV zawiera każdą hipotekę, kwotę, walutę i wierzyciela.
5. Czy zadziała weryfikacja po ponownym otwarciu innej KW.
6. Czy przy blokadzie 403 nic nie zostaje oznaczone jako pobrane.

Bez tego testu nie włączamy produkcyjnej integracji.

## Dalsza architektura

Docelowy bezpłatny kanał wymaga **legalnego, stabilnego dostępu do żywej przeglądarki EKW**. Po potwierdzeniu odczytu można przygotować lokalny agent lub rozszerzenie z żądaniem z Finance You i bezpiecznym transferem do backendu. Warstwa parserów i `kw_documents` już istnieje.
