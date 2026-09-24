/**
 * Komplet dokumentów pożyczki w JEDNYM pliku .docx — z jednego silnika.
 *
 * Kolejność części (każda od nowej strony, pod każdą blok podpisów):
 *   1. Wniosek o udzielenie pożyczki pieniężnej
 *   2. Umowa pożyczki (komparycja + § z biblioteki klauzul + lista załączników)
 *   3. Załącznik nr 1 — Harmonogram spłat (tabela rat + podsumowanie sum)
 *   4. Załącznik nr 2 — Protokół z negocjacji indywidualnych
 *   5. Załącznik nr 3 — Tabela opłat windykacyjnych
 *
 * Zasada: dokument zawiera WYŁĄCZNIE treść wiążącą — bez ostrzeżeń, uwag,
 * komentarzy, notatek dla operatora ani znaków wodnych. Treść umowy pochodzi
 * z `renderuj()` (biblioteka klauzul), treść wniosku i załączników — z danych
 * `UmowaData` i stałych wzorca poniżej.
 *
 * Budowa w dwóch krokach: `zbudujBloki()` → model bloków (czysty, testowalny),
 * `blokiDoXml()` → WordprocessingML. Bloki podpisów są niewidocznymi tabelami
 * (nie tabulatorami — te rozjeżdżają się po imporcie do Google Drive).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Dokument } from "./renderer";
import { tekstOdeslania } from "./renderer";
import { krotkieOznaczenie, listaPozyczkobiorcow, oznaczenieStrony, rodzajZenski } from "./facts";
import { formatKwotaPL, parseKwota } from "./schedule";
import { OPLATY_WINDYKACYJNE_DOMYSLNE, type OplataWindykacyjna } from "./oplaty-windykacyjne";

export interface KompletOpcje {
  /** Stawki Załącznika nr 3; domyślnie `OPLATY_WINDYKACYJNE_DOMYSLNE`. */
  oplaty?: readonly OplataWindykacyjna[];
}

// ── model bloków ───────────────────────────────────────────────

export interface Run {
  tekst: string;
  bold?: boolean;
  italic?: boolean;
}
export type Komorka = {
  tekst: string | Run[];
  bold?: boolean;
  align?: "left" | "center" | "right";
};
export interface Podpisujacy {
  rola: string;
  nazwa?: string;
  /** Osoby podpisujące w imieniu podmiotu (reprezentacja). */
  wImieniu?: string[];
}

export type Blok =
  | { t: "tytul"; tekst: string; nowaStrona?: boolean }
  | { t: "podtytul"; tekst: string }
  | { t: "naglowek"; tekst: string }
  | {
      t: "akapit";
      runs: Run[];
      wciecie?: "ustep" | "podpunkt" | "lista";
      etykieta?: string;
      align?: "both" | "left" | "center";
    }
  | { t: "tabela"; szerokosci: number[]; wiersze: { komorki: Komorka[]; naglowek?: boolean }[] }
  | { t: "podpisy"; osoby: Podpisujacy[] };

const r = (tekst: string, o: Omit<Run, "tekst"> = {}): Run => ({ tekst, ...o });
const akapit = (tekst: string | Run[], o: Partial<Extract<Blok, { t: "akapit" }>> = {}): Blok => ({
  t: "akapit",
  runs: typeof tekst === "string" ? [r(tekst)] : tekst,
  ...o,
});
const lista = (tekst: string | Run[]): Blok => akapit(tekst, { wciecie: "lista", etykieta: "–" });

const CHECK = (v: boolean | null | undefined) => (v ? "☒" : "☐");
/** Liczebnik z rzeczownikiem: formy dla 1, dla 2–4 (bez 12–14) i pozostałych. */
function odmienLiczbe(n: number, jeden: string, kilka: string, wiele: string): string {
  const d = n % 10;
  const s = n % 100;
  if (n === 1) return `1 ${jeden}`;
  if (d >= 2 && d <= 4 && !(s >= 12 && s <= 14)) return `${n} ${kilka}`;
  return `${n} ${wiele}`;
}
/** „1 rata”, „2 raty”, „5 rat”, „22 raty”, „12 rat”. */
export const ratyLiczba = (n: number) => odmienLiczbe(n, "rata", "raty", "rat");
const miesiaceLiczba = (n: number) => odmienLiczbe(n, "miesiąc", "miesiące", "miesięcy");
const zl = (cyframi: string | null | undefined) => `${cyframi ?? ""} zł`;

// ── strony i podpisy ───────────────────────────────────────────

function reprezentanci(s: any): string[] {
  const rep = s?.reprezentacja;
  const l: any[] = !rep ? [] : Array.isArray(rep) ? rep : [rep];
  return l.map((x) => `${x.imie_nazwisko} – ${x.funkcja}`);
}

function podpisujacy(s: any, rola: string): Podpisujacy {
  const p: Podpisujacy = { rola, nazwa: krotkieOznaczenie(s) };
  if (s?.typ === "podmiot_gospodarczy") {
    if (s.forma === "spolka_cywilna" && Array.isArray(s.wspolnicy_sc)) {
      p.wImieniu = s.wspolnicy_sc.map((w: any) => `${w.imie_nazwisko} – wspólnik`);
    } else {
      const rep = reprezentanci(s);
      if (rep.length) p.wImieniu = rep;
    }
    p.nazwa = oznaczenieStrony(s, false);
  }
  return p;
}

/** Wszystkie Strony Umowy w kolejności komparycji. */
function stronyDoPodpisu(d: any): Podpisujacy[] {
  const out: Podpisujacy[] = listaPozyczkobiorcow(d).map((p) => podpisujacy(p, "Pożyczkobiorca"));
  if (d.porecziciel) out.push(podpisujacy(d.porecziciel, "Poręczyciel"));
  const widziani = new Set<string>();
  for (const n of d.nieruchomosci ?? []) {
    if (n.wlasciciel_ref === "osoba_trzecia" && n.wlasciciel_dane) {
      const k = oznaczenieStrony(n.wlasciciel_dane);
      if (widziani.has(k)) continue;
      widziani.add(k);
      out.push(podpisujacy(n.wlasciciel_dane, "Właściciel nieruchomości"));
    }
  }
  out.push(podpisujacy(d.pozyczkodawca, "Pożyczkodawca"));
  return out;
}

function nazwyPozyczkobiorcow(d: any): string {
  const l = listaPozyczkobiorcow(d);
  const rolnicy = l.filter(
    (p) => p?.typ === "osoba_fizyczna" && p.dzialalnosc === "gospodarstwo_rolne",
  ).length;
  const nazwy = l.map((p) =>
    p?.typ === "osoba_fizyczna"
      ? p.firma
        ? `${p.imie_nazwisko}, ${rodzajZenski(p.imie_nazwisko) ? "prowadząca" : "prowadzący"} działalność gospodarczą pod firmą ${p.firma}`
        : p.imie_nazwisko
      : oznaczenieStrony(p, false),
  );
  const tekst =
    nazwy.length > 1 ? nazwy.slice(0, -1).join(", ") + " oraz " + nazwy.at(-1) : nazwy[0];
  if (rolnicy > 1 && rolnicy === l.length)
    return `${tekst} — rolnicy prowadzący wspólne gospodarstwo rolne`;
  return tekst ?? "";
}

function identyfikatory(p: any): string {
  if (p?.typ === "osoba_fizyczna") {
    return [`PESEL ${p.pesel}`, p.nip ? `NIP ${p.nip}` : null, p.regon ? `REGON ${p.regon}` : null]
      .filter(Boolean)
      .join(", ");
  }
  return [
    p?.krs ? `KRS ${p.krs}` : null,
    p?.nip ? `NIP ${p.nip}` : null,
    p?.regon ? `REGON ${p.regon}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Wartość pola wniosku dla jednej lub wielu osób („Imię: wartość; …”). */
function poleWielu(l: any[], f: (p: any) => string | null | undefined): string {
  const w = l.map((p) => [krotkieOznaczenie(p), (f(p) ?? "").trim()] as const);
  const niepuste = w.filter(([, v]) => v);
  if (l.length === 1) return w[0]?.[1] ?? "";
  const unikalne = new Set(niepuste.map(([, v]) => v));
  if (unikalne.size === 1 && niepuste.length === l.length) return niepuste[0][1];
  return niepuste.map(([n, v]) => `${v} (${n})`).join("; ");
}

// ── 1. Wniosek ─────────────────────────────────────────────────

function wniosekBloki(d: any): Blok[] {
  const l = listaPozyczkobiorcow(d);
  const h = d.warunki.harmonogram;
  const w = d.wniosek ?? {};
  const wid = [2400, 7238];
  const wiersz = (a: string, b: string) => ({
    komorki: [{ tekst: a, bold: true }, { tekst: b }] as Komorka[],
  });

  const zabezp: string[] = (d.nieruchomosci ?? []).map(
    (n: any) =>
      `hipoteka umowna do ${zl(n.hipoteka?.kwota?.cyframi)} na nieruchomości KW nr ${n.nr_kw}`,
  );
  const e777 = d.zabezpieczenia?.egzekucja_777;
  let zabTxt = zabezp.join("; ");
  if (e777)
    zabTxt += ` oraz oświadczenie o poddaniu się egzekucji (art. 777 § 1 pkt 5 k.p.c.) do ${zl(e777.kwota?.cyframi)}`;

  const pep = w.pep;
  const ocena = w.aml_ocena_ryzyka;
  const prog = w.aml_powyzej_15000_eur;

  return [
    { t: "tytul", tekst: "WNIOSEK O UDZIELENIE POŻYCZKI PIENIĘŻNEJ" },
    { t: "naglowek", tekst: "I. DANE WNIOSKODAWCY" },
    {
      t: "tabela",
      szerokosci: wid,
      wiersze: [
        wiersz("Imię i nazwisko / Firma:", nazwyPozyczkobiorcow(d)),
        wiersz("PESEL / NIP:", poleWielu(l, identyfikatory)),
        wiersz(
          "Seria i numer dok. tożsamości:",
          poleWielu(l, (p) => (p?.typ === "osoba_fizyczna" ? p.dokument_tozsamosci : null)),
        ),
        wiersz(
          "Adres zamieszkania / siedziby:",
          poleWielu(l, (p) => p?.adres),
        ),
        wiersz(
          "Telefon:",
          poleWielu(l, (p) => p?.telefon),
        ),
        wiersz(
          "E-mail:",
          poleWielu(l, (p) => p?.email),
        ),
      ],
    },
    { t: "naglowek", tekst: "II. CHARAKTER POŻYCZKI" },
    akapit([
      r("Wnioskuję o udzielenie pożyczki pieniężnej "),
      r("na cele związane z prowadzoną działalnością gospodarczą", { bold: true }),
      r("."),
    ]),
    akapit([
      r("Oświadczam, że pożyczka "),
      r("nie ma charakteru konsumenckiego", { bold: true }),
      r(" i nie stanowi kredytu konsumenckiego w rozumieniu ustawy o kredycie konsumenckim."),
    ]),
    { t: "naglowek", tekst: "III. WARUNKI POŻYCZKI" },
    {
      t: "tabela",
      szerokosci: wid,
      wiersze: [
        wiersz("Wnioskowana kwota:", zl(d.warunki.kwota_pozyczki.cyframi)),
        wiersz("Okres pożyczki:", miesiaceLiczba(h.liczba_rat)),
        wiersz("Cel pożyczki:", d.warunki.cel),
        wiersz("Zabezpieczenie:", zabTxt),
      ],
    },
    { t: "naglowek", tekst: "IV. OŚWIADCZENIA FINANSOWE (AML)" },
    akapit([r("Oświadczam, że:", { bold: true })]),
    lista("Osiągam stały i rzeczywisty dochód umożliwiający spłatę pożyczki."),
    lista("Nie posiadam przeterminowanych zobowiązań pieniężnych."),
    lista("Żadne moje zobowiązanie kredytowe ani pożyczkowe nie zostało wypowiedziane."),
    lista("Wszystkie moje zobowiązania reguluję terminowo."),
    lista("Nie toczy się wobec mnie postępowanie egzekucyjne."),
    { t: "naglowek", tekst: "V. OŚWIADCZENIE PEP" },
    akapit(
      `${CHECK(pep === false)} Nie jestem osobą zajmującą eksponowane stanowisko polityczne (PEP), ani osobą z nią powiązaną.`,
      { wciecie: "lista" },
    ),
    akapit(`${CHECK(pep === true)} Jestem osobą PEP lub osobą powiązaną z PEP.`, {
      wciecie: "lista",
    }),
    { t: "naglowek", tekst: "VI. AML – DO WYPEŁNIENIA PRZEZ POŻYCZKODAWCĘ" },
    akapit([
      r("Ocena ryzyka:  "),
      r(
        `${CHECK(ocena === "niskie")} niskie   ${CHECK(ocena === "srednie")} średnie   ${CHECK(ocena === "wysokie")} wysokie`,
        { bold: true },
      ),
    ]),
    akapit(
      `${CHECK(prog === true)} Transakcja przekracza równowartość 15 000 EUR – wpis do ewidencji AML`,
      {
        wciecie: "lista",
      },
    ),
    akapit(`${CHECK(prog === false)} Transakcja nie przekracza równowartości 15 000 EUR`, {
      wciecie: "lista",
    }),
    { t: "naglowek", tekst: "VII. ODPOWIEDZIALNOŚĆ KARNA" },
    akapit(
      "Oświadczam, że jestem świadomy/a, iż podanie nieprawdziwych danych lub złożenie nieprawdziwych oświadczeń w celu uzyskania pożyczki pieniężnej stanowi przestępstwo, w szczególności z art. 286 §1 oraz art. 297 §1 Kodeksu karnego.",
    ),
    { t: "naglowek", tekst: "VIII. OŚWIADCZENIE KOŃCOWE" },
    akapit(
      "Oświadczam, że zapoznałem/am się z treścią niniejszego wniosku i składam go dobrowolnie.",
    ),
    akapit(`Sporządzono w ${d.meta.miejscowosc}, dnia ${d.meta.data_umowy} r.`),
    {
      t: "podpisy",
      osoby: l.map((p) => ({
        ...podpisujacy(p, "Wnioskodawca"),
        rola: "Czytelny podpis Wnioskodawcy",
      })),
    },
  ];
}

// ── 2. Umowa ───────────────────────────────────────────────────

function umowaBloki(d: any, doc: Dokument): Blok[] {
  const out: Blok[] = [{ t: "tytul", tekst: "UMOWA POŻYCZKI" }];
  if (doc.meta?.numer_umowy) out.push({ t: "podtytul", tekst: `nr ${doc.meta.numer_umowy}` });
  const k = doc.komparycja;
  out.push(akapit(`zawarta dnia ${k.data} r. w ${k.miejscowosc} pomiędzy:`));
  k.strony.forEach((s, i) => {
    const kon = i < k.strony.length - 1 ? "," : ".";
    out.push(akapit([r(s.opis), r(", zwanym/ą dalej "), r(`„${s.rola}”`, { bold: true }), r(kon)]));
  });

  for (const sek of doc.sekcje) {
    out.push({ t: "naglowek", tekst: `§ ${sek.numer} – ${sek.tytul}` });
    for (const u of sek.ustepy) {
      out.push(
        u.poziom === "ustep"
          ? akapit(u.tekst, { wciecie: "ustep", etykieta: `${u.numer}.` })
          : akapit(u.tekst, { wciecie: "podpunkt", etykieta: u.litera ?? "–" }),
      );
    }
  }

  out.push({ t: "naglowek", tekst: "ZAŁĄCZNIKI" });
  for (const z of doc.zalaczniki) out.push(lista(`Załącznik nr ${z.nr} — ${z.tytul}`));
  out.push({ t: "podpisy", osoby: stronyDoPodpisu(d) });
  return out;
}

// ── 3. Załącznik nr 1 — harmonogram ────────────────────────────

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function naglowekZalacznika(nr: number, tytul: string, d: any): Blok[] {
  const nrUmowy = d.meta.numer_umowy ? ` nr ${d.meta.numer_umowy}` : "";
  return [
    { t: "tytul", tekst: `ZAŁĄCZNIK NR ${nr} DO UMOWY POŻYCZKI` },
    { t: "podtytul", tekst: tytul },
    akapit(
      `do Umowy pożyczki${nrUmowy} zawartej dnia ${d.meta.data_umowy} r. w ${d.meta.miejscowosc}`,
      {
        align: "center",
      },
    ),
  ];
}

function harmonogramBloki(d: any): Blok[] {
  const w = d.warunki;
  const h = w.harmonogram;
  const raty: any[] = h.raty ?? [];
  const potracana = w.prowizja?.model === "potracana_z_wyplaty";
  const K = parseKwota(w.kwota_pozyczki.cyframi);
  const P = parseKwota(w.prowizja.kwota.cyframi);
  const wid = [2800, 6838];
  const wiersz = (a: string, b: string) => ({
    komorki: [{ tekst: a, bold: true }, { tekst: b }] as Komorka[],
  });

  const suma = (pole: string) => round2(raty.reduce((a, x) => a + (parseKwota(x[pole]) || 0), 0));
  const sKap = suma("kapital");
  const sOds = suma("odsetki");
  const sProw = suma("prowizja");
  const sRat = suma("rata_razem");

  const out: Blok[] = [
    ...naglowekZalacznika(1, "HARMONOGRAM SPŁAT", d),
    {
      t: "tabela",
      szerokosci: wid,
      wiersze: [
        wiersz("Kwota Pożyczki:", zl(w.kwota_pozyczki.cyframi)),
        wiersz(
          "Kwota wypłacona:",
          potracana
            ? `${zl(formatKwotaPL(round2(K - P)))} (po potrąceniu prowizji)`
            : `${zl(w.kwota_pozyczki.cyframi)} (bez potrącenia prowizji)`,
        ),
        wiersz(
          "Prowizja jednorazowa:",
          potracana
            ? `${zl(w.prowizja.kwota.cyframi)} (potrącona z Kwoty Pożyczki przy wypłacie)`
            : `${zl(w.prowizja.kwota.cyframi)} (płatna w ratach zgodnie z tabelą rat)`,
        ),
        wiersz(
          "Oprocentowanie umowne:",
          `${w.oprocentowanie} % rocznie, naliczane od kapitału pozostającego do spłaty`,
        ),
      ],
    },
    akapit([r(`Tabela rat (${ratyLiczba(raty.length)}):`, { bold: true })]),
  ];

  const kw = (v: any) => formatKwotaPL(parseKwota(v));
  const prawa = (t: string): Komorka => ({ tekst: t, align: "right" });
  out.push({
    t: "tabela",
    szerokosci: [600, 1300, 1400, 1400, 1300, 1300, 1400],
    wiersze: [
      {
        naglowek: true,
        komorki: ["Nr", "Termin", "Rata", "Kapitał", "Odsetki", "Prowizja", "Saldo"].map((x) => ({
          tekst: x,
          bold: true,
          align: "center" as const,
        })),
      },
      ...raty.map((x) => ({
        komorki: [
          { tekst: String(x.nr), align: "center" as const },
          { tekst: x.termin, align: "center" as const },
          prawa(kw(x.rata_razem)),
          prawa(kw(x.kapital)),
          prawa(kw(x.odsetki)),
          prawa(kw(x.prowizja)),
          prawa(kw(x.saldo)),
        ],
      })),
      {
        komorki: [
          { tekst: "Razem", bold: true },
          { tekst: "" },
          { tekst: formatKwotaPL(sRat), bold: true, align: "right" },
          { tekst: formatKwotaPL(sKap), bold: true, align: "right" },
          { tekst: formatKwotaPL(sOds), bold: true, align: "right" },
          { tekst: formatKwotaPL(sProw), bold: true, align: "right" },
          { tekst: "" },
        ],
      },
    ],
  });

  // Podsumowanie sum (jak we wzorcu): łączna kwota + opis rat.
  const regularne = raty.slice(0, -1).map((x) => parseKwota(x.rata_razem));
  const rowneRegularne = regularne.length > 0 && regularne.every((v) => v === regularne[0]);
  const ostatnia = raty.at(-1);
  let opisRat: string;
  if (h.typ === "balonowy" && rowneRegularne && ostatnia) {
    opisRat = `${ratyLiczba(regularne.length)} po ${formatKwotaPL(regularne[0])} zł oraz rata końcowa (balonowa) ${kw(ostatnia.rata_razem)} zł`;
  } else {
    opisRat = `${ratyLiczba(raty.length)} w kwotach określonych w tabeli rat`;
  }
  out.push(
    akapit([
      r(
        `Łączna suma wszystkich płatności (kapitał + prowizja + odsetki): ${formatKwotaPL(sRat)} zł ` +
          `(kapitał ${formatKwotaPL(sKap)} zł + prowizja ${formatKwotaPL(sProw)} zł + odsetki ${formatKwotaPL(sOds)} zł); ` +
          `${opisRat}, płatne ${h.dzien_miesiaca}. dnia każdego miesiąca począwszy od ${h.data_pierwszej_raty} r.`,
        { bold: true },
      ),
    ]),
  );
  out.push({ t: "podpisy", osoby: stronyDoPodpisu(d) });
  return out;
}

// ── 4. Załącznik nr 2 — protokół z negocjacji ─────────────────

function protokolBloki(d: any, doc: Dokument): Blok[] {
  const l = listaPozyczkobiorcow(d);
  const pn = d.protokol_negocjacji ?? {};
  const h = d.warunki.harmonogram;
  const wid = [3400, 6238];
  const wiersz = (a: string, b: string) => ({
    komorki: [{ tekst: a, bold: true }, { tekst: b }] as Komorka[],
  });
  const telefon = poleWielu(l, (p) => p?.telefon);
  const email = poleWielu(l, (p) => p?.email);
  const posr = pn.posrednik;
  const posrTxt = posr
    ? `${posr.imie_nazwisko}${posr.telefon ? ` (tel. ${posr.telefon})` : ""}`
    : null;

  const daneStron = [
    wiersz("Pożyczkodawca:", oznaczenieStrony(d.pozyczkodawca, false)),
    wiersz(l.length > 1 ? "Pożyczkobiorcy:" : "Pożyczkobiorca:", nazwyPozyczkobiorcow(d)),
  ];
  if (telefon) daneStron.push(wiersz("Tel. negocjacyjny Pożyczkobiorcy:", telefon));
  if (d.porecziciel) daneStron.push(wiersz("Poręczyciel:", krotkieOznaczenie(d.porecziciel)));
  if (posrTxt) daneStron.push(wiersz("Pośrednik finansowy:", posrTxt));

  const formy: string[] =
    pn.formy ??
    [
      telefon ? "telefonicznie" : null,
      posr ? "posrednik" : null,
      email ? "elektronicznie" : null,
    ].filter((x): x is string => !!x);
  const opisFormy: Record<string, string | null> = {
    telefonicznie: telefon ? `telefonicznie (nr tel.: ${telefon});` : "telefonicznie;",
    posrednik: posrTxt ? `za pośrednictwem pośrednika finansowego — ${posrTxt};` : null,
    elektronicznie: email ? `drogą elektroniczną (e-mail: ${email});` : "drogą elektroniczną;",
    osobiscie: "osobiście, w siedzibie Pożyczkodawcy lub w miejscu uzgodnionym przez Strony;",
  };

  const ost = (h.raty ?? []).at(-1);
  const regularna = (h.raty ?? [])[0];
  const okres =
    h.typ === "balonowy" && ost && regularna && h.raty.length > 1
      ? `${miesiaceLiczba(h.liczba_rat)} (${ratyLiczba(h.raty.length - 1)} po ${formatKwotaPL(parseKwota(regularna.rata_razem))} zł + rata końcowa/balonowa ${formatKwotaPL(parseKwota(ost.rata_razem))} zł)`
      : `${miesiaceLiczba(h.liczba_rat)} (${ratyLiczba(h.liczba_rat)} zgodnie z Załącznikiem nr 1)`;

  const odes = (id: string, par = false) => {
    const p = doc.polozenia[id];
    return p ? tekstOdeslania(p, par) : null;
  };
  const pierwszy = (...ids: string[]) => ids.map((i) => odes(i)).find(Boolean) ?? null;
  const zakres: [string, string | null][] = [
    ["Kwota pożyczki, jej wysokość i przeznaczenie", odes("PRZ_01_przedmiot", true)],
    [
      "Wysokość jednorazowej prowizji za udzielenie pożyczki oraz jej uzasadnienie",
      pierwszy("KWO_02_prowizja_nie_potracana", "KWO_02b_prowizja_potracana"),
    ],
    [
      "Sposób i terminy wypłaty pożyczki, w tym podział na przelew / gotówkę / przekaz",
      pierwszy("KWO_03_wyplata_pelna", "KWO_03b_wyplata_z_podzialem"),
    ],
    [
      "Wysokość oprocentowania umownego oraz zasady jego naliczania od kapitału pozostającego do spłaty",
      odes("KWO_04_oprocentowanie"),
    ],
    [
      "Ustanowienie zabezpieczeń: wysokość hipoteki, poddanie się egzekucji",
      odes("ZAB_01_hipoteka", true),
    ],
    ["Harmonogram spłat: terminy, liczba rat, wysokość rat", "Załącznik nr 1"],
    [
      "Postanowienia dotyczące windykacji i kolejność zaliczania wpłat",
      odes("WIN_01_odsetki_za_opoznienie", true),
    ],
    [
      "Prawo Pożyczkodawcy do wypowiedzenia Umowy i przesłanki wypowiedzenia",
      odes("WYP_01_przeslanki", true),
    ],
    ["Forma doręczeń, w tym zgoda na doręczenia e-mailowe", odes("OSW_20m_doreczenia_email")],
  ];

  const out: Blok[] = [
    ...naglowekZalacznika(2, "PROTOKÓŁ Z NEGOCJACJI INDYWIDUALNYCH", d),
    { t: "naglowek", tekst: "1. DANE STRON" },
    { t: "tabela", szerokosci: wid, wiersze: daneStron },
    { t: "naglowek", tekst: "2. MIEJSCE, FORMY I PRZEBIEG NEGOCJACJI" },
    akapit("Negocjacje prowadzone były w trybie indywidualnym, w szczególności:"),
    ...formy
      .map((f) => opisFormy[f])
      .filter((x): x is string => !!x)
      .map((x) => lista(x)),
    {
      t: "tabela",
      szerokosci: wid,
      wiersze: [
        wiersz(
          "Negocjacje trwały:",
          `${pn.data_od ?? d.meta.data_umowy} – ${pn.data_do ?? d.meta.data_umowy}`,
        ),
        wiersz("Uzgodniona prowizja finalna:", zl(d.warunki.prowizja.kwota.cyframi)),
        wiersz("Uzgodnione oprocentowanie finalne:", `${d.warunki.oprocentowanie} %`),
        wiersz("Uzgodniony okres pożyczki:", okres),
      ],
    },
    { t: "naglowek", tekst: "3. ZAKRES INDYWIDUALNIE NEGOCJOWANYCH WARUNKÓW" },
    akapit("Strony potwierdzają, że następujące elementy zostały indywidualnie negocjowane:"),
    ...zakres
      .filter(([, gdzie]) => gdzie)
      .map(([co, gdzie]) =>
        lista(`${co} (${gdzie === "Załącznik nr 1" ? gdzie : `${gdzie} Umowy`}).`),
      ),
    { t: "naglowek", tekst: "4. POTWIERDZENIA STRON" },
    lista(
      "Pożyczkobiorca potwierdza, że wszystkie powyższe elementy były negocjowane indywidualnie, są dla niego jasne i zrozumiałe, a ich treść odzwierciedla wynik negocjacji.",
    ),
    lista(
      "Pożyczkobiorca potwierdza, że treść Umowy nie została mu narzucona i miał realny wpływ na każde z jej kluczowych postanowień.",
    ),
    lista("Pożyczkodawca potwierdza prawidłowość przebiegu procesu negocjacyjnego."),
    lista(
      "Strony potwierdzają, że podpisanie Umowy nastąpiło po zakończeniu procesu negocjacji opisanego w niniejszym Protokole.",
    ),
    { t: "podpisy", osoby: stronyDoPodpisu(d) },
  ];
  return out;
}

// ── 5. Załącznik nr 3 — tabela opłat windykacyjnych ───────────

function oplatyBloki(d: any, doc: Dokument, oplaty: readonly OplataWindykacyjna[]): Blok[] {
  const p = doc.polozenia["WIN_05_zwrot_kosztow"];
  const odes = p ? ` (${tekstOdeslania(p)} Umowy)` : "";
  return [
    ...naglowekZalacznika(3, "TABELA OPŁAT WINDYKACYJNYCH", d),
    akapit(
      `Poniższe opłaty są naliczane wyłącznie w przypadku opóźnień w spłacie i stanowią zwrot rzeczywistych, udokumentowanych kosztów czynności windykacyjnych${odes}.`,
    ),
    {
      t: "tabela",
      szerokosci: [6238, 3400],
      wiersze: [
        {
          naglowek: true,
          komorki: [
            { tekst: "Czynność windykacyjna", bold: true },
            { tekst: "Opłata", bold: true, align: "right" },
          ],
        },
        ...oplaty.map((o) => ({
          komorki: [
            { tekst: o.czynnosc },
            {
              tekst: typeof o.oplata === "number" ? `${formatKwotaPL(o.oplata)} zł` : o.oplata,
              bold: true,
              align: "right" as const,
            },
          ] as Komorka[],
        })),
      ],
    },
    { t: "podpisy", osoby: stronyDoPodpisu(d) },
  ];
}

/** Cały komplet jako lista bloków — każda część od nowej strony. */
export function zbudujBloki(umowa: any, doc: Dokument, opts: KompletOpcje = {}): Blok[] {
  const czesci: Blok[][] = [
    wniosekBloki(umowa),
    umowaBloki(umowa, doc),
    harmonogramBloki(umowa),
    protokolBloki(umowa, doc),
    oplatyBloki(umowa, doc, opts.oplaty ?? OPLATY_WINDYKACYJNE_DOMYSLNE),
  ];
  const out: Blok[] = [];
  czesci.forEach((c, i) => {
    const [pierwszy, ...reszta] = c;
    out.push(
      i > 0 && pierwszy.t === "tytul" ? { ...pierwszy, nowaStrona: true } : pierwszy,
      ...reszta,
    );
  });
  return out;
}

// ── WordprocessingML ───────────────────────────────────────────

function xmlEsc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runXml(x: Run, extra = ""): string {
  const rpr = [x.bold ? "<w:b/><w:bCs/>" : "", x.italic ? "<w:i/><w:iCs/>" : "", extra].join("");
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEsc(x.tekst)}</w:t></w:r>`;
}

function pXml(runs: string, ppr: string[] = []): string {
  return `<w:p>${ppr.length ? `<w:pPr>${ppr.join("")}</w:pPr>` : ""}${runs}</w:p>`;
}

const SZER_STRONY = 9638; // A4 minus marginesy 2 × 1134 dxa

function tabelaXml(szer: number[], wiersze: string[], ramka: boolean): string {
  const b = ramka ? 'w:val="single" w:sz="4" w:space="0" w:color="808080"' : 'w:val="nil"';
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((k) => `<w:${k} ${b}/>`)
    .join("");
  const suma = szer.reduce((a, x) => a + x, 0);
  return (
    // Kolejność tblPr wg schematu OOXML: tblW → tblBorders → tblLayout → tblCellMar.
    `<w:tbl><w:tblPr><w:tblW w:w="${suma}" w:type="dxa"/>` +
    `<w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${szer.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    wiersze.join("") +
    `</w:tbl>` +
    pXml("", ['<w:spacing w:before="0" w:after="120"/>'])
  );
}

function komorkaXml(k: Komorka, w: number, rozmiar?: number): string {
  const runs = typeof k.tekst === "string" ? [r(k.tekst, { bold: k.bold })] : k.tekst;
  const sz = rozmiar ? `<w:sz w:val="${rozmiar}"/><w:szCs w:val="${rozmiar}"/>` : "";
  const ppr = [`<w:spacing w:before="20" w:after="20"/>`, `<w:jc w:val="${k.align ?? "left"}"/>`];
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>` +
    pXml(runs.map((x) => runXml(x, sz)).join(""), ppr) +
    `</w:tc>`
  );
}

function podpisyXml(osoby: Podpisujacy[]): string {
  // Niewidoczna tabela: maks. 3 kolumny, kolejne osoby w następnych wierszach.
  const kol = Math.min(3, Math.max(1, osoby.length));
  const w = Math.floor(SZER_STRONY / kol);
  const wiersze: string[] = [];
  for (let i = 0; i < osoby.length; i += kol) {
    const grupa = osoby.slice(i, i + kol);
    while (grupa.length < kol) grupa.push({ rola: "" });
    const komorki = grupa.map((o) => {
      if (!o.rola) return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
      // Kolejność pPr wg schematu OOXML: keepNext → spacing → jc.
      const c = [
        "<w:keepNext/>",
        '<w:spacing w:before="0" w:after="0"/>',
        '<w:jc w:val="center"/>',
      ];
      const akapity = [
        pXml(runXml(r("……………………………………")), [
          "<w:keepNext/>",
          '<w:spacing w:before="720" w:after="0"/>',
          '<w:jc w:val="center"/>',
        ]),
        pXml(runXml(r(o.rola, { italic: true })), c),
      ];
      if (o.nazwa) akapity.push(pXml(runXml(r(o.nazwa)), c));
      for (const x of o.wImieniu ?? [])
        akapity.push(pXml(runXml(r(x), '<w:sz w:val="18"/><w:szCs w:val="18"/>'), c));
      return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${akapity.join("")}</w:tc>`;
    });
    wiersze.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${komorki.join("")}</w:tr>`);
  }
  return tabelaXml(Array(kol).fill(w), wiersze, false);
}

export function blokiDoXml(bloki: Blok[]): string {
  const body = bloki.map((b) => {
    switch (b.t) {
      case "tytul":
        return pXml(runXml(r(b.tekst, { bold: true }), '<w:sz w:val="28"/><w:szCs w:val="28"/>'), [
          "<w:keepNext/>",
          ...(b.nowaStrona ? ["<w:pageBreakBefore/>"] : []),
          '<w:spacing w:before="0" w:after="120"/>',
          '<w:jc w:val="center"/>',
        ]);
      case "podtytul":
        return pXml(runXml(r(b.tekst, { bold: true }), '<w:sz w:val="24"/><w:szCs w:val="24"/>'), [
          "<w:keepNext/>",
          '<w:spacing w:before="0" w:after="120"/>',
          '<w:jc w:val="center"/>',
        ]);
      case "naglowek":
        return pXml(runXml(r(b.tekst, { bold: true })), [
          "<w:keepNext/>",
          '<w:spacing w:before="240" w:after="120"/>',
        ]);
      case "akapit": {
        // Kolejność elementów pPr wg schematu OOXML: spacing → ind → jc.
        const ppr: string[] = ['<w:spacing w:before="0" w:after="80"/>'];
        if (b.wciecie === "ustep") ppr.push('<w:ind w:left="360" w:hanging="360"/>');
        if (b.wciecie === "podpunkt") ppr.push('<w:ind w:left="720" w:hanging="360"/>');
        if (b.wciecie === "lista") ppr.push('<w:ind w:left="360" w:hanging="360"/>');
        ppr.push(`<w:jc w:val="${b.align ?? "both"}"/>`);
        const etyk = b.etykieta ? runXml(r(`${b.etykieta} `, { bold: b.wciecie === "ustep" })) : "";
        return pXml(etyk + b.runs.map((x) => runXml(x)).join(""), ppr);
      }
      case "tabela": {
        const male = b.szerokosci.length > 4 ? 18 : undefined;
        const wiersze = b.wiersze.map(
          (w) =>
            `<w:tr>${w.naglowek ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}` +
            w.komorki.map((k, i) => komorkaXml(k, b.szerokosci[i], male)).join("") +
            `</w:tr>`,
        );
        return tabelaXml(b.szerokosci, wiersze, true);
      }
      case "podpisy":
        return podpisyXml(b.osoby);
    }
  });

  const sectPr =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body.join("")}${sectPr}</w:body></w:document>`
  );
}

export function buildKompletDocumentXml(
  umowa: any,
  doc: Dokument,
  opts: KompletOpcje = {},
): string {
  return blokiDoXml(zbudujBloki(umowa, doc, opts));
}

// ── pakowanie .docx ────────────────────────────────────────────

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  "</Types>";

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

const DOC_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

// Domyślna czcionka i rozmiar — jawnie, żeby Word i Google Drive renderowały tak samo.
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>' +
  '<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="pl-PL"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>' +
  '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  "</w:styles>";

/** Pakuje XML dokumentu do bajtów .docx (stała data wpisów ZIP → powtarzalny wynik). */
export async function spakujDocx(documentXml: string): Promise<Uint8Array> {
  const { default: PizZip } = await import("pizzip");
  const zip = new PizZip();
  const date = new Date(Date.UTC(2020, 0, 1));
  zip.file("[Content_Types].xml", CONTENT_TYPES, { date });
  zip.file("_rels/.rels", RELS, { date });
  zip.file("word/_rels/document.xml.rels", DOC_RELS, { date });
  zip.file("word/styles.xml", STYLES, { date });
  zip.file("word/document.xml", documentXml, { date });
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

/** Komplet (wniosek + umowa + Zał. 1–3) jako bajty .docx. */
export async function buildKompletDocx(
  umowa: any,
  doc: Dokument,
  opts: KompletOpcje = {},
): Promise<Uint8Array> {
  return spakujDocx(buildKompletDocumentXml(umowa, doc, opts));
}

// ── tekst z .docx (testy, audyt) ───────────────────────────────

/**
 * Tekst dokumentu z WordprocessingML: akapity w liniach, komórki tabel
 * rozdzielone „ | ”, wiersz tabeli = linia. Służy do snapshotów i do
 * kontroli, że dokument nie zawiera treści nie-umownych.
 */
export function tekstZDocumentXml(xml: string): string {
  const out: string[] = [];
  let linia = "";
  let komorka: string[] | null = null;
  let wiersz: string[] | null = null;
  const dec = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
  const re = /<(\/?)w:(p|tc|tr|t|br)\b[^>]*?(\/?)>|([^<]+)/g;
  let inT = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, zamk, tag, samo, tekst] = m;
    if (tekst !== undefined) {
      if (inT) linia += dec(tekst);
      continue;
    }
    if (tag === "t") {
      inT = !zamk && !samo;
    } else if (tag === "p" && (zamk || samo)) {
      if (komorka) komorka.push(linia.trim());
      else out.push(linia.trimEnd());
      linia = "";
    } else if (tag === "tc") {
      if (!zamk) komorka = [];
      else {
        wiersz?.push((komorka ?? []).filter(Boolean).join(" / "));
        komorka = null;
      }
    } else if (tag === "tr") {
      if (!zamk) wiersz = [];
      else {
        out.push((wiersz ?? []).join(" | ").trimEnd());
        wiersz = null;
      }
    }
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Tekst z bajtów .docx. */
export async function tekstZDocx(bytes: Uint8Array): Promise<string> {
  const { default: PizZip } = await import("pizzip");
  const zip = new PizZip(bytes);
  return tekstZDocumentXml(zip.file("word/document.xml")!.asText());
}
