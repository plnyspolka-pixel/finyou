// Krajowy Rejestr Zadłużonych — tablica obwieszczeń (portal publiczny).
// Typy odpowiedzi nieoficjalnego API SPA (ustalone 2026-11-06 na podstawie
// ruchu przeglądarki; brak oficjalnej dokumentacji, pola mogą się zmienić).

/** Wiersz z wyszukiwania po dacie (`/api/v1/obwieszczenie/wyszukaj-po-dacie`). */
export type KrzSearchRow = {
  idZewnetrzny: string;
  dataObwieszczenia: string;
  dataWydaniaPostanowienia?: string;
  dataUprawomocnienia?: string;
  numerObwieszczenia: string;
  sygnaturaPostepowania: string;
  sadWydajacyPostanowienie: string;
  nazwaWydzialu?: string;
  imie?: string;
  nazwisko?: string;
  nazwaPodmiotu?: string;
  podkategoriaObwieszczenia: string;
  /** U — upadłość, R — restrukturyzacja, Z — inne/zakaz. */
  rodzajSprawy: string;
  dokumentUuidSpr?: string;
};

export type KrzSearchResponse = {
  czyPrzekroczono: boolean;
  iloscWBazie: number;
  iloscPozycjiWyswietlanych: number;
  grupaKategoriiKategorieObweszczeniaResponse: Array<{
    tytul: string;
    kolejnosc: number;
    kategorie: Array<{
      tytul: string;
      kolejnosc: number;
      obwieszczenia: KrzSearchRow[];
    }>;
  }>;
};

/** Spłaszczony wiersz listy z nazwą grupy i kategorii. */
export type KrzNotice = KrzSearchRow & {
  grupa: string;
  kategoria: string;
};

export type KrzEntityKind = "osoba_fizyczna" | "podmiot" | "nieznany";

/** Szczegóły z `/api/v1/obwieszczenie/xml?id=…` — bez PESEL. */
export type KrzNoticeDetail = {
  idZewnetrzny: string;
  sygnaturaAkt: string | null;
  numerObwieszczenia: string | null;
  dataObwieszczenia: string | null;
  tytul: string | null;
  sad: string | null;
  wydzial: string | null;
  czasWygenerowania: string | null;
  podmiot: {
    rodzaj: KrzEntityKind;
    nazwa: string | null;
    imie: string | null;
    nazwisko: string | null;
    miejscowosc: string | null;
    kraj: string | null;
    formaPrawna: string | null;
    prowadziDzialalnosc: boolean | null;
    krs: string | null;
    nip: string | null;
  };
  atrybuty: Record<string, string>;
  doradcy: Array<{
    zdarzenie: string | null;
    zdarzenieKod: string | null;
    tytul: string | null;
    imie: string | null;
    nazwisko: string | null;
    nazwa: string | null;
    nrLicencji: string | null;
    krs: string | null;
  }>;
  /** Treść obwieszczenia jako tekst (HTML zdjęty, PESEL zamaskowany). */
  tresc: string;
};

/** Wynik klasyfikacji AI jednego obwieszczenia. */
export type KrzAiAnalysis = {
  etap:
    | "wniosek"
    | "zabezpieczenie"
    | "otwarcie"
    | "ogloszenie_upadlosci"
    | "oddalenie"
    | "uklad"
    | "plan_splaty"
    | "umorzenie"
    | "zakonczenie"
    | "inne";
  rodzajPodmiotu: "konsument" | "jdg" | "spolka" | "inny";
  streszczenie: string;
  kluczoweFakty: string[];
  terminDlaWierzycieli: string | null;
  sygnalRyzyka: "niski" | "sredni" | "wysoki";
  uzasadnienieRyzyka: string;
  /** Czy obwieszczenie może dotyczyć kogoś, kogo Finyou powinno sprawdzić (pożyczkobiorca, dłużnik, kontrahent). */
  wartoSprawdzicWBazie: boolean;
  identyfikatory: { krs: string | null; nip: string | null };
};
