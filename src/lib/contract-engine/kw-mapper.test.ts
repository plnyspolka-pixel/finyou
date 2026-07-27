/**
 * Testy mappera KwExtraction → schemat silnika (3.3.2).
 * Kluczowe reguły: rozpoznanie właściciela po PESEL, współwłasność łączna
 * małżeńska vs odrzucenie osoby trzeciej, klasyfikacja działów III/IV,
 * zasada braku zgadywania (sposob_usuniecia='brak', pola niewyprowadzalne = null).
 */
import { describe, it, expect } from "vitest";
import { mapujKwDoNieruchomosci, type KwMapContext } from "./kw-mapper";
import type { KwExtraction } from "../kw-render";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PB = "70010112345";
const POR = "65050512399";
const OBCY = "88121254321";

function kw(over: Partial<KwExtraction> = {}): KwExtraction {
  return {
    kwNumber: "LU1I/00012345/6",
    sadRejonowy: "Sąd Rejonowy w Lublinie",
    typKsiegi: "NIERUCHOMOŚĆ GRUNTOWA",
    dzial1o: {
      miejscowosc: "Lublin",
      ulica: "Polna",
      numerBudynku: "3",
      przeznaczenie: "BUDOWLANA",
      dzialki: [{ numer: "145/2" }],
    },
    dzial2: { wlasciciele: [{ imiePierwsze: "Jan", nazwisko: "Kowalski", pesel: PB }] },
    dzial3: { wpisy: [] },
    dzial4: { hipoteki: [] },
    ...over,
  } as KwExtraction;
}
const ctx: KwMapContext = { id: "N1", pozyczkobiorcaPesele: [PB], poreczicielPesel: POR };

describe("Mapper KW → nieruchomość", () => {
  it("pola podstawowe: nr_kw, sad, działki", () => {
    const r = mapujKwDoNieruchomosci(kw(), ctx);
    expect(r.odrzucona).toBe(false);
    expect(r.nieruchomosc.nr_kw).toBe("LU1I/00012345/6");
    expect(r.nieruchomosc.sad).toBe("Sąd Rejonowy w Lublinie");
    expect(r.nieruchomosc.dzialki_w_kw).toEqual(["145/2"]);
    expect(r.nieruchomosc.rodzaj).toBe("dzialka_budowlana");
  });

  it("właściciel = pożyczkobiorca (PESEL match)", () => {
    const r = mapujKwDoNieruchomosci(kw(), ctx);
    expect(r.nieruchomosc.wlasciciel_ref).toBe("pozyczkobiorca");
    expect(r.nieruchomosc.wlasciciel_dane).toBeUndefined();
  });

  it("właściciel = poręczyciel (PESEL match)", () => {
    const r = mapujKwDoNieruchomosci(
      kw({ dzial2: { wlasciciele: [{ nazwisko: "Nowak", pesel: POR }] } }),
      ctx,
    );
    expect(r.nieruchomosc.wlasciciel_ref).toBe("porecziciel");
  });

  it("właściciel = osoba trzecia → wlasciciel_dane + ostrzeżenie o adresie", () => {
    const r = mapujKwDoNieruchomosci(
      kw({ dzial2: { wlasciciele: [{ imiePierwsze: "Ewa", nazwisko: "Obca", pesel: OBCY }] } }),
      ctx,
    );
    expect(r.nieruchomosc.wlasciciel_ref).toBe("osoba_trzecia");
    expect(r.nieruchomosc.wlasciciel_dane.typ).toBe("osoba_fizyczna");
    expect(r.nieruchomosc.wlasciciel_dane.imie_nazwisko).toBe("Ewa Obca");
    expect(r.nieruchomosc.wlasciciel_dane.adres).toBeNull();
    expect(r.ostrzezenia.some((o) => o.includes("adres"))).toBe(true);
  });

  it("dwoje właścicieli-pożyczkobiorców → współwłasność łączna małżeńska", () => {
    const r = mapujKwDoNieruchomosci(
      kw({
        dzial2: {
          wlasciciele: [
            { nazwisko: "Kowalski", pesel: PB },
            { nazwisko: "Kowalska", pesel: "72020254321" },
          ],
        },
      }),
      { id: "N1", pozyczkobiorcaPesele: [PB, "72020254321"], poreczicielPesel: null },
    );
    expect(r.odrzucona).toBe(false);
    expect(r.nieruchomosc.wlasciciel_ref).toBe("pozyczkobiorca");
    expect(r.nieruchomosc.wspolwlasnosc.rodzaj).toBe("laczna_malzenska");
    expect(r.nieruchomosc.wspolwlasnosc.wspolwlasciciele).toHaveLength(2);
  });

  it("współwłasność z osobą spoza transakcji → ODRZUCENIE", () => {
    const r = mapujKwDoNieruchomosci(
      kw({
        dzial2: {
          wlasciciele: [
            { nazwisko: "Kowalski", pesel: PB },
            { nazwisko: "Obcy", pesel: OBCY },
          ],
        },
      }),
      ctx,
    );
    expect(r.odrzucona).toBe(true);
    expect(r.powod).toContain("współwłasności");
    expect(r.nieruchomosc).toBeUndefined();
  });

  it("dział III: dożywocie klasyfikowane, sposob_usuniecia='brak' + ostrzeżenie ryzykowne", () => {
    const r = mapujKwDoNieruchomosci(
      kw({
        dzial3: {
          wpisy: [
            { rodzaj: "SŁUŻEBNOŚĆ OSOBISTA DOŻYWOCIA", tresc: "dożywotnie prawo mieszkania" },
          ],
        },
      }),
      ctx,
    );
    const o = r.nieruchomosc.obciazenia.find((x: any) => x.dzial === "III");
    expect(o.rodzaj).toBe("dozywocie");
    expect(o.sposob_usuniecia).toBe("brak");
    expect(o.opis).toBe("dożywotnie prawo mieszkania");
    expect(r.ostrzezenia.some((w) => w.includes("ryzykowne"))).toBe(true);
  });

  it("dział III: nierozpoznany rodzaj → 'inne' + ostrzeżenie, oryginał w opisie", () => {
    const r = mapujKwDoNieruchomosci(
      kw({ dzial3: { wpisy: [{ rodzaj: "COŚ NIETYPOWEGO", tresc: "treść oryginalna" }] } }),
      ctx,
    );
    const o = r.nieruchomosc.obciazenia.find((x: any) => x.dzial === "III");
    expect(o.rodzaj).toBe("inne");
    expect(o.opis).toBe("treść oryginalna");
    expect(r.ostrzezenia.some((w) => w.includes("Nierozpoznany"))).toBe(true);
  });

  it("dział IV: hipoteka umowna, kwota sformatowana", () => {
    const r = mapujKwDoNieruchomosci(
      kw({
        dzial4: {
          hipoteki: [
            {
              rodzaj: "HIPOTEKA UMOWNA",
              sumaKwota: 142350,
              walutaSumy: "ZŁ",
              wierzyciel: "Bank X",
            },
          ],
        },
      }),
      ctx,
    );
    const o = r.nieruchomosc.obciazenia.find((x: any) => x.dzial === "IV");
    expect(o.rodzaj).toBe("hipoteka_umowna");
    expect(o.kwota).toBe("142 350,00");
    expect(o.wierzyciel).toBe("Bank X");
    expect(o.sposob_usuniecia).toBe("brak");
  });

  it("dział IV: waluta ≠ PLN → ostrzeżenie", () => {
    const r = mapujKwDoNieruchomosci(
      kw({
        dzial4: { hipoteki: [{ rodzaj: "HIPOTEKA UMOWNA", sumaKwota: 50000, walutaSumy: "EUR" }] },
      }),
      ctx,
    );
    expect(r.ostrzezenia.some((w) => w.includes("walucie EUR"))).toBe(true);
  });

  it("KW wielodziałkowa → ostrzeżenie o obciążeniu wszystkich", () => {
    const r = mapujKwDoNieruchomosci(
      kw({ dzial1o: { miejscowosc: "Lublin", dzialki: [{ numer: "145/2" }, { numer: "145/3" }] } }),
      ctx,
    );
    expect(r.nieruchomosc.dzialki_w_kw).toEqual(["145/2", "145/3"]);
    expect(r.ostrzezenia.some((w) => w.includes("obejmuje 2 działek"))).toBe(true);
  });

  it("właściciel-podmiot jako osoba trzecia", () => {
    const r = mapujKwDoNieruchomosci(
      kw({
        dzial2: {
          wlasciciele: [{ nazwa: "FIRMA sp. z o.o.", regon: "123456789", siedziba: "Warszawa" }],
        },
      }),
      ctx,
    );
    expect(r.nieruchomosc.wlasciciel_ref).toBe("osoba_trzecia");
    expect(r.nieruchomosc.wlasciciel_dane.typ).toBe("podmiot_gospodarczy");
    expect(r.nieruchomosc.wlasciciel_dane.nazwa).toBe("FIRMA sp. z o.o.");
  });
});
