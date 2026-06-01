# /embed/wniosek = /klient (1:1)

## Cel
Embed wklejany na financeyou.pl ma mieć dokładnie ten sam formularz co `/klient` — pełne 5 kroków, uploady dokumentów, walidacje, OCR KW, auto-zapis. Logowanie w kroku 2 (mail+tel albo Google/Apple). Telefon docierany w kroku 3, jeśli brak.

## Główna decyzja techniczna
OAuth (Google/Apple) jest **blokowany w iframe** przez providerów (X-Frame-Options/CSP). Dlatego embed nie może w pełni zhostować flow z uploadami w iframie — uploady wymagają zalogowanej sesji Supabase.

**Rozwiązanie:** embed prowadzi krok 1 (kalkulator) w iframie, w kroku 2 wybijamy z iframe do `app.financeyou.pl` (`window.top.location`) z parametrami kalkulatora w URL, gdzie cała reszta (auth + kroki 2–5 + uploady) dzieje się natywnie na `/klient`. Dla użytkownika to nadal jeden ciągły flow, tylko otwierany w nowej karcie/pełnym oknie.

## Zakres zmian

### 1. `/embed/wniosek` → tylko krok 1 (kalkulator + zabezpieczenie)
- Zostawić obecny ekran kroku 1 (kwota, wynagrodzenie, okres, max rata, typ zabezpieczenia, podgląd raty).
- Przycisk „Dalej" wybija do `window.top.location.href = "https://app.financeyou.pl/klient/start?<params>"` z zaszyfrowanym/zakodowanym stanem kalkulatora w query stringu (`amount`, `annualRate`, `months`, `maxPayment`, `secType`, `source`).
- Jeśli brak `window.top` (otwarte bezpośrednio), nawiguje wewnątrz.

### 2. Nowa trasa `/klient/start` (publiczna)
- Czyta paramy z URL, zapisuje do `sessionStorage` (klucz `embed_calc_v1`).
- Jeśli użytkownik zalogowany → redirect do `/klient` (krok 2).
- Jeśli niezalogowany → pokazuje ekran auth zgodnie z wymogiem:
  - **email + telefon + hasło** (sign up) lub **email + hasło** (sign in)
  - **„Kontynuuj z Google"** (`lovable.auth.signInWithOAuth("google", { redirect_uri: origin + "/klient/start" })`)
  - **„Kontynuuj z Apple"** (analogicznie)
- Po pomyślnym auth → redirect do `/klient`.

### 3. `/klient` pre-fill z `sessionStorage`
- Na starcie, jeśli `clientId === null` i jest `embed_calc_v1` w sessionStorage → wczytuje paramy do kalkulatora, zapisuje telefon (jeśli był), ustawia krok na 2 lub 3 (zależnie czy telefon dotarł), i czyści klucz.
- Jeśli telefon nie został podany w trakcie auth → na kroku 3 (Dane kontaktowe) telefon jest wymagany jak dziś.

### 4. Konfiguracja auth
- `supabase--configure_social_auth` z `providers: ["google", "apple"]` (jeśli Apple jeszcze nie włączone).
- Apple wymaga konfiguracji Services ID/JWT — informacja dla użytkownika jeśli nie skonfigurowane.

### 5. Panel `/admin/embed`
- Bez zmian funkcjonalnych. URL pozostaje `/embed/wniosek?source=...`.

## Co się NIE zmienia
- `/klient` (już ma pełne 5 kroków, uploady, OCR KW) — tylko mała wstawka pre-fill na starcie.
- `/api/public/loan-application` — pozostaje dla wstecznej kompatybilności, ale embed już go nie używa.
- Schemat DB — bez migracji.

## UX
- Użytkownik na `financeyou.pl` widzi w iframe „mini-kalkulator". Klika „Dalej" → otwiera się `app.financeyou.pl` w tej samej karcie (`_top`) z auth + pełnym wnioskiem.
- Cały lead (dane + dokumenty + zdjęcia) trafia 1:1 jak z `/klient`, z `source=embed_<źródło>`.

## Pliki
- `src/routes/embed.wniosek.tsx` — uprościć do kroku 1 + przekierowanie top-frame
- `src/routes/klient.start.tsx` — NOWA, auth gateway z pre-fillem
- `src/routes/klient.index.tsx` — dodać efekt pre-fillu z sessionStorage
- konfiguracja: `configure_social_auth(["google","apple"])`

OK z planem? Wtedy implementuję.