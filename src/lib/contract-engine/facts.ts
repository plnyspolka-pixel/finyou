/**
 * Warstwa faktów pochodnych + pomocnicze oznaczenia stron.
 *
 * Port z `renderer.py` (zbuduj_fakty, oznaczenie_strony, odmiany itd.).
 * Wszystkie warunki w bibliotece klauzul odwołują się WYŁĄCZNIE do faktów
 * albo do ścieżek w danych — nigdy do surowego tekstu. Klucze faktów są
 * zachowane 1:1 z Pythonem, bo odwołują się do nich klauzule i testy.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Dane = Record<string, any>;
export type Fakty = Record<string, any>;

const CONSONANT = /[bcdfghjklmnprstwzżźćń]$/;

function endsAny(s: string, suf: string[]): boolean {
  return suf.some((x) => s.endsWith(x));
}

// ── odmiana imion i nazwisk ─────────────────────────────────

/** Odmiana do biernika (kogo? co?) — po przyimku „przez". */
export function odmienBiernik(imieNazwisko: string): string {
  const slowa = imieNazwisko.split(/\s+/).filter(Boolean);
  const kobieta = slowa.length > 0 && slowa[0].trimEnd().toLowerCase().endsWith("a");
  return slowa
    .map((w, idx) => {
      const low = w.toLowerCase();
      if (endsAny(low, ["ski", "cki", "dzki"])) return w + "ego";
      if (endsAny(low, ["ska", "cka", "dzka"])) return w.slice(0, -1) + "ą";
      if (low.endsWith("a")) return w.slice(0, -1) + "ę";
      if (CONSONANT.test(low)) return kobieta && idx > 0 ? w : w + "a";
      return w;
    })
    .join(" ");
}

/** Odmiana imienia i nazwiska do dopełniacza (kogo? czego?). */
export function odmienDopelniacz(imieNazwisko: string): string {
  const slowa = imieNazwisko.split(/\s+/).filter(Boolean);
  const kobieta = slowa.length > 0 && slowa[0].trimEnd().toLowerCase().endsWith("a");
  return slowa
    .map((w, idx) => {
      const low = w.toLowerCase();
      if (endsAny(low, ["ski", "cki", "dzki"])) return w + "ego";
      if (endsAny(low, ["ska", "cka", "dzka"])) return w.slice(0, -1) + "iej";
      if (low.endsWith("a")) return w.slice(0, -1) + "y";
      if (CONSONANT.test(low)) return kobieta && idx > 0 ? w : w + "a";
      return w;
    })
    .join(" ");
}

/** Heurystyka rodzaju żeńskiego po pierwszym słowie (imieniu). */
export function rodzajZenski(imieNazwisko: string): boolean {
  if (!imieNazwisko) return false;
  return imieNazwisko.split(/\s+/)[0].trimEnd().toLowerCase().endsWith("a");
}

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

function odmienFunkcje(funkcja: string): string {
  const f = funkcja.trim().toLowerCase();
  if (f in FUNKCJA_DOP) return FUNKCJA_DOP[f];
  return CONSONANT.test(f) ? funkcja + "a" : funkcja;
}

export function listaReprezentantow(s: Dane): Dane[] {
  const r = s?.reprezentacja;
  if (!r) return [];
  return Array.isArray(r) ? r : [r];
}

function opisReprezentacji(s: Dane): string {
  const rep = listaReprezentantow(s);
  if (rep.length === 0) return "";
  const laczna = Boolean(s.reprezentacja_laczna);
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

/** Buduje tekstowe oznaczenie strony do komparycji. */
export function oznaczenieStrony(s: Dane | null | undefined, pelne = true): string {
  if (s === null || s === undefined) return "";
  if (s.typ === "osoba_fizyczna") {
    const czesci: string[] = [String(s.imie_nazwisko).toUpperCase()];
    if (s.firma) czesci.push(`prowadzący działalność gospodarczą pod firmą ${s.firma}`);
    if (!pelne) return String(s.imie_nazwisko).toUpperCase();
    czesci.push(`adres: ${s.adres}`);
    const ident: string[] = [`PESEL ${s.pesel}`];
    for (const [k, etykieta] of [
      ["nip", "NIP"],
      ["regon", "REGON"],
    ] as const) {
      if (s[k]) ident.push(`${etykieta} ${s[k]}`);
    }
    if (s.dokument_tozsamosci) ident.push(String(s.dokument_tozsamosci));
    if (s.telefon) ident.push(`tel. ${s.telefon}`);
    if (s.email) ident.push(`e-mail ${s.email}`);
    czesci.push(ident.join(", "));
    return czesci.join(", ");
  }

  // podmiot gospodarczy
  let nazwa = s.nazwa as string;
  const formaTxt = s.forma_prawna || FORMA_NAZWA[s.forma ?? "inna"] || "";
  if (formaTxt && !nazwa.includes(formaTxt)) nazwa = `${nazwa} ${formaTxt}`;
  if (!pelne) return nazwa;

  // spółka cywilna nie ma podmiotowości — stroną są wspólnicy
  if (s.forma === "spolka_cywilna" && s.wspolnicy_sc) {
    const opisy = (s.wspolnicy_sc as Dane[]).map((w) => oznaczenieStrony(w));
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

export function krotkieOznaczenie(s: Dane | null | undefined): string {
  if (s === null || s === undefined) return "";
  return s.typ === "osoba_fizyczna" ? s.imie_nazwisko : s.nazwa;
}

export const ROLA_NAZWA: Record<string, string> = {
  pozyczkobiorca: "Pożyczkobiorca",
  porecziciel: "Poręczyciel",
  osoba_trzecia: "Właściciel nieruchomości",
  wlasciciel_osoba_trzecia: "Właściciel nieruchomości",
};

export function listaPozyczkobiorcow(d: Dane): Dane[] {
  const p = d.pozyczkobiorca;
  if (p === null || p === undefined) return [];
  return Array.isArray(p) ? p : [p];
}

function wlascicielObiekt(d: Dane, n: Dane): Dane | null {
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

function oznaczenieWlascicieli(d: Dane, f: Fakty): string {
  const role: string[] = [];
  for (const n of d.nieruchomosci as Dane[]) {
    let r = ROLA_NAZWA[n.wlasciciel_ref];
    if (n.wlasciciel_ref === "pozyczkobiorca" && f.wielu_pozyczkobiorcow) r = "Pożyczkobiorcy";
    if (!role.includes(r)) role.push(r);
  }
  if (role.length === 1) return role[0];
  return role.slice(0, -1).join(", ") + " oraz " + role[role.length - 1];
}

function oznaczenie777(d: Dane): string {
  const role = (d.zabezpieczenia.egzekucja_777.poddaje_sie as string[]).map((r) => ROLA_NAZWA[r]);
  if (role.length === 1) return role[0];
  return role.slice(0, -1).join(", ") + " oraz " + role[role.length - 1];
}

// ── zbiory PESEL (odpowiednik pythonowych set-ów) ────────────

function subset(a: Set<any>, b: Set<any>): boolean {
  if (a.size === 0) return true;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ── buildFacts (zbuduj_fakty) ────────────────────────────────

export function buildFacts(d: Dane): Fakty {
  const f: Fakty = {};
  const nier: Dane[] = d.nieruchomosci;

  // --- pożyczkobiorcy ---
  const poz = listaPozyczkobiorcow(d);
  f.pozyczkobiorcy = poz;
  f.liczba_pozyczkobiorcow = poz.length;
  f.wielu_pozyczkobiorcow = poz.length > 1;

  const wielu: boolean = f.wielu_pozyczkobiorcow;
  f.pb = wielu ? "Pożyczkobiorcy" : "Pożyczkobiorca";
  f.pb_dop = wielu ? "Pożyczkobiorców" : "Pożyczkobiorcy";
  f.pb_cel = wielu ? "Pożyczkobiorcom" : "Pożyczkobiorcy";
  f.pb_bier = wielu ? "Pożyczkobiorców" : "Pożyczkobiorcę";
  f.pb_ma = wielu ? "ma dla nich" : "ma dla niego";
  f.pb_przedsiebiorca = wielu ? "przedsiębiorcami" : "przedsiębiorcą";
  f.pb_narz = wielu ? "Pożyczkobiorcami" : "Pożyczkobiorcą";
  f.pb_zaimek = wielu ? "nich" : "niego";
  f.pb_zaimek_mu = wielu ? "im" : "mu";
  f.pb_oswiadcza = wielu ? "oświadczają" : "oświadcza";
  f.pb_zobowiazuje = wielu ? "zobowiązują się" : "zobowiązuje się";
  f.pb_potwierdza = wielu ? "potwierdzają" : "potwierdza";
  f.pb_otrzymal = wielu ? "otrzymali" : "otrzymał";
  f.pb_mial = wielu ? "mieli" : "miał";
  f.pb_rozumie = wielu ? "rozumieją" : "rozumie";
  f.pb_dziala = wielu ? "działają" : "działa";
  f.pb_zawiera = wielu ? "zawierają" : "zawiera";
  f.pb_jest = wielu ? "są" : "jest";
  f.pb_posiada = wielu ? "posiadają" : "posiada";
  f.pb_przeznaczy = wielu ? "przeznaczą" : "przeznaczy";
  f.pb_ponosi = wielu ? "ponoszą" : "ponosi";
  f.pb_toczy_sie = wielu ? "nim" : "niemu";

  f.dluznicy_solidarni = wielu;

  const pselePb = new Set<any>();
  for (const p of poz) if (p.typ === "osoba_fizyczna") pselePb.add(p.pesel ?? null);
  f.pesele_pozyczkobiorcow = pselePb;

  f.liczba_nieruchomosci = nier.length;
  f.wiele_nieruchomosci = nier.length > 1;

  // --- charakter hipoteki (art. 76 u.k.w.h.) ---
  f.charakter_hipoteki = d.zabezpieczenia.charakter_hipoteki ?? "laczna";
  f.hipoteka_laczna = f.charakter_hipoteki === "laczna" && nier.length > 1;

  // --- zakres w obrębie KW ---
  f.ma_kw_wielodzialkowe = nier.some((n) => (n.dzialki_w_kw ?? []).length > 1);
  f.nieruchomosci_po_odlaczeniu = nier.filter((n) => n.zakres === "po_odlaczeniu");
  f.ma_odlaczenia = f.nieruchomosci_po_odlaczeniu.length > 0;

  // --- właściciele ---
  const roleWl = new Set(nier.map((n) => n.wlasciciel_ref));
  f.ma_wlasciciela_osobe_trzecia = roleWl.has("osoba_trzecia");
  f.ma_wlasciciela_poreczyciela = roleWl.has("porecziciel");
  f.wlasciciel_inny_niz_pozyczkobiorca = !(roleWl.size === 1 && roleWl.has("pozyczkobiorca"));

  // --- opróżnione miejsce hipoteczne ---
  f.nieruchomosci_oproznione_miejsce = nier.filter(
    (n) => n.hipoteka.pierwszenstwo === "oproznione_miejsce",
  );
  f.ma_oproznione_miejsce = f.nieruchomosci_oproznione_miejsce.length > 0;

  // --- obciążenia: spłaszczone z numerem KW ---
  const obcAll: Dane[] = [];
  for (const n of nier) {
    for (const o of n.obciazenia ?? []) {
      obcAll.push({ ...o, nr_kw: n.nr_kw, nieruchomosc_id: n.id });
    }
  }
  f.obciazenia_wszystkie = obcAll;
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
  f.ma_obciazenia_egzekucyjne = obcAll.some((o) =>
    ["egzekucja_sadowa", "egzekucja_administracyjna", "hipoteka_przymusowa"].includes(o.rodzaj),
  );

  // --- zgody ---
  let wymagaMalzonka = false;
  for (const n of nier) {
    const w = n.wspolwlasnosc;
    if (w && w.rodzaj === "laczna_malzenska") {
      const wspolwlPesele = new Set<any>((w.wspolwlasciciele as Dane[]).map((c) => c.pesel ?? null));
      if (!(wspolwlPesele.size > 0 && subset(wspolwlPesele, pselePb))) wymagaMalzonka = true;
    }
    const wl = wlascicielObiekt(d, n);
    if (wl && wl.typ === "osoba_fizyczna" && wl.ustroj_majatkowy === "wspolnosc_ustawowa") {
      const okMalzonek =
        w &&
        w.rodzaj === "laczna_malzenska" &&
        subset(new Set<any>((w.wspolwlasciciele as Dane[]).map((c) => c.pesel ?? null)), pselePb);
      if (!okMalzonek) wymagaMalzonka = true;
    }
  }
  f.wymaga_zgody_malzonka = wymagaMalzonka;

  f.malzonkowie_oboje_pozyczkobiorcami = nier.some((n) => {
    const w = n.wspolwlasnosc;
    if (!w || w.rodzaj !== "laczna_malzenska") return false;
    const pesele = new Set<any>((w.wspolwlasciciele as Dane[]).map((c) => c.pesel ?? null));
    return subset(pesele, pselePb) && w.wspolwlasciciele.length > 1;
  });

  // --- poręczyciel ---
  const por = d.porecziciel ?? null;
  f.ma_poreczyciela = por !== null;
  f.porecziciel_wymaga_zgody_malzonka = Boolean(
    por && por.typ === "osoba_fizyczna" && por.ustroj_majatkowy === "wspolnosc_ustawowa",
  );

  const zgoda = (por && por.zgoda_malzonka) || {};
  f.zgoda_malzonka_na_hipoteke = Boolean(zgoda.na_hipoteke);
  f.zgoda_malzonka_na_poreczenie = Boolean(zgoda.na_poreczenie);

  const zakres = (por && por.zakres_odpowiedzialnosci) ?? "rzeczowa_i_osobista";
  f.porecziciel_zakres = zakres;
  f.porecziciel_odpowiada_osobiscie = Boolean(por) && zakres === "rzeczowa_i_osobista";
  f.porecziciel_tylko_rzeczowo = Boolean(por) && zakres === "rzeczowa";

  f.porecziciel_ograniczenie_do_majatku_osobistego = Boolean(
    f.porecziciel_odpowiada_osobiscie &&
      f.porecziciel_wymaga_zgody_malzonka &&
      !f.zgoda_malzonka_na_poreczenie,
  );
  f.porecziciel_pelna_odpowiedzialnosc = Boolean(
    f.porecziciel_odpowiada_osobiscie && !f.porecziciel_ograniczenie_do_majatku_osobistego,
  );

  // --- forma prawna stron, reprezentacja, uchwały korporacyjne ---
  const stronyPodmiotowe: Array<[string, Dane]> = [];
  poz.forEach((o, i) => {
    if (o.typ === "podmiot_gospodarczy") {
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

  const uchwalyDoPrzedlozenia: Dane[] = [];
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
          organ: ORGAN_NAZWA[u.organ || ""] || "właściwego organu",
          etykieta,
        });
      }
    }
  }
  f.uchwaly_do_przedlozenia = uchwalyDoPrzedlozenia;
  f.ma_uchwaly_do_przedlozenia = uchwalyDoPrzedlozenia.length > 0;
  f.wlasciciele_oznaczenie_zbiorcze = oznaczenieWlascicieli(d, f);
  f.egzekucja_777_podmioty = oznaczenie777(d);

  // uzgodnienie liczby czasownika (jeden podmiot vs kilku)
  const roleWlascicieli = new Set<string>();
  for (const n of nier) {
    let r = ROLA_NAZWA[n.wlasciciel_ref];
    if (n.wlasciciel_ref === "pozyczkobiorca" && f.wielu_pozyczkobiorcow) r = "Pożyczkobiorcy (mn.)";
    roleWlascicieli.add(r);
  }
  const mnogaWl = roleWlascicieli.size > 1 || roleWlascicieli.has("Pożyczkobiorcy (mn.)");
  f.wlasciciele_czasownik_zobowiazuje = mnogaWl ? "zobowiązują się" : "zobowiązuje się";
  f.wlasciciele_czasownik_oswiadcza = mnogaWl ? "oświadczają" : "oświadcza";
  f.wlasciciele_zaimek_przysluguje = mnogaWl ? "przysługuje im" : "przysługuje mu";

  const liczba777 = d.zabezpieczenia.egzekucja_777.poddaje_sie.length;
  f.egzekucja_777_czasownik = liczba777 === 1 ? "podda się" : "poddadzą się";

  if (por !== null) f.porecziciel_oznaczenie = "Poręczyciel";

  // odmiana uprawnionych do zrzeczenia
  for (const o of f.obciazenia_zrzeczenie as Dane[]) {
    const upr = o.uprawniony_do_zrzeczenia || {};
    const imie = upr.imie_nazwisko || "";
    o.uprawniony_dopelniacz = odmienBiernik(imie);
    o.uprawniony_dopelniacz_kogo = odmienDopelniacz(imie);
    o.uprawniony_zaimek = rodzajZenski(imie) ? "jej" : "mu";
  }

  // --- warunki zawieszające ---
  f.ma_warunki_zawieszajace = [
    f.ma_wykreslenia_przed_wyplata,
    f.ma_zrzeczenia,
    f.wymaga_zgody_malzonka,
    f.ma_uchwaly_do_przedlozenia,
    f.ma_splaty_wierzycieli,
  ].some(Boolean);

  // --- transze wypłaty ---
  const transze: Dane[] = [];
  if (f.ma_splaty_wierzycieli) {
    for (const o of f.obciazenia_splata_ze_srodkow as Dane[]) {
      const kw = o.kwota_splaty;
      transze.push({
        kwota: kw ? kw.cyframi : "—",
        opis:
          `na rachunek wierzyciela ${o.wierzyciel || "hipotecznego"} ` +
          `nr ${o.wierzyciel_rachunek || "[NR RACHUNKU WIERZYCIELA]"}, ` +
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

  return f;
}
