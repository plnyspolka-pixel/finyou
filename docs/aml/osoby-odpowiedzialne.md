# Osoby odpowiedzialne za AML w Finance You sp. z o.o.

Stan na 23 października 2026 r.

| Rola                                                                                      | Osoba                        | Podstawa              |
| ----------------------------------------------------------------------------------------- | ---------------------------- | --------------------- |
| Członek kadry kierowniczej wyższego szczebla odpowiedzialny za wykonywanie obowiązków AML | Filip Bielak, Prezes Zarządu | art. 7 i 8 ustawy AML |
| Pracownik odpowiedzialny za zapewnienie zgodności z ustawą (osoba odpowiedzialna za AML)  | Filip Bielak                 | art. 9 ustawy AML     |

W spółce obie funkcje pełni ta sama osoba.

## Gdzie ta rola działa w systemie

- **Powiadomienia e-mail** modułu screeningu i oświadczeń o źródle środków
  idą na adresy z `screening_settings.aml_officer_emails`. Adres osoby
  odpowiedzialnej za AML jest tam wpisany (panel administratora → Screening →
  ustawienia, pole „E-mail osoby odpowiedzialnej za AML”). Zmiana adresu
  wymaga roli administratora i trafia do logu audytowego.
- **Trafienia sankcyjne** idą dodatkowo na `board_emails` (członkowie zarządu).
  Prezes Zarządu jest jednocześnie osobą odpowiedzialną za AML, więc dostaje
  je już z pierwszej listy; lista zarządu pozostaje do uzupełnienia, gdy
  pojawi się drugi adres.
- **Decyzje** w sprawach PEP, trafień sankcyjnych i oświadczeń o źródle
  środków podejmują osoby z rolą administratora albo operatora; akceptacja
  relacji z PEP (wzmożone środki) wymaga roli administratora
  (`docs/aml/screening-pep-sankcje.md`).

Adresu e-mail nie wpisujemy do kodu ani dokumentacji w repozytorium — źródłem
prawdy są ustawienia w bazie.
