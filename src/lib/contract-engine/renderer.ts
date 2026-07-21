/**
 * Renderer umowy — deterministyczne składanie dokumentu z klauzul.
 *
 * Port z `renderer.py` (renderuj, _renderuj_klauzule, _komparycja, _zalaczniki,
 * podstaw). Te same dane zawsze dają ten sam dokument — żadnych decyzji
 * redakcyjnych. Sekcja/ustęp, który się nie kwalifikuje, nie zostawia dziury,
 * a numeracja przelicza się sama.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildFacts, listaPozyczkobiorcow, oznaczenieStrony, ROLA_NAZWA, type Fakty } from "./facts";
import { evalCondition, resolvePath, type Ctx } from "./conditions";

type Dane = Record<string, any>;

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
}
export interface Komparycja {
  data: string;
  miejscowosc: string;
  strony: Strona[];
}
export interface Zalacznik {
  nr: number;
  tytul: string;
}
export interface Dokument {
  meta: Dane;
  komparycja: Komparycja;
  sekcje: Sekcja[];
  fakty: Fakty;
  zalaczniki: Zalacznik[];
}

export class KeyErrorPola extends Error {}

const POLE_RE = /\{\{([^}]+)\}\}/g;

/** Podstawienie pól {{...}}. lokalne: mapy prefiksów (n/o/u) na obiekt. */
export function podstaw(tekst: string, ctx: Ctx, lokalne?: Record<string, Dane>): string {
  return tekst.replace(POLE_RE, (_m, g1: string) => {
    const sciezka = g1.trim();
    if (lokalne) {
      for (const pref of Object.keys(lokalne)) {
        const obj = lokalne[pref];
        if (sciezka === pref || sciezka.startsWith(pref + ".")) {
          const reszta = sciezka.slice(pref.length).replace(/^\.+/, "");
          const v = reszta ? resolvePath({ [pref]: obj } as Ctx, sciezka) : obj;
          if (v === null || v === undefined) {
            throw new KeyErrorPola(`Brak wartości dla pola {{${sciezka}}}`);
          }
          return String(v);
        }
      }
    }
    const v = resolvePath(ctx, sciezka);
    if (v === null || v === undefined) {
      throw new KeyErrorPola(`Brak wartości dla pola {{${sciezka}}}`);
    }
    return String(v);
  });
}

function renderujKlauzule(kl: Dane, ctx: Ctx, fakty: Fakty): Ustep[] {
  const out: Ustep[] = [];
  const poziom: "ustep" | "podpunkt" = kl.poziom ?? "ustep";

  // klauzula iterująca po kolekcji
  if (kl.iteruje) {
    const kolekcja: Dane[] =
      (fakty[kl.iteruje] && fakty[kl.iteruje].length ? fakty[kl.iteruje] : undefined) ??
      ((ctx as Dane)[kl.iteruje] && (ctx as Dane)[kl.iteruje].length
        ? (ctx as Dane)[kl.iteruje]
        : undefined) ??
      [];
    if (!kolekcja.length) return [];

    // wariant hipoteki: jedna vs wiele nieruchomości
    if (kl.id === "ZAB_01_hipoteka") {
      if (kolekcja.length === 1) {
        out.push({
          poziom: "ustep",
          tekst: podstaw(kl.tekst_pojedyncza, ctx, { n: kolekcja[0] }),
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

    const kluczLokalny = kl.iteruje.startsWith("obciazenia")
      ? "o"
      : kl.iteruje.startsWith("uchwaly")
        ? "u"
        : "n";
    for (const el of kolekcja) {
      out.push({
        poziom,
        tekst: podstaw(kl.tekst_pozycja, ctx, { [kluczLokalny]: el }),
        zrodlo: kl.id,
      });
    }
    return out;
  }

  // klauzula z dynamicznymi podpunktami (transze wypłaty)
  if (kl.podpunkty_dynamiczne) {
    out.push({ poziom: "ustep", tekst: podstaw(kl.tekst, ctx), zrodlo: kl.id });
    for (const t of fakty[kl.podpunkty_dynamiczne] as Dane[]) {
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

function komparycja(d: Dane): Komparycja {
  const poz = listaPozyczkobiorcow(d);
  const rolaPb = poz.length > 1 ? "Pożyczkobiorcami" : "Pożyczkobiorcą";
  const strony: Strona[] = poz.map((p) => ({
    rola: rolaPb,
    opis: oznaczenieStrony(p),
    grupa: "pozyczkobiorca",
  }));
  if (d.porecziciel) {
    strony.push({ rola: "Poręczycielem", opis: oznaczenieStrony(d.porecziciel) });
  }
  const widziani = new Set<string>();
  for (const n of d.nieruchomosci as Dane[]) {
    if (n.wlasciciel_ref === "osoba_trzecia" && n.wlasciciel_dane) {
      const opis = oznaczenieStrony(n.wlasciciel_dane);
      if (!widziani.has(opis)) {
        widziani.add(opis);
        strony.push({ rola: "Właścicielem nieruchomości", opis });
      }
    }
  }
  strony.push({ rola: "Pożyczkodawcą", opis: oznaczenieStrony(d.pozyczkodawca) });
  return { data: d.meta.data_umowy, miejscowosc: d.meta.miejscowosc, strony };
}

function zalaczniki(d: Dane, f: Fakty): Zalacznik[] {
  const z: Zalacznik[] = [{ nr: 1, tytul: "Harmonogram spłat" }];
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

const LITERY = "abcdefghijklmnoprstuwz";

/** Główny renderer: dane + biblioteka klauzul → struktura dokumentu. */
export function renderuj(dane: Dane, biblioteka: Dane): Dokument {
  const fakty = buildFacts(dane);
  const ctx: Ctx = { ...dane, ...fakty };

  // wzbogacenie nieruchomości o oznaczenie właściciela
  for (const n of dane.nieruchomosci as Dane[]) {
    n.wlasciciel_oznaczenie = ROLA_NAZWA[n.wlasciciel_ref];
  }

  const sekcjeDef: Record<string, Dane> = biblioteka.sekcje;
  const klauzule: Dane[] = biblioteka.klauzule;

  const wynikSekcje: Sekcja[] = [];
  const posortowaneSekcje = Object.entries(sekcjeDef).sort((a, b) => a[1].order - b[1].order);

  for (const [nazwaSekcji, meta] of posortowaneSekcje) {
    if (!evalCondition(meta.warunek ?? true, ctx)) continue;

    const klauzuleSekcji = klauzule
      .filter((k) => k.sekcja === nazwaSekcji)
      .sort((a, b) => a.order - b.order);

    const ustepy: Ustep[] = [];
    for (const kl of klauzuleSekcji) {
      if (!evalCondition(kl.warunek ?? true, ctx)) continue;
      ustepy.push(...renderujKlauzule(kl, ctx, fakty));
    }

    if (ustepy.length) {
      let tytul = meta.tytul as string;
      for (const [war, alt] of Object.entries(meta.tytul_warunkowy ?? {})) {
        if (evalCondition(war, ctx)) {
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
    // literowanie podpunktów w obrębie poprzedzającego ustępu
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

  return {
    meta: dane.meta,
    komparycja: komparycja(dane),
    sekcje: wynikSekcje,
    fakty,
    zalaczniki: zalaczniki(dane, fakty),
  };
}
