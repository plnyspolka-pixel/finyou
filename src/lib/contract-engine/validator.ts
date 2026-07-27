/**
 * Walidacja danych wejściowych — DWIE warstwy (port `validator.py`):
 *   1. Schemat (zod) — kształt, typy, wzorce.
 *   2. Reguły biznesowe — spójność, której schemat nie wyrazi (R1–R27).
 *
 * Warstwa 2 jest ważniejsza: łapie dane, które przechodzą walidację formalną,
 * ale dają umowę wewnętrznie sprzeczną. Poziom BLAD blokuje generowanie,
 * OSTRZEZENIE wymaga potwierdzenia operatora.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { umowaSchema } from "./schema";

export type Poziom = "BLAD" | "OSTRZEZENIE";

export interface Problem {
  poziom: Poziom;
  sciezka: string;
  komunikat: string;
}

// ── Warstwa 1 — schemat (zod) ──────────────────────────────────
export function walidujSchemat(dane: unknown): Problem[] {
  const res = umowaSchema.safeParse(dane);
  if (res.success) return [];
  return res.error.issues.map((e) => ({
    poziom: "BLAD" as const,
    sciezka: e.path.map(String).join(".") || "(korzeń)",
    komunikat: e.message,
  }));
}

// ── pomocnicze ─────────────────────────────────────────────────
function naLiczbe(s: string): number {
  const v = parseFloat(String(s).replace(/ /g, "").replace(/,/g, "."));
  if (Number.isNaN(v)) throw new Error("NaN");
  return v;
}
function naLiczbeBezp(txt: unknown): number | null {
  const v = parseFloat(String(txt).replace(/ /g, "").replace(/,/g, "."));
  return Number.isNaN(v) ? null : v;
}
// odpowiednik pythonowego f"{x:,.2f}" — grupowanie tysięcy przecinkiem
function fmt(x: number): string {
  const neg = x < 0;
  const s = Math.abs(x).toFixed(2);
  const [int, dec] = s.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + "." + dec;
}

// ── Warstwa 2 — reguły biznesowe ───────────────────────────────
export function walidujReguly(d: any): Problem[] {
  const P: Problem[] = [];
  const blad = (sc: string, k: string) => P.push({ poziom: "BLAD", sciezka: sc, komunikat: k });
  const ostrz = (sc: string, k: string) =>
    P.push({ poziom: "OSTRZEZENIE", sciezka: sc, komunikat: k });

  const nier: any[] = d.nieruchomosci ?? [];
  const por = d.porecziciel ?? null;
  const _pb = d.pozyczkobiorca;
  const pbLista: any[] = Array.isArray(_pb) ? _pb : _pb ? [_pb] : [];
  const zab = d.zabezpieczenia ?? {};

  // R1: unikalność ID
  const ids = nier.map((n) => n.id);
  if (ids.length !== new Set(ids).size)
    blad("nieruchomosci", "Zduplikowane identyfikatory nieruchomości");

  // R2: unikalność numerów KW
  const kws = nier.map((n) => n.nr_kw);
  if (kws.length !== new Set(kws).size)
    blad("nieruchomosci", "Ta sama księga wieczysta wskazana wielokrotnie");

  nier.forEach((n, i) => {
    const sc = `nieruchomosci[${i}]`;

    // R3
    if (n.wlasciciel_ref === "osoba_trzecia" && !n.wlasciciel_dane)
      blad(sc, "wlasciciel_ref='osoba_trzecia' wymaga wypełnienia wlasciciel_dane");

    // R4
    if (n.wlasciciel_ref === "porecziciel" && por === null)
      blad(sc, "wlasciciel_ref='porecziciel', ale poręczyciel nie został zdefiniowany");

    // R5
    const hip = n.hipoteka ?? {};
    if (hip.pierwszenstwo === "oproznione_miejsce") {
      if (!hip.oproznione_miejsce_po)
        blad(
          `${sc}.hipoteka`,
          "pierwszenstwo='oproznione_miejsce' wymaga pola oproznione_miejsce_po",
        );
      const usuwane = (n.obciazenia ?? []).filter((o: any) =>
        ["wykreslenie_przed_wyplata", "wykreslenie_ze_srodkow_pozyczki"].includes(
          o.sposob_usuniecia,
        ),
      );
      if (usuwane.length === 0)
        blad(
          `${sc}.hipoteka`,
          "Wpis na opróżnione miejsce, ale żadne obciążenie tej nieruchomości nie jest oznaczone do wykreślenia",
        );
    }

    // R6
    if (hip.pierwszenstwo === "pierwsze") {
      const pozostajace = (n.obciazenia ?? []).filter(
        (o: any) =>
          o.dzial === "IV" &&
          ["brak", "pozostaje_akceptowane"].includes(o.sposob_usuniecia ?? "brak"),
      );
      if (pozostajace.length)
        blad(
          `${sc}.hipoteka`,
          `Zadeklarowano pierwsze miejsce hipoteczne, ale na nieruchomości pozostaje ${pozostajace.length} niewykreślona hipoteka — pierwszeństwo będzie inne niż zakładane`,
        );
    }

    // R18: zakres obciążenia w obrębie KW
    const zakres = n.zakres ?? "cala_kw";
    const dzialki: string[] = n.dzialki_w_kw ?? [];
    const doOdlaczenia: string[] = n.dzialki_do_odlaczenia ?? [];

    if (zakres === "po_odlaczeniu") {
      if (doOdlaczenia.length === 0) {
        blad(sc, "zakres='po_odlaczeniu' wymaga wskazania dzialki_do_odlaczenia");
      } else {
        const nieznane = doOdlaczenia.filter((x) => dzialki.length && !dzialki.includes(x));
        if (nieznane.length)
          blad(sc, `Działki do odłączenia nieujawnione w dzialki_w_kw: ${nieznane.join(", ")}`);
        if (dzialki.length && setEq(new Set(doOdlaczenia), new Set(dzialki)))
          ostrz(
            sc,
            "Do odłączenia wskazano wszystkie działki z KW — odłączenie jest wtedy zbędne, wystarczy zakres='cala_kw'",
          );
      }
      ostrz(
        sc,
        "Hipoteka ma objąć działki wymagające odłączenia do odrębnej księgi wieczystej. Postępowanie wieczystoksięgowe trwa obecnie ok. roku — do czasu jego zakończenia hipoteki nie da się ustanowić na tych działkach. Rozważ zakres='cala_kw' albo uwzględnij ten czas w harmonogramie uruchomienia",
      );
    }

    if (zakres === "cala_kw" && dzialki.length > 1)
      ostrz(
        sc,
        `KW obejmuje ${dzialki.length} działek — hipoteka obciąży je wszystkie (nie da się obciążyć wybranej działki bez odłączenia jej do nowej KW)`,
      );

    (n.obciazenia ?? []).forEach((o: any, j: number) => {
      const osc = `${sc}.obciazenia[${j}]`;
      const sposob = o.sposob_usuniecia ?? "brak";

      // R7
      if (sposob === "zrzeczenie_uprawnionego" && !o.uprawniony_do_zrzeczenia)
        blad(
          osc,
          "sposob_usuniecia='zrzeczenie_uprawnionego' wymaga wypełnienia uprawniony_do_zrzeczenia",
        );

      // R8
      if (sposob === "wykreslenie_ze_srodkow_pozyczki") {
        if (!o.kwota_splaty) blad(osc, "Spłata ze środków pożyczki wymaga podania kwota_splaty");
        if (!o.wierzyciel_rachunek)
          ostrz(osc, "Brak rachunku wierzyciela — w umowie pojawi się placeholder");
      }

      // R9
      if (
        ["egzekucja_administracyjna", "hipoteka_przymusowa"].includes(o.rodzaj) &&
        ["brak", "pozostaje_akceptowane"].includes(sposob)
      )
        ostrz(
          osc,
          "Wpis egzekucyjny/hipoteka przymusowa pozostaje na nieruchomości. Należności publicznoprawne mogą mieć pierwszeństwo przed hipoteką umowną — rozważ warunek wykreślenia przed wypłatą",
        );

      // R10
      if (
        ["dozywocie", "sluzebnosc_osobista"].includes(o.rodzaj) &&
        ["brak", "pozostaje_akceptowane"].includes(sposob)
      )
        ostrz(
          osc,
          "Służebność osobista/dożywocie pozostaje na nieruchomości — istotnie obniża wartość egzekucyjną zabezpieczenia",
        );
    });
  });

  // R11: suma spłat wierzycieli
  try {
    const kwotaPoz = naLiczbe(d.warunki.kwota_pozyczki.cyframi);
    let sumaSplat = 0;
    for (const n of nier)
      for (const o of n.obciazenia ?? [])
        if (o.sposob_usuniecia === "wykreslenie_ze_srodkow_pozyczki" && o.kwota_splaty)
          sumaSplat += naLiczbe(o.kwota_splaty.cyframi);
    if (sumaSplat > kwotaPoz)
      blad(
        "warunki.kwota_pozyczki",
        `Suma spłat wierzycieli (${fmt(sumaSplat)}) przekracza Kwotę Pożyczki (${fmt(kwotaPoz)})`,
      );
    else if (sumaSplat > 0 && kwotaPoz - sumaSplat < 0.1 * kwotaPoz)
      ostrz(
        "warunki.kwota_pozyczki",
        `Po spłacie wierzycieli pożyczkobiorcy pozostaje ${fmt(kwotaPoz - sumaSplat)} zł (<10% kwoty pożyczki)`,
      );
  } catch {
    /* brak danych — pomijamy */
  }

  // R19: charakter hipoteki
  const charakter = zab.charakter_hipoteki ?? "laczna";
  if (charakter === "odrebna" && nier.length > 1) {
    try {
      const kwoty = new Set(nier.map((n) => n.hipoteka.kwota.cyframi));
      if (kwoty.size === 1)
        ostrz(
          "zabezpieczenia.charakter_hipoteki",
          "Hipoteki odrębne, ale każda opiewa na tę samą kwotę — sprawdź, czy nie chodziło o hipotekę łączną (art. 76 u.k.w.h.)",
        );
    } catch {
      /* ignore */
    }
  }

  // R20: podział nieruchomości już obciążonej
  nier.forEach((n, i) => {
    if (n.zakres === "po_odlaczeniu") {
      const istniejace = (n.obciazenia ?? []).filter((o: any) => o.dzial === "IV");
      if (istniejace.length)
        ostrz(
          `nieruchomosci[${i}]`,
          "Odłączenie działki z nieruchomości obciążonej hipoteką: hipoteka z mocy prawa stanie się łączna i obciąży również nowo powstałą nieruchomość. Bezciężarowe odłączenie wymaga zgody wierzyciela hipotecznego",
        );
    }
  });

  // R21: spójność zgód małżonka poręczyciela
  if (por && por.typ === "osoba_fizyczna") {
    const wspolnosc = por.ustroj_majatkowy === "wspolnosc_ustawowa";
    const zgoda = por.zgoda_malzonka;
    const zakresPor = por.zakres_odpowiedzialnosci ?? "rzeczowa_i_osobista";

    if (wspolnosc && (zgoda === null || zgoda === undefined))
      blad(
        "porecziciel.zgoda_malzonka",
        "Poręczyciel we wspólności ustawowej wymaga wypełnienia zgoda_malzonka (na_hipoteke i na_poreczenie) — od tego zależy zakres egzekucji",
      );

    if (!wspolnosc && zgoda !== null && zgoda !== undefined)
      ostrz(
        "porecziciel.zgoda_malzonka",
        "Wypełniono zgodę małżonka, choć poręczyciel nie pozostaje we wspólności ustawowej — zgoda nie jest wtedy wymagana",
      );

    if (wspolnosc && zgoda) {
      const wnosiNieruchomosc = nier.some((n) => n.wlasciciel_ref === "porecziciel");
      if (wnosiNieruchomosc && !zgoda.na_hipoteke)
        blad(
          "porecziciel.zgoda_malzonka.na_hipoteke",
          "Poręczyciel wnosi nieruchomość jako zabezpieczenie, ale małżonek nie wyraził zgody na ustanowienie hipoteki (art. 37 § 1 pkt 1 k.r.o.) — hipoteka nie powstanie",
        );

      if (zakresPor === "rzeczowa_i_osobista" && !zgoda.na_poreczenie)
        ostrz(
          "porecziciel.zgoda_malzonka.na_poreczenie",
          "Brak zgody małżonka na poręczenie: poręczenie pozostaje w mocy, ale egzekucja ogranicza się do majątku osobistego poręczyciela (art. 41 § 2 k.r.o.) — majątek wspólny jest wyłączony",
        );

      if (zakresPor === "rzeczowa" && zgoda.na_poreczenie)
        ostrz(
          "porecziciel.zakres_odpowiedzialnosci",
          "Małżonek wyraził zgodę na poręczenie, ale zakres ustawiono na 'rzeczowa' — poręczenie osobiste nie zostanie ujęte w umowie mimo dostępnej zgody",
        );
    }
  }

  // R22: poręczyciel bez nieruchomości i bez odpowiedzialności osobistej
  if (por && por.zakres_odpowiedzialnosci === "rzeczowa") {
    if (!nier.some((n) => n.wlasciciel_ref === "porecziciel"))
      blad(
        "porecziciel.zakres_odpowiedzialnosci",
        "Poręczyciel odpowiada wyłącznie rzeczowo, ale żadna nieruchomość nie ma go jako właściciela — nie ma z czego prowadzić egzekucji",
      );
  }

  // R23-R27: forma prawna, reprezentacja, uchwały korporacyjne
  const podmioty: [string, any, boolean][] = [];
  pbLista.forEach((o, i) => {
    if (o && o.typ === "podmiot_gospodarczy")
      podmioty.push([pbLista.length > 1 ? `pozyczkobiorca[${i}]` : "pozyczkobiorca", o, true]);
  });
  if (por && por.typ === "podmiot_gospodarczy") podmioty.push(["porecziciel", por, false]);
  const _pd = d.pozyczkodawca;
  if (_pd && _pd.typ === "podmiot_gospodarczy") podmioty.push(["pozyczkodawca", _pd, false]);
  for (const n of nier) {
    const wl = n.wlasciciel_dane;
    if (n.wlasciciel_ref === "osoba_trzecia" && wl && wl.typ === "podmiot_gospodarczy")
      podmioty.push([`nieruchomosci[${n.id}].wlasciciel_dane`, wl, false]);
  }

  const FORMY_KAPITALOWE = new Set(["sp_z_oo", "sa", "prosta_sa"]);

  for (const [etykieta, o, jestDluznikiem] of podmioty) {
    const forma = o.forma ?? "inna";

    // R23
    if (forma === "spolka_cywilna") {
      if (!o.wspolnicy_sc)
        blad(
          `${etykieta}.wspolnicy_sc`,
          "Spółka cywilna nie ma podmiotowości prawnej — stroną Umowy są wszyscy wspólnicy. Wypełnij wspolnicy_sc, inaczej umowa zostanie zawarta z podmiotem, który nie istnieje w obrocie prawnym",
        );
      if (o.krs)
        ostrz(
          `${etykieta}.krs`,
          "Spółka cywilna nie podlega wpisowi do KRS — sprawdź, czy nie chodzi o spółkę jawną",
        );
    }

    // R24: reprezentacja
    const rep = o.reprezentacja;
    const repLista: any[] = Array.isArray(rep) ? rep : rep ? [rep] : [];
    if (forma !== "spolka_cywilna" && repLista.length === 0)
      blad(
        `${etykieta}.reprezentacja`,
        "Podmiot niebędący osobą fizyczną wymaga wskazania osób reprezentujących",
      );
    if (o.reprezentacja_laczna && repLista.length < 2)
      blad(
        `${etykieta}.reprezentacja_laczna`,
        "Zadeklarowano reprezentację łączną, ale wskazano mniej niż dwie osoby",
      );
    for (const r of repLista) {
      if (r && ["pełnomocnik", "prokurent"].includes(r.funkcja) && !r.podstawa)
        ostrz(
          `${etykieta}.reprezentacja`,
          `${r.funkcja} bez wskazania podstawy umocowania — notariusz zażąda dokumentu`,
        );
    }

    // R25: kapitał zakładowy a próg z art. 230 k.s.h.
    if (FORMY_KAPITALOWE.has(forma)) {
      const kap = o.kapital_zakladowy;
      if (!kap) {
        if (jestDluznikiem)
          ostrz(
            `${etykieta}.kapital_zakladowy`,
            "Brak kapitału zakładowego — nie da się sprawdzić progu z art. 230 k.s.h. (zobowiązanie > 2× kapitał wymaga uchwały wspólników)",
          );
      } else {
        const kapV = naLiczbeBezp(kap.cyframi);
        const kwotaV = naLiczbeBezp(d.warunki?.kwota_pozyczki?.cyframi);
        const uZob = o.uchwala_zobowiazanie ?? {};
        if (jestDluznikiem && kapV && kwotaV && kwotaV > 2 * kapV) {
          if (!uZob.wymagana && !uZob.wylaczona_umowa_spolki)
            ostrz(
              `${etykieta}.uchwala_zobowiazanie`,
              `Kwota Pożyczki (${fmt(kwotaV)}) przekracza dwukrotność kapitału zakładowego (${fmt(kapV)}) — art. 230 k.s.h. wymaga uchwały wspólników, chyba że umowa spółki stanowi inaczej. Brak uchwały NIE powoduje nieważności (art. 17 § 1 k.s.h. jest wyłączony), ale rodzi odpowiedzialność zarządu`,
            );
        }
      }
    }

    // R26: uchwała na obciążenie nieruchomości (art. 228 pkt 4 k.s.h.)
    const wnosiNieruchomosc = nier.some(
      (n) =>
        (n.wlasciciel_ref === "osoba_trzecia" && n.wlasciciel_dane === o) ||
        (n.wlasciciel_ref === "porecziciel" && o === por) ||
        (n.wlasciciel_ref === "pozyczkobiorca" && jestDluznikiem),
    );
    if (wnosiNieruchomosc && (FORMY_KAPITALOWE.has(forma) || forma === "spoldzielnia")) {
      const uNier = o.uchwala_nieruchomosc;
      if (uNier === null || uNier === undefined)
        blad(
          `${etykieta}.uchwala_nieruchomosc`,
          "Spółka kapitałowa obciąża nieruchomość hipoteką — wypełnij uchwala_nieruchomosc. Brak wymaganej uchwały (art. 228 pkt 4 k.s.h.) skutkuje NIEWAŻNOŚCIĄ czynności (art. 17 § 1 k.s.h.)",
        );
      else if (uNier.wymagana && !uNier.wylaczona_umowa_spolki && !uNier.przedlozona)
        ostrz(
          `${etykieta}.uchwala_nieruchomosc`,
          "Uchwała na obciążenie nieruchomości wymagana i jeszcze nieprzedłożona — dodano warunek zawieszający. Bez niej czynność będzie nieważna (art. 17 § 1 k.s.h.)",
        );
    }

    // R27: uchwała przedłożona bez danych
    for (const pole of ["uchwala_zobowiazanie", "uchwala_nieruchomosc"]) {
      const u = o[pole];
      if (u && u.przedlozona && !(u.data || u.numer))
        ostrz(
          `${etykieta}.${pole}`,
          "Uchwała oznaczona jako przedłożona, ale bez daty i numeru — nie da się jej jednoznacznie zidentyfikować w umowie",
        );
    }
  }

  // R12: poddanie się egzekucji przez podmioty, których nie ma
  const poddaje: string[] = zab.egzekucja_777?.poddaje_sie ?? [];
  if (poddaje.includes("porecziciel") && por === null)
    blad(
      "zabezpieczenia.egzekucja_777",
      "Poręczyciel wskazany w poddaje_sie, ale nie zdefiniowano poręczyciela",
    );
  if (poddaje.includes("wlasciciel_osoba_trzecia")) {
    if (!nier.some((n) => n.wlasciciel_ref === "osoba_trzecia"))
      blad(
        "zabezpieczenia.egzekucja_777",
        "Wskazano właściciela-osobę trzecią, ale żadna nieruchomość nie ma takiego właściciela",
      );
  }

  // R13: kwota hipoteki vs kwota pożyczki
  try {
    const kwotaPoz = naLiczbe(d.warunki.kwota_pozyczki.cyframi);
    nier.forEach((n, i) => {
      const kh = naLiczbe(n.hipoteka.kwota.cyframi);
      if (kh < kwotaPoz)
        ostrz(
          `nieruchomosci[${i}].hipoteka`,
          `Kwota hipoteki (${fmt(kh)}) niższa niż Kwota Pożyczki (${fmt(kwotaPoz)}) — zabezpieczenie nie pokrywa kapitału`,
        );
    });
  } catch {
    /* ignore */
  }

  // R16: spójność harmonogramu
  const h = d.warunki?.harmonogram ?? {};
  if (h.typ === "balonowy" && !h.kwota_raty_koncowej)
    blad("warunki.harmonogram", "Harmonogram balonowy wymaga podania kwota_raty_koncowej");
  if ((h.liczba_rat ?? 0) > 0 && Array.isArray(h.raty) && h.raty.length > 0) {
    if (h.raty.length !== h.liczba_rat)
      blad(
        "warunki.harmonogram.raty",
        `Zadeklarowano ${h.liczba_rat} rat, a tabela zawiera ${h.raty.length}`,
      );
  }

  // R17: stan cywilny vs ustrój majątkowy
  const osoby: [string, any][] = pbLista.map((o, i) => [
    pbLista.length > 1 ? `pozyczkobiorca[${i}]` : "pozyczkobiorca",
    o,
  ]);
  osoby.push(["porecziciel", por]);
  for (const [etykieta, osoba] of osoby) {
    if (osoba && osoba.typ === "osoba_fizyczna") {
      if (osoba.stan_cywilny === "zonaty_zamezna" && !osoba.ustroj_majatkowy)
        ostrz(
          etykieta,
          "Osoba w związku małżeńskim bez określonego ustroju majątkowego — nie da się ustalić, czy wymagana jest zgoda małżonka",
        );
    }
  }

  return P;
}

function setEq(a: Set<any>, b: Set<any>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ── kombinacja obu warstw ──────────────────────────────────────
export function waliduj(dane: any): Problem[] {
  return [...walidujSchemat(dane), ...walidujReguly(dane)];
}
