/**
 * Pkt 7 zlecenia „przypadki graniczne": wartości domyślne draft_contract —
 * pole użyte w szablonie bez wartości nie może dać błędu renderu dopiero
 * przy podglądzie.
 */
import { describe, expect, it } from "vitest";
import fx from "./fixtures/scenariusz_01_podstawowy.json";
import { przetworzSzkic } from "./umowa-agent-core";
import { tekstKompletu } from "./komplet";
import { miejscownikMiejscowosci, uzupelnijDomyslne } from "./uzupelnienia";

/* eslint-disable @typescript-eslint/no-explicit-any */
const baza = () => structuredClone(fx as any);

describe("egzekucja_777 — wartości domyślne", () => {
  it("brak termin_wezwania_dni → 7, brak data_graniczna → data umowy + 10 lat; render bez błędu", () => {
    const u = baza();
    delete u.zabezpieczenia.egzekucja_777.termin_wezwania_dni;
    delete u.zabezpieczenia.egzekucja_777.data_graniczna;
    const r = przetworzSzkic(u);
    expect(r.umowa.zabezpieczenia.egzekucja_777.termin_wezwania_dni).toBe(7);
    expect(r.umowa.zabezpieczenia.egzekucja_777.data_graniczna).toBe("21.07.2036");
    expect(r.autokorekty.map((k) => k.sciezka)).toEqual(
      expect.arrayContaining([
        "zabezpieczenia.egzekucja_777.termin_wezwania_dni",
        "zabezpieczenia.egzekucja_777.data_graniczna",
      ]),
    );
    expect(r.problemy.filter((p) => p.poziom === "BLAD")).toEqual([]);
    expect(() => tekstKompletu(r.umowa)).not.toThrow();
  });

  it("tylko kwota hipoteki → ta sama kwota w art. 777", () => {
    const u = baza();
    delete u.zabezpieczenia.egzekucja_777.kwota;
    const kwotaHip = u.nieruchomosci[0].hipoteka.kwota.cyframi;
    const r = uzupelnijDomyslne(u);
    expect(u.zabezpieczenia.egzekucja_777.kwota.cyframi).toBe(kwotaHip);
    expect(r.autokorekty.some((k) => k.sciezka === "zabezpieczenia.egzekucja_777.kwota")).toBe(
      true,
    );
  });

  it("tylko kwota z art. 777 → ta sama kwota hipoteki", () => {
    const u = baza();
    delete u.nieruchomosci[0].hipoteka.kwota;
    uzupelnijDomyslne(u);
    expect(u.nieruchomosci[0].hipoteka.kwota.cyframi).toBe(
      u.zabezpieczenia.egzekucja_777.kwota.cyframi,
    );
  });

  it("brak obu → tylko podpowiedź 2× do spłaty (INFORMACJA), bez autouzupełnienia", () => {
    const u = baza();
    delete u.zabezpieczenia.egzekucja_777.kwota;
    for (const n of u.nieruchomosci) delete n.hipoteka.kwota;
    const r = przetworzSzkic(u);
    expect(r.umowa.zabezpieczenia.egzekucja_777.kwota).toBeUndefined();
    const info = r.problemy.find((p) => p.poziom === "INFORMACJA");
    expect(info?.komunikat).toMatch(/2 × łączna kwota do spłaty/);
  });
});

describe("meta.miejscowosc — mianownik → miejscownik", () => {
  it.each([
    ["Lublin", "Lublinie"],
    ["Słupsk", "Słupsku"],
    ["Warszawa", "Warszawie"],
    ["Kraków", "Krakowie"],
    ["Katowice", "Katowicach"],
    ["Zielona Góra", "Zielonej Górze"],
    ["Rzeszów", "Rzeszowie"],
    ["Lublinie", "Lublinie"],
    ["Nowym Dworze Mazowieckim", "Nowym Dworze Mazowieckim"],
  ])("%s → %s", (a, b) => expect(miejscownikMiejscowosci(a).wynik).toBe(b));
});

describe("sąd z kodu wydziału KW", () => {
  it("brak sądu przy nieruchomości → słownik kw_court_codes + autokorekta", () => {
    const u = baza();
    u.nieruchomosci[0].sad = null;
    u.nieruchomosci[0].nr_kw = "SL1S/00061444/8";
    const r = przetworzSzkic(u);
    expect(r.umowa.nieruchomosci[0].sad).toBe("Sąd Rejonowy w Słupsku");
    expect(r.autokorekty.some((k) => k.sciezka === "nieruchomosci[0].sad")).toBe(true);
  });
});
