# Sklep inwestora — uruchomienie procesów zakupowych i zgodności

Stan: 2 listopada 2026. Wdrożenie kodu jest odrębne od publikacji domeny. Ten plik jest checklistą techniczną, nie opinią prawną.

## Już zaimplementowane
- Publiczne metadane 28 lekcji i aktualnych wzorów bez ujawniania plików.
- Jedyny bezpłatny dokument: osobny szablon umowy pożyczki B2B bez załączników i danych osobowych (DOCX), dostęp bez logowania.
- Reguła „zaakceptuj raz na wersję”: pełny regulamin sklepu i odrębna umowa powierzenia, zapis treści, wersji, SHA-256 i dowodów akceptacji w tabeli prywatnej; każda aktualizacja wymaga nowej akceptacji.
- Identyfikacja administratora danych przy DPA, brak pre-checked checkboxów; osobna zgoda na rozpoczęcie dostarczania treści cyfrowych i informacja o odstąpieniu.
- Transakcyjne potwierdzenie przyjęcia aktualnej wersji umów z dokładną treścią e-mailem; awaria e-mail nie unieważnia trwałego zapisu.
- Formularz zamówienia, historia zleceń i zakupów. Gdy Tpay nie jest uprawniony do sprzedaży SKU, użytkownik składa zapisane w bazie zamówienie do potwierdzenia, system wysyła e-maile. Nie tworzymy fikcyjnej płatności.
- Potwierdzanie transakcji Tpay serwer-serwer, walidacja kwoty i identyfikatora; atomowy, idempotentny zapis uprawnień w SQL.
- Odtwarzanie opłaconej lekcji z prywatnym 15-minutowym URL; odrębny kreator dla opłaconego wzoru, podpisy DOCX z prywatnym plikiem. Użycie danych osób trzecich wymaga aktualnej DPA i odpowiedniego uprawnienia.
- Dotychczasowy 10-stopniowy pipeline inwestora (KYC, PEP, AML, NDA, umowa ramowa, RODO) jest niezależny i nie został obejściem ominięty.

## Flagi bezpieczeństwa — domyślnie wyłączone
- `STORE_PAYMENTS_ENABLED=true` — aktywacja płatności jednostkowych Tpay. Nie włączać w izolacji.
- `STORE_SELLER_CONFIRMED=true` — dopiero po pisemnym potwierdzeniu, że rachunek i konto Tpay należą do rzeczywistego sprzedawcy danych produktów.
- `STORE_SELLER_LEGAL_NAME=` — pełna legalna nazwa sprzedawcy wyświetlana przed opłaceniem. Wymagana, bez niej checkout pozostaje nieaktywny.
- `STORE_INVOICING_READY=true` — dopiero po zaprojektowaniu, wdrożeniu i przetestowaniu poprawnego wystawiania faktur dla *nowych* SKU. Obecny abonament nie zastępuje tych obowiązków.
- `STORE_DPA_PROCESSING_ENABLED=true` — dopiero po weryfikacji umów art. 28 RODO z realnymi podprocesorami, celów AI, transferów i retencji oraz kompletności obowiązków informacyjnych. Przedtem funkcja generująca dokumenty z powierzonych danych pozostaje zamknięta.

## Otwarte elementy wymagające zweryfikowania
1. Właściwy sprzedawca i fakturowanie: Fundacja obsługuje dotychczas abonament, narzędzia świadczy Finance You sp. z o.o. Ustalić, kto sprzedaje lekcje/dokumenty/analizy i dokonać odpowiednich rozliczeń VAT i podatkowych. Osobna infrastruktura faktur/receipts dla sklepu.
2. Regulamin i DPA: przed aktywacją płatności i wprowadzaniem danych osób trzecich — finalny przegląd przez prawnika; adresy sprzedawcy i administratorów, limity retencji, podprocesorzy i mechanizmy zgody, szczególne kategorie danych; zaakceptowana wersja nie może być podmieniana.
3. DPA/AI: dokumentacja umów z dostawcami (Supabase, Cloudflare/Lovable, dostawcą LLM i podpisu, CMD/EasyMKW, Resend, Didit i innymi faktycznie użytymi). Ich rola jako procesor albo odrębny administrator musi być ustalona osobno. Sprawdzić transfery poza EOG i wyłączenie trenowania modeli.
4. KW 99 zł: etap generacji raportu po opłaceniu, zlecenie pobrania EKW, asynchroniczny status (z techniczną idempotencją), audyt, retencja, pobieranie PDF przez konkretnego kupującego, polityka zwrotów przy błędach i braku księgi. Na razie przycisk jedynie waliduje numer i nie nalicza opłat.
5. Obsługa zgód konsumenckich i usług cyfrowych: trwały nośnik potwierdzający wszystkie oświadczenia, dokumenty wymagane ustawą o prawach konsumenta, prawo odstąpienia przy częściowo rozpoczętych usługach, reklamacje, rozliczenie niewykonanych świadczeń.
6. Integracja z e-podpisem: istniejący moduł podpisu ma odmienne wymogi kwalifikacji formy; nie mieszać „kliknięcia DPA” z kwalifikowanym podpisem dokumentu pożyczkowego.
7. Zlecenie okazji: wymaga istniejącego pipeline; przejście do panelu może wymagać aktywnego abonamentu i ważnej weryfikacji AML. Nie obiecywać gwarantowanych 5 propozycji.
8. Test pełnego zakupu po podłączeniu właściwego konta Tpay: realna transakcja testowa/autoryzowana, webhook, uprawnienie, faktura, potwierdzenie klienta, pozycja w historii oraz obsługa zwrotu i chargeback.

## Zasady niezastępowalne
- Wszystkie ceny rozstrzyga serwer, a uprawnienia powstają wyłącznie po weryfikacji płatności.
- Żaden checkbox nie jest wstępnie zaznaczony; akceptacja DPA nie jest ogólną „zgodą RODO”.
- Nie można przekazywać wrażliwych plików, raportów KW ani adresów podpisu przez publiczny endpoint.
- Projekt nie usuwa umów już zawartych przez istniejących inwestorów.
- Nie tworzyć ani aktywować wtyczek, nie uruchamiać Tpay i przetwarzania cudzych danych bez zamknięcia otwartych punktów.

## Kontrola po publikacji
- `/sklep` — film pierwszy na telefonie; koszyk i pięć modułów.
- `/sklep/zgody` — dokumenty do pobrania, akceptacja po logowaniu.
- `/api/public/store/free-loan-agreement` — DOCX bez danych i załączników.
- `/sklep/zamowienie` — najpierw elektroniczna akceptacja, potem zgłoszenie do potwierdzenia albo Tpay po aktywacji.
- `/sklep/zakupy` — własne zamówienia i uprawnienia.
- `/inwestor/umowy` — niezmieniony pipeline weryfikacji i zawarcia umów.
