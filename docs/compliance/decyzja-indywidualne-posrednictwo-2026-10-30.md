# Decyzja strategiczna — Finance You: indywidualne pośrednictwo B2B
Data: 2026-10-30
Status: zatwierdzony kierunek biznesowy; **nie jest potwierdzeniem legalności ani zgodą na uruchomienie**.

## Decyzja
Rezygnujemy z automatycznej dystrybucji projektów do inwestorów w wariancie usługi indywidualnego pośrednictwa. Docelowo Finance You przyjmuje indywidualne zlecenie i rzeczywiście kojarzy strony w konkretnej sprawie. Po indywidualnym skojarzeniu aplikacja może wspierać negocjacje, kalkulator, analitykę, dokumenty, podpisy i obsługę pożyczki. Każda pożyczka: jeden inwestor i jeden pożyczkobiorca, przelewy bezpośrednie między stronami.

## Krytyczne wymagania przed uruchomieniem
1. Nie uruchamiać automatycznego przydzielania, wyszukiwania, rankingu i sekwencyjnego przesyłania projektów inwestorom w wariancie pozalicencyjnym.
2. Nie udostępniać inwestorom katalogu ofert ani automatycznie generowanych teaserów z nieprzypisanych projektów.
3. Skojarzenie stron musi być faktycznie indywidualną usługą pośrednictwa, a nie tylko ukrytym za loginem automatem; działania operatora muszą mieć ślad audytowy.
4. Oddzielić funkcjonalnie i uprawnieniami wariant pośrednictwa od ewentualnej przyszłej platformy ECSPR.
5. Przed aktywacją: pisemna analiza art. 37–38 polskiej ustawy crowdfundingowej, art. 2–3 rozporządzenia 2020/1503 i pozostałych obowiązków (m.in. AML, RODO, pośrednictwo).
6. Nie zakładać, że abonament, NDA, limit członków lub model 1:1 same wyłączają nadzór.

## Miejsca w kodzie wymagające zmian i testów
- `src/lib/investor-agreements/order-cycle.functions.ts`: `getMyOrderCycle` wywołuje `autoMatchInvestorOrders` podczas wejścia inwestora; wyłączyć dla wariantu pośrednictwa.
- `src/lib/investor-agreements/order-cycle.server.ts`: `autoMatchInvestorOrders` tworzy dopasowanie i teaser; wymaga bramki serwerowej i testu braku nieautoryzowanego wywołania.
- `src/lib/investor-agreements/order-projects.functions.ts`: przejrzeć listowanie i dostęp do projektów; pokazywać wyłącznie już indywidualnie przypisane sprawy.
- Sprawdzić wszystkie inne ścieżki dystrybucji i funkcje `auto-distribution`, RLS oraz publiczne endpointy.

## Warunek wdrożenia
**Nie włączać wariantu pozalicencyjnego na produkcji przed pozytywną opinią prawną i testami end-to-end.** Ten dokument nie przesądza, że licencja KNF jest zbędna.
