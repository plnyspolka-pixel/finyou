# Finance You — EKW Direct (bez CMD / EasyMKW)

Eksperymentalny worker pobierający aktualną treść **konkretnej** księgi wieczystej
z publicznej przeglądarki Ministerstwa Sprawiedliwości, za pomocą Playwright.

## Co już jest połączone

- `src/lib/kw-fetch.server.ts`: gdy ustawione są oba sekrety EKW Direct, 
  nowy adapter ma pierwszeństwo przed EasyMKW i CMD.
- `src/lib/kw-ekw-direct.server.ts`: weryfikuje cyfrę kontrolną, odpytuje workera,
  sprawdza kompletność wszystkich pięciu działów i zapisuje `kw_documents`.
- Dalej działają istniejące moduły: raport KW, adres, właściciele, analiza
  ryzyka, hipoteki, współwłaściciele i integracje rejestrowe.
- Bez ustawienia sekretów nowy kod niczego nie zmienia w pobieraniu na produkcji.

## Lokalny test workera

```sh
cd services/ekw-direct
npm install
npx playwright install chromium
npm test
EKW_DIRECT_TOKEN="$(openssl rand -hex 32)" npm start
```

Token do uruchomienia zachowaj w managerze sekretów. Test pobrania (wyłącznie
numer KW, do którego mamy podstawę przetwarzania):

```sh
curl -sS -X POST http://127.0.0.1:8789/v1/kw/content \
  -H "Authorization: Bearer $EKW_DIRECT_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"kw":"XXXX/00000000/0"}'
```

W kodzie aplikacji (sekrety backendu, **nie** `VITE_*`):

- `EKW_DIRECT_URL=https://ekw-worker.wlasna-domena.pl` — adres HTTPS workera;
- `EKW_DIRECT_TOKEN=<identyczny sekret w workerze i backendzie>`;
- opcjonalnie `EKW_MIN_INTERVAL_MS=10000`.

Docker: `docker build -t financeyou-ekw-direct services/ekw-direct`.
Uruchom przez prywatny reverse proxy HTTPS lub prywatny tunel; **nie wystawiaj
portu 8789 bezpośrednio do Internetu**. Limit: jedna sesja jednocześnie,
minimum 10 s odstępu między pobraniami. Brak proxy rotacyjnych, omijania
CAPTCHA i masowego generowania numerów KW.

## Statusy i ograniczenia

Ten kod jest **prototypem**. Testy jednostkowe potwierdzają normalizację i
kontrakt, ale nie dowodzą, że prawdziwy portal w tej chwili pozwala na
automatyczny odczyt. Trzeba wykonać test end-to-end na uprawnionym numerze KW,
zweryfikować treść wszystkich działów i porównać z EKW / CMD.

Gdy EKW żąda interakcji człowieka, worker zwraca `HUMAN_VERIFICATION` i
zatrzymuje pobieranie. Nie zapisujemy pustych działów jako prawdziwy wynik.
Nie ma automatycznego przejścia na płatne API przy niepowodzeniu bezpośredniego
pobierania — operator może wykorzystać istniejący import treści KW.
EKW publikuje limity połączeń i może zmieniać interfejs bez uprzedzenia.
Każde wdrożenie powinno uwzględniać podstawę przetwarzania danych, retencję,
kontrolę dostępu i dokumentację ochrony danych.

**To nie jest urzędowy odpis księgi wieczystej** ani narzędzie wyszukiwania
nieznanych numerów KW.

## Wynik próby z GitHub Actions (2026-11-02)

Automatyczny Chromium w GitHub Actions otrzymał **HTTP 403** na formularzu
`przegladarka-ekw.ms.gov.pl`, zanim podał jakikolwiek numer KW. Oznacza to
blokadę ruchu z tego środowiska, **nie** dowodzi, że parser nie działa, ale
wyklucza uznanie tego środowiska za działającą produkcję. Nie uruchamiać
`EKW_DIRECT_URL` bez pozytywnego testu na docelowym, dopuszczonym hoście.
