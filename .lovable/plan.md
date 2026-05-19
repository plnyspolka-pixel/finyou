## Cel
Przebudować formularz wniosku o pożyczkę hipoteczną tak, by zaczynał się jak kalkulator oferty, a następnie prowadził klienta przez kolejne kroki z logiką warunkową zależną od typu zabezpieczenia, statusu działalności i statusu księgi wieczystej.

## Zakres zmian

### 1. Nowy wieloetapowy formularz (`src/routes/klient.index.tsx` — pełna przebudowa)
Kroki:
1. **Kalkulator** — suwaki: kwota (20k–1M), wynagrodzenie roczne (15–36% + „powyżej 36%”), okres (3–72 mies.), maks. rata. Kafelki z ikonami dla typu zabezpieczenia (6 opcji). Wskaźnik zainteresowania inwestora (tylko liczba/pasek, wartości bazowe + skalowanie wg %). Wyliczenie raty annuitetowej, łącznego wynagrodzenia, łącznej kwoty do spłaty. Ostrzeżenie gdy rata > maks. rata.
2. **Bramka działalności gospodarczej** — 3 opcje radio. „Nie i nie zamierzam” → blokada z komunikatem i przyciskiem „Wróć”. „Tak” → wymagane pole NIP.
3. **Dane kontaktowe** — imię i nazwisko, e-mail, telefon (wszystkie wymagane).
4. **Lokalizacja + KW** — miejscowość/ulica/województwo. Pytanie o KW: znam (pole numer KW), nie znam (upload zdjęć dokumentu własności), brak KW (opis + upload dokumentów).
5. **Dokumenty wg typu zabezpieczenia** — pola pokazywane warunkowo zgodnie ze specyfikacją (mieszkanie/dom/lokal/działka budowlana/rolna/inna).
6. **Podsumowanie** — wszystkie dane + przycisk „Wyślij kompletny wniosek do analizy”.

Wskaźnik zainteresowania **tylko liczba/pasek**, bez tekstu oceniającego. Nie zapisywany do tabel widocznych dla inwestora.

### 2. Komponent kalkulatora i wskaźnika
- `src/components/loan-calculator.tsx` — suwaki + wyliczenia
- `src/components/security-type-picker.tsx` — 6 kafelków z ikonami Lucide (Building2, Home, Trees, Map, Store, FileQuestion)
- `src/components/investor-interest-meter.tsx` — pasek progress + liczba X/100
- `src/lib/loan-math.ts` — funkcje: `monthlyPayment(amount, annualRate, months)`, `interestScore(type, annualRate)`

### 3. Schemat bazy — migracja
Dodać do `loan_applications`:
- `annual_investor_rate numeric` — proponowane wynagrodzenie inwestora (%)
- `max_monthly_payment numeric` — maksymalna rata klienta
- `business_status text` — `prowadzi` / `zamierza` / `nie_zamierza`
- `nip text`
- `kw_status text` — `znam` / `nie_znam` / `brak`
- `interest_score integer` — zapisany wskaźnik (tylko dla admina, nieujawniany w RLS dla inwestora)

Dodać do `properties`:
- `street text`
- `mpzp_info text` — informacja o MPZP / warunkach zabudowy
- `land_registry_extract text` — pole tekstowe lub flaga o wypisie

Nowa tabela / wykorzystanie istniejącej: temat inwestycyjny utworzy się automatycznie poprzez ustawienie `loan_applications.status = 'do_weryfikacji'` (lub nowy enum value) + `available_to_investors = false`. Admin akceptuje, ustawia `available_to_investors = true`.

### 4. Endpoint dla embed (`src/routes/api/public/loan-application.ts`)
Rozszerzyć schemat Zod o nowe pola (annual_investor_rate, max_monthly_payment, business_status, nip, kw_status, street). Wstawianie do nowych kolumn.

### 5. Embed (`src/routes/embed.wniosek.tsx`)
Zastosować tę samą logikę wieloetapową w formie skondensowanej dla osadzenia.

## Co NIE wchodzi w zakres tego planu
- Widok admina do akceptacji tematów inwestycyjnych — założenie: użyje istniejącego `admin.wnioski.tsx`, dodam tylko przełącznik `available_to_investors` jeśli go nie ma.
- Zmiany w panelu inwestora — wskaźnik i tak nie jest tam pokazywany.

## Pytanie do potwierdzenia
Czy migracja DB (dodanie kolumn) i pełna przebudowa `klient.index.tsx` (zastąpi obecny 7-krokowy formularz) jest OK? Obecny formularz zniknie — nowy będzie zgodny ze specyfikacją.
