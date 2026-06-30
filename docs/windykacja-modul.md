# Moduł windykacji Finance You — przewodnik

Branch: `claude/investor-debt-collection-module-f5tl1c` · PR #2
Lokalizacja w aplikacji: **Panel inwestora → Windykacja** (`/inwestor/windykacja`)

---

## Co obejrzeć w Lovable

1. **Dashboard** (`/inwestor/windykacja`)
   - 4 karty metryczne: sprawy w toku, kwota w windykacji, „wymaga działania dziś", sprawy krytyczne
   - sekcja **„Wymaga działania dziś"** — sprawy z upływającym terminem + podpowiedź kroku
   - lista spraw: kolor opóźnienia (zielony <14, bursztyn 15–30, czerwony >30), badge ścieżki, etap, priorytet, filtr ścieżki
   - **„Nowa sprawa"** — formularz dłużnik + pożyczka
   - pusty stan: **„Załaduj dane przykładowe"** → 4 sprawy (miękka / standardowa / twarda / karna). **Zacznij od tego.**

2. **Karta sprawy** (`/inwestor/windykacja/<id>`)
   - lewa kolumna: **oś czasu zdarzeń** ze statusami doręczeń i odliczaniem terminu 7 dni, filtr (pisma / kontakt / sądowe), lista dokumentów
   - prawa kolumna: dane dłużnika/umowy/zabezpieczenia, **stepper etapu**, **„sugerowane następne działanie"**, wyliczenie zadłużenia z odsetkami maksymalnymi, przyciski akcji
   - akcje (modale): SMS, e-mail, telefon, dodaj pismo (skan), aktualizacja doręczenia (awizo/zwrot/fikcja), wpłata, notatka, zmiana etapu, **generuj dokument**

3. **Generuj dokument** → źródło **„Gotowy wzór DOCX (Kreator dokumentów)"**
   - wzór z `document_templates` (kategorie windykacyjne na górze) wypełniany danymi sprawy → realny plik **.docx** do pobrania
   - alternatywnie szablon tekstowy (szybki podgląd)

4. **Raport dowodowy (PDF)** — przycisk u góry karty → strona druku → „Zapisz jako PDF"
   - chronologiczny rejestr zdarzeń, statusy doręczeń, należność, wykaz załączników i dokumentów

---

## Logika prawna (zaszyta w kodzie)

- **Odsetki maksymalne za opóźnienie** (art. 481 §2¹ KC): 2 × (stopa ref. NBP + 5,5 p.p.); efektywna stopa = min(umowna, maksymalna). `src/lib/debt-collection-math.ts`
- **Zaliczanie wpłat** (art. 451 KC): koszty → odsetki → kapitał
- **Ścieżki** miękka / standardowa (art. 777) / twarda / karna (286/297 k.k.) z etapami i terminem 7 dni od doręczenia; **fikcja doręczenia** przy awizo/zwrocie. `src/lib/windykacja-procedure.ts`
- **Rejestr zdarzeń append-only** (`wind_events`: tylko SELECT/INSERT) — rdzeń dowodowy

---

## Pliki

| Plik | Rola |
|------|------|
| `supabase/migrations/20260629170000_windykacja_system.sql` | tabele `wind_borrowers/loans/collection_cases/events/documents`, enumy, RLS, indeksy; usuwa stary moduł `debt_collection_*` |
| `src/lib/windykacja.functions.ts` | server functions: CRUD, akcje (SMS/e-mail realnie wysyłane), append zdarzeń, generowanie dokumentów, seed |
| `src/lib/windykacja-procedure.ts` | ścieżki, etapy, „sugerowany krok", terminy doręczeń, etykiety |
| `src/lib/windykacja-documents.ts` | szablony tekstowe pism (podpis zarządu FY) |
| `src/lib/windykacja-docfill.ts` | auto-uzupełnianie wzorów DOCX z Kreatora danymi sprawy |
| `src/lib/debt-collection-math.ts` | silnik liczenia długu / odsetek maksymalnych |
| `src/routes/inwestor.windykacja.tsx` | dashboard |
| `src/routes/inwestor.windykacja.$caseId.tsx` | karta sprawy + modale akcji |
| `src/routes/inwestor.windykacja.$caseId.raport.tsx` | raport dowodowy do druku/PDF |

---

## Do weryfikacji po stronie Lovable (konfiguracja, nie kod)

1. **Migracje** muszą się zastosować — moduł tworzy tabele `wind_*` i **usuwa** stare `debt_collection_*`.
2. **Lista wzorów DOCX** w windykacji pojawi się tylko, jeśli szablony z kategorią `windykacja_*` istnieją w `document_templates` i są widoczne dla roli inwestora przez RLS.
3. **SMS/e-mail** wysyłają się realnie tylko przy skonfigurowanych connectorach (Twilio / Resend przez Lovable). Bez nich zdarzenie i tak zapisuje się w rejestrze (status błędu).

---

## Status względem specyfikacji (sekcja 9)

Zrobione punkty **1–8**: model danych, dashboard, karta sprawy z osią czasu, modale akcji, logika sugerowanego kroku, generowanie dokumentów (szablony tekstowe + wzory DOCX z Kreatora), eksport raportu dowodowego do PDF, dane przykładowe.

Możliwe kolejne kroki: inline edycja danych sprawy na karcie (server fns `updateWind*` już gotowe), automatyczny wyzwalacz zaległości (A0) z harmonogramu rat, generowanie pism od razu jako PDF.
