/**
 * Warstwa faktów pochodnych + oznaczenia stron — port z `renderer.py`.
 *
 * Wszystkie warunki w bibliotece klauzul odwołują się WYŁĄCZNIE do faktów
 * budowanych tutaj albo do ścieżek w danych — nigdy do surowego tekstu. To tu
 * żyje logika „kiedy co się stosuje".
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONSONANT_END = /[bcdfghjklmnprstwzżźćń]$/;

// ── odmiana imion i nazwisk ────────────────────────────────────
export function odmienBiernik(imieNazwisko: string): string {
  const slowa = (imieNazwisko || "").split(/\s+/).filter(Boolean);
  const kobieta = slowa.length > 0 && slowa[0].trim().toLowerCase().endsWith("a");
  return slowa
    .map((w, idx) => {
      const low = w.toLowerCase();
      if (low.endsWith("ski") || low.endsWith("cki") || low.endsWith("dzki")) return w + "ego";
      if (low.endsWith("ska") || low.endsWith("cka") || low.endsWith("dzka"))
        return w.slice(0, -1) + "ą";
      if (low.endsWith("a")) return w.slice(0, -1) + "ę";
      if (!kobieta && idx === 0 && low.endsWith("eł")) return w.slice(0, -2) + "ła"; // Paweł → Pawła
      if (CONSONANT_END.test(low) || low.endsWith("ł")) return kobieta && idx > 0 ? w : w + "a";
      return w;
    })
    .join(" ");
}

export function odmienDopelniacz(imieNazwisko: string): string {
  const slowa = (imieNazwisko || "").split(/\s+/).filter(Boolean);
  const kobieta = slowa.length > 0 && slowa[0].trim().toLowerCase().endsWith("a");
  return slowa
    .map((w, idx) => {
      const low = w.toLowerCase();
      if (low.endsWith("ski") || low.endsWith("cki") || low.endsWith("dzki")) return w + "ego";
      if (low.endsWith("ska") || low.endsWith("cka") || low.endsWith("dzka"))
        return w.slice(0, -1) + "iej";
      if (low.endsWith("a")) return w.slice(0, -1) + "y";
      if (!kobieta && idx === 0 && low.endsWith("eł")) return w.slice(0, -2) + "ła"; // Paweł → Pawła
      if (CONSONANT_END.test(low) || low.endsWith("ł")) return kobieta && idx > 0 ? w : w + "a";
      return w;
    })
    .join(" ");
}

export function rodzajZenski(imieNazwisko: string): boolean {
  if (!imieNazwisko) return false;
  return imieNazwisko.split(/\s+/)[0].trim().toLowerCase().endsWith("a");
}

/**
 * Płeć osoby fizycznej do odmiany rodzaju gramatycznego: pole `plec`, a gdy
 * go brak — PESEL (przedostatnia cyfra parzysta = kobieta), a gdy i tego brak
 * — końcówka imienia. Podmiot gospodarczy → rodzaj męski (rzeczownik
 * „Pożyczkobiorca”).
 */
export function plecOsoby(o: any): "K" | "M" {
  if (!o || (o.typ && o.typ !== "osoba_fizyczna")) return "M";
  if (o.plec === "K" || o.plec === "M") return o.plec;
  const pesel = String(o.pesel ?? "");
  if (peselPoprawny(pesel)) return Number(pesel[9]) % 2 === 0 ? "K" : "M";
  return rodzajZenski(String(o.imie_nazwisko ?? "")) ? "K" : "M";
}

/** PESEL z poprawną cyfrą kontrolną (wagi 1-3-7-9). */
export function peselPoprawny(pesel: string): boolean {
  if (!/^\d{11}$/.test(pesel)) return false;
  const wagi = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const suma = wagi.reduce((acc, w, i) => acc + w * Number(pesel[i]), 0);
  return (10 - (suma % 10)) % 10 === Number(pesel[10]);
}

export function jestKobieta(o: any): boolean {
  return plecOsoby(o) === "K";
}

// Nazwy rodzajów obciążeń z działów III/IV — do klauzuli o stanie obciążeń.
const RODZAJ_OBCIAZENIA: Record<string, string> = {
  hipoteka_umowna: "hipoteka umowna",
  hipoteka_przymusowa: "hipoteka przymusowa",
  sluzebnosc_osobista: "służebność osobista",
  sluzebnosc_gruntowa: "służebność gruntowa",
  dozywocie: "prawo dożywocia",
  roszczenie: "roszczenie",
  egzekucja_sadowa: "wzmianka o egzekucji sądowej",
  egzekucja_administracyjna: "wzmianka o egzekucji administracyjnej",
  najem_dzierzawa: "najem/dzierżawa",
  zakaz_zbywania: "zakaz zbywania",
  inne: "inne obciążenie",
};

const ORGAN_NAZWA: Record<string, string> = {
  zgromadzenie_wspolnikow: "zgromadzenia wspólników",
  walne_zgromadzenie: "walnego zgromadzenia",
  rada_nadzorcza: "rady nadzorczej",
  wspolnicy: "wspólników",
  komplementariusze: "komplementariuszy",
};

const FORMA_NAZWA: Record<string, string> = {
  jdg: "",
  spolka_cywilna: "spółka cywilna",
  spolka_jawna: "sp. j.",
  spolka_partnerska: "sp. p.",
  spolka_komandytowa: "sp. k.",
  spolka_komandytowo_akcyjna: "S.K.A.",
  sp_z_oo: "sp. z o.o.",
  prosta_sa: "P.S.A.",
  sa: "S.A.",
  spoldzielnia: "spółdzielnia",
  fundacja: "fundacja",
  stowarzyszenie: "stowarzyszenie",
  inna: "",
};

const FUNKCJA_DOP: Record<string, string> = {
  "prezes zarządu": "prezesa zarządu",
  "wiceprezes zarządu": "wiceprezesa zarządu",
  "członek zarządu": "członka zarządu",
  prokurent: "prokurenta",
  pełnomocnik: "pełnomocnika",
  wspólnik: "wspólnika",
  komplementariusz: "komplementariusza",
  likwidator: "likwidatora",
};

export function odmienFunkcje(funkcja: string): string {
  const f = (funkcja || "").trim().toLowerCase();
  if (f in FUNKCJA_DOP) return FUNKCJA_DOP[f];
  return CONSONANT_END.test(f) ? funkcja + "a" : funkcja;
}

export function listaReprezentantow(s: any): any[] {
  const r = s?.reprezentacja;
  if (!r) return [];
  return Array.isArray(r) ? [...r] : [r];
}

export function opisReprezentacji(s: any): string {
  const rep = listaReprezentantow(s);
  if (rep.length === 0) return "";
  const laczna = !!s.reprezentacja_laczna;
  const czesci = rep.map((r) => {
    let t = `${odmienFunkcje(r.funkcja)} ${odmienDopelniacz(r.imie_nazwisko)}`;
    if (r.pesel) t += ` (PESEL ${r.pesel})`;
    if (r.podstawa) t += ` na podstawie ${r.podstawa}`;
    return t;
  });
  if (czesci.length === 1) return "reprezentowana przez " + czesci[0];
  const spojnik = laczna ? " oraz " : " i ";
  let tresc = czesci.slice(0, -1).join(", ") + spojnik + czesci[czesci.length - 1];
  if (laczna) tresc += " — działających łącznie";
  return "reprezentowana przez " + tresc;
}

export interface OznaczenieOpts {
  /** Komparycja: strona jest jednym z rolników prowadzących WSPÓLNE gospodarstwo. */
  wspolneGospodarstwo?: boolean;
}

export function oznaczenieStrony(s: any, pelne = true, opts?: OznaczenieOpts): string {
  if (s === null || s === undefined) return "";
  if (s.typ === "osoba_fizyczna") {
    const czesci: string[] = [String(s.imie_nazwisko).toUpperCase()];
    if (s.firma)
      czesci.push(
        `${jestKobieta(s) ? "prowadząca" : "prowadzący"} działalność gospodarczą pod firmą ${s.firma}`,
      );
    else if (s.dzialalnosc === "gospodarstwo_rolne") {
      // Zmiana 2 po Kańkowskich: rolnik prowadzący gospodarstwo — traktowany
      // jak przedsiębiorca; przy wspólnym gospodarstwie NIP widnieje przy
      // przedstawicielu (pole `nip` tej osoby), pozostali mają sam PESEL.
      const prowadzacy = jestKobieta(s) ? "prowadząca" : "prowadzący";
      czesci.push(
        opts?.wspolneGospodarstwo
          ? `rolnik ${prowadzacy} wspólne gospodarstwo rolne`
          : `rolnik ${prowadzacy} gospodarstwo rolne`,
      );
    }
    if (!pelne) return String(s.imie_nazwisko).toUpperCase();
    czesci.push(`adres: ${s.adres}`);
    const ident: string[] = [`PESEL ${s.pesel}`];
    for (const [k, etykieta] of [
      ["nip", "NIP"],
      ["regon", "REGON"],
    ] as const) {
      if (s[k]) ident.push(`${etykieta} ${s[k]}`);
    }
    if (s.dokument_tozsamosci) ident.push(s.dokument_tozsamosci);
    if (s.telefon) ident.push(`tel. ${s.telefon}`);
    if (s.email) ident.push(`e-mail ${s.email}`);
    czesci.push(ident.join(", "));
    return czesci.join(", ");
  }

  // podmiot gospodarczy
  let nazwa = s.nazwa;
  const formaTxt = s.forma_prawna || FORMA_NAZWA[s.forma ?? "inna"] || "";
  if (formaTxt && !String(nazwa).includes(formaTxt)) nazwa = `${nazwa} ${formaTxt}`;
  if (!pelne) return nazwa;

  if (s.forma === "spolka_cywilna" && s.wspolnicy_sc) {
    const opisy = s.wspolnicy_sc.map((w: any) => oznaczenieStrony(w));
    return (
      `${opisy.join(" oraz ")} — wspólnicy spółki cywilnej działającej pod nazwą ${s.nazwa}` +
      (s.nip ? `, NIP ${s.nip}` : "")
    );
  }

  const czesci: string[] = [nazwa];
  const repTxt = opisReprezentacji(s);
  if (repTxt) czesci.push(repTxt);
  czesci.push(`adres: ${s.adres}`);
  const ident: string[] = [];
  for (const [k, etykieta] of [
    ["krs", "KRS"],
    ["nip", "NIP"],
    ["regon", "REGON"],
  ] as const) {
    if (s[k]) ident.push(`${etykieta} ${s[k]}`);
  }
  if (ident.length) czesci.push(ident.join(", "));
  return czesci.join(", ");
}

export function krotkieOznaczenie(s: any): string {
  if (s === null || s === undefined) return "";
  return s.typ === "osoba_fizyczna" ? s.imie_nazwisko : s.nazwa;
}

export const ROLA_NAZWA: Record<string, string> = {
  pozyczkobiorca: "Pożyczkobiorca",
  porecziciel: "Poręczyciel",
  osoba_trzecia: "Właściciel nieruchomości",
  wlasciciel_osoba_trzecia: "Właściciel nieruchomości",
};

export function listaPozyczkobiorcow(d: any): any[] {
  const p = d.pozyczkobiorca;
  if (p === null || p === undefined) return [];
  return Array.isArray(p) ? [...p] : [p];
}

export function wlascicielObiekt(d: any, n: any): any {
  const ref = n.wlasciciel_ref;
  if (ref === "pozyczkobiorca") {
    const poz = listaPozyczkobiorcow(d);
    const idx = n.wlasciciel_index;
    if (idx !== null && idx !== undefined && idx >= 0 && idx < poz.length) return poz[idx];
    return poz.length === 1 ? poz[0] : null;
  }
  if (ref === "porecziciel") return d.porecziciel ?? null;
  return n.wlasciciel_dane ?? null;
}

export function oznaczenieWlascicieli(d: any, f: any): string {
  const role: string[] = [];
  for (const n of d.nieruchomosci) {
    let r = ROLA_NAZWA[n.wlasciciel_ref];
    if (n.wlasciciel_ref === "pozyczkobiorca" && f.wielu_pozyczkobiorcow) r = "Pożyczkobiorcy";
    if (!role.includes(r)) role.push(r);
  }
  if (role.length === 1) return role[0];
  return role.slice(0, -1).join(", ") + " oraz " + role[role.length - 1];
}

export function oznaczenie777(d: any): string {
  const wielu = listaPozyczkobiorcow(d).length > 1;
  const role = d.zabezpieczenia.egzekucja_777.poddaje_sie.map((r: string) =>
    r === "pozyczkobiorca" && wielu ? "Pożyczkobiorcy" : ROLA_NAZWA[r],
  );
  if (role.length === 1) return role[0];
  return role.slice(0, -1).join(", ") + " oraz " + role[role.length - 1];
}

/** Opis stanu cywilnego do oświadczenia o majątku osobistym; null = nie dotyczy. */
function opisStanuCywilnego(o: any): string | null {
  const k = jestKobieta(o);
  switch (o?.stan_cywilny) {
    case "kawaler_panna":
      return "nie pozostaje w związku małżeńskim";
    case "rozwiedziony":
      return `nie pozostaje w związku małżeńskim (jest ${k ? "rozwiedziona" : "rozwiedziony"})`;
    case "wdowiec":
      return `nie pozostaje w związku małżeńskim (jest ${k ? "wdową" : "wdowcem"})`;
    case "zonaty_zamezna":
      return o.ustroj_majatkowy === "rozdzielnosc"
        ? "pozostaje w związku małżeńskim, w którym obowiązuje ustrój rozdzielności majątkowej"
        : null;
    default:
      return null;
  }
}

// ── operacje na zbiorach PESEL ─────────────────────────────────
function peselSet(items: any[]): Set<any> {
  return new Set(items.map((c) => c?.pesel ?? null));
}
function isSubset(a: Set<any>, b: Set<any>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ── główny budowniczy faktów ───────────────────────────────────
export function zbudujFakty(d: any): Record<string, any> {
  const f: Record<string, any> = {};
  const nier: any[] = d.nieruchomosci;

  const poz = listaPozyczkobiorcow(d);
  f.pozyczkobiorcy = poz;
  f.liczba_pozyczkobiorcow = poz.length;
  f.wielu_pozyczkobiorcow = poz.length > 1;

  const wielu = f.wielu_pozyczkobiorcow as boolean;
  // Rodzaj gramatyczny: przy jednej osobie fizycznej wg płci (pole `plec`,
  // PESEL albo imię), przy wielu pożyczkobiorcach liczba mnoga jak dotąd.
  const kobieta = !wielu && poz.length === 1 && jestKobieta(poz[0]);
  f.pb_kobieta = kobieta;
  const g = (mn: string, k: string, m: string) => (wielu ? mn : kobieta ? k : m);
  f.pb = wielu ? "Pożyczkobiorcy" : "Pożyczkobiorca";
  f.pb_dop = wielu ? "Pożyczkobiorców" : "Pożyczkobiorcy";
  f.pb_cel = wielu ? "Pożyczkobiorcom" : "Pożyczkobiorcy";
  f.pb_bier = wielu ? "Pożyczkobiorców" : "Pożyczkobiorcę";
  f.pb_ma = g("ma dla nich", "ma dla niej", "ma dla niego");
  f.pb_przedsiebiorca = wielu ? "przedsiębiorcami" : "przedsiębiorcą";
  f.pb_narz = wielu ? "Pożyczkobiorcami" : "Pożyczkobiorcą";
  f.pb_zaimek = g("nich", "nią", "niego");
  f.pb_zaimek_mu = g("im", "jej", "mu");
  f.pb_dla = g("nich", "niej", "niego");
  f.pb_oswiadcza = wielu ? "oświadczają" : "oświadcza";
  f.pb_zobowiazuje = wielu ? "zobowiązują się" : "zobowiązuje się";
  f.pb_potwierdza = wielu ? "potwierdzają" : "potwierdza";
  f.pb_otrzymal = g("otrzymali", "otrzymała", "otrzymał");
  f.pb_mial = g("mieli", "miała", "miał");
  f.pb_rozumie = wielu ? "rozumieją" : "rozumie";
  f.pb_dziala = wielu ? "działają" : "działa";
  f.pb_zawiera = wielu ? "zawierają" : "zawiera";
  f.pb_jest = wielu ? "są" : "jest";
  f.pb_posiada = wielu ? "posiadają" : "posiada";
  f.pb_przeznaczy = wielu ? "przeznaczą" : "przeznaczy";
  f.pb_ponosi = wielu ? "ponoszą" : "ponosi";
  f.pb_toczy_sie = g("nim", "niej", "niemu");
  // Formy do klauzul windykacji, oświadczeń, RODO i wypowiedzenia (wzorzec
  // Kańkowskich) — liczba mnoga dla kilku pożyczkobiorców.
  f.pb_zobowiazany_jest = g("zobowiązani są", "zobowiązana jest", "zobowiązany jest");
  f.pb_wywiazuje_sie = wielu ? "wywiązują się" : "wywiązuje się";
  f.pb_zawarl = g("zawarli", "zawarła", "zawarł");
  f.pb_konsument = wielu ? "konsumenci" : "konsument";
  f.pb_przedsiebiorca_mian = wielu ? "przedsiębiorcy" : "przedsiębiorca";
  f.pb_prowadzacego = g("prowadzących", "prowadzącej", "prowadzącego");
  f.pb_dokonal = g("dokonali", "dokonała", "dokonał");
  f.pb_jego = g("ich", "jej", "jego");
  f.pb_jego_male = f.pb_jego;
  f.pb_zrozumial = g("zrozumieli", "zrozumiała", "zrozumiał");
  f.pb_bedzie_roscil = g("będą rościli", "będzie rościła", "będzie rościł");
  f.pb_swiadomy = g("świadomi", "świadoma", "świadomy");
  f.pb_znajduje_sie = wielu ? "znajdują się" : "znajduje się";
  f.pb_wybral = g("wybrali", "wybrała", "wybrał");
  f.pb_wyraza = wielu ? "wyrażają" : "wyraża";
  f.pb_ma_prawo = wielu ? "mają prawo" : "ma prawo";
  f.pb_opoznia_sie = wielu ? "opóźniają się" : "opóźnia się";
  f.pb_wykorzysta = wielu ? "wykorzystają" : "wykorzysta";
  f.pb_podal = g("podali", "podała", "podał");
  f.pb_utrudnia = wielu ? "utrudniają" : "utrudnia";
  f.pb_narusza = wielu ? "naruszają" : "narusza";
  f.pb_zaimek_wobec = g("któregokolwiek z nich", "niej", "niego");
  f.pb_dokona = wielu ? "dokonają" : "dokona";
  // Biblioteka 1.3: aktywna działalność, warunki wejścia w życie, obciążenia
  // pozostające przed hipoteką Pożyczkodawcy, przesłanki wypowiedzenia.
  f.pb_wykonuje = wielu ? "wykonują" : "wykonuje";
  f.pb_zlozyl = g("złożyli", "złożyła", "złożył");
  f.pb_spelnia = wielu ? "spełniają" : "spełnia";
  f.pb_zlozy = wielu ? "złożą" : "złoży";
  f.pb_dopusci = wielu ? "dopuszczą" : "dopuści";
  f.pb_podpis_poswiadczony = wielu
    ? "z podpisami Pożyczkobiorców poświadczonymi notarialnie"
    : "z podpisem Pożyczkobiorcy poświadczonym notarialnie";
  // Oświadczenie o aktywnym wykonywaniu działalności (CEIDG) — pożyczkobiorca
  // będący osobą fizyczną przedsiębiorcą (nie rolnikiem prowadzącym gospodarstwo).
  f.ma_pb_ceidg = poz.some(
    (p) => p?.typ === "osoba_fizyczna" && p.dzialalnosc !== "gospodarstwo_rolne",
  );

  const emaile = [...new Set(poz.map((p) => String(p?.email ?? "").trim()).filter(Boolean))];
  f.ma_email_pozyczkobiorcy = emaile.length > 0;
  if (emaile.length) f.pb_email = emaile.join(" oraz ");
  if (d.pozyczkodawca) f.pozyczkodawca_nazwa = oznaczenieStrony(d.pozyczkodawca, false);

  f.dluznicy_solidarni = wielu;

  const peseleP = peselSet(poz.filter((p) => p?.typ === "osoba_fizyczna"));
  f.pesele_pozyczkobiorcow = peseleP;

  f.liczba_nieruchomosci = nier.length;
  f.wiele_nieruchomosci = nier.length > 1;

  f.charakter_hipoteki = d.zabezpieczenia.charakter_hipoteki ?? "laczna";
  f.hipoteka_laczna = f.charakter_hipoteki === "laczna" && nier.length > 1;

  f.ma_kw_wielodzialkowe = nier.some((n) => (n.dzialki_w_kw ?? []).length > 1);
  f.nieruchomosci_po_odlaczeniu = nier.filter((n) => n.zakres === "po_odlaczeniu");
  f.ma_odlaczenia = f.nieruchomosci_po_odlaczeniu.length > 0;

  const roleWl = new Set(nier.map((n) => n.wlasciciel_ref));
  f.ma_wlasciciela_osobe_trzecia = roleWl.has("osoba_trzecia");
  f.ma_wlasciciela_poreczyciela = roleWl.has("porecziciel");
  f.wlasciciel_inny_niz_pozyczkobiorca = !(roleWl.size === 1 && roleWl.has("pozyczkobiorca"));

  f.nieruchomosci_oproznione_miejsce = nier.filter(
    (n) => n.hipoteka.pierwszenstwo === "oproznione_miejsce",
  );
  f.ma_oproznione_miejsce = f.nieruchomosci_oproznione_miejsce.length > 0;

  // Roszczenie o przeniesienie hipoteki na przyszłe opróżnione miejsce (art. 101¹) —
  // opcjonalna klauzula zabezpieczająca, niezależna od aktualnego wpisu na opróżnione miejsce.
  f.nieruchomosci_roszczenie_oproznione = nier.filter((n) => n.roszczenie_oproznione_miejsce);
  f.ma_roszczenie_oproznione_miejsce = f.nieruchomosci_roszczenie_oproznione.length > 0;

  const obcAll: any[] = [];
  for (const n of nier) {
    for (const o of n.obciazenia ?? []) {
      const o2 = { ...o, nr_kw: n.nr_kw, nieruchomosc_id: n.id };
      // Czytelny opis wpisu do klauzuli o stanie obciążeń (zmiana 3 po
      // Kańkowskich): rodzaj (w tym hipoteka PRZYMUSOWA), wierzyciel
      // instytucjonalny (KRUS, ZUS, US, Skarb Państwa…), kwota, treść wpisu.
      // Silnik tylko opisuje, co jest w księdze — bez ocen i ostrzeżeń.
      o2.opis_wpisu =
        `w dziale ${o2.dzial} księgi wieczystej nr ${o2.nr_kw}: ` +
        (RODZAJ_OBCIAZENIA[o2.rodzaj] ?? o2.rodzaj) +
        (o2.wierzyciel ? ` na rzecz ${o2.wierzyciel}` : "") +
        (o2.kwota ? ` na kwotę ${o2.kwota} zł` : "") +
        ` — ${o2.opis}`;
      obcAll.push(o2);
    }
  }
  f.obciazenia_wszystkie = obcAll;
  f.ma_obciazenia_ujawnione = obcAll.length > 0;
  f.obciazenia_wykreslenie_przed = obcAll.filter(
    (o) => o.sposob_usuniecia === "wykreslenie_przed_wyplata",
  );
  f.obciazenia_splata_ze_srodkow = obcAll.filter(
    (o) => o.sposob_usuniecia === "wykreslenie_ze_srodkow_pozyczki",
  );
  f.obciazenia_zrzeczenie = obcAll.filter((o) => o.sposob_usuniecia === "zrzeczenie_uprawnionego");
  f.ma_wykreslenia_przed_wyplata = f.obciazenia_wykreslenie_przed.length > 0;
  f.ma_splaty_wierzycieli = f.obciazenia_splata_ze_srodkow.length > 0;
  f.ma_zrzeczenia = f.obciazenia_zrzeczenie.length > 0;
  // Hipoteki pozostające w księdze z pierwszeństwem przed hipoteką
  // Pożyczkodawcy (zaakceptowane, nieusuwane) — zobowiązania z § 5
  // i przesłanka wypowiedzenia.
  const hipPozostajace = obcAll.filter(
    (o) =>
      o.sposob_usuniecia === "pozostaje_akceptowane" &&
      (o.rodzaj === "hipoteka_umowna" || o.rodzaj === "hipoteka_przymusowa"),
  );
  f.ma_hipoteki_pozostajace = hipPozostajace.length > 0;
  const opisyPozostajacych = hipPozostajace.map(
    (o) =>
      (o.rodzaj === "hipoteka_przymusowa" ? "hipoteki przymusowej" : "hipoteki umownej") +
      (o.wierzyciel ? ` na rzecz ${o.wierzyciel}` : "") +
      (o.kwota ? ` do kwoty ${o.kwota} zł` : "") +
      ` wpisanej w dziale ${o.dzial} księgi wieczystej nr ${o.nr_kw}`,
  );
  f.hipoteki_pozostajace_opis =
    opisyPozostajacych.length > 1
      ? opisyPozostajacych.slice(0, -1).join(", ") +
        " oraz " +
        opisyPozostajacych[opisyPozostajacych.length - 1]
      : (opisyPozostajacych[0] ?? "");
  f.hipoteki_pozostajace_ta = hipPozostajace.length > 1 ? "tymi hipotekami" : "tą hipoteką";
  f.hipoteki_pozostajace_pozostajacej =
    hipPozostajace.length > 1 ? "pozostających" : "pozostającej";
  f.ma_obciazenia_egzekucyjne = obcAll.some((o) =>
    ["egzekucja_sadowa", "egzekucja_administracyjna", "hipoteka_przymusowa"].includes(o.rodzaj),
  );

  // --- zgody ---
  let wymagaMalzonka = false;
  for (const n of nier) {
    const w = n.wspolwlasnosc;
    if (w && w.rodzaj === "laczna_malzenska") {
      const wspolwlPesele = peselSet(w.wspolwlasciciele);
      if (!(wspolwlPesele.size > 0 && isSubset(wspolwlPesele, peseleP))) wymagaMalzonka = true;
    }
    const wl = wlascicielObiekt(d, n);
    if (wl && wl.typ === "osoba_fizyczna" && wl.ustroj_majatkowy === "wspolnosc_ustawowa") {
      // Logika konstrukcyjna (kto jest stroną): gdy wszyscy współwłaściciele —
      // przy współwłasności łącznej małżeńskiej ORAZ ułamkowej — są zarazem
      // pożyczkobiorcami, odrębna zgoda małżonka nie jest generowana.
      const ok = !!w && isSubset(peselSet(w.wspolwlasciciele), peseleP);
      if (!ok) wymagaMalzonka = true;
    }
  }
  f.wymaga_zgody_malzonka = wymagaMalzonka;

  f.malzonkowie_oboje_pozyczkobiorcami = nier.some((n) => {
    const w = n.wspolwlasnosc ?? {};
    return (
      w.rodzaj === "laczna_malzenska" &&
      isSubset(peselSet(n.wspolwlasnosc.wspolwlasciciele), peseleP) &&
      n.wspolwlasnosc.wspolwlasciciele.length > 1
    );
  });

  // --- współwłasność ułamkowa (zmiana 1 po Kańkowskich) ---
  // Renderer opisuje udziały w komparycji i w sekcji zabezpieczeń; gdy wszyscy
  // współwłaściciele przystępują do Umowy, hipoteka obciąża całą nieruchomość.
  // Żadnej reguły blokującej — silnik składa umowę z takimi stronami, jakie
  // dostanie; decyzja, czy brać taką nieruchomość, należy do człowieka.
  f.nieruchomosci_ulamkowe = nier.filter((n) => n.wspolwlasnosc?.rodzaj === "ulamkowa");
  f.ma_wspolwlasnosc_ulamkowa = f.nieruchomosci_ulamkowe.length > 0;
  for (const n of f.nieruchomosci_ulamkowe) {
    const wspolwl: any[] = n.wspolwlasnosc.wspolwlasciciele ?? [];
    const opisy = wspolwl.map((w: any) => {
      let t = String(w.imie_nazwisko ?? "");
      if (w.pesel) t += ` (PESEL ${w.pesel})`;
      if (w.udzial) t += ` — w udziale wynoszącym ${w.udzial} części`;
      return t;
    });
    n.wspolwlasnosc_opis =
      opisy.length > 1
        ? opisy.slice(0, -1).join(", ") + " oraz " + opisy[opisy.length - 1]
        : (opisy[0] ?? "");
    const wszyscyStronami =
      wspolwl.length > 0 && isSubset(peselSet(wspolwl), peseleP) && peseleP.size > 0;
    n.ulamkowa_hipoteka_zdanie = wszyscyStronami
      ? "Wszyscy współwłaściciele przystępują do niniejszej Umowy i wspólnie obejmują żądaniem ustanowienia hipoteki całą nieruchomość — hipoteka obciąża całą nieruchomość, a nie poszczególne udziały"
      : "Oświadczenie o ustanowieniu hipoteki obejmuje udziały we współwłasności przysługujące osobom składającym to oświadczenie";
  }

  // --- majątek osobisty jedynego właściciela (osoba fizyczna) ---
  // Oświadczenie o stanie cywilnym i przynależności nieruchomości do majątku
  // osobistego — gdy właściciel jest jedyny w dziale II (brak współwłasności),
  // a z danych wynika, że wspólność majątkowa małżeńska go nie obejmuje.
  // Przy wspólności ustawowej działa istniejąca zgoda małżonka (WZA_02).
  const majatekOsobisty: any[] = [];
  for (const n of nier) {
    if (n.wspolwlasnosc) continue;
    const wl = wlascicielObiekt(d, n);
    if (!wl || wl.typ !== "osoba_fizyczna") continue;
    // Brak danych o stanie cywilnym i ustroju = brak adnotacji o wspólności
    // w dziale II — oświadczenie bez części o stanie cywilnym.
    const nieznany = !wl.stan_cywilny && !wl.ustroj_majatkowy;
    const opis = opisStanuCywilnego(wl);
    if (!opis && !nieznany) continue;
    const kobieta = jestKobieta(wl);
    majatekOsobisty.push({
      ...n,
      wlasciciel_imie_nazwisko: wl.imie_nazwisko,
      wlasciciel_oswiadcza: "oświadcza",
      wlasciciel_ujawniony: kobieta ? "ujawniona" : "ujawniony",
      wlasciciel_zaimek: kobieta ? "jej" : "jego",
      stan_cywilny_opis: opis ?? "",
      stan_cywilny_czesc: opis ? `${opis}, a ` : "",
    });
  }
  f.nieruchomosci_majatek_osobisty = majatekOsobisty;
  f.ma_majatek_osobisty = majatekOsobisty.length > 0;

  // --- poręczyciel ---
  const por = d.porecziciel ?? null;
  f.ma_poreczyciela = por !== null;

  f.porecziciel_wymaga_zgody_malzonka = !!(
    por &&
    por.typ === "osoba_fizyczna" &&
    por.ustroj_majatkowy === "wspolnosc_ustawowa"
  );

  const zgoda = (por && por.zgoda_malzonka) || {};
  f.zgoda_malzonka_na_hipoteke = !!zgoda.na_hipoteke;
  f.zgoda_malzonka_na_poreczenie = !!zgoda.na_poreczenie;

  const zakres = (por && por.zakres_odpowiedzialnosci) ?? "rzeczowa_i_osobista";
  f.porecziciel_zakres = zakres;
  f.porecziciel_odpowiada_osobiscie = !!por && zakres === "rzeczowa_i_osobista";
  f.porecziciel_tylko_rzeczowo = !!por && zakres === "rzeczowa";

  f.porecziciel_ograniczenie_do_majatku_osobistego = !!(
    f.porecziciel_odpowiada_osobiscie &&
    f.porecziciel_wymaga_zgody_malzonka &&
    !f.zgoda_malzonka_na_poreczenie
  );
  f.porecziciel_pelna_odpowiedzialnosc = !!(
    f.porecziciel_odpowiada_osobiscie && !f.porecziciel_ograniczenie_do_majatku_osobistego
  );

  // --- forma prawna stron, reprezentacja, uchwały korporacyjne ---
  const stronyPodmiotowe: [string, any][] = [];
  poz.forEach((o, i) => {
    if (o?.typ === "podmiot_gospodarczy") {
      stronyPodmiotowe.push([poz.length > 1 ? `pozyczkobiorca[${i}]` : "pozyczkobiorca", o]);
    }
  });
  if (por && por.typ === "podmiot_gospodarczy") stronyPodmiotowe.push(["porecziciel", por]);
  for (const n of nier) {
    const wl = n.wlasciciel_dane;
    if (n.wlasciciel_ref === "osoba_trzecia" && wl && wl.typ === "podmiot_gospodarczy") {
      stronyPodmiotowe.push([`wlasciciel[${n.id}]`, wl]);
    }
  }
  f.strony_podmiotowe = stronyPodmiotowe;
  f.ma_strone_bedaca_spolka = stronyPodmiotowe.length > 0;
  f.ma_spolke_cywilna = stronyPodmiotowe.some(([, o]) => o.forma === "spolka_cywilna");
  f.ma_reprezentacje_laczna = stronyPodmiotowe.some(([, o]) => o.reprezentacja_laczna);

  const uchwalyDoPrzedlozenia: any[] = [];
  for (const [etykieta, o] of stronyPodmiotowe) {
    for (const [pole, opis] of [
      ["uchwala_zobowiazanie", "zaciągnięcie zobowiązania"],
      ["uchwala_nieruchomosc", "obciążenie nieruchomości hipoteką"],
    ] as const) {
      const u = o[pole];
      if (u && u.wymagana && !u.wylaczona_umowa_spolki && !u.przedlozona) {
        uchwalyDoPrzedlozenia.push({
          podmiot: oznaczenieStrony(o, false),
          czynnosc: opis,
          podstawa: u.podstawa || "przepisów o organach spółki",
          organ: ORGAN_NAZWA[u.organ ?? ""] || "właściwego organu",
          etykieta,
        });
      }
    }
  }
  f.uchwaly_do_przedlozenia = uchwalyDoPrzedlozenia;
  f.ma_uchwaly_do_przedlozenia = uchwalyDoPrzedlozenia.length > 0;
  f.wlasciciele_oznaczenie_zbiorcze = oznaczenieWlascicieli(d, f);
  f.egzekucja_777_podmioty = oznaczenie777(d);

  const roleWlascicieli = new Set<string>();
  for (const n of nier) {
    let r = ROLA_NAZWA[n.wlasciciel_ref];
    if (n.wlasciciel_ref === "pozyczkobiorca" && f.wielu_pozyczkobiorcow)
      r = "Pożyczkobiorcy (mn.)";
    roleWlascicieli.add(r);
  }
  const mnogaWl = roleWlascicieli.size > 1 || roleWlascicieli.has("Pożyczkobiorcy (mn.)");
  f.wlasciciele_czasownik_zobowiazuje = mnogaWl ? "zobowiązują się" : "zobowiązuje się";
  f.wlasciciele_czasownik_oswiadcza = mnogaWl ? "oświadczają" : "oświadcza";
  // Jeden właściciel (osoba fizyczna) — zaimek wg płci („przysługuje jej”).
  const wlascicielJedyny = !mnogaWl && nier.length > 0 ? wlascicielObiekt(d, nier[0]) : null;
  f.wlasciciele_zaimek_przysluguje = mnogaWl
    ? "przysługuje im"
    : jestKobieta(wlascicielJedyny)
      ? "przysługuje jej"
      : "przysługuje mu";

  const liczba777 = d.zabezpieczenia.egzekucja_777.poddaje_sie.length;
  f.egzekucja_777_czasownik =
    liczba777 === 1 &&
    !(f.wielu_pozyczkobiorcow && d.zabezpieczenia.egzekucja_777.poddaje_sie[0] === "pozyczkobiorca")
      ? "podda się"
      : "poddadzą się";

  if (por !== null) f.porecziciel_oznaczenie = "Poręczyciel";

  for (const o of f.obciazenia_zrzeczenie) {
    const upr = o.uprawniony_do_zrzeczenia ?? {};
    const imie = upr.imie_nazwisko ?? "";
    o.uprawniony_dopelniacz = odmienBiernik(imie);
    o.uprawniony_dopelniacz_kogo = odmienDopelniacz(imie);
    o.uprawniony_zaimek = rodzajZenski(imie) ? "jej" : "mu";
  }

  // Liczba egzemplarzy = liczba Stron w komparycji (każda dostaje egzemplarz).
  const wlascicieleTrzeci = new Set(
    nier
      .filter((n) => n.wlasciciel_ref === "osoba_trzecia" && n.wlasciciel_dane)
      .map((n) => oznaczenieStrony(n.wlasciciel_dane)),
  );
  f.liczba_egzemplarzy = poz.length + (por ? 1 : 0) + wlascicieleTrzeci.size + 1;

  f.ma_warunki_zawieszajace =
    f.ma_wykreslenia_przed_wyplata ||
    f.ma_zrzeczenia ||
    f.wymaga_zgody_malzonka ||
    !!f.ma_uchwaly_do_przedlozenia ||
    f.ma_splaty_wierzycieli;

  const transze: any[] = [];
  if (f.ma_splaty_wierzycieli) {
    for (const o of f.obciazenia_splata_ze_srodkow) {
      const kw = o.kwota_splaty;
      transze.push({
        kwota: kw ? kw.cyframi : "—",
        opis:
          `na rachunek wierzyciela ${o.wierzyciel || "hipotecznego"} ` +
          `nr ${o.wierzyciel_rachunek ?? ""}, ` +
          `tytułem spłaty zadłużenia zabezpieczonego wpisem: ${o.opis} ` +
          `(KW nr ${o.nr_kw}); w tym zakresie Pożyczkobiorca dokonuje przekazu, ` +
          `a Pożyczkodawca przekaz ten przyjmuje`,
      });
    }
    transze.push({
      kwota: "pozostała część Kwoty Pożyczki",
      opis: `na rachunek bankowy Pożyczkobiorcy nr ${d.warunki.rachunki.wyplata}`,
    });
  }
  f.wyplata_transze = transze;

  // § 1: zakaz przeznaczenia pożyczki na cele związane z nieruchomościami.
  // Domyślnie włączony; przy spłacie wierzycieli hipotecznych ze środków
  // pożyczki domyślnie wyłączony (inaczej umowa przeczyłaby sama sobie).
  const zakaz = d.warunki?.zakaz_celu_nieruchomosciowego;
  f.zakaz_celu_nieruchomosciowego = zakaz === true || (zakaz !== false && !f.ma_splaty_wierzycieli);

  // § 2 ust. 6 lit. b: wpis roszczenia o opróżnione miejsce, gdy dotyczy.
  f.wejscie_w_zycie_roszczenie = f.ma_roszczenie_oproznione_miejsce
    ? " (wraz z żądaniem wpisu roszczenia o przeniesienie hipoteki na opróżnione miejsce hipoteczne)"
    : "";

  return f;
}
