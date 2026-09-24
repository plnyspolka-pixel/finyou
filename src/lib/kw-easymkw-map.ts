// Mapowanie surowego JSON-a z EasyMKW na strukturę KwExtraction, którą
// renderujemy do tych samych kolumn HTML (dzial_1o/1s/2/3/4), jakie zapisuje
// stary silnik CMD. Dzięki temu WSZYSTKIE parsery (analiza ryzyka, adres,
// współwłaściciele, hipoteki) działają identycznie niezależnie od dostawcy.

import type { KwExtraction, KwExtractionOwner } from "@/lib/kw-render";

type Any = Record<string, any>;

function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t && t !== "null" && t !== "undefined" ? t : null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function joinNonEmpty(parts: Array<string | null | undefined>, sep = " "): string | null {
  const v = parts.map((p) => s(p)).filter(Boolean).join(sep);
  return v || null;
}

function mapOwners(dzial2: Any | undefined): KwExtractionOwner[] {
  const out: KwExtractionOwner[] = [];
  const groups: Any[] = [
    ...(dzial2?.wlasciciele ?? []),
    ...(dzial2?.wlascicieleWyodrebnionegoLokalu ?? []),
    ...(dzial2?.uzytkownicyWieczysci ?? []),
    ...(dzial2?.uprawnieni ?? []),
  ];
  for (const g of groups) {
    const udzial = s(g?.prawo?.wlkUdzialu);
    const osoby: Any[] = g?.osoby ?? [];
    const podmioty: Any[] = g?.podmioty ?? g?.instytucje ?? g?.osobyPrawne ?? [];
    for (const o of osoby) {
      out.push({
        imiePierwsze: s(o?.imie1 ?? o?.imie),
        imieDrugie: s(o?.imie2),
        nazwisko: joinNonEmpty([o?.nazwisko1 ?? o?.nazwisko, o?.nazwisko2], "-"),
        imieOjca: s(o?.imieOjca),
        imieMatki: s(o?.imieMatki),
        pesel: s(o?.pesel),
        udzial,
      });
    }
    for (const p of podmioty) {
      out.push({
        nazwa: s(p?.nazwa ?? p?.nazwaPelna),
        regon: s(p?.regon),
        siedziba: s(p?.siedziba ?? p?.miejscowosc),
        udzial,
      });
    }
    // Niektóre odpowiedzi trzymają dane podmiotu bezpośrednio w grupie.
    if (!osoby.length && !podmioty.length && (s(g?.nazwa) || s(g?.nazwisko1))) {
      out.push(
        s(g?.nazwa)
          ? { nazwa: s(g?.nazwa), regon: s(g?.regon), siedziba: s(g?.siedziba), udzial }
          : {
              imiePierwsze: s(g?.imie1),
              nazwisko: s(g?.nazwisko1),
              pesel: s(g?.pesel),
              udzial,
            },
      );
    }
  }
  return out;
}

function mapDzial1o(d: Any | undefined): KwExtraction["dzial1o"] {
  if (!d) return null;
  const dzialki = (d.dzialki ?? []).map((dz: Any) => ({
    numer: s(dz?.nrDzialki),
    obreb: joinNonEmpty([dz?.nazwaObrebu, dz?.nrObrebu], " / "),
    polozenie: joinNonEmpty(
      [dz?.polozenia?.[0]?.miejscowosc, dz?.polozenia?.[0]?.gmina, dz?.polozenia?.[0]?.powiat],
      ", ",
    ),
    sposobKorzystania: s(dz?.sposobKorzystania),
  }));
  const pol: Any =
    d.polozenia?.[0] ??
    d.dzialki?.[0]?.polozenia?.[0] ??
    d.lokale?.[0]?.polozenia?.[0] ??
    d.budynki?.[0]?.polozenia?.[0] ??
    {};
  const adres: Any = d.adresy?.[0] ?? d.lokale?.[0]?.adresy?.[0] ?? d.budynki?.[0]?.adresy?.[0] ?? d.dzialki?.[0]?.adresy?.[0] ?? {};
  const lokal: Any = d.lokale?.[0] ?? {};
  return {
    wojewodztwo: s(pol?.wojewodztwo),
    powiat: s(pol?.powiat),
    gmina: s(pol?.gmina),
    miejscowosc: s(pol?.miejscowosc ?? adres?.miejscowosc),
    ulica: s(adres?.ulica),
    numerBudynku: s(adres?.nrBudynku ?? adres?.numerBudynku),
    numerLokalu: s(adres?.nrLokalu ?? adres?.numerLokalu),
    przeznaczenie: s(lokal?.przeznaczenieLokalu ?? lokal?.przeznaczenie ?? d?.nieruchomosc?.sposobKorzystania),
    obszar: s(d?.nieruchomosc?.obszar ?? lokal?.polePowierzchni ?? lokal?.obszar),
    kondygnacja: num(lokal?.kondygnacja),
    liczbaKondygnacji: num(lokal?.liczbaKondygnacji ?? d?.budynki?.[0]?.liczbaKondygnacji),
    dzialki,
    inne: [],
  };
}

function entryText(e: Any): string | null {
  return (
    s(e?.tresc) ??
    s(e?.opis) ??
    s(e?.trescWpisu) ??
    s(e?.rodzajWpisu) ??
    (typeof e === "string" ? s(e) : null)
  );
}

function mapDzial3(d: Any | undefined): KwExtraction["dzial3"] {
  if (!d) return null;
  const src: Any[] = [
    ...(d.prawaRoszczeniaOgraniczenia ?? []),
    ...(d.wpisy ?? []),
    ...(d.roszczenia ?? []),
    ...(d.ostrzezenia ?? []),
  ];
  const wpisy = src
    .map((e) => ({
      rodzaj: s(e?.rodzajWpisu ?? e?.rodzaj ?? e?.typWpisu),
      tresc: entryText(e),
    }))
    .filter((w) => w.rodzaj || w.tresc);
  return { brakWpisu: wpisy.length === 0, wpisy };
}

function mapDzial4(d: Any | undefined): KwExtraction["dzial4"] {
  if (!d) return null;
  const hipoteki = (d.hipoteki ?? [])
    .map((h: Any) => ({
      numer: s(h?.numerHipoteki ?? h?.lp ?? h?.numer),
      rodzaj: s(h?.rodzajHipoteki ?? h?.rodzaj),
      sumaKwota: num(h?.sumaHipoteki?.wartosc ?? h?.sumaHipoteki ?? h?.suma?.wartosc ?? h?.suma ?? h?.kwota),
      walutaSumy: s(h?.sumaHipoteki?.waluta ?? h?.suma?.waluta ?? h?.waluta) ?? "ZŁ",
      wierzyciel: joinNonEmpty(
        [
          h?.wierzyciele?.[0]?.nazwa,
          h?.wierzyciele?.[0]?.podmioty?.[0]?.nazwa,
          h?.wierzyciel?.nazwa,
          h?.wierzyciel,
        ],
        " ",
      ),
      tresc: s(h?.trescWpisu ?? h?.opis ?? h?.tresc),
    }))
    .filter((h: Any) => h.rodzaj || h.sumaKwota != null || h.wierzyciel || h.tresc);
  return { brakWpisu: hipoteki.length === 0, hipoteki };
}

function mapDzial1s(d: Any | undefined): KwExtraction["dzial1sp"] {
  if (!d) return null;
  const wpisy = [
    ...(d.prawaZwiazaneZWlasnoscia ?? []),
    ...(d.prawaUzytkowaniaWieczystego ?? []),
    ...(d.spoldzielnieMieszkaniowe ?? []),
  ]
    .map((e: Any) => entryText(e))
    .filter((v): v is string => !!v);
  return { wpisy };
}

/** Surowy JSON EasyMKW → KwExtraction (wejście dla renderKwSections). */
export function easyMkwJsonToExtraction(raw: unknown): KwExtraction {
  const j = (raw ?? {}) as Any;
  const root: Any = j.dzial1o || j.dzial2 || j.okladka ? j : (j.tresc ?? j.data ?? j.ksiega ?? j);
  return {
    kwNumber: s(root?.nrKsiegiWieczystej),
    typKsiegi: s(root?.okladka?.typKsiegi),
    sadRejonowy: joinNonEmpty(
      [root?.okladka?.daneWydzialu?.nazwaSadu, root?.okladka?.daneWydzialu?.nazwaWydzialu],
      ", ",
    ),
    dzial1o: mapDzial1o(root?.dzial1o),
    dzial1sp: mapDzial1s(root?.dzial1s),
    dzial2: root?.dzial2 ? { wlasciciele: mapOwners(root.dzial2) } : null,
    dzial3: mapDzial3(root?.dzial3),
    dzial4: mapDzial4(root?.dzial4),
    uwagi: [],
  };
}

/** Data stanu księgi z odpowiedzi dostawcy (ISO) — do okładki. */
export function easyMkwStanZDnia(raw: unknown): string | null {
  return s((raw as Any)?.stanZDnia);
}
