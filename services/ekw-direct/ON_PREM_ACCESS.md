# EKW: własny dostęp bez płatnego API — ścieżka techniczna

Stan: **eksperyment, jeszcze nie działa end-to-end**. Bez potwierdzenia formy urzędowej EKW i kompletnego pobrania działów nie używać do decyzji o zabezpieczeniu hipoteki.

## Dlaczego przestaliśmy testować serwery w chmurze

- `ekw.ms.gov.pl/eukw_ogol/menu.do`: HTTP 200 na GitHubie i Firecrawl.
- `przegladarka-ekw.ms.gov.pl/eukw_prz/...`: blokada HTTP 403 / Access Denied Error 15 **przed formularzem** na tych samych środowiskach.
- Ten sam test MSiG ma HTTP 200, ponieważ MSiG udostępnia publicznie dostępny endpoint `/api/Monitor/Search`. EKW nie wykazał takiej dostępnej drogi.
- Próby nierespektujące blokady nie są rozwiązaniem. Nie stosować rotacji IP, stealth, bypass CAPTCHA ani nieautoryzowanego dostępu.

## Hipoteza do rozstrzygnięcia — dostawca internetu czy sesja automatu?

Wyniki `local-diagnostic.mjs` na laptopie były blokowane, ale proces otwierał **nową, nietrwałą sesję przeglądarki**. Nie ustalono porównania ze zwykłą sesją Chrome na **tym samym łączu**.

Czysty test A/B:
1. Otwórz `https://ekw.ms.gov.pl/eukw_ogol/menu.do` w zwykłym Chrome i przejdź do „Przeglądanie księgi wieczystej”. Zanotuj: formularz czy Error 15. Nie otwieraj wielu kart, nie wykonuj pętli.
2. W PowerShell (po jednorazowym `git pull`):
   ```powershell
   cd "$HOME\finyou\services\ekw-direct"
   $env:EKW_BROWSER_PROFILE_DIR = "$env:LOCALAPPDATA\FinanceYou\ekw-dedicated-chrome"
   $env:EKW_BROWSER_CHANNEL = "chrome"
   node .\persistent-access-check.mjs
   ```
3. Skrypt otwiera oficjalne EKW przez **zainstalowany Chrome i odrębny trwały profil**; nie wprowadza numeru KW, nie pobiera danych osobowych i nie próbuje obchodzić WAF. Raportuje `KW_FORM_ACCESSIBLE` albo `NO_CONFIRMED_KW_ACCESS`.

**Interpretacja:**
- Standard Chrome i profil trwały działają: istnieje podstawowa przesłanka dla własnego workera pod normalnymi ograniczeniami portalu. Następny krok to jednorazowy odczyt znanej, uprawnionej KW i porównanie pięciu działów i wzmianek.
- Standard Chrome działa, trwały profil blokowany: problem dotyczy środowiska automatyzacji/sesji, nie można przypisać go wyłącznie publicznemu IP. Ten worker nie jest produkcyjny.
- Obydwa blokowane: podstawowy problem to brak dostępu na danym łączu / w tym środowisku. Żaden parser ani zmiana endpointu go nie naprawi; wymagany prawidłowy dostęp do portalu.
- Standard Chrome nie działa, profil działa: zdiagnozować różnicę konfiguracji lokalnego Chrome/proxy/VPN/rozszerzeń, nie robić automatycznych ponowień.

## Gotowy element architektury (dopiero po pozytywnym teście)

```
Finance You app (Cloudflare)
       |
       | token + pobranie aktualnej KW po znanym numerze
       v
Cloudflare Tunnel / private Access — tylko do firmowego workera
       |
       v
Worker Node.js na firmowym komputerze z dozwolonym dostępem do EKW
       |
       | lokalna zainstalowana przeglądarka i oddzielny persistent profile
       v
przegladarka-ekw.ms.gov.pl (widzi sieć firmowego komputera)
       |
       v
Walidacja kompletności I-O, I-Sp, II, III, IV, wzmianek i czasu -> kw_documents
```

`cloudflared` jest połączeniem **wejściowym z chmury do firmowego workera**, a nie pośrednikiem w połączeniu z EKW. Wymaga osobnych reguł dostępu (Cloudflare Access), silnego tokenu i bezpiecznego przechowywania danych osobowych. Nie wolno wystawiać workera anonimowo.

### Konfiguracja eksperymentalna własnego workera

```powershell
cd "$HOME\finyou\services\ekw-direct"
$env:EKW_BROWSER_PROFILE_DIR = "$env:LOCALAPPDATA\FinanceYou\ekw-dedicated-chrome"
$env:EKW_BROWSER_CHANNEL = "chrome"
$env:EKW_BROWSER_HEADLESS = "false"
# Ustaw mocny, lokalny sekret EKW_DIRECT_TOKEN, poza historią poleceń.
node .\server.mjs
```

Nie ustawiaj `EKW_DIRECT_URL` produkcyjnie, dopóki nie zakończy się sukcesem zlecenie na realnej KW oraz porównanie na stronie urzędowej.

### Uwagi

- Zmienna `EKW_BROWSER_PROFILE_DIR` **nie może** wskazywać domyślnego profilu Chrome; Chrome 136+ i Playwright tego nie wspierają.
- Zapisany profil przeglądarki może zawierać cookies; chronić go. Nie synchronizować z chmurą.
- W trybie graficznym komputer musi mieć aktywną sesję użytkownika; typowa usługa Windows uruchamiana w Session 0 nie ma widocznego pulpitu.
- Trwały profil nie obchodzi ograniczeń IP, aktywnej blokady, CAPTCHA ani regulaminu. Nie ma gwarancji, że uzyskamy formę urzędową.
- Żadna korespondencja z administratorem EKW lub osobami trzecimi nie jest generowana ani wysyłana przez ten kod.
