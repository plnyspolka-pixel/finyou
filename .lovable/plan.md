# Przywrócenie EasyMKW i trwałej synchronizacji z GitHubem

## Zakres
- Przywrócić wyłącznie obsługę produkcyjnego EasyMKW i korektę konfiguracji CMD z utraconych zmian `9345206d` i `aa417377`.
- Zachować w całości obecny silnik umów z PR #176 oraz wszystkie późniejsze, niezwiązane zmiany.
- Nie zmieniać modułu MCP ani jego manifestu.

## Wykonanie
1. Dodać ponownie klienta EasyMKW, mapowanie odpowiedzi, zapis treści KW i bezpieczny odbiór gotowego zamówienia.
2. Włączyć EasyMKW jako główną ścieżkę pobierania KW, pozostawiając dotychczasowy CMD jako ścieżkę zapasową.
3. Przywrócić testy starej ścieżki CMD bez ingerencji w aktualny silnik umów.
4. Zachować istniejące typy bazy; wymagane kolumny EasyMKW i trzy funkcje są już zadeklarowane, więc nie będą nadpisywane ani usuwane.
5. Uruchomić testy związane z KW i sprawdzić wynik kompilacji generowany przez podgląd.

## GitHub i publikacja
- Publiczny `main` repozytorium nadal wskazuje `7dad7d27`; lokalne repo ma tylko wewnętrzny adres Lovable, nie adres GitHuba.
- Po przywróceniu sprawdzić, czy synchronizacja utworzyła commit na `plnyspolka-pixel/finyou:main`.
- Jeśli zapis nadal jest zablokowany, zatrzymać się przed publikacją i podać dokładne kroki ponownego nadania aplikacji Lovable dostępu do tego repozytorium.
- Opublikować dopiero po potwierdzeniu nowego SHA na publicznym `main`.
