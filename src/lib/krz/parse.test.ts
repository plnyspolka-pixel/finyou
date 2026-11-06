import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { displayName, flattenSearch, htmlToText, maskPesel, parseNoticeXml } from "./parse";
import type { KrzSearchResponse } from "./types";

const fx = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("flattenSearch", () => {
  it("spłaszcza grupy i kategorie, zachowując nazwy", () => {
    const res = JSON.parse(fx("lista.json")) as KrzSearchResponse;
    const rows = flattenSearch(res);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.grupa).toBeTruthy();
      expect(r.kategoria).toBeTruthy();
      expect(r.idZewnetrzny).toMatch(/^[0-9a-f-]{36}$/);
      expect(["U", "R", "Z"]).toContain(r.rodzajSprawy);
    }
  });
  it("pusta odpowiedź → pusta lista", () => {
    expect(
      flattenSearch({
        czyPrzekroczono: false,
        iloscWBazie: 0,
        iloscPozycjiWyswietlanych: 1000,
        grupaKategoriiKategorieObweszczeniaResponse: [],
      }),
    ).toEqual([]);
  });
});

describe("parseNoticeXml — osoba fizyczna", () => {
  const d = parseNoticeXml(fx("osoba.xml"), "id-osoba");
  it("metryka i sąd", () => {
    expect(d.sygnaturaAkt).toBe("PL1P/GU/535/2026");
    expect(d.numerObwieszczenia).toBe("20261105/00416");
    expect(d.dataObwieszczenia).toBe("2026-11-05");
    expect(d.sad).toBe("Sąd Rejonowy w Płocku");
    expect(d.wydzial).toContain("V Wydział");
  });
  it("podmiot bez PESEL", () => {
    expect(d.podmiot.rodzaj).toBe("osoba_fizyczna");
    expect(d.podmiot.imie).toBe("Jan");
    expect(d.podmiot.nazwisko).toBe("Testowy");
    expect(d.podmiot.prowadziDzialalnosc).toBe(false);
    expect(d.podmiot.nip).toBeNull();
    expect(JSON.stringify(d)).not.toContain("00000000000");
    expect(JSON.stringify(d)).not.toMatch(/PESEL\s*\d/);
  });
  it("treść jako tekst z zamaskowanym PESEL", () => {
    expect(d.tresc).not.toContain("<p>");
    expect(d.tresc).toContain("(PESEL [PESEL])");
    expect(d.tresc).toContain("tymczasowego nadzorcę sądowego");
  });
  it("doradca i atrybuty", () => {
    expect(d.doradcy).toHaveLength(1);
    expect(d.doradcy[0].zdarzenieKod).toBe("P");
    expect(d.doradcy[0].nrLicencji).toBe("0001");
    expect(d.atrybuty.terminKrajowyWniesieniaZaskarzen).toBe("2026-11-12");
  });
  it("displayName", () => {
    expect(displayName(d)).toBe("Jan Testowy");
  });
});

describe("parseNoticeXml — spółka", () => {
  const d = parseNoticeXml(fx("spolka.xml"), "id-spolka");
  it("podmiot z KRS i NIP", () => {
    expect(d.podmiot.rodzaj).toBe("podmiot");
    expect(d.podmiot.nazwa).toContain("SKYWOOD");
    expect(d.podmiot.krs).toBe("0000859953");
    expect(d.podmiot.nip).toBe("8992885588");
    expect(d.podmiot.formaPrawna).toContain("ograniczoną");
    expect(displayName(d)).toContain("SKYWOOD");
  });
  it("doradca będący spółką", () => {
    expect(d.doradcy[0].nazwa).toContain("KANCELARIA");
    expect(d.doradcy[0].krs).toBe("0000583226");
    expect(d.doradcy[0].imie).toBeNull();
  });
});

describe("maskPesel / htmlToText", () => {
  it("maskuje 11 cyfr, zostawia NIP i KRS", () => {
    expect(maskPesel("PESEL 81061406091, NIP 8992885588, KRS 0000859953")).toBe(
      "PESEL [PESEL], NIP 8992885588, KRS 0000859953",
    );
  });
  it("zdejmuje HTML i encje", () => {
    expect(htmlToText("<p>a&nbsp;b</p><p>c &amp; d</p>")).toBe("a b\nc & d");
  });
});
