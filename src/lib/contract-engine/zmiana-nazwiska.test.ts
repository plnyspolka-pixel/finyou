/**
 * Pkt 3 zlecenia „przypadki graniczne": właścicielka w KW pod poprzednim
 * nazwiskiem, w CEIDG/dowodzie pod aktualnym, PESEL ten sam. Umowa idzie na
 * nazwisko z CEIDG z adnotacją o nazwisku z KW (komparycja + § 5 ust. 8).
 * Inny PESEL — brak adnotacji (blokada zostaje po stronie analizy KW).
 */
import { describe, expect, it } from "vitest";
import fx from "./fixtures/scenariusz_01_podstawowy.json";
import { przetworzSzkic } from "./umowa-agent-core";
import { tekstKompletu } from "./komplet";
import { dopiszUjawnieniaZKw } from "./uzupelnienia";

/* eslint-disable @typescript-eslint/no-explicit-any */
const KW = "WA1N/00019868/3";

function umowa(): any {
  const u = structuredClone(fx as any);
  u.pozyczkobiorca.imie_nazwisko = "Anna Jopek";
  u.pozyczkobiorca.pesel = "44051401441";
  u.pozyczkobiorca.firma = null;
  return u;
}

describe("zmiana nazwiska — ten sam PESEL", () => {
  const u = umowa();
  const korekty = dopiszUjawnieniaZKw(u, KW, [
    { imie_nazwisko: "Anna Żukowska", pesel: "44051401441" },
  ]);
  const { umowa: wynik, problemy } = przetworzSzkic(u);
  const tekst = tekstKompletu(wynik);

  it("dopisuje ujawnienie_w_kw i autokorektę", () => {
    expect(wynik.pozyczkobiorca.ujawnienie_w_kw).toEqual([
      { nr_kw: KW, imie_nazwisko: "Anna Żukowska" },
    ]);
    expect(korekty).toHaveLength(1);
    expect(problemy.filter((p) => p.poziom === "BLAD")).toEqual([]);
  });

  it("komparycja: nazwisko z CEIDG + adnotacja o nazwisku z KW", () => {
    expect(tekst).toContain(`ujawniona w dziale II księgi wieczystej nr ${KW} jako ANNA ŻUKOWSKA`);
    expect(tekst).toMatch(/ANNA JOPEK/);
  });

  it("§ 5: oświadczenie o majątku osobistym z adnotacją", () => {
    expect(tekst).toContain(
      `Anna Jopek, ujawniona w dziale II księgi wieczystej nr ${KW} jako ANNA ŻUKOWSKA, oświadcza, że`,
    );
  });

  it("wywołanie ponowne nie dubluje adnotacji", () => {
    expect(
      dopiszUjawnieniaZKw(wynik, KW, [{ imie_nazwisko: "Anna Żukowska", pesel: "44051401441" }]),
    ).toEqual([]);
  });
});

describe("zmiana nazwiska — inny PESEL", () => {
  it("brak adnotacji (to nie ta sama osoba)", () => {
    const u = umowa();
    const korekty = dopiszUjawnieniaZKw(u, KW, [
      { imie_nazwisko: "Anna Żukowska", pesel: "70010112345" },
    ]);
    expect(korekty).toEqual([]);
    expect(u.pozyczkobiorca.ujawnienie_w_kw).toBeUndefined();
  });

  it("to samo nazwisko i PESEL — nic do dopisania", () => {
    const u = umowa();
    expect(
      dopiszUjawnieniaZKw(u, KW, [{ imie_nazwisko: "ANNA JOPEK", pesel: "44051401441" }]),
    ).toEqual([]);
  });
});

import { diffTekstu } from "./diff-tekstu";
describe("diffTekstu (wersje dokumentu)", () => {
  it("pokazuje zmienione linie z kontekstem", () => {
    const d = diffTekstu("a\nb\nc\nd", "a\nB\nc\nd\ne");
    expect(d.dodane).toBe(2);
    expect(d.usuniete).toBe(1);
    expect(d.linie.map((l) => l.typ + l.tekst)).toEqual([" a", "-b", "+B", " c", " d", "+e"]);
  });
});
