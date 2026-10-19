# Instagram finansowy w liczbach

**Co robią na Instagramie najwięksi twórcy finansowi: pomiar na danych z Instagram Graph API (Business Discovery)**
Dane pobrano 18 października 2026. Raport przygotowano dla Finance You.

---

## Najważniejsze wyniki

1. **Duzi twórcy zagraniczni publikują dużo i niemal wyłącznie rolki.** Zbadano 12 aktywnych kont zagranicznych (z postem w ostatnich 30 dniach). Mediana to **11,9 posta tygodniowo**, z czego **86% to rolki**. Skrajne przypadki: @hormozi publikuje 41,6 posta tygodniowo, @ryanpineda 29, a @codiesanchez i @herfirst100k po ok. 19. Aktywne konta polskie (6 kont) publikują rzadziej: mediana to **5,8 posta tygodniowo**. Częściej też sięgają po karuzele: **54%** postów to karuzele, a rolki to **36%**.
2. **Lejki „skomentuj SŁOWO” to standard.** W podpisach aktywnych kont zagranicznych mediana udziału takich wezwań wynosi **44%**. U @ramit miało je **21 z 21** sprawdzonych podpisów, użytych z 15 różnymi słowami. U @pacemorby było to 91%, u @herfirst100k 84%, a u @biggerpockets 73%. W Polsce mechanizm konsekwentnie stosuje **@marcin_iwuc_fbo (89%)**. Używa też @dorota.sierakowska (36%).
3. **Liczba komentarzy wyraźnie rośnie, gdy słowo kluczowe prowadzi do konkretnego darmowego materiału.** Porównano posty ze słowem kluczowym i bez niego (komentarze na polubienie, siedem kont z co najmniej 3 postami w każdej grupie). Mediana przyrostu to **2,6×**. Rozrzut jest jednak bardzo duży:
   - @erikankullberg: 24× (darmowy warsztat TRAVEL),
   - @dorota.sierakowska: 10,7× (kurs PODSTAWY, webinar BEZPIECZNIE),
   - @herfirst100k: 7,3× (PLAN, CHALLENGE),
   - @ryanpineda: brak efektu, 1,0× (słowo PODCAST),
   - @hormozi: 0,66× (słowo WIN doklejane do niemal każdego posta).
4. **Wezwanie do komentarza nie wiązało się z mniejszymi zasięgami rolek.** Mediana wyświetleń rolek ze słowem kluczowym w porównaniu z rolkami bez niego:
   - @codiesanchez: 166 655 vs 75 224,
   - @erikankullberg: 571 921 vs 292 579,
   - @herfirst100k: 64 656 vs 70 968,
   - @biggerpockets: 7 257 vs 7 335.

   To korelacja, a nie dowód przyczynowy.
5. **Zasięgi rozkładają się bardzo nierówno.** W aktywnych kontach zagranicznych mediana 15,8% rolek przekracza trzykrotność mediany konta, a 10% najlepszych rolek zbiera medianę 43% wszystkich wyświetleń (w polskich kontach 19%). U @hormozi rolki z dwóch stałych wieczornych slotów (16:00 i 19:00 UTC, czyli 18:00 i 21:00 w Warszawie) mają medianę **463 246** wyświetleń. Pozostałe rolki mają medianę **19 660** (n = 23 i n = 40).
6. **Konto Finance You (@filipbielakconsulting) praktycznie nie ma zasięgu.** Ma 4 obserwujących i 27 postów. 15 rolek od 29 września ma medianę **5 wyświetleń**, średnią 9 i maksimum 35. Wszystkie mają 0 polubień. Publikacje są nieregularne: 5 rolek pojawiło się między 29 września, godz. 00:40 UTC, a 30 września, godz. 06:00 UTC. Na tym etapie problemem jest dystrybucja, a nie sama treść (to wniosek z danych).
7. **Polskie konta mają inny profil niż zagraniczne.** Rolki osiągają większy odsetek obserwujących: mediana 13,4% wobec 3,4% za granicą. Prawdopodobnie wynika to z wielkości kont, bo mniejsze konta zwykle mają wyższy stosunek wyświetleń do obserwujących (to wniosek). Karuzele w Polsce zbierają tyle polubień co rolki (mediana stosunku 1,1), a za granicą 3,8 razy więcej. Kilka dużych polskich kont jest obecnie uśpionych:
   - @dla_pieniedzy: 58 dni bez posta,
   - @pani_od_oszczedzania: 92 dni,
   - @inwestomat.eu: 0,5 posta tygodniowo,
   - @filipkowarski: ostatni post w listopadzie 2025.

---

## Metoda i próba

- **Źródło:** endpoint `business_discovery` w Instagram Graph API, wywoływany przez połączone konto Finance You (wyłącznie zapytania GET). Pobrane pola: `timestamp`, `media_type`, `media_product_type`, `like_count`, `comments_count`, `view_count` (tylko rolki), `permalink` i `caption`. Na poziomie profilu: `biography`, `website`, `followers_count` i `media_count`.
- **Próba:** 26 kont, w tym 3 wyłączone jako nieaktywne (@andreijikh, @austinhankwitz, @filipkowarski). Z każdego konta pobrano od 50 do 100 ostatnich postów, łącznie 1 480 postów z metrykami. Podpisy pobrano dla 18–50 najnowszych postów konta (łącznie 587). Kilka bardzo długich podpisów skrócono przy zapisie. Zachowano pierwszą linię i wezwanie do działania, a skrócone podpisy wyłączono ze statystyk długości.
- **Nie udało się pobrać** (`Invalid user id` oznacza błędny handle albo konto osobiste, niewidoczne dla Business Discovery): Vivian Tu (yourrichbff), Caleb Hammer (dostępne tylko konto programu @calebhammershow), Michał Szafrański, Phil Konieczny, Rafał Zaorski i Trader21. Konta „M2 Investments” i „marcinjaworski” odpowiadające tym nazwom to inne podmioty, więc je pominięto. Graham Stephan występuje jako **@gpstephan**, a Ken McElroy jako **@kenmcelroyofficial**. Pełny log znajduje się w `data/_handles_log.json`.
- **Definicje:**
  - Rolki do statystyk wyświetleń muszą mieć co najmniej 72 godziny.
  - Wynik odstający to rolka z co najmniej 3-krotnością mediany wyświetleń danego konta.
  - Słowo kluczowe to wezwanie typu „comment / skomentuj / napisz w komentarzu / DM me” plus słowo, wyciągnięte automatycznie z podpisu.
  - Czas warszawski obejmuje strefę Europe/Warsaw z uwzględnieniem DST.
- **Okna czasowe są nierówne.** Przy kontach bardzo aktywnych 100 postów obejmuje tylko 17–24 dni (oznaczone gwiazdką w tabeli). U kont publikujących rzadko 50 postów sięga ponad roku wstecz.

---

## Tabela podsumowująca

`*` oznacza, że próba obejmuje mniej niż 30 dni, a tempo policzono z całej próby. „Like / wyśw.” i „Kom. / 1000 wyśw.” to mediany dla rolek mających co najmniej 72 godziny.

| Konto | Obserw. | Próba: posty (okres) | Posty/tydz. 30 d | Rolki / karuzele | Mediana wyśw. rolki | Wyśw. / obserw. | Like / wyśw. | Kom. / 1000 wyśw. | „Comment KEYWORD” w podpisach | Dni od ost. posta |
|---|---:|---|---:|---|---:|---:|---:|---:|---|---:|
| @codiesanchez | 3 435 132 | 100 (2026-09-10 – 2026-10-18) | 18.4 | 73% / 27% | 116 776 | 3.4% | 2.3% | 0.60 | 44% (n=50) | 0 |
| @hormozi | 5 100 382 | 100 (2026-10-02 – 2026-10-18) | 41.6* | 82% / 18% | 34 242 | 0.7% | 1.1% | 0.19 | 60% (n=30) | 0 |
| @herfirst100k | 2 282 638 | 100 (2026-09-13 – 2026-10-17) | 19.1 | 84% / 16% | 75 340 | 3.3% | 0.1% | 0.20 | 84% (n=31) | 1 |
| @ramit | 985 411 | 100 (2026-08-26 – 2026-10-18) | 12.4 | 57% / 42% | 46 437 | 4.7% | 0.6% | 0.63 | 100% (n=21) | 0 |
| @humphreytalks | 907 826 | 90 (2026-04-22 – 2026-10-16) | 4.0 | 99% / 1% | 166 262 | 18.3% | 0.9% | 0.30 | 2% (n=50) | 2 |
| @marktilbury | 2 102 968 | 50 (2026-05-30 – 2026-10-15) | 1.6 | 98% / 2% | 413 266 | 19.7% | 1.9% | 0.30 | 7% (n=30) | 3 |
| @erikankullberg | 5 267 462 | 50 (2025-07-16 – 2026-10-17) | 1.4 | 88% / 12% | 560 229 | 10.6% | 2.2% | 0.39 | 40% (n=30) | 1 |
| @gpstephan | 494 392 | 50 (2026-06-23 – 2026-09-13) | 0.0 | 100% / 0% | 141 177 | 28.6% | 1.1% | 0.24 | 3% (n=30) | 35 |
| @nischa.me | 583 402 | 50 (2026-02-20 – 2026-05-29) | 0.0 | 92% / 8% | 43 707 | 7.5% | 1.9% | 0.38 | 0% (n=30) | 142 |
| @minoritymindset | 921 347 | 100 (2026-09-01 – 2026-10-16) | 11.4 | 65% / 28% | 6 078 | 0.7% | 1.2% | 0.20 | 7% (n=30) | 2 |
| @ryanpineda | 477 421 | 100 (2026-09-24 – 2026-10-18) | 29.0* | 98% / 1% | 16 386 | 3.4% | 1.0% | 0.67 | 43% (n=30) | 0 |
| @pacemorby | 751 846 | 50 (2026-09-30 – 2026-10-18) | 19.3* | 94% / 6% | 23 658 | 3.1% | 0.9% | 0.86 | 91% (n=22) | 0 |
| @biggerpockets | 545 353 | 50 (2026-09-12 – 2026-10-16) | 8.9 | 76% / 22% | 7 835 | 1.4% | 0.6% | 1.00 | 73% (n=30) | 2 |
| @kenmcelroyofficial | 90 675 | 50 (2026-08-15 – 2026-10-08) | 4.7 | 92% / 4% | 1 250 | 1.4% | 1.2% | 0.39 | 0% (n=30) | 10 |
| @kubamidel | 221 575 | 50 (2026-09-30 – 2026-10-18) | 19.4* | 86% / 2% | 11 150 | 5.0% | 0.3% | 0.12 | 0% (n=30) | 0 |
| @marcin_iwuc_fbo | 126 010 | 50 (2026-08-18 – 2026-10-18) | 6.8 | 32% / 60% | 22 697 | 18.0% | 1.1% | 0.50 | 89% (n=18) | 0 |
| @dorota.sierakowska | 123 256 | 50 (2026-08-11 – 2026-10-18) | 4.4 | 26% / 74% | 33 959 | 27.6% | 1.3% | 0.42 | 36% (n=25) | 0 |
| @girls.money.club | 47 404 | 50 (2026-08-12 – 2026-10-18) | 4.9 | 40% / 48% | 5 077 | 10.7% | 0.8% | 0.11 | – (nie pobrano) | 0 |
| @independenttrader.pl | 12 922 | 50 (2026-09-17 – 2026-10-17) | 11.0 | 40% / 16% | 1 736 | 13.4% | 1.1% | 0.00 | – (nie pobrano) | 2 |
| @inwestomat.eu | 6 310 | 50 (2026-03-16 – 2026-10-04) | 0.5 | 0% / 96% | – | – | – | – | – (nie pobrano) | 14 |
| @pani_od_oszczedzania | 162 920 | 50 (2025-07-29 – 2026-07-18) | 0.0 | 36% / 62% | 66 914 | 41.1% | 0.6% | 0.53 | 6% (n=18) | 92 |
| @dla_pieniedzy | 200 703 | 50 (2025-02-01 – 2026-08-21) | 0.0 | 94% / 2% | 191 735 | 95.5% | 0.9% | 0.32 | 0% (n=25) | 58 |
| @filipbielakconsulting | 4 | 27 (2026-03-11 – 2026-10-11) | 3.5 | 56% / 4% | 5 | 125.0% | 0.0% | 0.00 | 11% (n=27) | 7 |

Uwaga do ostatniego wiersza: wskaźnik 125% przy 4 obserwujących nie ma znaczenia analitycznego.

---

## 1. Częstotliwość i pory publikacji

- **Konta zagraniczne** (12 aktywnych): mediana 11,9 posta tygodniowo. Rozpiętość jest ogromna, od @erikankullberg (1,4 posta tygodniowo przy medianie 560 tys. wyświetleń rolki) do @hormozi (41,6). Wysoka częstotliwość nie jest warunkiem dużych zasięgów. @marktilbury publikuje 1,6 posta tygodniowo i ma medianę 413 tys. wyświetleń.
- **Konta polskie** (6 aktywnych): mediana 5,8 posta tygodniowo. Najczęściej publikuje @kubamidel (19,4 tygodniowo, z czego wiele to zapowiedzi „Materiał dostępny w całości na kanale”), a po nim @independenttrader.pl (11,0).
- **Pory (czas warszawski, posty z ostatnich 90 dni):**
  - Konta polskie skupiają publikacje między 10:00 a 17:00. Szczyty to **16:00 (33 posty)** i **17:00 (30)**, a poza tym 10:00–14:00 (po 20–23 posty na godzinę).
  - Konta zagraniczne publikują w porze dnia w USA, czyli od 15:00 do 03:00 czasu warszawskiego. Szczyt przypada na **21:00 (125 postów)**, a kolejne godziny to 18:00 (95) i 19:00 (78).
  - @marcin_iwuc_fbo publikuje głównie o 17:00 i 16:00 (23 i 16 z 50 postów), a @dorota.sierakowska rano i w południe (10:00–15:00).
  - Finance You publikuje najczęściej o **17:00** (15 z 27 postów), czyli w polskim szczycie.
- **Stałe sloty.** Część kont publikuje o stałych godzinach z dokładnością do minut. @nischa.me publikowała zwykle o 17:00–17:02 UTC, a @minoritymindset o 19:00, 22:00 i 23:45 UTC. Dane sugerują harmonogram planowany narzędziem (to wniosek).

## 2. Rolki a karuzele

- **Za granicą dominują rolki** (mediana udziału 86%). Karuzele, jeśli się pojawiają, zbierają medianę **3,8×** więcej polubień niż rolki tego samego konta. Przykłady: @codiesanchez (karuzele 10 038, rolki 2 752), @ramit (643 vs 248), @hormozi (13 590 vs 285).
- **W Polsce karuzele to główny format edukacyjny.** Udział karuzel wynosi 74% u @dorota.sierakowska, 60% u @marcin_iwuc_fbo i 96% u @inwestomat.eu. Stosunek polubień karuzel do rolek: 2,4× u @dorota.sierakowska (837 vs 346), 0,81× u @marcin_iwuc_fbo (204 vs 253), a mediana dla aktywnych kont polskich to 1,1×.
- **Zastrzeżenie:** Business Discovery nie podaje zasięgu ani wyświetleń karuzel. Polubienia na obserwującego to jedyna wspólna miara, a karuzele trafiają głównie do obecnych obserwujących (to wniosek). Wyższa liczba polubień karuzeli nie oznacza więc większego zasięgu.
- **Rolki z dużą liczbą wyświetleń i prawie bez polubień.** U @herfirst100k **44 z 81** dojrzałych rolek miało co najmniej 5 000 wyświetleń przy współczynniku polubień poniżej 0,1%. Ich mediana wyświetleń to 55 879, a pozostałych rolek 114 027. Przykład: 10-11, 1 733 927 wyświetleń i 468 polubień. Podobnie wyglądają posty sponsorowane: @humphreytalks / GM, 2 086 799 wyświetleń i 111 polubień, oraz @gpstephan / Meta, 6 484 846 wyświetleń i 8 841 polubień. **Wniosek:** to prawdopodobnie płatnie promowane albo testowe („trial”) rolki pokazywane osobom spoza obserwujących. API tego nie oznacza, więc nie da się tego potwierdzić.

## 3. Co łączy rolki o wynikach odstających

- Wykryto **144 wyniki odstające** (co najmniej 3× mediana konta). Podpisy były dostępne dla 41 z nich. Najwięcej należało do @hormozi (25), @humphreytalks (16), @ryanpineda i @herfirst100k (po 14), @dla_pieniedzy (12), @ramit (11) i @codiesanchez (10).
- **Pierwsze linie wyników odstających** porównano ze wszystkimi 385 dojrzałymi rolkami z podpisem:
  - kwota pieniędzy: 17% vs 10%,
  - pytanie: 17% vs 21%,
  - liczba: 22% vs 23%,
  - „you / Ty”: 29% vs 43%.

  Wyniki odstające mają nieco częściej kwotę w pierwszej linii, a rzadziej zwrot do odbiorcy. Sam format pierwszej linii nie tłumaczy jednak wyniku.
- **Powtarzające się wzorce** (na podstawie odczytu pierwszych linii, to interpretacja):
  - **Historia lub spór o pieniądze z konkretną osobą albo instytucją:**
    - @marktilbury: „The bank just refused to give my money back!”, 17 253 649 wyświetleń (41,7× mediany),
    - @codiesanchez: „A bank once offered Daymond John a $1.3 billion credit line…”, 4 749 334 (40,7×),
    - @gpstephan: „He Pays $400 For A Haircut”, 525 464 (3,7×).
  - **Kamienie milowe w kwotach:** @humphreytalks, „After you hit $100,000, the next money milestone…”, 770 553 (4,6×), a także „Once you hit 250k…” i „50k changes everything…”.
  - **Treści osobiste lub obyczajowe zamiast eksperckich:**
    - @kubamidel: „Mrożona pizza z żabki czy proste żarcie z ognia?”, 150 858 (13,5× mediany), powrót do treningów 70 142 (6,3×), „Mieszkanie po 12 latach najmu. Kupione za 105…”, 68 274 (6,1×),
    - @pacemorby: esej o „re-entry shock”, 1 089 717 (46,1×).
  - **Kontrowersja wobec znanej postaci:** @herfirst100k, „he would be so mad if he knew…” (o Dave’ie Ramseyu), 1 733 927 (23×).
  - **Współprace płatne:** GM (@humphreytalks), Meta (@gpstephan) i Alior (@pani_od_oszczedzania, 224 598, 3,4×). Bardzo prawdopodobne, że były wspierane budżetem (to wniosek).
- **Polityka w Polsce.** U @dla_pieniedzy większość wyników odstających to komentarze polityczne i newsowe („To się dzieje naprawdę…”, 1 816 739; „Trump porządkuje ulice”, 829 520). To nie są treści finansowe.
- **Pora publikacji.** U @hormozi pora tłumaczy więcej niż treść. Rolki ze slotów 16:00 i 19:00 UTC miały medianę 463 246 wyświetleń, a pozostałe 19 660. 8 z 30 sprawdzonych podpisów składało się wyłącznie z „Comment the word “WIN” to get a free scaling roadmap”. **Wniosek:** dwie „główne” rolki dziennie i wiele materiałów pomocniczych lub testowych.

## 4. Lejki „skomentuj SŁOWO” (ManyChat i podobne narzędzia)

**Kto i jak:**

| Konto | Udział podpisów z keyword | Najczęstsze słowa (liczba) |
|---|---:|---|
| @ramit | 100% (21/21) | CHALLENGE 3, NEWSLETTER 2, JOURNAL 2, DATING 2, CSP 2, AUDIT, MINDSET, MONEY MINDSET, MONEY TALK, DEBT, CALM, SCRIPTS, DECADE, PODCAST, START |
| @pacemorby | 91% | READY 7, DEAL 6, PARK 3, PODCAST 2, RV, SPRINT |
| @marcin_iwuc_fbo | 89% | KURS 4, WYZWANIE 3, FINANSE 2, RANKING, OBLIGACJE, KREDYT, SYSTEM, ETAP, WEBINAR, NAWYKI |
| @herfirst100k | 84% | PLAN 6, CHALLENGE 6, SYSTEM 6, PATH 4, CARDRECS, HYSA100, FLASH50, AUTO |
| @biggerpockets | 73% | BPCON 7, MYND 3 (sponsor), POD 2, ANDRES, TURNKEY, VALUE ADD, ANGIE, STRATEGY, YIELD, ROOKIE, ESTIMATE, FOOTBALL |
| @hormozi | 60% | WIN 18 |
| @codiesanchez | 44% | SCALE 15, BIGDEAL/BIG DEAL 5, OWN, BUY, GROW |
| @ryanpineda | 43% | PODCAST 11, M19, KINGDOM |
| @erikankullberg | 40% | TRAVEL 7, WORKSHOP 2, STUDENT, FINE PRINT, TOKYO |
| @dorota.sierakowska | 36% | PODSTAWY 7, BEZPIECZNIE 2, RODZAJ, CZYTAM |
| @humphreytalks | 2% | GUIDE 1 (zamiast tego „Let me know in the comments” w 54% podpisów) |
| @kubamidel, @nischa.me, @kenmcelroyofficial, @dla_pieniedzy | 0% | – |

**Typowe obietnice po słowie kluczowym:**
- darmowy plan lub PDF (PLAN, GUIDE),
- warsztat lub webinar na żywo (TRAVEL, SCALE, WEBINAR, BEZPIECZNIE),
- wyzwanie kilkudniowe (CHALLENGE, WYZWANIE),
- link do odcinka (PODCAST, BIGDEAL, ETAP),
- ranking lub zestawienie (RANKING u @marcin_iwuc_fbo, YIELD u @biggerpockets),
- kod lub oferta partnera (HYSA100, INCOGNI, MYND),
- sprzedaż kursu (KURS, PODSTAWY, FLASH50).

**Formuły językowe:**
- angielskie: „Comment X and I’ll send you…”, „Follow me + comment X” (u @herfirst100k „follow” pojawia się w 68% podpisów), „Comment or DM me X”;
- polskie: „Skomentuj 👉 KURS, aby dowiedzieć się więcej”, „Napisz w komentarzu RANKING, a wyślę Ci…”, „Skomentuj post słowem 👉 ETAP, a wyślę Ci link do filmu w wiadomości prywatnej”.

**Czy liczba komentarzy rośnie (sygnał lejka)?** Porównano komentarze na polubienie w postach ze słowem kluczowym i bez niego. Mediany przy co najmniej 3 postach w każdej grupie:

| Konto | Z keyword | Bez keyword | Krotność | n (z / bez) |
|---|---:|---:|---:|---|
| @erikankullberg | 0,485 | 0,020 | 24,0× | 12 / 18 |
| @dorota.sierakowska | 0,330 | 0,031 | 10,7× | 9 / 16 |
| @herfirst100k | 0,274 | 0,038 | 7,3× | 25 / 5 |
| @biggerpockets | 0,309 | 0,118 | 2,6× | 22 / 8 |
| @codiesanchez | 0,026 | 0,017 | 1,6× | 22 / 28 |
| @ryanpineda | 0,065 | 0,063 | 1,0× | 13 / 16 |
| @hormozi | 0,025 | 0,038 | 0,66× | 18 / 11 |

Mediana krotności to **2,6×**. @marcin_iwuc_fbo ma 13× (0,234 vs 0,018), ale tylko 2 posty bez słowa kluczowego, więc wynik jest niewiarygodny. Liczba komentarzy na 1 000 wyświetleń rolek:
- @erikankullberg: 5,99 vs 0,30 (n = 9 i 16),
- @biggerpockets: 1,53 vs 1,01,
- @codiesanchez: 0,54 vs 0,41.

**Posty, w których komentarze przekraczają połowę polubień** (w tej grupie sporo jest wzrostów wywołanych słowem kluczowym):
- @herfirst100k: 26 na 100 postów, np. karuzela z 3 763 komentarzami przy 1 252 polubieniach,
- @dorota.sierakowska: 10 na 50 (1 721 komentarzy przy 1 043 polubieniach),
- @marcin_iwuc_fbo: 9 na 50 (rolka: 634 komentarze, 359 polubień),
- @erikankullberg: 5 na 50 (14 052 komentarze, 8 500 polubień),
- @pani_od_oszczedzania: 7 na 50 (4 591 komentarzy, 1 410 polubień).

**Wniosek** (interpretacja, nie pomiar przyczynowy): wzrost komentarzy jest duży, gdy:
- słowo kluczowe prowadzi do **konkretnego, darmowego i opisanego materiału lub wydarzenia** (warsztat, plan, wyzwanie, webinar),
- pojawia się **nie w każdym poście** albo różni się zależnie od tematu (@ramit używa 15 słów w 21 postach).

Efekt znika, gdy słowo zamienia się w stały dopisek (WIN u @hormozi) albo prowadzi tylko do odcinka podcastu (PODCAST u @ryanpineda).

**Inne wezwania do działania (CTA):**
- „link in bio” jest rzadki za granicą (mediana 0%). Wyjątek to @erikankullberg (37%, równolegle ze słowami kluczowymi).
- „save this” pojawia się rzadko (najwyżej 6,5%, u @herfirst100k).
- Prośby o udostępnienie są marginalne (do 7%).

## 5. Konta polskie a zagraniczne

| Miara (mediana aktywnych kont) | Zagraniczne (12) | Polskie (6) |
|---|---:|---:|
| Posty / tydzień | 11,9 | 5,8 |
| Udział rolek / karuzel | 86% / 14% | 36% / 54% |
| Wyświetlenia rolki / obserwujący | 3,4% | 13,4% (n=5) |
| Polubienia / wyświetlenia (rolki) | 1,03% | 1,08% (n=5) |
| Komentarze / 1000 wyświetleń (rolki) | 0,4 | 0,1 (n=5) |
| Udział podpisów ze słowem kluczowym | 44% | 36% (n=3 konta z podpisami) |
| Mediana długości podpisu (znaki) | 287 | 104 (n=3) |
| Polubienia karuzeli / rolki | 3,8× | 1,1× |
| Udział rolek ≥3× mediany | 15,8% | 6,2% (n=5) |
| Oznaczenia reklam / partnerstw w podpisach | 3,3% | 10% (n=3) |
| Zastrzeżenia („nie stanowi porady”, ryzyko) | 0% | 3,3% (n=3) |

**Najważniejsze obserwacje:**
- **Słowa kluczowe w Polsce działają już w niszy finansowej.** Najbardziej konsekwentnie stosuje je @marcin_iwuc_fbo, łącznie z rankingiem kredytów hipotecznych sponsorowanym przez pośrednika: „Napisz w komentarzu RANKING…”, oznaczone „[reklama_HipotekaDirect]”. To najbliższy Finance You temat w próbie.
- **Polscy twórcy jawnie oznaczają autopromocję:** „[marka własna]”, „#markawłasna”, „#autopromocja” (50% sprawdzonych podpisów @kubamidel, 28% u @dorota.sierakowska). U zagranicznych kont takich oznaczeń nie ma.
- **Polscy twórcy rzadziej publikują rolki.** Rolki @marcin_iwuc_fbo (mediana 22 697) i @dorota.sierakowska (33 959) osiągają jednak 18–28% liczby obserwujących, czyli kilka razy więcej niż rolki dużych kont zagranicznych.
- **Konta firmowe lub redakcyjne mają niskie zasięgi.** Dotyczy to zarówno kont polskich, jak i zagranicznych: @independenttrader.pl (mediana 1 736), @girls.money.club (5 077), @biggerpockets (7 835 przy 545 tys. obserwujących), @kenmcelroyofficial (1 250 przy 90,7 tys.) i @minoritymindset (6 078 przy 921 tys., 77% postów bez podpisu). Konta oparte na marce osobistej mają wyższe wskaźniki (to wniosek z porównania, nie test).

## 6. Punkt odniesienia: Finance You

- **Konto:** @filipbielakconsulting („Filip Bielak | Finansowanie Firm”): 4 obserwujących, 1 obserwowany, 27 postów. Link w bio prowadzi do `filipbielak.pl/wezpozyczkelanding/`. Bio jest skierowane do **pożyczkobiorców** („Kapitał pod zastaw nieruchomości… Złóż bezpłatny wniosek”), a rolki od 29 września do **inwestorów**.
  - Konto @finance.you należy do innego podmiotu („Finance U”, 11 obserwujących).
  - Handle @financeyou nie jest dostępny jako konto firmowe lub twórcy.
- **Zasięg:** 15 rolek (od 2026-09-29 do 2026-10-11) ma medianę 5 wyświetleń, średnią 9 i maksimum 35. Wszystkie mają 0 polubień, a 4 rolki mają po 1 komentarzu. 12 grafik z marca i kwietnia ma łącznie 3 polubienia.
- **Rytm:** 3,5 posta tygodniowo w ostatnich 30 dniach, ale skokowo. 5 rolek opublikowano w ciągu 30 godzin (2026-09-29 00:40 UTC – 2026-09-30 06:00 UTC), a następnie od 3 do 11 października publikowano codziennie o 15:10–15:20 UTC.
- **Podpisy:** mediana 400 znaków, czyli dłuższe niż mediana kont zagranicznych (287). Statystyki:
  - zastrzeżenia w 26% (np. „Materiał edukacyjny, nie stanowi oferty ani rekomendacji inwestycyjnej. Inwestowanie wiąże się z ryzykiem utraty kapitału”),
  - „Obserwuj” w 26%,
  - słowo kluczowe WNIOSEK w 3 grafikach z marca i kwietnia, ale w żadnej rolce dla inwestorów.
- **Pierwsze linie:** październikowe są konkretne, np. „Pożyczasz 1,1 mln zł pod nieruchomość wartą 1 mln zł?” albo „Czy wiesz, że kolejność hipotek decyduje…”. Wrześniowe były ogólnikowe („Zainwestuj w stabilność!”, „Szukasz bezpiecznego sposobu na pomnażanie kapitału?”). Jedna z nich mówi o „stabilnych zyskach i minimalnym ryzyku”.
- **Wniosek:** przy 4 obserwujących i wyświetleniach na poziomie kilku sztuk konto praktycznie nie trafia do osób spoza obserwujących. Dane o treści (pierwsze linie, długość, słowa kluczowe) nie pozwalają jeszcze ocenić, co działa, bo nie ma czego mierzyć.

---

## 7. Wnioski dla Finance You

Wnioski dotyczą rolek inwestorskich 20–45 s z awatarem AI i B-rollem oraz gotowych lejków z hasłem w komentarzu. Punkty oznaczone **[pomiar]** wynikają bezpośrednio z danych. Punkty **[wniosek]** to rekomendacje oparte na interpretacji.

1. **Najpierw dystrybucja, potem optymalizacja treści.** [pomiar] Mediana 5 wyświetleń na rolkę oznacza, że testy hooków i słów kluczowych nic nie pokażą. [wniosek] Zanim cokolwiek zostanie uznane za działające, warto:
   - wybrać jedno docelowe konto marki (inwestorskie) z handle’em i bio pod inwestora, zamiast konta „Finansowanie Firm” z linkiem do wniosku o pożyczkę;
   - przez 2–4 tygodnie testować płatną promocję 2–3 najlepszych rolek do grup inwestorskich (Meta Ads);
   - publikować rolki jako współpracę (Collab) z kontem osobistym Filipa i z partnerami lub pośrednikami z sieci;
   - zaplanować rolki testowe pokazywane osobom spoza obserwujących.

   Duże wyświetlenia przy znikomych polubieniach u @herfirst100k, a także w postach sponsorowanych @humphreytalks i @gpstephan, wskazują, że duzi twórcy też dokupują zasięg albo testują rolki poza obserwującymi. To wniosek, którego API nie potwierdza.
2. **Słowo kluczowe tylko z konkretnym materiałem.** [pomiar] Wzrost komentarzy jest największy (7–24×) tam, gdzie słowo prowadzi do konkretnego darmowego materiału lub wydarzenia. Bliski zera jest tam, gdzie słowo dopisano do wszystkiego. [wniosek] Każdy lead magnet Finance You powinien mieć osobne słowo i być nazwany w podpisie. Pomysły:
   - LTV: kalkulator lub checklista LTV przed wpłatą,
   - KSIĘGA: jak czytać dział IV,
   - UMOWA: na co patrzeć w umowie pożyczki,
   - RANKING: zestawienie zabezpieczeń i oprocentowań, jak u @marcin_iwuc_fbo.

   W jednym tygodniu warto używać 2–4 różnych słów (u @ramit było 15 słów w 21 postach). Sprawdzona polska formuła brzmi: „Skomentuj 👉 LTV, a wyślę Ci [nazwa materiału] w wiadomości prywatnej”. Wezwanie powinno być w podpisie, a jak sądzimy, także na ekranie w ostatnich 3 s rolki.
3. **Częstotliwość.** [pomiar] Aktywne konta polskie publikują średnio 5,8 posta tygodniowo, a zagraniczne 11,9. Szczyt polskich publikacji przypada na 16:00–17:00 czasu warszawskiego. [wniosek] Dla Finance You realne i wystarczające jest 5–7 postów tygodniowo, w tym 4–5 rolek i 1–2 karuzele, w stałych slotach około 16:00–17:00. Lepiej unikać serii po kilka rolek w ciągu doby, takich jak 29 i 30 września.
4. **Karuzele do edukacji inwestora.** [pomiar] Polskie konta edukacyjne opierają się na karuzelach (@dorota.sierakowska 74%, @marcin_iwuc_fbo 60%). Karuzele zbierają tam tyle samo lub więcej polubień co rolki, a lejki komentarzowe u @dorota.sierakowska i @herfirst100k działają bardzo dobrze właśnie w karuzelach. [wniosek] Seria „Czy wiesz, że…” (kolejność hipotek, zastaw vs hipoteka, LTV) nadaje się na karuzele ze słowem kluczowym. Rolki z awatarem mogą służyć do docierania poza obserwujących, a karuzele do pozyskiwania kontaktów.
5. **Pierwsza linia z konkretną liczbą lub sytuacją.** [pomiar] W wynikach odstających kwota w pierwszej linii występuje częściej (17% vs 10%). Najmocniejsze tematy to konflikt z bankiem lub osobą, kamień milowy w złotych i historia z życia. [wniosek] Warto stawiać na konkret w rodzaju „1,1 mln zł pod mieszkanie warte 1 mln zł”, opowieść inwestora (anonimizowana i za zgodą) albo spór typu „bank odmówił, prywatny pożyczkodawca…”. Ogólniki w rodzaju „Zainwestuj w stabilność!” lepiej porzucić.
6. **Twarz i marka osobista.** [pomiar] Konta firmowe i redakcyjne mają w próbie najniższe wskaźniki wyświetleń na obserwującego (1,4% @biggerpockets, 1,4% @kenmcelroyofficial, 0,7% @minoritymindset). Najsilniejsze konta to marki osobiste. [wniosek] Awatar AI wygląda podobnie jak „konto firmowe”. Warto testować co trzecią rolkę z prawdziwym Filipem lub inwestorem (np. Daniel Siwiec za zgodą i w ustalonych granicach) i porównywać medianę wyświetleń w tej samej porze publikacji.
7. **Zgodność z przepisami jako przewaga, nie hamulec.** [pomiar] Zagraniczni twórcy prawie nie stosują zastrzeżeń (mediana 0%). Polscy oznaczają reklamę i autopromocję („[reklama_…]”, „#markawłasna”, „#autopromocja”), a Finance You dodaje zastrzeżenie w 26% podpisów. [wniosek] Zastrzeżenie o ryzyku warto zostawić w każdym poście inwestorskim, a treści o własnej ofercie oznaczać jako autopromocję. Należy usunąć sformułowania „minimalne ryzyko”, „bezpieczny zwrot” i „stabilne zyski” z wrześniowych podpisów. Przy produkcie inwestycyjnym to ryzyko regulacyjne i wizerunkowe, a polscy twórcy z próby takich zwrotów unikają.
8. **Mierzenie we własnym zakresie.** [wniosek] Business Discovery pokazuje tylko polubienia, komentarze i wyświetlenia. Dla własnego konta trzeba co tydzień zbierać z Insights: zasięg, zapisania, udostępnienia, kontakty z profilu, wiadomości prywatne po słowie kluczowym oraz konwersję DM → e-mail → rozmowa (`list_lead_magnet_triggers`, `list_lead_magnet_signups`). Słowa kluczowe i formaty warto porównywać po 3–4 tygodniach.

---

## Czego dane nie mówią

- **Brak zasięgu, zapisań, udostępnień, czasu oglądania, wizyt w profilu i obserwujących z posta.** Business Discovery udostępnia tylko polubienia, komentarze, `view_count` (rolki) i dane profilu. Nie wiadomo, ile komentarzy pod postami ze słowem kluczowym zamieniło się w wiadomości prywatne, e-maile czy sprzedaż.
- **Brak informacji o płatnej promocji i rolkach testowych.** Rolki z dużymi wyświetleniami i znikomymi polubieniami interpretujemy jako promowane albo testowe, ale API tego nie oznacza.
- **Ukryte polubienia.** Pojedyncze posty nie mają `like_count` (np. @nischa.me 2026-05-05). Część niskich wartości może też wynikać z ustawień autora.
- **Dobór próby i survivorship bias.** Wybrano największe i najbardziej znane konta. Konta osobiste (np. Vivian Tu, Szafrański, Konieczny) są niewidoczne dla API. Wnioski nie opisują typowego twórcy finansowego, lecz tych, którzy odnieśli sukces i używają kont firmowych lub twórcy.
- **Posty wciąż zbierają wyświetlenia.** Rolki młodsze niż 72 godziny wyłączono, ale nawet starsze, zwłaszcza z ostatnich 2 tygodni, mogą jeszcze rosnąć. Konta publikujące często mają w próbie relatywnie świeże posty, co zaniża ich mediany.
- **Nierówne okna czasowe.** Dla kont z 40 postami tygodniowo próba obejmuje 17 dni, a dla kont publikujących rzadko ponad rok. Porównania tempa i mediany wyświetleń między kontami są przybliżone.
- **Podpisy to podzbiór.** Analizę podpisów oparto na 18–50 najnowszych postach konta, a dla 3 polskich kont nie pobrano jej wcale. Klasyfikacja wezwań, hooków i reklam jest automatyczna (wyrażenia regularne) i może zawierać pojedyncze błędy.
- **Korelacja, nie przyczynowość.** Porównania „ze słowem kluczowym / bez” i „pierwsza linia z kwotą / bez” nie kontrolują tematu, pory publikacji ani promocji. Komentarze pod postami ze słowem kluczowym są z definicji zawyżone przez sam mechanizm (każdy zainteresowany wpisuje słowo), więc rosnąca liczba komentarzy nie oznacza większego zaangażowania w treść.
- **Dane z jednego dnia.** Stan na 18 października 2026. Metryki zmieniają się z każdym dniem.

---

## Pliki

- Surowe dane, jeden plik JSON na konto: `/home/claude/research_notes/Instagram finansowy/data/`. Log handle’i: `data/_handles_log.json`.
- Skrypty (uruchamiane przez `python3 -I`): `/home/claude/research_notes/Instagram finansowy/scripts/analyze.py`, `extra_checks.py` i `make_table.py`.
- Wyniki obliczeń: `/home/claude/research_notes/Instagram finansowy/analysis_output.json`.
