/**
 * Testy jądra agenta umowy (osobny agent TYLKO do wypełniania umowy):
 * scalanie łatek AI, deterministyczne doliczenia (słownie, id, harmonogram
 * z silnika) i pełne przetworzenie szkicu (autonaprawa + walidacja).
 */
import { describe, it, expect } from "vitest";
import {
  scalPatch,
  przetworzSzkic,
  uzupelnijHarmonogram,
  uzupelnijSlownie,
} from "./umowa-agent-core";
import { walidujHarmonogram } from "./schedule";
import S1 from "./fixtures/scenariusz_01_podstawowy.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T>(o: T): T => structuredClone(o);

describe("Agent umowy — scalanie łatek (scalPatch)", () => {
  it("scala obiekty rekurencyjnie", () => {
    const wynik = scalPatch(
      { meta: { miejscowosc: "Lublinie" }, a: 1 },
      { meta: { numer_umowy: "FP/1" } },
    );
    expect(wynik).toEqual({ meta: { miejscowosc: "Lublinie", numer_umowy: "FP/1" }, a: 1 });
  });

  it("tablice podmienia w całości", () => {
    const wynik = scalPatch(
      { nieruchomosci: [{ id: "N1" }, { id: "N2" }] },
      { nieruchomosci: [{ nr_kw: "X" }] },
    );
    expect(wynik.nieruchomosci).toEqual([{ nr_kw: "X" }]);
  });

  it("null czyści wartość", () => {
    const wynik = scalPatch({ porecziciel: { imie_nazwisko: "Jan" } }, { porecziciel: null });
    expect(wynik.porecziciel).toBeNull();
  });

  it("nie mutuje bazy", () => {
    const baza = { warunki: { cel: "stary" } };
    scalPatch(baza, { warunki: { cel: "nowy" } });
    expect(baza.warunki.cel).toBe("stary");
  });
});

describe("Agent umowy — doliczenia deterministyczne", () => {
  it("uzupełnia brakujące „slownie” przy kwotach", () => {
    const dane: any = { warunki: { kwota_pozyczki: { cyframi: "50 000,00", slownie: "" } } };
    uzupelnijSlownie(dane);
    expect(dane.warunki.kwota_pozyczki.slownie).toContain("pięćdziesiąt tysięcy");
  });

  it("harmonogram balonowy liczy SILNIK — wynik przechodzi walidację harmonogramu", () => {
    const z = clone(S1) as any;
    z.warunki.harmonogram.raty = [];
    uzupelnijHarmonogram(z);
    uzupelnijSlownie(z);
    const raty = z.warunki.harmonogram.raty;
    expect(raty.length).toBe(z.warunki.harmonogram.liczba_rat);
    expect(raty[0].termin).toBe(z.warunki.harmonogram.data_pierwszej_raty);
    expect(walidujHarmonogram(z.warunki)).toEqual([]);
  });

  it("bez pułapu raty (typ balonowy) nie liczy — braki zostają dla walidatora", () => {
    const z = clone(S1) as any;
    z.warunki.harmonogram.raty = [];
    z.warunki.harmonogram.kwota_raty = null;
    uzupelnijHarmonogram(z);
    expect(z.warunki.harmonogram.raty).toEqual([]);
  });
});

describe("Agent umowy — przetworzSzkic (całość)", () => {
  it("kompletny szkic: id nieruchomości, harmonogram i słownie doliczone, zero błędów", () => {
    const z = clone(S1) as any;
    z.warunki.harmonogram.raty = [];
    z.nieruchomosci[0].id = undefined;
    const { umowa, problemy } = przetworzSzkic(z);
    expect(umowa.nieruchomosci[0].id).toBe("N1");
    expect(umowa.warunki.harmonogram.raty.length).toBeGreaterThan(0);
    expect(problemy.filter((p) => p.poziom === "BLAD")).toEqual([]);
  });

  it("pusty szkic nie wybucha — zwraca braki schematu jako błędy", () => {
    const { problemy } = przetworzSzkic({});
    expect(problemy.length).toBeGreaterThan(0);
    expect(problemy.every((p) => p.poziom === "BLAD" || p.poziom === "OSTRZEZENIE")).toBe(true);
  });
});
