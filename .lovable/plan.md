# Audyt lekcji Akademii inwestora (tylko odczyt) + plan okładek

## 1. Źródło danych
- Tabela `training_videos` (27 opublikowanych rekordów, wszystkie `is_published = true`), pliki w prywatnym buckecie `training-videos`.
- Strona inwestora: `src/routes/inwestor.szkolenia.tsx` (kolejność `sort_order`, potem `created_at desc`). Ta sama lista trafia do `/posrednik/szkolenia`; zarządzanie w `/admin/szkolenia`.
- W bazie NIE ma pól transkrypcji/napisów ani załączników do lekcji. `duration_seconds` jest puste dla wszystkich. Darmowe lekcje (`free_lesson`): 1, 6, 7.

## 2. Spis lekcji (kolejność jak w aplikacji)
Okładka: M1–M7 = wspólny plik `covers/akademia/modul-N.png`; „brak” = pole puste. Rozmiar = plik wideo.

| # | ID | Tytuł | Kategoria | Opis | Plik | MB | Okładka |
|---|---|---|---|---|---|---|---|
| 1 | 9e3b75e6 | 1. Wprowadzenie do rynku pożyczek pod hipotekę | Wprowadzenie | Podstawy rynku pożyczek pod zabezpieczenie hipoteczne — od czego zacząć. | akademia/01-…mp4 | 61 | M1 |
| 2 | 3cc415a2 | 2. Zarabianie na pożyczkach | Strategia | Jak zarabia inwestor — modele przychodu, marża, koszty. | akademia/02-…mp4 | 24 | M1 |
| 3 | 04b49c97 | 3. Strategie inwestycyjne w pożyczkach | Strategia | Krótko/długoterminowe, dywersyfikacja portfela. | akademia/03-…mp4 | 39 | M1 |
| 4 | 65f110b0 | 4. Pośrednictwo inwestycyjne — klucze do skuteczności | Strategia | Jak skutecznie pośredniczyć między inwestorem a klientem. | akademia/04-…mp4 | 75 | M1 |
| 5 | 0ee187e5 | 5. Pozyskiwanie klientów — zalety i wady | Marketing | Kanały pozyskiwania klientów: porównanie i rekomendacje. | akademia/05-…mp4 | 26 | M2 |
| 6 | efc68e02 | 6. Aspekty prawne udzielania pożyczek | Prawo | Najważniejsze regulacje dla pożyczkodawcy. | akademia/06-…mp4 | 20 | M3 |
| 7 | eee9e286 | 7. Interpretacja wyłączeń z ustawy o kredycie konsumenckim | Prawo | Kiedy pożyczka nie podlega ustawie. | akademia/07-…mp4 | 72 | M3 |
| 8 | e7b3e35c | 8. Art. 304 Kodeksu Karnego — wykład | Prawo | Wyzysk: jak go uniknąć i jak czytać przepis. | akademia/08-…mp4 | 65 | M3 |
| 9 | eefecae6 | 9. Lichwa — analiza przepisów i orzecznictwa | Prawo | Limity kosztów pozaodsetkowych i ryzyko lichwy. | akademia/09-…mp4 | 147 | M3 |
| 10 | 48d9dd14 | Możliwości spłaty pożyczek dla inwestorów | inwestor | Spłata z perspektywy inwestora, scenariusze zakończenia. | inwestor/1783731059- | 14 | brak |
| 11 | 425edb3e | 10. Zarządzanie umowami i klientami w nieruchomościach | Operacje | Umowy, dokumenty, klient. | akademia/zarzadzanie-…mp4 | 14 | M4 |
| 12 | 7f3f7965 | Wymagane dokumenty do umowy pożyczki | inwestor | Komplet dokumentów do umowy zabezpieczonej. | inwestor/1783731095- | 7 | brak |
| 13 | 25bc5258 | 11. Analiza nieruchomości jako zabezpieczenia pożyczki | Analiza nieruchomości | Ocena ryzyka i wartości zabezpieczenia. | akademia/11-…mp4 | 30 | M5 |
| 14 | 00e94945 | Jak zawrzeć umowę pożyczki | inwestor | Procedura krok po kroku. | inwestor/1783731115- | 33 | brak |
| 15 | f4967c35 | 12. Różnice w rodzajach nieruchomości | Analiza nieruchomości | Mieszkanie, dom, działka, lokal. | akademia/12-…mp4 | 28 | M5 |
| 16 | bde4ecd9 | Analiza umowy pożyczki dla firm | inwestor | Na co uważać w umowie dla firm. | inwestor/…-analiza-umowy-pozyczki-dla-firm.mp4 | 62 | brak |
| 17 | e5d54c9e | 13. Analiza klientów i decyzji kredytowych | Analiza klienta | Dobry klient i świadoma decyzja. | akademia/13-…mp4 | 22 | M6 |
| 18 | 6a618573 | Oferta dla klientów premium | inwestor | Konstruowanie oferty dla klientów o wyższym profilu. | inwestor/1783731199- | 12 | brak |
| 19 | 47324146 | Optymalizowanie oferty dla klienta | inwestor | Dopasowanie warunków do sprawy. | inwestor/…-optymalizowanie-oferty.mp4 | 20 | brak |
| 20 | 448c26ed | Miękka windykacja — jak podejść do klientów | inwestor | Rozmowy przy opóźnieniach w spłacie. | inwestor/1783730957- | 17 | brak |
| 21 | 767b1b06 | Case study: mieszkanie w Świebodzicach | Case study | Analiza realnego mieszkania jako zabezpieczenia. | akademia/case-…mp4 | 16 | M7 |
| 22 | 7acef86d | Wykup nieruchomości od dłużnika | inwestor | Scenariusz przejęcia — jak i kiedy. | inwestor/1783731003- | 21 | brak |
| 23 | c9f7945f | Case study: nieruchomość w Siemionce | Case study | Wnioski i decyzja. | akademia/case-…mp4 | 9 | M7 |
| 24 | 6af6e38d | Droga cywilno-prawna w praktyce | inwestor | Egzekucja umowy na drodze sądowej. | inwestor/…-droga-cywilno-prawna.mp4 | 24 | brak |
| 25 | efc3e6fd | Case study: nieruchomość w Lipinach | Case study | Wnioski i decyzja. | akademia/case-…mp4 | 40 | M7 |
| 26 | fcc44a65 | Case study: działka w Żelewie | Case study | Analiza działki i decyzja. | akademia/case-…mp4 | 29 | M7 |
| 27 | 73837bb5 | Case study: działka w Strzyżewicach | Case study | Analiza działki pod zabezpieczenie. | akademia/case-…mp4 | 38 | M7 |
| 28 | 25667082 | Case study: Lubań | Case study | Analiza, decyzja, wnioski. | akademia/case-luban.mp4 | 48 | M7 |

(28 wierszy = 19 lekcji „Akademii” + 9 lekcji „inwestor” z lipca; pełne ID w bazie.)

## 3. Treść lekcji — stan wiedzy
- Transkrypcji, napisów ani tekstów materiałów nie ma nigdzie w bazie ani w Storage. Nie oglądałem filmów.
- Wszystko, co dziś wiadomo o treści, wynika WYŁĄCZNIE z tytułu i opisu (tabela wyżej). Analiz 3–5 zagadnień na lekcję nie podaję, bo byłyby zgadywaniem.

## 4. Ustalenia techniczne (okładki)
- Pole: `training_videos.thumbnail_url` (pełny URL). Dziś 19 lekcji wskazuje 7 wspólnych plików modułowych, 9 lekcji „inwestor” nie ma okładki.
- Błąd: bucket `training-videos` jest prywatny, więc publiczne adresy okładek zwracają 404 — obecne okładki nie są możliwe do wyświetlenia.
- Strona inwestora w ogóle nie używa `thumbnail_url`: `<video>` bez `poster`, widać pierwszą klatkę. Okładkę pokazuje tylko panel admina (miniatura 144×80).
- Kadr: `aspect-video` (16:9), `object-contain` na czarnym tle. Siatka: 1 kolumna na telefonie, 2 od `md`. Zalecany plik: 1920×1080 (min. 1280×720), JPG/WebP < 300 KB; tekst w bezpiecznym polu ok. 80% środka, czytelny przy szerokości ~340 px na telefonie.
- Styl strony: nagłówek `FancyPageHeader` („Wiedza inwestora / Akademia inwestora”), karty shadcn, tytuł 2 linie, opis 2 linie, plakietka „Darmowa lekcja”. Logo wyłącznie oficjalne (wordmark / sygnet).
- Kolejność: 10 par lekcji ma ten sam `sort_order` (100–220), więc lekcje „Akademii” i „inwestor” przeplatają się.
- Pliki „inwestor/1783…-” nie mają rozszerzenia (działają jako video/mp4).

## 5. Proponowany dalszy krok (do zatwierdzenia)
1. Transkrypcja: pobrać 28 plików do /tmp, odczytać długość (ffprobe) i wygenerować transkrypcje mową-na-tekst (ElevenLabs, jeśli sekret jest; zużywa kredyty — wymagam Twojej zgody), zapis tylko w /mnt/documents jako raport. Bez zmian w bazie.
2. Na tej podstawie raport: 3–5 zagadnień + główna idea na lekcję, długości.
3. Osobno (po zgodzie): projekt okładek 1920×1080, naprawa wyświetlania (poster w `<video>`, publiczny dostęp do okładek lub podpisane adresy).
