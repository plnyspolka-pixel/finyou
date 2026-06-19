# Plan: kreator dokumentów, panel operatora, propozycje inwestora

Zakres jest bardzo szeroki — robię to w **4 osobnych iteracjach**, każda kończy się czymś działającym i testowalnym. Po Twoim "ok" odpalam iterację 1.

---

## Iteracja 1 — Fundament: kreator dokumentów (DOCX + PDF)

**Co dostajesz:** w panelach `/admin`, `/inwestor`, `/operator` nowa zakładka **„Kreator dokumentów"** z listą 31 wzorów z pakietu B2B. Wybierasz wzór → formularz z polami → generujesz DOCX i PDF.

**Backend:**
- Upload wszystkich 31 `.docx` do bucketu `documents/templates/` (Storage).
- Migracja: seed do `document_templates` (nazwa, kategoria: `windykacja` / `umowa` / `zalacznik`, lista placeholderów wyciągniętych z `[NAWIASÓW KWADRATOWYCH]`, ścieżka do pliku w Storage).
- Nowa tabela `generated_documents` (lead_id?, loan_application_id?, template_id, dane formularza JSONB, ścieżki do docx/pdf w Storage, created_by, created_at). RLS: właściciel + administrator + operator + inwestor (dla swoich).
- Server fn `generateDocumentFromTemplate({ templateId, data, leadId?, loanId? })`:
  - pobiera szablon z Storage
  - **DOCX:** `docxtemplater` — podmiana `[PLACEHOLDER]` na wartości (custom delimiter `[`/`]`)
  - **PDF:** konwersja przez zewnętrzne API (CloudConvert / Docs2Pdf). LibreOffice nie działa w Cloudflare Worker, więc albo dodaję konektor zewnętrzny, albo na start zwracam tylko DOCX i PDF dorabiam w iteracji 1b. **Wymaga decyzji** — patrz pytanie niżej.
  - zapisuje oba pliki w Storage, wpis do `generated_documents`.

**UI:**
- `/admin/dokumenty`, `/inwestor/dokumenty`, `/operator/dokumenty` — wspólny komponent `DocumentCreator`.
- Lewa kolumna: lista wzorów pogrupowana po kategorii.
- Prawa: formularz auto-generowany z `placeholders` (pola: data, kwota, tekst, słownie). Wspólne pola (dane wierzyciela, dłużnika, umowy) pre-fill z wybranego leada/wniosku.
- **Prowizja za pośrednictwo:** osobne pole „Prowizja pośrednika [PLN]" + checkbox „dolicz do kosztów pożyczki" — wartość trafia do `[KWOTA]` / `[KWOTA ŁĄCZNA]` w odpowiednich szablonach (Aneks 01, Umowa pożyczki U01-04, Tabela opłat 23).
- Historia wygenerowanych dokumentów dla danego leada.

---

## Iteracja 2 — Panel operatora: leady + komunikacja

**Co dostajesz:** `/operator` — operator widzi WSZYSTKIE leady (read-only na razie), klika lead → pełny widok 360°.

**UI:**
- `/operator` — dashboard (liczniki: nowe / w pracy / do oddzwonienia).
- `/operator/leady` — lista wszystkich leadów (filtry: status, źródło, audience, data). Wyszukiwarka po telefonie/emailu/PESEL/NIP.
- `/operator/leady/$id` — widok leada w **maks. czytelnej formie**:
  - dane kontaktowe + przyciski **„Zadzwoń"** (`tel:` — działa z mobila) i **„SMS"**, „Email"
  - timeline `lead_communications` (wszystkie wysłane SMS-y, maile, calle, followupy z statusem dostarczenia/otwarcia/kliknięcia)
  - transkrypty rozmów voicebota (ElevenLabs — z `lead_communications` gdzie `kind = voice_call`)
  - powiązane wnioski (`loan_applications`)
  - dokumenty (wszystko z `documents` + `generated_documents`)
- **Ocena leada dla Mety (CAPI):** w widoku leada przycisk „Oznacz jakość: lead_quality (good/bad/spam)" → server fn wysyła `lead` event do Meta CAPI z `event_source_url` + `lead_id` + wynikiem oceny. Dodaję kolumnę `quality_rating` do `leads`.

---

## Iteracja 3 — Operator: ręczny wniosek + dedup

**Co dostajesz:** operator może z `/operator/leady/$id` (albo z listy) dodać ręcznie wniosek pożyczkowy w imieniu klienta.

**Backend:**
- Server fn `manualCreateApplication({ leadId?, dane })`:
  - Krok 1: dedup po `phone` + `email` + `pesel` + `nip` → zwraca propozycje dopasowania (istniejące leady / wnioski).
  - Krok 2: po potwierdzeniu — jeśli matchujemy istniejący lead, podpinamy; jeśli nie — tworzymy nowy `lead` + `loan_application`.
  - Auto-przypisanie `operator_id` (kto stworzył).
- UI: wizard 3-krokowy (dane → potwierdzenie dopasowania → szczegóły wniosku).

---

## Iteracja 4 — Propozycje od inwestora + integracja z kreatorem

**Co dostajesz:** w `/inwestor` osobna sekcja „Propozycje dla klientów" — inwestor wybiera lead/wniosek i ręcznie wystawia ofertę. Operator widzi to w panelu leada.

**Backend:**
- Rozszerzenie `investor_offers` (jeśli brakuje pól): `loan_application_id`, `commission_amount`, `total_cost_with_commission`, `manual` (bool).
- Powiązanie kreatora dokumentów z konkretną ofertą — przy generowaniu „Umowy pożyczki" pobieramy parametry z `investor_offers` + prowizję.

**UI:**
- `/inwestor/propozycje/nowa` — formularz: wybierz lead → kwota / okres / oprocentowanie / prowizja pośrednika → wystaw.
- W `/operator/leady/$id` sekcja „Propozycje od inwestorów" z przyciskiem „Generuj komplet dokumentów" (umowa U01-04, oświadczenie 777 U05, klauzula RODO U08, KYC U09 — jednym strzałem).

---

## Pytanie blokujące iterację 1

**PDF — jak generujemy?** Cloudflare Worker nie ma LibreOffice. Opcje:
1. **CloudConvert API** (płatne ~$0.01/konwersja) — najbardziej niezawodne, dorzucam jako secret.
2. **Tylko DOCX teraz**, PDF dorobimy gdy podasz preferowane API.
3. **Browser-side** — render DOCX → PDF w przeglądarce (lib `docx-preview` + `html2pdf`) — gorsza jakość, ale 0 kosztów i bez zewnętrznych API.

Napisz **1 / 2 / 3**, a jak masz preferowane API (CloudConvert / inne) — to też powiedz. Zatwierdzasz plan?
