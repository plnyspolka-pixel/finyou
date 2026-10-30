# Finance You — indywidualne pośrednictwo, bez automatycznej dystrybucji

Decyzja biznesowa: 30 października 2026 r. — operator ma realnie wykonywać indywidualne pośrednictwo przy konkretnych pożyczkach B2B, nie prowadzić automatycznej internetowej giełdy projektów.

## Zmiany w systemie

1. `getMyOrderCycle` nie wywołuje auto-matching; automatyczna funkcja doboru `autoMatchInvestorOrders` została usunięta.
2. `getMyOrderProjects` prezentuje tylko projekty ręcznie przypisane do zlecenia; przed przypisaniem nie pokazuje żadnej puli. Raporty, ujawnienie danych, rezerwacja i składanie propozycji są objęte tą samą bramką serwerową.
3. Inwestor nie może sam utworzyć dopasowania z nieprzypisanego projektu.
4. Ręczne dopasowanie przez administratora wymaga uzasadnienia (min. 20 znaków) i jest zapisywane w dzienniku zdarzeń, z identyfikatorem operatora.
5. Endpoint „Dobierz projekty dla mnie” jest wyłączony po stronie serwera.
6. Cron, synchronizacja oraz zatwierdzanie propozycji auto-dystrybucji do instytucji są wyłączone po stronie serwera niezależnie od zapisanych ustawień.
7. Ręczny e-mail z kartą sprawy można wysłać tylko do **jednego wskazanego inwestora**; wysyłka masowa i domyślne „wszyscy” są blokowane także w API.
8. Funkcje RPC udostępniające listę propozycji dowolnemu zalogowanemu inwestorowi są wyłączane migracją SQL, podobnie jak automatyczny przydział RPC dla osób bez uprawnień service_role.
9. Dane, archiwum transakcji, analiza nieruchomości, kalkulator, umowy i komunikacja w sprawach już indywidualnie skojarzonych pozostają dostępne.

## Zasady operacyjne (nie tylko UI)

- Zlecenie inwestora może zawierać parametry poszukiwanego finansowania. Nie stanowi automatycznej zgody na prezentowanie mu projektów z bazy.
- Operator analizuje konkretną sprawę, wybiera konkretnego inwestora i dokumentuje dlaczego właśnie on jest adresatem indywidualnego kontaktu. Dostęp do dokumentacji i negocjacji jest następstwem takiego przypisania, nie wynikiem samodzielnego wyszukiwania przez użytkownika.
- Nie prowadzimy publicznego katalogu ofert ani automatycznego przydzielania kart projektów według rankingu lub kolejki.
- Wysyłka e-mail do jednej osoby nie stanowi sama w sobie gwarancji, że działalność jest poza regulacją. W szczególności powtarzalne automatyczne kojarzenie przez operatora i rekrutacja nieograniczonej liczby inwestorów mogą zmienić kwalifikację prawną.
- Zmienione funkcje serwerowe są skuteczne dopiero po wdrożeniu aplikacji; kontrola RPC wymaga wykonania nowej migracji w środowisku docelowym.

## Otwarte ryzyka prawne — nie stanowi potwierdzenia zwolnienia z licencji

Nie przyjmujemy, że samo wyłączenie automatu wyłącza art. 2 ECSPR albo art. 38 ustawy o finansowaniu społecznościowym. Przed uruchomieniem pośrednictwa bez licencji należy uzyskać pisemną ocenę całej usługi (reklama, rekrutacja, abonament, formularz, ręczne dobieranie, opłaty, rola fundacji, umowy, rzeczywista publiczna dostępność), w tym ryzyka z art. 37 i 38. Potrzebna jest również analiza relacji z regulacjami dotyczącymi pośrednictwa kredytowego, usług płatniczych, AML i ochrony konsumentów, jeżeli w danej relacji znajdują zastosowanie.

## Lista kontrolna wdrożenia

- [ ] Test TypeScript, testy i build w CI na gałęzi.
- [ ] Wdrożenie migracji `manual_mediation_security` w bazie docelowej.
- [ ] Wdrożenie aplikacji z gałęzi po przeglądzie zmian.
- [ ] Próba uruchomienia automatycznego matchingu, auto-crona, wysyłki do wszystkich i pobrania nieprzypisanego projektu: wszystkie mają zostać odrzucone.
- [ ] Sprawdzenie archiwalnych kart/udostępnień i wstrzymanie jeszcze aktywnych automatycznych procesów poza repozytorium (np. Make/cron/agent AI).
- [ ] Aktualizacja regulaminów, treści strony i umów do rzeczywistego modelu indywidualnego pośrednictwa.
- [ ] Opinia prawna o obowiązku zezwolenia i art. 38 przed komercyjnym uruchomieniem.
