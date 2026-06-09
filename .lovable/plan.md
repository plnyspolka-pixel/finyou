# Ujednolicenie ścieżki klienta (Meta lead → wniosek → uzupełnianie)

## Cel

Klient (najczęściej z Mety) ma w każdej chwili wiedzieć:
1. **Gdzie jest** (np. „krok 3 z 5", „brakuje 2 dokumentów")
2. **Co ma zrobić dalej** (jeden duży przycisk „Kontynuuj")
3. **Czego brakuje** (jawna checklista, nie procent)
4. **Jak wrócić** (jeden link działa zawsze, niezależnie czy zalogowany, niezalogowany, ma konto czy nie)

## Diagnoza obecnego stanu (skrót audytu)

```text
PROBLEM                                            SKUTEK DLA KLIENTA
─────────────────────────────────────────────      ────────────────────────────────
SMS z Mety → /wniosek/$token gubi token przy       Powstaje 2. pusty wniosek;
rejestracji (nie linkuje webhookowego rekordu)     klient widzi „0%", admin widzi
                                                   osierocony lead z Mety
─────────────────────────────────────────────      ────────────────────────────────
2 równoległe wizardy (standalone routes +          Stepper raz mówi „3/4", raz „4/5";
/wniosek-formularz z zakładkami)                   klient nie wie ile zostało
─────────────────────────────────────────────      ────────────────────────────────
/klient/wniosek pokazuje tylko % i liczbę plików   Klient nie wie KTÓRY dokument
(missing_documents[] jest liczone, ale ukryte)     ma wgrać
─────────────────────────────────────────────      ────────────────────────────────
/logowanie = tylko magic link (shouldCreateUser    Klient zarejestrowany hasłem
false). /wniosek-start = hasło. Niespójne.         nie może się zalogować z /logowanie
─────────────────────────────────────────────      ────────────────────────────────
Brak dedykowanej strony „Dokumenty" w panelu       Żeby dorzucić 1 PDF klient
klienta — trzeba przejść cały wizard               przechodzi przez 5 zakładek
─────────────────────────────────────────────      ────────────────────────────────
/wniosek-opis ustawia completeness=100% omijając   Status w bazie kłamie
faktyczne sprawdzenie braków
```

## Architektura docelowa

### Jedna oś nawigacji dla klienta

```text
                   ┌──────────────────────────────────┐
   Meta Lead  ──►  │  /wniosek/$token  (smart entry)  │
   SMS link        │  - rozpoznaje token              │
   Email link      │  - rozpoznaje sesję              │
   /embed/wniosek  │  - łączy webhookowy loan_app     │
   /l/$slug        │    z kontem (claim)              │
                   └─────────────────┬────────────────┘
                                     ▼
                   ┌──────────────────────────────────┐
                   │  /klient (panel = home klienta)  │
                   │  ┌─ HERO: „Co dalej?" ──────────┐│
                   │  │  Jeden duży CTA z kolejnym  ││
                   │  │  brakującym krokiem         ││
                   │  ├─ CHECKLISTA braków ─────────┤│
                   │  │  ✓ Dane kontaktowe          ││
                   │  │  ✓ Nieruchomość             ││
                   │  │  ☐ Numer KW    [Dodaj]      ││
                   │  │  ☐ Wypis z KW  [Wgraj]      ││
                   │  │  ☐ MPZP        [Wgraj]      ││
                   │  ├─ Status wniosku + timeline ─┤│
                   │  └─ Linki: Profil, Dokumenty ──┘│
                   └─────────────────┬────────────────┘
                                     ▼
                   /klient/dokumenty  /klient/wniosek/[sekcja]
                   (nowa strona)      (głębokie linki do edycji
                                       konkretnej sekcji)
```

### Zasady

- **Jeden wniosek na klienta** (active). Webhookowy rekord z `meta_lead` jest *claimowany* przez konto przy pierwszym logowaniu — nie tworzymy duplikatu.
- **Jeden komponent „co brakuje"** (`<NextStepCard />`) używany w 3 miejscach: `/klient`, na górze każdej podstrony wniosku, w mailu/SMS jako tekst.
- **Głębokie linki do sekcji**: `/klient/wniosek/dokumenty`, `/klient/wniosek/nieruchomosc`, `/klient/wniosek/dane`, `/klient/wniosek/opis` — klient klika „Wgraj KW" i ląduje DOKŁADNIE w polu na KW, nie na początku 5-krokowego wizarda.
- **Standalone wizard (`/wniosek-warunki`, `/wniosek-opis`, `/wniosek-zabezpieczenie`)** → przekierowania 301 do odpowiednich sekcji panelu. Zostaje tylko `/wniosek-start` (rejestracja) i `/embed/*` (do iframe).
- **Auth zunifikowany**: `/logowanie` obsługuje hasło + magic link + OAuth (jeden ekran, dwie zakładki). Reset hasła zlinkowany.

## Plan implementacji (etapy)

### Etap 1 — Fundament: claim leada + jedno źródło prawdy o brakach

1. **Naprawić `/wniosek/$token`**
   - Jeśli zalogowany: `UPDATE loan_applications SET client_id = <profile.client_id> WHERE return_link_token = $token AND client_id IS NULL` (claim).
   - Jeśli niezalogowany: zapisać `pendingClaimToken` w `localStorage` (nie session), przekierować na `/logowanie?claim=<token>`.
   - Po zalogowaniu/rejestracji: `useEffect` na panelu sprawdza `pendingClaimToken` → wywołuje serverFn `claimLoanApplication({ token })`.

2. **Wystawić `computeLoanProgress` jako serverFn dla klienta**
   - `getMyLoanProgress.functions.ts` → zwraca `{ percent, missing: [{key, label, ctaHref, ctaLabel}], uploaded, nextStep }`.
   - Wzbogacić `missing_documents` o `ctaHref` (deep link) i `ctaLabel` („Wgraj wypis z KW").

3. **Komponent `<NextStepCard />`**
   - Wejście: wynik `getMyLoanProgress`.
   - Wyjście: gradientowa karta z jedną akcją „Kontynuuj: <nextStep.label>" + drugorzędne „Zobacz pełną listę".

### Etap 2 — Panel klienta jako home

4. **Przepisać `/klient` (dashboard)**
   - Sekcja 1: `<NextStepCard />` (HERO)
   - Sekcja 2: `<ProgressChecklist />` — pełna lista wymagań pogrupowana (Dane / Nieruchomość / Dokumenty / Opis), każdy item z ikoną ✓/☐ i przyciskiem akcji
   - Sekcja 3: status badge + krótki timeline (z `audit_logs` filtrowane do wydarzeń widocznych klientowi)
   - Sekcja 4: skróty (Profil, Wyloguj)

5. **Nowa strona `/klient/dokumenty`**
   - Lista wgranych dokumentów (z `documents`) + checklista brakujących z `missing_documents`
   - Drag & drop upload, każdy slot opisany („Tu wgraj wypis z KW", „Tu zdjęcia nieruchomości")
   - Po uploadzie automatyczne rozpoznanie typu (heurystyka po nazwie + OCR KW już istnieje)

6. **Sekcyjne edycje `/klient/wniosek/$section`**
   - `dane`, `nieruchomosc`, `warunki`, `opis` — pojedyncze formularze, nie 5-step wizard
   - Każdy autosave (debounce 800ms) do `loan_applications`
   - Górny pasek progress + breadcrumb „← Wróć do panelu"

### Etap 3 — Auth + komunikacja

7. **Zunifikować `/logowanie`**
   - Zakładki: „Hasło" / „Magic link" / „Google"
   - `shouldCreateUser: false` zostaje dla magic linka, ale dodajemy ścieżkę hasła
   - Link „Nie pamiętam hasła" → `/zapomniane-haslo`
   - Po zalogowaniu honoruje `?claim=` i `?next=`

8. **Linki w SMS i mailach prowadzą do `/wniosek/$token`** (jak dziś), ale teraz token zawsze claimuje wniosek

9. **`scheduleCalculatorEntryFollowup` + voicebot + reminder emails** czytają z `getMyLoanProgress` — dokładnie ta sama lista braków co widzi klient (spójność komunikatu)

### Etap 4 — Sprzątanie

10. **Standalone routes → redirecty**:
    - `/wniosek-warunki` → `/klient/wniosek/warunki`
    - `/wniosek-zabezpieczenie` → `/klient/wniosek/nieruchomosc`
    - `/wniosek-opis` → `/klient/wniosek/opis`
    - `/wniosek-formularz` → `/klient` (z banerem migracji)

11. **Naprawić `/wniosek-opis`**: `completeness_percent` zawsze z `computeLoanProgress`, nie hardcoded 100%

## Szczegóły techniczne

**Nowe pliki:**
- `src/lib/my-loan.functions.ts` — `getMyLoanProgress`, `claimLoanApplication`, `updateMySection`
- `src/components/client/NextStepCard.tsx`
- `src/components/client/ProgressChecklist.tsx`
- `src/components/client/DocumentSlot.tsx` (single slot z uploadem/podglądem)
- `src/routes/klient.dokumenty.tsx`
- `src/routes/klient.wniosek.$section.tsx` (dynamic segment)

**Zmiany w istniejących:**
- `src/lib/loan-progress.ts` — dodać `ctaHref`/`ctaLabel`/`section` do każdego brakującego wymogu
- `src/routes/wniosek.$token.tsx` — claim logic
- `src/routes/klient.tsx` + `klient.wniosek.tsx` — przepisać jako dashboard z checklistą
- `src/routes/logowanie.tsx` — dodać password tab
- `src/routes/wniosek-{warunki,zabezpieczenie,opis,formularz}.tsx` — zamienić w redirecty

**Baza:** bez migracji w etapie 1–2 (wszystko da się policzyć z istniejących tabel). W etapie 3 ewentualnie `loan_application_events` dla timeline klienta (osobna decyzja po zatwierdzeniu planu).

## Zakres jednej iteracji

Etapy 1+2 to ~6–8 plików zmienionych/dodanych i jest realistyczne w jednym podejściu. Etapy 3+4 sugeruję jako oddzielną iterację, żebyś mógł najpierw zobaczyć i potestować nowy panel klienta zanim odetnę stare ścieżki.

## Co zatwierdzasz

- [ ] Tak, ruszamy z **Etapem 1+2** (claim leadów + nowy panel klienta z checklistą braków + strona Dokumenty + sekcyjne edycje). Po zobaczeniu działania robię Etap 3+4.
- [ ] Chcę najpierw zmienić zakres / kolejność (opisz co).
