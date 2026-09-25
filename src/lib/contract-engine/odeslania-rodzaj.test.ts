/**
 * Testy jednostkowe biblioteki 1.3: walidacja odesłań wewnętrznych i odmiana
 * rodzaju gramatycznego Pożyczkobiorcy.
 */
import { describe, expect, it } from "vitest";
import biblioteka from "./clauses.json";
import { renderuj } from "./renderer";
import {
  bezPrzepisow,
  bledyOdeslanKompletu,
  bledyOdeslanUmowy,
  znajdzOdeslania,
} from "./odeslania";
import { jestKobieta, peselPoprawny, plecOsoby, zbudujFakty } from "./facts";
import { przetworzSzkic } from "./umowa-agent-core";
import { przypadekA, przypadekB, przypadekC } from "./fixtures/komplet-przypadki";

/* eslint-disable @typescript-eslint/no-explicit-any */

const umowa = (dane: any) => przetworzSzkic(dane).umowa;

describe("odesłania — rozpoznawanie", () => {
  it("cytaty przepisów nie są odesłaniami wewnętrznymi", () => {
    for (const t of [
      "art. 777 § 1 pkt 5 k.p.c.",
      "art. 777 §1 pkt 5 k.p.c.",
      "art. 359 § 2¹ k.c.",
      "art. 6 ust. 1 lit. b RODO",
      "art. 4 ust. 1 ustawy",
      "art. 101¹ ustawy",
      "art. 3 pkt 23 ustawy",
    ])
      expect(znajdzOdeslania(t), t).toEqual([]);
    expect(bezPrzepisow("zgodnie z art. 41 § 2 k.r.o. oraz § 3 ust. 1")).toContain("§ 3 ust. 1");
  });

  it("odesłania bezwzględne i względne", () => {
    expect(znajdzOdeslania("o którym mowa w § 5 ust. 1 lit. m")).toEqual([
      { tekst: "§ 5 ust. 1 lit. m", paragraf: 5, ustep: 1, litera: "m" },
    ]);
    expect(znajdzOdeslania("w § 1 oraz w ust. 2")).toEqual([
      { tekst: "§ 1", paragraf: 1, ustep: null, litera: null },
      { tekst: "ust. 2", paragraf: null, ustep: 2, litera: null },
    ]);
  });
});

describe("odesłania — walidacja po numeracji", () => {
  const doc = () => renderuj(umowa(przypadekA()));

  it("przypadek końcowy: wszystkie odesłania poprawne", () => {
    expect(bledyOdeslanUmowy(doc())).toEqual([]);
  });

  it("odesłanie do nieistniejącego ustępu, litery, paragrafu i załącznika = błąd", () => {
    const d = doc();
    const tekst = "zob. § 3 ust. 4 oraz § 3 ust. 40, § 5 ust. 11 lit. z, § 9 i Załącznik nr 7";
    const bledy = bledyOdeslanKompletu(d, tekst);
    expect(bledy).toHaveLength(4);
    expect(bledy.join(" ")).toContain("§ 3 ust. 40");
    expect(bledy.join(" ")).toContain("§ 5 ust. 11 lit. z");
    expect(bledy.join(" ")).toContain("§ 9");
    expect(bledy.join(" ")).toContain("Załącznika nr 7");
    // odesłanie względne w treści ustępu — liczone w obrębie paragrafu
    d.sekcje[0].ustepy[0].tekst += " (zob. ust. 9)";
    expect(bledyOdeslanUmowy(d)[0]).toContain("„ust. 9” do nieistniejącej jednostki");
  });

  it("renderer blokuje umowę z błędnym odesłaniem", () => {
    const bib = structuredClone(biblioteka) as any;
    bib.klauzule.find((k: any) => k.id === "POG_02_forma_pisemna").tekst += " Zob. § 2 ust. 99.";
    expect(() => renderuj(umowa(przypadekA()), bib)).toThrow(/Błędne odesłania/);
  });

  it("lint biblioteki: odesłania wewnętrzne wyłącznie jako {{ref}} (numeracja jest dynamiczna)", () => {
    const pola = [
      "tekst",
      "tekst_pozycja",
      "tekst_pojedyncza",
      "tekst_wielokrotna_naglowek",
      "tekst_wielokrotna_pozycja",
      "tekst_wielokrotna_stopka_laczna",
      "tekst_wielokrotna_stopka_odrebna",
    ];
    const naSztywno: string[] = [];
    for (const k of (biblioteka as any).klauzule)
      for (const p of pola)
        if (typeof k[p] === "string")
          for (const o of znajdzOdeslania(k[p].replace(/\{\{[^}]+\}\}/g, " ")))
            naSztywno.push(`${k.id}.${p}: ${o.tekst}`);
    expect(naSztywno).toEqual([]);
  });

  it("każde {{ref}} wskazuje klauzulę istniejącą w bibliotece", () => {
    const ids = new Set((biblioteka as any).klauzule.map((k: any) => k.id));
    for (const k of (biblioteka as any).klauzule) {
      const t = JSON.stringify(k);
      for (const m of t.matchAll(/\{\{(?:ref|ref_par):([A-Za-z0-9_]+)\}\}/g))
        expect(ids.has(m[1]), `${k.id} → ${m[1]}`).toBe(true);
      for (const m of t.matchAll(/\{\{refs_lista:([A-Za-z0-9_,]+)\}\}/g))
        for (const id of m[1].split(",")) expect(ids.has(id), `${k.id} → ${id}`).toBe(true);
    }
  });
});

describe("rodzaj gramatyczny", () => {
  it("płeć: pole plec > PESEL z poprawną cyfrą kontrolną > imię", () => {
    expect(peselPoprawny("85061512347")).toBe(true);
    expect(peselPoprawny("85061512348")).toBe(false);
    expect(
      plecOsoby({ typ: "osoba_fizyczna", imie_nazwisko: "Jan Nowak", pesel: "85061512347" }),
    ).toBe("K");
    expect(
      plecOsoby({ typ: "osoba_fizyczna", imie_nazwisko: "Anna Nowak", pesel: "72081300951" }),
    ).toBe("M");
    expect(
      plecOsoby({
        typ: "osoba_fizyczna",
        imie_nazwisko: "Jan Nowak",
        pesel: "85061512347",
        plec: "M",
      }),
    ).toBe("M");
    // PESEL z błędną cyfrą kontrolną — decyduje imię
    expect(
      jestKobieta({ typ: "osoba_fizyczna", imie_nazwisko: "Anna Nowak", pesel: "80010112345" }),
    ).toBe(true);
    expect(jestKobieta({ typ: "podmiot_gospodarczy", nazwa: "Alfa" })).toBe(false);
  });

  it("formy pb_*: kobieta / mężczyzna / spółka / liczba mnoga", () => {
    const fa = zbudujFakty(umowa(przypadekA()));
    expect([fa.pb_zawarl, fa.pb_swiadomy, fa.pb_zaimek_wobec, fa.pb_jego]).toEqual([
      "zawarła",
      "świadoma",
      "niej",
      "jej",
    ]);
    const m = przypadekA();
    m.pozyczkobiorca.plec = "M";
    const fm = zbudujFakty(umowa(m));
    expect([fm.pb_zawarl, fm.pb_swiadomy, fm.pb_zaimek_wobec, fm.pb_jego]).toEqual([
      "zawarł",
      "świadomy",
      "niego",
      "jego",
    ]);
    const fc = zbudujFakty(umowa(przypadekC())); // sp. z o.o. — rodzaj męski (Pożyczkobiorca)
    expect([fc.pb_zawarl, fc.pb_swiadomy]).toEqual(["zawarł", "świadomy"]);
    const fb = zbudujFakty(umowa(przypadekB())); // liczba mnoga jak dotąd
    expect([fb.pb_zawarl, fb.pb_swiadomy, fb.pb_zaimek_wobec, fb.pb_jego]).toEqual([
      "zawarli",
      "świadomi",
      "któregokolwiek z nich",
      "ich",
    ]);
  });

  it("komparycja: zwaną / zwanym / zwanymi łącznie", () => {
    const zwany = (dane: any) => renderuj(umowa(dane)).komparycja.strony.map((s) => s.zwany);
    expect(zwany(przypadekA())).toEqual([
      "zwaną dalej „Pożyczkobiorcą”",
      "zwaną dalej „Pożyczkodawcą”",
    ]);
    expect(zwany(przypadekB())).toEqual([
      "",
      "zwanymi dalej łącznie „Pożyczkobiorcami”",
      "zwaną dalej „Pożyczkodawcą”",
    ]);
    expect(zwany(przypadekC())).toEqual([
      "zwaną dalej „Pożyczkobiorcą”",
      "zwanym dalej „Poręczycielem”",
      "zwaną dalej „Pożyczkodawcą”",
    ]);
  });
});
