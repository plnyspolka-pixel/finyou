# Finance You — dwa odrębne kanały finansowania: ręczny Tinder 1:1 i automatyczna dystrybucja instytucjonalna

Decyzja biznesowa: 30 października 2026 r. — operator ma realnie wykonywać indywidualne pośrednictwo przy konkretnych pożyczkach B2B, nie prowadzić automatycznej internetowej giełdy projektów.

## Zmiany w systemie

1. `getMyOrderCycle` nie wywołuje auto-matching; automatyczna funkcja doboru `autoMatchInvestorOrders` została usunięta.
2. `getMyOrderProjects` prezentuje tylko projekty ręcznie przypisane do zlecenia; przed przypisaniem nie pokazuje żadnej puli. Raporty, ujawnienie danych, rezerwacja i składanie propozycji są objęte tą samą bramką serwerową.
3. Inwestor nie może sam utworzyć dopasowania z nieprzypisanego projektu.
4. Ręczne dopasowanie przez administratora wymaga uzasadnienia (min. 20 znaków) i jest zapisywane w dzienniku zdarzeń, z identyfikatorem operatora.
5. Endpoint „Dobierz projekty dla mnie” jest wyłączony po stronie serwera.
6. **Wyjątek: instytucje.** Cron automatycznie wysyła kwalifikujące się wnioski B2B (ocena lokalizacji **ściśle > 50 pkt**) do aktywnych inwestorów instytucjonalnych z e-mailem, **tylko jeżeli kwota pożyczki mieści się w indywidualnie ustawionych widełkach instytucji**. Bez ręcznego zatwierdzania; brak score lub wynik 50 nie uruchamia wysyłki.
7. Moduł instytucjonalnych ofert e-mail zachowuje możliwość wysyłki do wszystkich aktywnych instytucji albo ręcznie wybranej grupy. Nie jest to Tinder prywatnych inwestorów.
8. Funkcje RPC udostępniające listę propozycji dowolnemu zalogowanemu inwestorowi są wyłączane migracją SQL, podobnie jak automatyczny przydział RPC dla osób bez uprawnień service_role.
9. Dane, archiwum transakcji, analiza nieruchomości, kalkulator, umowy i komunikacja w sprawach już indywidualnie skojarzonych pozostają dostępne.

## Zasady operacyjne (nie tylko UI)

- W module Tindera zlecenie inwestora może zawierać parametry poszukiwanego finansowania. Nie stanowi automatycznej zgody na prezentowanie mu projektów z bazy.
- Operator analizuje konkretną sprawę, wybiera konkretnego inwestora i dokumentuje dlaczego właśnie on jest adresatem indywidualnego kontaktu. Dostęp do dokumentacji i negocjacji jest następstwem takiego przypisania, nie wynikiem samodzielnego wyszukiwania przez użytkownika.
- W module prywatnego Tindera nie prowadzimy publicznego katalogu ofert ani automatycznego przydzielania kart projektów według rankingu lub kolejki. Nie dotyczy to odrębnej dystrybucji e-mail do inwestorów instytucjonalnych.
- Ani ręczny dobór w Tinderze, ani masowa wysyłka instytucjonalna nie stanowią gwarancji działania poza nadzorem. W szczególności automatyczna dystrybucja do grupy instytucji wymaga osobnej oceny prawnej i respektowania uprawnień odbiorców.
- Zmienione funkcje serwerowe są skuteczne dopiero po wdrożeniu aplikacji; kontrola RPC wymaga wykonania nowej migracji w środowisku docelowym.

## Otwarte ryzyka prawne — nie stanowi potwierdzenia zwolnienia z licencji

Nie przyjmujemy, że samo wyłączenie automatu wyłącza art. 2 ECSPR albo art. 38 ustawy o finansowaniu społecznościowym. Przed uruchomieniem pośrednictwa bez licencji należy uzyskać pisemną ocenę całej usługi (reklama, rekrutacja, abonament, formularz, ręczne dobieranie, opłaty, rola fundacji, umowy, rzeczywista publiczna dostępność), w tym ryzyka z art. 37 i 38. Potrzebna jest również analiza relacji z regulacjami dotyczącymi pośrednictwa kredytowego, usług płatniczych, AML i ochrony konsumentów, jeżeli w danej relacji znajdują zastosowanie.

## Lista kontrolna wdrożenia

- [ ] Test TypeScript, testy i build w CI na gałęzi.
- [ ] Wdrożenie migracji `manual_mediation_security` w bazie docelowej.
- [ ] Wdrożenie aplikacji z gałęzi po przeglądzie zmian.
- [ ] Próba automatycznego matchingu w Tinderze i pobrania nieprzypisanego projektu: odrzucone. Oddzielnie: cron instytucjonalny wysyła przy score > 50 tylko do aktywnych instytucji z odpowiednimi widełkami kwotowymi, respektując deduplikację i limit spraw na przebieg.
- [ ] Sprawdzenie archiwalnych kart/udostępnień i wstrzymanie jeszcze aktywnych automatycznych procesów poza repozytorium (np. Make/cron/agent AI).
- [ ] Aktualizacja regulaminów, treści strony i umów do rzeczywistego modelu indywidualnego pośrednictwa.
- [ ] Opinia prawna o obowiązku zezwolenia i art. 38 przed komercyjnym uruchomieniem.

## Szczegóły automatu instytucjonalnego (decyzja uzupełniająca)

- Minimalny score lokalizacji: **powyżej 50**; 50, wynik niższy lub NULL nie kwalifikują.
- Odbiorcy: aktywne instytucje w bazie (`investor_type = instytucjonalny`, `is_active = true`) posiadające adres e-mail, z zachowaniem ich **własnych widełek min/max kwoty** z tabeli `investor_distribution_criteria`. Przykład: JanVest — od 100 000 zł (łącznie z 100 000 zł), Korona — do 350 000 zł (łącznie z 350 000 zł), o ile te wartości pozostają zapisane w bazie. Respektujemy także wyraźną rezygnację z automatycznych ofert, odmowę przyjmowania i aktywną pauzę.
- Konieczny cel gospodarczy pożyczki (`business_purpose_declared = true`) i dodatnia kwota. Wniosek musi pozostawać w dopuszczonym statusie procesu i nie może być usunięty.
- Nie trzeba ręcznej akceptacji ani kompletnego briefu dokumentów; po obliczeniu score automat może rozesłać nieukończoną jeszcze sprawę. Jest to świadoma decyzja operacyjna, wymagająca kontroli prawnej i jakości danych.
- Technicznie zadanie działa co 30 minut; maksymalnie trzy nowe sprawy na przebieg i ograniczenie liczby spraw/dobę według ustawień. Każdy wniosek trafia tylko do instytucji akceptujących jego kwotę; warunki kwotowe są sprawdzane w kolejce oraz ponownie bezpośrednio przed wysyłką.
- Historyczne wysyłki nie są ponawiane. Jeżeli e-mail dla danej instytucji zakończył się błędem, mechanizm może go ponowić w tej samej dystrybucji.
- Raport z wysyłki jest utrzymywany w `auto_distribution_proposals` i `offer_distributions`. Ręczny przycisk wysyłki do wszystkich instytucji pozostaje dostępny w panelu administratora.
- **Uwaga regulacyjna:** publicznie udostępniana Karta oferty, masowy charakter kontaktu i status odbiorców wymagają oceny m.in. pod kątem art. 37–38 ustawy crowdfundingowej oraz przepisów o komunikacji elektronicznej. Nie traktować tego wyjątku jako automatycznie licencyjnie bezpiecznego.
