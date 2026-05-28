# kw-fetcher-worker

Osobny serwis Node.js + Playwright do automatycznego pobierania pojedynczych ksiąg wieczystych z oficjalnego portalu EKW i zapisywania wyniku do bazy Supabase aplikacji.

> **WAŻNE:** Ten serwis NIE działa wewnątrz Lovable. Lovable hostuje frontend + API + bazę. Worker musisz uruchomić u siebie (VPS, Docker host, Fly.io, Railway, własny serwer).
>
> Worker **nie omija** captcha, blokad ani rate-limitów EKW — zgodnie z regulaminem portalu. Jeżeli EKW zablokuje próbę, zadanie zostanie oznaczone jako `BLOCKED_BY_SECURITY` lub `REQUIRES_MANUAL_REVIEW` i operator wkleja HTML działów ręcznie w panelu.

## Co worker robi

1. Co 60 s pyta Supabase o jedno zadanie z `kw_fetch_jobs` o statusie `PENDING / RETRY_SCHEDULED / RATE_LIMITED / BLOCKED_BY_SECURITY`, którego `next_attempt_at <= now()` i `attempts < max_attempts`.
2. Ustawia status `PROCESSING`, zwiększa `attempts`, loguje próbę w `kw_fetch_attempts`.
3. Otwiera przeglądarkę, wpisuje numer KW (dzielony na: kod wydziału / numer / cyfra kontrolna), klika "Wyszukaj księgę".
4. Zapisuje ekran wyniku wyszukiwania jako `summary_raw_html` / `summary_raw_text`.
5. Klika **"PRZEGLĄDANIE AKTUALNEJ TREŚCI KW"**.
6. Po kolei klika zakładki: **Dział I-O → I-Sp → II → III → IV** i dla każdego działu zapisuje rekord w `kw_section_sources` (raw_html, raw_text).
7. Wywołuje RPC `kw_parse_and_score` (na poziomie aplikacji, przez webhook lub bezpośrednio przez insert do `kw_analysis`) — w tym szablonie worker tylko pobiera dane; parsowanie + scoring uruchamia panel operatora po wejściu w widok KW (lub osobny cron w przyszłości).
8. Ustawia status końcowy: `SUCCESS`, `PARTIAL_SUCCESS`, `RETRY_SCHEDULED`, `FAILED_*`, `BLOCKED_BY_SECURITY`, `REQUIRES_MANUAL_REVIEW`.

## Uruchomienie

```bash
cd kw-fetcher-worker
cp .env.example .env
# uzupełnij SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY z panelu Lovable Cloud
npm install
npm run install:browsers
npm start
```

### Docker

```bash
docker build -t kw-fetcher .
docker run --env-file .env --restart=always kw-fetcher
```

## Czego worker NIE robi

- nie generuje numerów KW,
- nie wyszukuje KW po adresie,
- nie pobiera wielu ksiąg dla jednego wniosku,
- nie obchodzi captcha,
- nie używa anti-captcha / rotacji IP,
- nie wykonuje masowego scrapingu — pobiera dokładnie jedną księgę dla jednego wniosku.

## Selektory EKW

Selektory portalu EKW potrafią się zmieniać. Worker celowo używa **tekstu** przycisków i nagłówków (np. "Wyszukaj księgę", "PRZEGLĄDANIE AKTUALNEJ TREŚCI KW", "Dział I-O") zamiast klas CSS, ale i tak należy okresowo weryfikować, czy układ portalu się nie zmienił. W razie błędu w `kw_fetch_attempts.error_message` zobaczysz, na którym kroku scenariusz padł.
