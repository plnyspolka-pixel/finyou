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

import { DOMYSLNY_CEL_POZYCZKI, ustawPoczatekNegocjacji } from "./uzupelnienia";

describe("zmiany z 10.2026: cel, PEP, negocjacje, wejście w życie, wcześniejsza spłata", () => {
  it("brak celu → „Finansowanie bieżącej działalności gospodarczej” we wniosku i umowie", () => {
    const u = baza();
    u.warunki.cel = "";
    const r = przetworzSzkic(u);
    expect(r.umowa.warunki.cel).toBe(DOMYSLNY_CEL_POZYCZKI);
    expect(tekstKompletu(r.umowa)).toContain(
      "Cel pożyczki: | Finansowanie bieżącej działalności gospodarczej",
    );
  });

  it("wniosek: samo oświadczenie „nie jestem PEP”, bez pól wyboru", () => {
    const t = tekstKompletu(przetworzSzkic(baza()).umowa);
    expect(t).toContain(
      "Oświadczam, że nie jestem osobą zajmującą eksponowane stanowisko polityczne (PEP) ani osobą z nią powiązaną.",
    );
    expect(t).not.toMatch(/Jestem osobą PEP/);
    expect(t).not.toMatch(/[☐☒] .*PEP/);
  });

  it("wniosek.pep = true blokuje generację", () => {
    const u = baza();
    u.wniosek = { pep: true };
    const r = przetworzSzkic(u);
    expect(r.problemy.some((p) => p.poziom === "BLAD" && p.sciezka === "wniosek.pep")).toBe(true);
  });

  it("negocjacje od dnia przyjęcia wniosku; ręczna data_od nie jest nadpisywana", () => {
    const u = baza();
    delete u.protokol_negocjacji;
    expect(ustawPoczatekNegocjacji(u, "2026-10-01T09:15:00Z")).toHaveLength(1);
    expect(u.protokol_negocjacji.data_od).toBe("01.10.2026");
    expect(tekstKompletu(przetworzSzkic(u).umowa)).toContain(
      "Negocjacje trwały: | 01.10.2026 – 21.07.2026".replace("21.07.2026", u.meta.data_umowy),
    );
    expect(ustawPoczatekNegocjacji(u, "2026-09-01T00:00:00Z")).toEqual([]);
    expect(u.protokol_negocjacji.data_od).toBe("01.10.2026");
  });

  it("wejście w życie bez podpisu poświadczonego notarialnie; prowizja −30% / −20%", () => {
    const t = tekstKompletu(przetworzSzkic(baza()).umowa);
    expect(t).toContain("a) oryginału Umowy wraz z załącznikami;");
    expect(t).not.toMatch(/poświadczonym notarialnie;/);
    expect(t).toContain(
      "przed upływem 1 roku od dnia zawarcia Umowy prowizja ulega obniżeniu o 30%",
    );
    expect(t).toContain("lecz przed upływem 2 lat od dnia zawarcia Umowy — o 20%");
  });
});

describe("prowizja Finance You w umowie (bez Załącznika nr 4)", () => {
  const zInwestorem = () => {
    const u = baza();
    u.pozyczkodawca = {
      typ: "osoba_fizyczna",
      imie_nazwisko: "Jan Inwestor",
      pesel: "70010112345",
      adres: "ul. Testowa 1, 00-001 Warszawa",
    };
    u.warunki.rachunki.splata = "11 1111 1111 1111 1111 1111 1111";
    return u;
  };

  it("pożyczkodawca-inwestor: sama dyspozycja przelewu prowizji FY w § 2, bez Zał. nr 4", () => {
    const r = przetworzSzkic(zInwestorem());
    expect(r.problemy.filter((p) => p.poziom === "BLAD")).toEqual([]);
    const t = tekstKompletu(r.umowa);
    expect(t).toMatch(
      /Pożyczkobiorca poleca Pożyczkodawcy przekazanie z Kwoty Pożyczki kwoty pięć tysięcy złotych 00\/100 \(5 000,00 zł\), stanowiącej Prowizję od Pożyczkobiorcy należną Finance You sp\. z o\.o\., na rachunek Finance You sp\. z o\.o\. nr [\d ]+\./,
    );
    expect(t).not.toMatch(/Załącznik(?:iem)? nr 4|ZAŁĄCZNIK NR 4|DYSPOZYCJA WYPŁATY|art\. 393/);
    expect(t).not.toMatch(/nie jest oprocentowana/);
    expect(t).not.toContain("5% Kwoty Pożyczki");
    // odsetki liczone od pełnej Kwoty Pożyczki (50 000 zł), nie od kwoty na rękę
    expect(r.umowa.warunki.harmonogram.raty[0].odsetki).toBe("604,17");
  });

  it("pożyczkodawca Finance You: brak klauzuli o prowizji FY nawet przy podanym polu", () => {
    const u = baza();
    u.warunki.prowizja_finance_you = { kwota: { cyframi: "5 000,00", slownie: "" } };
    const t = tekstKompletu(przetworzSzkic(u).umowa);
    expect(t).not.toContain("Prowizji od Pożyczkobiorcy");
  });
});
