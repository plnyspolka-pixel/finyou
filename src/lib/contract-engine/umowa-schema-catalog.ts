// Katalog schematu `UmowaData` w formie opisu dla modeli AI — wspólny dla
// agenta umowy (/inwestor) i narzędzi MCP. Opis danych, nie treść umowy.
export const KATALOG_SCHEMATU = `
KORZEŃ: { meta, pozyczkodawca, pozyczkobiorca, porecziciel?, warunki, nieruchomosci[], zabezpieczenia, wniosek?, protokol_negocjacji? }

meta: { data_umowy "DD.MM.RRRR", miejscowosc (miejscownik, np. "Lublinie"), numer_umowy? }

STRONA (pozyczkodawca; pozyczkobiorca może być tablicą 1–6 stron):
- osoba fizyczna: { typ:"osoba_fizyczna", imie_nazwisko, firma? (nazwa JDG), dzialalnosc? ("gospodarstwo_rolne" dla rolnika prowadzącego gospodarstwo), pesel (11 cyfr), nip? (10 cyfr — przy wspólnym gospodarstwie rolnym NIP tylko u jednego przedstawiciela), regon?, dokument_tozsamosci?, adres, telefon?, email?, stan_cywilny? ("kawaler_panna"|"zonaty_zamezna"|"rozwiedziony"|"wdowiec"), ustroj_majatkowy? ("wspolnosc_ustawowa"|"rozdzielnosc"|"wspolnosc_umowna") }
- podmiot gospodarczy: { typ:"podmiot_gospodarczy", nazwa, forma? ("jdg"|"spolka_cywilna"|"spolka_jawna"|"spolka_partnerska"|"spolka_komandytowa"|"spolka_komandytowo_akcyjna"|"sp_z_oo"|"prosta_sa"|"sa"|"spoldzielnia"|"fundacja"|"stowarzyszenie"|"inna"), forma_prawna?, krs? (10 cyfr), nip?, regon?, adres, reprezentacja: [{ imie_nazwisko, pesel?, funkcja (np. "prezes zarządu"), podstawa? }], reprezentacja_laczna?, kapital_zakladowy? {cyframi, slownie}, wspolnicy_sc? (dla s.c.: tablica osób fizycznych), uchwala_zobowiazanie?, uchwala_nieruchomosc? { wymagana, organ?, przedlozona?, data?, numer?, wylaczona_umowa_spolki? } }

porecziciel?: jak strona + zakres_odpowiedzialnosci? ("rzeczowa"|"rzeczowa_i_osobista") + zgoda_malzonka? { na_hipoteke, na_poreczenie }

warunki: {
  kwota_pozyczki {cyframi}, prowizja { kwota {cyframi}, model? ("nie_potracana_raty" domyślnie | "potracana_z_wyplaty") },
  oprocentowanie (string, JEDNO miejsce po przecinku, np. "15,5"), cel (min. 5 znaków),
  harmonogram { liczba_rat (1–360), typ ("balonowy"|"rowne_raty"|"malejace"), data_pierwszej_raty "DD.MM.RRRR", dzien_miesiaca (1–28), kwota_raty? {cyframi} (przy typie balonowym = pułap raty miesięcznej — WYMAGANA do policzenia rat), kwota_raty_koncowej_docelowa? {cyframi} (tylko balonowy: docelowa ostatnia rata, np. kapitał + pułap — silnik sam dobierze prowizję do grosza i nadpisze warunki.prowizja.kwota) },
  rachunki { wyplata (nr rachunku pożyczkobiorcy), splata (nr rachunku pożyczkodawcy; gdy pożyczkodawcą jest Finance You i pole jest puste, system wstawi 56 1090 2590 0000 0001 5708 1371) }
}

nieruchomosci[≥1]: { nr_kw (np. "LU1I/00123456/7"), sad (np. "Sąd Rejonowy Lublin-Zachód w Lublinie"), opis, rodzaj? ("lokal"|"dom"|"dzialka_budowlana"|"grunt_rolny"|"lokal_uzytkowy"|"inne"), wlasciciel_ref ("pozyczkobiorca"|"porecziciel"|"osoba_trzecia"), wlasciciel_dane? (strona, gdy osoba_trzecia), wlasciciel_index? (indeks pożyczkobiorcy-właściciela), wspolwlasnosc? { rodzaj ("laczna_malzenska"|"ulamkowa"), wspolwlasciciele: [{ imie_nazwisko, pesel?, udzial? (np. "1/2" przy ułamkowej) }] }, obciazenia?: [{ dzial ("III"|"IV"), rodzaj ("hipoteka_umowna"|"hipoteka_przymusowa"|"sluzebnosc_osobista"|"sluzebnosc_gruntowa"|"dozywocie"|"roszczenie"|"egzekucja_sadowa"|"egzekucja_administracyjna"|"najem_dzierzawa"|"zakaz_zbywania"|"inne"), opis, wierzyciel? (np. "Skarb Państwa — KRUS"), kwota? (np. "38 450,00"), sposob_usuniecia? ("brak"|"wykreslenie_przed_wyplata"|"wykreslenie_ze_srodkow_pozyczki"|"zrzeczenie_uprawnionego"|"pozostaje_akceptowane"), kwota_splaty? {cyframi}, wierzyciel_rachunek? }], hipoteka { kwota {cyframi}, pierwszenstwo ("pierwsze"|"kolejne"|"oproznione_miejsce"), oproznione_miejsce_po? }, zakres? ("cala_kw"|"po_odlaczeniu"), dzialki_w_kw?, dzialki_do_odlaczenia?, roszczenie_oproznione_miejsce? (bool) }

zabezpieczenia: { egzekucja_777 { kwota {cyframi}, poddaje_sie: ["pozyczkobiorca"|"porecziciel"|"wlasciciel_osoba_trzecia"], data_graniczna "DD.MM.RRRR", termin_wezwania_dni? (np. 7) }, charakter_hipoteki? ("laczna"|"odrebna") }

wniosek?: { pep? (bool: false = wnioskodawca nie jest PEP, true = jest), aml_ocena_ryzyka? ("niskie"|"srednie"|"wysokie"), aml_powyzej_15000_eur? (bool) } — pola wniosku o pożyczkę; nieustalone zostają do zaznaczenia przy podpisie.

protokol_negocjacji?: { data_od? "DD.MM.RRRR", data_do? "DD.MM.RRRR" (domyślnie data umowy), posrednik? { imie_nazwisko, telefon? }, formy? ["telefonicznie"|"elektronicznie"|"posrednik"|"osobiscie"] (domyślnie z telefonu/e-maila pożyczkobiorcy i pośrednika) } — Załącznik nr 2.`;
