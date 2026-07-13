# ARCHITECTURE.md — Finance You

> Skopiuj to do roota repo i **wypełnij**. Bez tego Claude Code zgaduje.
> Aktualizuj przy każdej większej zmianie. To jedyny dokument, który musi być prawdziwy.

## Co to jest
Jednym zdaniem: co system robi i dla kogo.

## Aktorzy
| Rola | Co robi | Do czego ma dostęp |
|---|---|---|
| Klient (pożyczkobiorca) | | |
| Inwestor | | |
| Pośrednik / broker | | |
| Admin (Filip) | | |

## Stack
- Frontend:
- Backend / funkcje:
- Baza:
- Auth:
- Storage:
- Hosting / deploy:
- AI (Bedrock / region):

## Skala (liczby, nie przymiotniki)
- Użytkownicy aktywni:
- Pożyczki w systemie:
- Requestów / dzień:
- Największa tabela i jej rozmiar:
- Najwolniejszy znany endpoint i jego czas:

## Główne encje domenowe
Wypisz tabele, które są sercem systemu i jak się mają do siebie.
np. `borrower → loan → schedule_entry → payment → collection_event`

## Przepływy krytyczne (te, które nie mogą się zepsuć)
1. Lead → weryfikacja → oferta → umowa → wypłata
2. Spłata → zaksięgowanie → aktualizacja salda
3. Zaległość → windykacja (miękka / standard / twarda / karna)
4. Generowanie dokumentu (umowa, aneks, wezwanie)

Dla każdego: gdzie w kodzie zaczyna się i kończy.

## Integracje zewnętrzne
| System | Po co | Co się dzieje, gdy padnie |
|---|---|---|
| NBP API | stopa referencyjna | |
| RCN / WFS | dane działki | |
| Facebook Lead Ads | leady | |
| AI calling agent | kwalifikacja | |
| E-mail (Resend) | wezwania, komunikacja | |

## Znane długi techniczne / rzeczy, które mnie boją
Bądź brutalnie szczery. To najcenniejsza sekcja.
- 
- 

## Czego NIE robić w tym repo
- np. "nie dodawaj Make.com / n8n — automatyzacja ma być na poziomie aplikacji"
- np. "nie zmieniaj wzorów dokumentów bez konsultacji prawnej"
- 
