/**
 * Renderer umowy — port `renderuj` z `renderer.py`.
 *
 * Wejście : dane (walidowane schematem), biblioteka klauzul.
 * Wyjście : struktura dokumentu (sekcje z ponumerowanymi ustępami).
 *
 * Deterministyczny: te same dane zawsze dają ten sam dokument. Żadnych decyzji
 * redakcyjnych — sekcja, która się nie kwalifikuje, nie zostawia dziury,
 * a numeracja przelicza się sama.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ewaluujWarunek, pobierzSciezke, type Ctx } from "./conditions";
import {
  listaPozyczkobiorcow,
  jestKobieta,
  oznaczenieStrony,
  ROLA_NAZWA,
  zbudujFakty,
} from "./facts";
import biblioteka from "./clauses.json";
import { bledyOdeslanUmowy } from "./odeslania";

export interface Ustep {
  poziom: "ustep" | "podpunkt";
  tekst: string;
  zrodlo: string;
  numer?: number | null;
  litera?: string;
}
export interface Sekcja {
  nazwa: string;
  tytul: string;
  ustepy: Ustep[];
  numer?: number;
}
export interface Strona {
  rola: string;
  opis: string;
  grupa?: string;
  /** „zwaną dalej „Pożyczkobiorcą”” — rodzaj wg płci/formy; pusty w środku grupy. */
  zwany: string;
}
/** Położenie klauzuli po numeracji — do odesłań („§ 4 ust. 2”, „§ 5 ust. 3 lit. m”). */
export interface Polozenie {
  paragraf: number;
  ustep: number | null;
  litera?: string;
}
export interface Dokument {
  meta: any;
  komparycja: { data: string; miejscowosc: string; strony: Strona[] };
  sekcje: Sekcja[];
  fakty: Record<string, any>;
  zalaczniki: { nr: number; tytul: string }[];
  /** ID klauzuli → jej położenie w dokumencie (pierwszy ustęp/podpunkt). */
  polozenia: Record<string, Polozenie>;
}

export class BladPola extends Error {}

const POLE_RE = /\{\{([^}]+)\}\}/g;
/** Odesłania do innych klauzul — rozwiązywane dopiero po numeracji. */
const ODESLANIE_RE = /\{\{(ref|ref_par):([A-Za-z0-9_]+)\}\}/g;
/**
 * Lista odesłań do oświadczeń, z których część może nie wejść do Umowy:
 * `{{refs_lista:ID1,ID2}}` → „tematu 1 (§ 5 ust. 3) lub tematu 2 (§ 5 ust. 4)”.
 * Wypisuje tylko klauzule obecne w Umowie (temat z metadanej
 * `temat_odeslania`); gdy nie ma żadnej — błąd renderowania.
 */
const LISTA_ODESLAN_RE = /\{\{refs_lista:([A-Za-z0-9_,]+)\}\}/g;
const ZNACZNIKI_ODESLAN = ["ref:", "ref_par:", "refs_lista:"];

export function podstaw(tekst: string, ctx: Ctx, lokalne?: Record<string, any>): string {
  return tekst.replace(POLE_RE, (m, grp) => {
    const sciezka = String(grp).trim();
    if (ZNACZNIKI_ODESLAN.some((z) => sciezka.startsWith(z))) return m;
    if (lokalne) {
      for (const pref of Object.keys(lokalne)) {
        const obj = lokalne[pref];
        if (sciezka === pref || sciezka.startsWith(pref + ".")) {
          const reszta = sciezka.slice(pref.length).replace(/^\.+/, "");
          const v = reszta ? pobierzSciezke({ [pref]: obj }, sciezka) : obj;
          if (v === null || v === undefined) {
            throw new BladPola(`Brak wartości dla pola {{${sciezka}}}`);
          }
          return String(v);
        }
      }
    }
    const v = pobierzSciezke(ctx, sciezka);
    if (v === null || v === undefined) {
      throw new BladPola(`Brak wartości dla pola {{${sciezka}}}`);
    }
    return String(v);
  });
}

const LITERY = "abcdefghijklmnoprstuwz";

/** Tekst odesłania do położenia klauzuli. */
export function tekstOdeslania(p: Polozenie, tylkoParagraf = false): string {
  if (tylkoParagraf || p.ustep == null) return `§ ${p.paragraf}`;
  return `§ ${p.paragraf} ust. ${p.ustep}` + (p.litera ? ` lit. ${p.litera.replace(")", "")}` : "");
}

export function renderuj(wejscie: any, bib: any = biblioteka): Dokument {
  // Renderer nie modyfikuje danych wejściowych (pola pomocnicze, np.
  // wlasciciel_oznaczenie, lądują w kopii) — dane wracają do wywołującego
  // w postaci zgodnej ze schematem.
  const dane = structuredClone(wejscie);
  const fakty = zbudujFakty(dane);
  const ctx: Ctx = { ...dane, ...fakty };

  for (const n of dane.nieruchomosci) {
    n.wlasciciel_oznaczenie = ROLA_NAZWA[n.wlasciciel_ref];
  }

  const sekcjeDef: Record<string, any> = bib.sekcje;
  const klauzule: any[] = bib.klauzule;

  const wynikSekcje: Sekcja[] = [];
  const posortowaneSekcje = Object.entries(sekcjeDef).sort((a, b) => a[1].order - b[1].order);

  for (const [nazwaSekcji, meta] of posortowaneSekcje) {
    if (!ewaluujWarunek(meta.warunek ?? true, ctx)) continue;

    const ustepy: Ustep[] = [];
    const klSekcji = klauzule
      .filter((k) => k.sekcja === nazwaSekcji)
      .sort((a, b) => a.order - b.order);
    for (const kl of klSekcji) {
      if (!ewaluujWarunek(kl.warunek ?? true, ctx)) continue;
      ustepy.push(...renderujKlauzule(kl, ctx, fakty));
    }

    if (ustepy.length) {
      let tytul = meta.tytul;
      for (const [war, alt] of Object.entries(meta.tytul_warunkowy ?? {})) {
        if (ewaluujWarunek(war, ctx)) {
          tytul = alt as string;
          break;
        }
      }
      wynikSekcje.push({ nazwa: nazwaSekcji, tytul, ustepy });
    }
  }

  // numeracja: paragrafy i ustępy
  wynikSekcje.forEach((sek, i) => {
    sek.numer = i + 1;
    let nrUst = 0;
    for (const u of sek.ustepy) {
      if (u.poziom === "ustep") {
        nrUst += 1;
        u.numer = nrUst;
      } else {
        u.numer = null;
      }
    }
    let idx = 0;
    for (const u of sek.ustepy) {
      if (u.poziom === "podpunkt") {
        u.litera = LITERY[idx % LITERY.length] + ")";
        idx += 1;
      } else {
        idx = 0;
      }
    }
  });

  // Interpunkcja wyliczeń: ostatni podpunkt ciągu kończy się kropką, a nie
  // średnikiem — niezależnie od tego, które podpunkty weszły do Umowy.
  for (const sek of wynikSekcje) {
    sek.ustepy.forEach((u, i) => {
      const nast = sek.ustepy[i + 1];
      if (u.poziom === "podpunkt" && (!nast || nast.poziom !== "podpunkt") && u.tekst.endsWith(";"))
        u.tekst = u.tekst.slice(0, -1) + ".";
    });
  }

  // położenia klauzul + rozwiązanie odesłań
  const polozenia: Record<string, Polozenie> = {};
  for (const sek of wynikSekcje) {
    let biezacyUstep: number | null = null;
    for (const u of sek.ustepy) {
      if (u.poziom === "ustep") biezacyUstep = u.numer ?? null;
      if (polozenia[u.zrodlo]) continue;
      polozenia[u.zrodlo] = {
        paragraf: sek.numer!,
        ustep: biezacyUstep,
        ...(u.poziom === "podpunkt" && u.litera ? { litera: u.litera } : {}),
      };
    }
  }
  const tematy: Record<string, string> = {};
  for (const k of klauzule) if (k.temat_odeslania) tematy[k.id] = k.temat_odeslania;
  for (const sek of wynikSekcje) {
    for (const u of sek.ustepy) {
      u.tekst = u.tekst.replace(LISTA_ODESLAN_RE, (_m, lista: string) => {
        const obecne = lista
          .split(",")
          .filter((id) => polozenia[id])
          .map((id) => {
            const ref = tekstOdeslania(polozenia[id]);
            return tematy[id] ? `${tematy[id]} (${ref})` : ref;
          });
        if (obecne.length === 0) {
          throw new BladPola(
            `Klauzula ${u.zrodlo} odsyła do oświadczeń ${lista}, z których żadne nie weszło do Umowy`,
          );
        }
        return obecne.length > 1
          ? obecne.slice(0, -1).join(", ") + " lub " + obecne[obecne.length - 1]
          : obecne[0];
      });
      u.tekst = u.tekst.replace(ODESLANIE_RE, (_m, rodzaj, id) => {
        const p = polozenia[id];
        if (!p) {
          throw new BladPola(
            `Klauzula ${u.zrodlo} odsyła do klauzuli ${id}, która nie weszła do Umowy`,
          );
        }
        return tekstOdeslania(p, rodzaj === "ref_par");
      });
    }
  }

  const doc: Dokument = {
    meta: dane.meta,
    komparycja: komparycja(dane),
    sekcje: wynikSekcje,
    fakty,
    zalaczniki: zalaczniki(dane, fakty),
    polozenia,
  };
  // Każde odesłanie wewnętrzne musi wskazywać istniejącą jednostkę redakcyjną.
  const bledy = bledyOdeslanUmowy(doc);
  if (bledy.length) throw new BladPola(`Błędne odesłania: ${bledy.join("; ")}`);
  return doc;
}

function renderujKlauzule(kl: any, ctx: Ctx, fakty: Record<string, any>): Ustep[] {
  const out: Ustep[] = [];
  const poziom: "ustep" | "podpunkt" = kl.poziom ?? "ustep";

  if (kl.iteruje) {
    const kolekcja: any[] = (fakty[kl.iteruje] || (ctx as any)[kl.iteruje] || []) as any[];
    if (!kolekcja || kolekcja.length === 0) return [];

    if (kl.id === "ZAB_01_hipoteka") {
      if (kolekcja.length === 1) {
        const n = kolekcja[0];
        out.push({
          poziom: "ustep",
          tekst: podstaw(kl.tekst_pojedyncza, ctx, { n }),
          zrodlo: kl.id,
        });
      } else {
        out.push({
          poziom: "ustep",
          tekst: podstaw(kl.tekst_wielokrotna_naglowek, ctx),
          zrodlo: kl.id,
        });
        for (const n of kolekcja) {
          out.push({
            poziom: "podpunkt",
            tekst: podstaw(kl.tekst_wielokrotna_pozycja, ctx, { n }),
            zrodlo: kl.id,
          });
        }
        const stopka =
          fakty.charakter_hipoteki === "laczna"
            ? "tekst_wielokrotna_stopka_laczna"
            : "tekst_wielokrotna_stopka_odrebna";
        out.push({ poziom: "ustep", tekst: podstaw(kl[stopka], ctx), zrodlo: kl.id });
      }
      return out;
    }

    let kluczLokalny: string;
    if (String(kl.iteruje).startsWith("obciazenia")) kluczLokalny = "o";
    else if (String(kl.iteruje).startsWith("uchwaly")) kluczLokalny = "u";
    else kluczLokalny = "n";

    for (const el of kolekcja) {
      out.push({
        poziom,
        tekst: podstaw(kl.tekst_pozycja, ctx, { [kluczLokalny]: el }),
        zrodlo: kl.id,
      });
    }
    return out;
  }

  if (kl.podpunkty_dynamiczne) {
    out.push({ poziom: "ustep", tekst: podstaw(kl.tekst, ctx), zrodlo: kl.id });
    for (const t of fakty[kl.podpunkty_dynamiczne]) {
      const kwota = t.kwota;
      const prefix =
        kwota !== "pozostała część Kwoty Pożyczki"
          ? `w części stanowiącej kwotę ${kwota} zł — `
          : "pozostałą część Kwoty Pożyczki — ";
      out.push({ poziom: "podpunkt", tekst: prefix + t.opis + ";", zrodlo: kl.id });
    }
    return out;
  }

  out.push({ poziom, tekst: podstaw(kl.tekst, ctx), zrodlo: kl.id });
  return out;
}

/**
 * Udziały we współwłasności ułamkowej (zmiana 1 po Kańkowskich) — dopisek do
 * komparycji przy osobie będącej współwłaścicielem w częściach ułamkowych.
 */
function opisUdzialowUlamkowych(d: any, p: any): string {
  if (!p || p.typ !== "osoba_fizyczna") return "";
  const czesci: string[] = [];
  for (const n of d.nieruchomosci ?? []) {
    const w = n.wspolwlasnosc;
    if (w?.rodzaj !== "ulamkowa") continue;
    for (const ws of w.wspolwlasciciele ?? []) {
      if (ws?.pesel && ws.pesel === p.pesel && ws.udzial) {
        const rola = jestKobieta(p) ? "współwłaścicielka" : "współwłaściciel";
        czesci.push(
          `${rola} w udziale wynoszącym ${ws.udzial} części nieruchomości objętej księgą wieczystą nr ${n.nr_kw}`,
        );
      }
    }
  }
  return czesci.length ? ", " + czesci.join(", ") : "";
}

// Formy prawne, których nazwa rodzajowa jest rodzaju żeńskiego (spółka,
// fundacja, spółdzielnia) — „zwaną dalej”.
const FORMY_ZENSKIE = new Set([
  "spolka_jawna",
  "spolka_partnerska",
  "spolka_komandytowa",
  "spolka_komandytowo_akcyjna",
  "sp_z_oo",
  "prosta_sa",
  "sa",
  "spoldzielnia",
  "fundacja",
]);

/** „zwanym” / „zwaną” / „zwanymi łącznie” — zgodnie z rodzajem oznaczenia strony. */
export function formaZwany(s: any): string {
  if (!s) return "zwanym";
  if (s.typ === "osoba_fizyczna") return jestKobieta(s) ? "zwaną" : "zwanym";
  if (s.forma === "spolka_cywilna" && Array.isArray(s.wspolnicy_sc)) return "zwanymi łącznie";
  if (s.forma && FORMY_ZENSKIE.has(s.forma)) return "zwaną";
  if (s.forma === "stowarzyszenie") return "zwanym";
  const nazwa = `${s.nazwa ?? ""} ${s.forma_prawna ?? ""}`.toLowerCase();
  return /\bsp\.|spółk|s\.a\.|fundacj|spółdziel/.test(nazwa) ? "zwaną" : "zwanym";
}

function komparycja(d: any): Dokument["komparycja"] {
  const poz = listaPozyczkobiorcow(d);
  const rolaPb = poz.length > 1 ? "Pożyczkobiorcami" : "Pożyczkobiorcą";
  // Zmiana 2 po Kańkowskich: dwoje (lub więcej) rolników wśród pożyczkobiorców
  // komparycja opisuje jako „rolników prowadzących wspólne gospodarstwo rolne".
  const wspolneGospodarstwo =
    poz.filter((p) => p?.typ === "osoba_fizyczna" && p.dzialalnosc === "gospodarstwo_rolne")
      .length > 1;
  const strony: Strona[] = poz.map((p, i) => ({
    rola: rolaPb,
    // Kilku pożyczkobiorców: jedno „zwanymi dalej łącznie” po ostatnim z nich.
    zwany:
      poz.length > 1
        ? i === poz.length - 1
          ? `zwanymi dalej łącznie „${rolaPb}”`
          : ""
        : `${formaZwany(p)} dalej „${rolaPb}”`,
    opis:
      oznaczenieStrony(p, true, {
        wspolneGospodarstwo:
          wspolneGospodarstwo &&
          p?.typ === "osoba_fizyczna" &&
          p.dzialalnosc === "gospodarstwo_rolne",
      }) + opisUdzialowUlamkowych(d, p),
    grupa: "pozyczkobiorca",
  }));
  if (d.porecziciel) {
    strony.push({
      rola: "Poręczycielem",
      zwany: `${formaZwany(d.porecziciel)} dalej „Poręczycielem”`,
      opis: oznaczenieStrony(d.porecziciel) + opisUdzialowUlamkowych(d, d.porecziciel),
    });
  }
  const widziani = new Set<string>();
  for (const n of d.nieruchomosci) {
    if (n.wlasciciel_ref === "osoba_trzecia" && n.wlasciciel_dane) {
      const opis =
        oznaczenieStrony(n.wlasciciel_dane) + opisUdzialowUlamkowych(d, n.wlasciciel_dane);
      if (!widziani.has(opis)) {
        widziani.add(opis);
        strony.push({
          rola: "Właścicielem nieruchomości",
          opis,
          zwany: `${formaZwany(n.wlasciciel_dane)} dalej „Właścicielem nieruchomości”`,
        });
      }
    }
  }
  strony.push({
    rola: "Pożyczkodawcą",
    opis: oznaczenieStrony(d.pozyczkodawca),
    zwany: `${formaZwany(d.pozyczkodawca)} dalej „Pożyczkodawcą”`,
  });
  return { data: d.meta.data_umowy, miejscowosc: d.meta.miejscowosc, strony };
}

function zalaczniki(d: any, f: Record<string, any>): { nr: number; tytul: string }[] {
  const z: { nr: number; tytul: string }[] = [{ nr: 1, tytul: "Harmonogram spłat" }];
  let nr = 2;
  z.push({ nr, tytul: "Protokół z negocjacji indywidualnych" });
  nr += 1;
  z.push({ nr, tytul: "Tabela opłat windykacyjnych" });
  nr += 1;
  if (f.wymaga_zgody_malzonka) {
    z.push({ nr, tytul: "Zgoda małżonka na ustanowienie hipoteki" });
    nr += 1;
  }
  if (f.porecziciel_wymaga_zgody_malzonka && f.zgoda_malzonka_na_poreczenie) {
    z.push({ nr, tytul: "Zgoda małżonka Poręczyciela na udzielenie poręczenia" });
    nr += 1;
  }
  if (f.ma_zrzeczenia) {
    z.push({ nr, tytul: "Oświadczenie o zrzeczeniu się prawa obciążającego nieruchomość" });
    nr += 1;
  }
  return z;
}

export function wczytajBiblioteke(): any {
  return biblioteka;
}
