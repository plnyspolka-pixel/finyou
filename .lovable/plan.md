## Cel

Przebudować `admin.kreator-pozyczki.tsx` w pełny kreator profilu klienta pożyczkowego B2B z integracją CEIDG/GUS/KRS (backend), 7 zakładkami, jednym centralnym obiektem `clientProfile`, automatycznym harmonogramem „Dyrektor Finansowy", oraz powiązaniem z istniejącym wnioskiem ze strony (`loan_applications`).

## Zakres zmian

### 1. Baza danych (migracja)
Nowa tabela `client_profiles` przechowująca cały `clientProfile` jako JSONB + kolumny indeksowe:
- `id`, `source_application_id` (FK → `loan_applications`), `borrower_type`, `nip`, `completion_percent`, `data` (JSONB z całym profilem), `created_at`, `updated_at`
- RLS: tylko `admin`/`inwestor` (operator) — odczyt/zapis przez `has_role`
- GRANT dla `authenticated` + `service_role`

### 2. Backend — server functions (`src/lib/client-profile.functions.ts`)
- `createProfileFromApplication(applicationId)` — mapuje wniosek → `clientProfile`
- `getClientProfile(id)` / `listClientProfiles()`
- `saveClientProfile(profile)` — upsert całego JSONB
- `fetchCompanyByNip(nip)` — odpytuje CEIDG v3 z `process.env.CEIDG_JWT_TOKEN`; obsługa statusów 200/204/400/401/403/404/429/500/503; zwraca dane z `source: "CEIDG"` lub typowany błąd. GUS/KRS przygotowane jako stuby z czytelnym komunikatem „integracja nie skonfigurowana" jeśli brak kluczy. **Bez mocków.**

### 3. Sekrety
Poprosić użytkownika o `CEIDG_JWT_TOKEN` (opcjonalnie później `GUS_BIR_API_KEY`, `KRS_API_BASE_URL`).

### 4. Frontend — przebudowa `admin.kreator-pozyczki.tsx`
Jedna strona z 7 zakładkami, jeden stan `clientProfile`:

1. **Profil klienta** — typ pożyczkobiorcy (JDG / spółki), dane osobowe/firmy, dokument tożsamości (rodzaj + numer), reprezentant dla spółek, przycisk „Pobierz dane po NIP" + status integracji + etykiety źródła pól (CEIDG/GUS/KRS/Ręcznie), konflikty edycji
2. **Nieruchomość** — typ, KW, adres, wartość, właściciel (jeśli inny niż klient — z dokumentem tożsamości), istniejące hipoteki, opis, upload zdjęć (kategorie zależne od typu — wykorzystać bucket `property-photos`), upload dokumentów (bucket `documents`)
3. **Inwestor** — dane inwestora, rachunek do wypłaty/spłat
4. **Oferta** — wszystkie pola z `offerData`, prowizja kredytowana, wynagrodzenie inwestora kwota/procent, data wypłaty, automatyczne wyliczenia read-only
5. **Harmonogram** — `buildDirectorSchedule()` z modelem A/B/C (rata vs wynagrodzenie inwestora → balon), tabela z kolumnami wg specyfikacji, blok „Benchmark prawny NBP" (ręczna stopa referencyjna), „Podsumowanie inwestora"
6. **Zabezpieczenia** — automatyczne rekomendacje (1.5× zobowiązania, okres +36mc), data końcowa art. 777, dane poręczyciela
7. **Dokumenty** — Wniosek, Umowa (z paragrafem „Oświadczenia Pożyczkobiorcy" + warunkami finansowymi), Załącznik 1 (harmonogram), Załącznik 2 (protokół negocjacji); przyciski Kopiuj / Kopiuj wszystkie / Pobierz TXT / Drukuj

Górny pasek: **wskaźnik kompletności profilu %**, lista brakujących pól, blokada generowania finalnych dokumentów przy brakach krytycznych (przeglądanie nie blokowane).

### 5. Powiązanie z wnioskiem
- W `admin.wnioski.$id.tsx` dodać przycisk „Utwórz profil klienta" → wywołuje `createProfileFromApplication` → redirect na `/admin/kreator-pozyczki?profileId=...`
- Kreator wczytuje `profileId` z query lub tworzy pusty profil

### 6. Czego NIE robię
- Bez mocków, bez przykładowych firm, bez seed data
- Nie pytam o typ harmonogramu / balon / metodę spłaty / ocenę ryzyka
- Nie dodaję checkboxów B2B w formularzu (tylko w umowie)
- Cel pożyczki = jedno pole tekstowe
- Bez DOCX export (tylko TXT + Drukuj — DOCX wymagałby biblioteki Node-only ryzykownej dla Workera; mogę dodać później na żądanie)

## Kolejność wykonania

1. Migracja DB (`client_profiles`)
2. Prośba o sekret `CEIDG_JWT_TOKEN`
3. `client-profile.functions.ts` (server functions + CEIDG)
4. Helpery: `loan-math` (rozszerzenie o `buildDirectorSchedule`), `profile-completion`, generatory dokumentów
5. Przebudowa `admin.kreator-pozyczki.tsx` z 7 zakładkami
6. Przycisk „Utwórz profil" w `admin.wnioski.$id.tsx`

## Pytanie kontrolne

Czy mogę poprosić Cię o `CEIDG_JWT_TOKEN` zaraz po zatwierdzeniu planu (sekret backendowy)? Bez niego przycisk „Pobierz dane po NIP" zwróci komunikat „Integracja CEIDG nie jest skonfigurowana" — reszta aplikacji będzie działać i pozwoli uzupełnić dane ręcznie.