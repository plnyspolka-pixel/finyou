# Blokada domen przez plik hosts — instrukcja

## Co jest w zestawie

| Plik | Do czego służy |
|---|---|
| `INSTALL.bat` | Autoinstaler — podwójne kliknięcie zakłada blokadę |
| `install-block.ps1` | Właściwy skrypt instalacyjny (uruchamiany przez INSTALL.bat) |
| `UNINSTALL.bat` | Zdejmowanie blokady — podwójne kliknięcie, wymaga hasła |
| `uninstall-block.ps1` | Właściwy skrypt odblokowujący |
| `.block-password.hash` | (powstaje przy instalacji) ukryty plik z hashem SHA-256 hasła |

## Instalacja — krok po kroku

1. Skopiuj **cały folder** (np. do `C:\Blokada`) — pliki muszą leżeć obok siebie.
2. Kliknij dwukrotnie **`INSTALL.bat`**.
3. Windows pokaże okno **UAC** („Czy chcesz zezwolić…”) → kliknij **Tak**.
4. **Tu hasło wpisuje Ania** — przy pierwszym uruchomieniu skrypt poprosi
   o ustawienie hasła (dwukrotnie, min. 6 znaków). Hasło zna tylko ona;
   na dysku zapisywany jest wyłącznie jego hash SHA-256, w ukrytym pliku.
5. Skrypt doda wpisy do `C:\Windows\System32\drivers\etc\hosts`
   (sekcja `# BLOCK-START` … `# BLOCK-END`, przekierowanie na `0.0.0.0`),
   ustawi plik jako tylko-do-odczytu, zaostrzy uprawnienia NTFS
   i wyczyści cache DNS. Na końcu wypisze „BLOKADA ZALOZONA POMYSLNIE”.

Instalację można uruchamiać wielokrotnie — stara sekcja BLOCK jest
podmieniana na nową, hasło pozostaje bez zmian.

## Zdejmowanie blokady

1. Kliknij dwukrotnie **`UNINSTALL.bat`** i zatwierdź UAC.
2. **Ania wpisuje hasło** w oknie PowerShell.
   - Hasło poprawne → sekcja BLOCK znika z hosts, uprawnienia wracają
     do domyślnych, DNS jest czyszczony.
   - Hasło błędne → skrypt nic nie zmienia i się zamyka.
3. Plik z hashem zostaje na dysku, więc ponowna instalacja użyje tego
   samego hasła. Aby ustawić nowe hasło: usuń (jako administrator)
   ukryty plik `.block-password.hash` z folderu i uruchom instalację od nowa.

## Blokowane adresy

Każda domena bazowa + warianty `www.` i `m.` (mobilne):

- snapchat.com (+ web.snapchat.com, accounts.snapchat.com)
- telegram.org (+ web.telegram.org, webk.telegram.org, webz.telegram.org)
- t.me
- signal.org
- escort.pl
- erodate.pl
- pornhub.com

## Ograniczenia (warto wiedzieć)

To rozwiązanie tworzy **tarcie**, nie jest nie do obejścia przez
administratora — zgodnie z założeniem:

- Plik hosts nie obsługuje wildcardów — blokowane są tylko wypisane
  subdomeny. Inne subdomeny (np. regionalne mirrory) przejdą.
- Aplikacje desktopowe/mobilne komunikatorów mogą używać własnych adresów
  IP lub własnego DNS i ominąć hosts — blokada działa najpewniej dla
  wersji przeglądarkowych.
- Przeglądarka z włączonym **DNS-over-HTTPS („bezpieczny DNS”)** nadal
  respektuje plik hosts w Windows, ale dla pewności warto wyłączyć
  „Użyj bezpiecznego DNS” w ustawieniach przeglądarki.
- Użytkownik z uprawnieniami administratora może przywrócić uprawnienia
  i wyedytować hosts ręcznie — wymaga to jednak świadomego podniesienia
  uprawnień (o to tarcie chodzi). Jeśli potrzebna jest twardsza blokada,
  najlepiej pracować na co dzień na koncie **bez** uprawnień administratora,
  a konto admina (z osobnym hasłem) zostawić Ani.
