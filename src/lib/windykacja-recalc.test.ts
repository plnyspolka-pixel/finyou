import { describe, expect, it } from "vitest";
import {
  daysSinceDue,
  formatRachunekSplaty,
  harmonogramFromInput,
  opisHarmonogramu,
  warsawToday,
  windRecalcPlan,
} from "./windykacja-recalc";
import { generateHarmonogram } from "./windykacja-harmonogram";

// Scenariusz z dokumentacji testu: 12 rat po 7 868,48 zł od 2026-07-10
// (ostatnia 7 868,37 zł), wpłaty 2026-07-09 7 868,48 zł i 2026-08-12 4 000 zł,
// stopa odsetek za opóźnienie 18,5 %, stan na 2026-10-06.
const harmonogram = generateHarmonogram({
  pierwszaRata: "2026-07-10",
  liczbaRat: 12,
  kwotaRaty: 7868.48,
  kwotaOstatniejRaty: 7868.37,
});
const wplata = (data: string, kwota: number) => ({
  typ: "wplata",
  data_zdarzenia: `${data}T12:00:00.000Z`,
  metadata: { kwota },
});
const events = [wplata("2026-07-09", 7868.48), wplata("2026-08-12", 4000)];
const loan = {
  kwota_pozyczki: 80_000,
  kwota_calkowita: 94_421.65,
  prowizja: 0,
  data_umowy: "2026-06-15",
  stopa_odsetek_max: 18.5,
  status: "w_zwloce",
  harmonogram,
};

describe("warsawToday", () => {
  it("zwraca dzień kalendarzowy w Polsce, a nie w UTC", () => {
    // 22:30 UTC 5 października = 00:30 6 października w Warszawie (CEST).
    expect(warsawToday(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
    // Zima (CET, UTC+1): 23:30 UTC 31 grudnia = 00:30 1 stycznia.
    expect(warsawToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(warsawToday(new Date("2026-10-06T10:00:00Z"))).toBe("2026-10-06");
  });
});

describe("daysSinceDue", () => {
  it("liczy dni od terminu, 0 przed terminem i bez terminu", () => {
    expect(daysSinceDue("2026-08-10", "2026-10-06")).toBe(57);
    expect(daysSinceDue("2026-10-06", "2026-10-06")).toBe(0);
    expect(daysSinceDue("2026-12-01", "2026-10-06")).toBe(0);
    expect(daysSinceDue(null, "2026-10-06")).toBe(0);
    expect(daysSinceDue("nie-data", "2026-10-06")).toBe(0);
  });
});

describe("windRecalcPlan — migawka sprawy z harmonogramu", () => {
  it("scenariusz testowy: zaległe raty, opóźnienie i saldo", () => {
    const plan = windRecalcPlan({ loan, kwotaZalegla: 0, events, asOf: "2026-10-06" });
    expect(plan).not.toBeNull();
    expect(plan!.snapshot.zaleglosc).toBe(11_744.94);
    expect(plan!.snapshot.odsetkiZaOpoznienie).toBe(211.75);
    expect(plan!.snapshot.doZaplatyTeraz).toBe(11_956.69);
    expect(plan!.casePatch).toEqual({ kwota_zalegla: 11_744.94, opoznienie_dni: 57 });
    // Saldo = zaległe raty (2. i 3.) + 9 rat przyszłych (8 × 7 868,48 + 7 868,37).
    expect(plan!.loanPatch.saldo_pozostale).toBe(82_561.15);
    // Status bez zmian (pożyczka nadal w zwłoce).
    expect(plan!.loanPatch.status).toBeUndefined();
  });

  it("ręczna kwota zaległa sprawy nie wpływa na wynik z harmonogramu", () => {
    const a = windRecalcPlan({ loan, kwotaZalegla: 0, events, asOf: "2026-10-06" });
    const b = windRecalcPlan({ loan, kwotaZalegla: 99_999, events, asOf: "2026-10-06" });
    expect(b!.casePatch).toEqual(a!.casePatch);
    expect(b!.loanPatch).toEqual(a!.loanPatch);
  });

  it("pożyczka bez harmonogramu — null (model jednoterminowy bez zmian)", () => {
    const legacy = { ...loan, harmonogram: null, termin_splaty: "2026-08-10" };
    expect(windRecalcPlan({ loan: legacy, kwotaZalegla: 4000, events, asOf: "2026-10-06" })).toBe(
      null,
    );
    expect(
      windRecalcPlan({ loan: { ...loan, harmonogram: [] }, events, asOf: "2026-10-06" }),
    ).toBeNull();
  });

  it("całość spłacona → status 'spłacona', saldo 0", () => {
    const wszystko = harmonogram.map((r) => wplata(r.termin, r.kwota));
    const plan = windRecalcPlan({ loan, events: wszystko, asOf: "2027-07-01" });
    expect(plan!.casePatch).toEqual({ kwota_zalegla: 0, opoznienie_dni: 0 });
    expect(plan!.loanPatch).toEqual({ saldo_pozostale: 0, status: "splacona" });
    // Już spłacona — statusu nie zapisujemy ponownie.
    const again = windRecalcPlan({
      loan: { ...loan, status: "splacona" },
      events: wszystko,
      asOf: "2027-07-01",
    });
    expect(again!.loanPatch.status).toBeUndefined();
  });

  it("'spłacona' ustawiona świadomie nie jest cofana przez przeliczenie", () => {
    const plan = windRecalcPlan({
      loan: { ...loan, status: "splacona" },
      events,
      asOf: "2026-10-06",
    });
    expect(plan!.loanPatch.status).toBeUndefined();
  });

  it("wypowiedziana: status zostaje, wszystkie raty wymagalne", () => {
    const plan = windRecalcPlan({
      loan: { ...loan, status: "wypowiedziana", data_wypowiedzenia: "2026-09-15" },
      events,
      asOf: "2026-10-06",
    });
    expect(plan!.loanPatch.status).toBeUndefined();
    // Po wypowiedzeniu nie ma rat przyszłych — saldo = kwota zaległa.
    expect(plan!.snapshot.raty!.pozostaleRatyPrzyszle).toBe(0);
    expect(plan!.loanPatch.saldo_pozostale).toBe(plan!.casePatch.kwota_zalegla);
    expect(plan!.casePatch.kwota_zalegla).toBe(82_561.15);
  });
});

describe("formatRachunekSplaty", () => {
  it("NRB i IBAN PL — zapis grupowy", () => {
    expect(formatRachunekSplaty("61109010140000071219812874")).toBe(
      "61 1090 1014 0000 0712 1981 2874",
    );
    expect(formatRachunekSplaty("61 1090 1014 0000 0712 1981 2874")).toBe(
      "61 1090 1014 0000 0712 1981 2874",
    );
    expect(formatRachunekSplaty("pl61-1090-1014-0000-0712-1981-2874")).toBe(
      "PL61 1090 1014 0000 0712 1981 2874",
    );
    expect(formatRachunekSplaty("PL61\u00a01090 1014 0000 0712 1981 2874")).toBe(
      "PL61 1090 1014 0000 0712 1981 2874",
    );
  });

  it("odrzuca numery o złej długości i obce IBAN-y", () => {
    expect(formatRachunekSplaty("6110901014000007121981287")).toBeNull();
    expect(formatRachunekSplaty("611090101400000712198128745")).toBeNull();
    expect(formatRachunekSplaty("DE89370400440532013000")).toBeNull();
    expect(formatRachunekSplaty("61 1090 1014 0000 0712 1981 287X")).toBeNull();
    expect(formatRachunekSplaty("")).toBeNull();
  });
});

describe("harmonogramFromInput", () => {
  it("kwoty i daty w zapisie polskim, sortowanie i numeracja", () => {
    const { harmonogram: h, bledy } = harmonogramFromInput([
      { termin: "10.08.2026", kwota: "7 868,48", odsetki: "1 200,00" },
      { termin: "2026-07-10", kwota: 7868.48, prowizja: 300 },
    ]);
    expect(bledy).toEqual([]);
    expect(h).toEqual([
      { nr: 1, termin: "2026-07-10", kwota: 7868.48, prowizja: 300 },
      { nr: 2, termin: "2026-08-10", kwota: 7868.48, odsetki: 1200 },
    ]);
  });

  it("pomija puste wiersze, a pusta lista → brak harmonogramu", () => {
    expect(harmonogramFromInput([{ termin: "", kwota: "" }, {}])).toEqual({
      harmonogram: null,
      bledy: [],
    });
    expect(harmonogramFromInput([])).toEqual({ harmonogram: null, bledy: [] });
    const { harmonogram: h } = harmonogramFromInput([
      { termin: "2026-07-10", kwota: 100 },
      { termin: " ", kwota: null },
    ]);
    expect(h).toHaveLength(1);
  });

  it("błędne wiersze → błędy z numerem raty, bez harmonogramu", () => {
    const { harmonogram: h, bledy } = harmonogramFromInput([
      { termin: "2026-07-10", kwota: 100 },
      { termin: "2026-02-30", kwota: 100 },
      { termin: "2026-09-10", kwota: 0 },
      { termin: "2026-10-10", kwota: 100, odsetki: 80, prowizja: 30 },
      { termin: "2026-11-10", kwota: 100, odsetki: "abc" },
      "x",
    ]);
    expect(h).toBeNull();
    expect(bledy).toEqual([
      "Rata 2: nieprawidłowy termin płatności (RRRR-MM-DD).",
      "Rata 3: kwota raty musi być większa od 0.",
      "Rata 4: odsetki i prowizja przekraczają kwotę raty.",
      "Rata 5: nieprawidłowa kwota odsetek.",
      "Rata 6: nieprawidłowy wiersz harmonogramu.",
    ]);
  });
});

describe("opisHarmonogramu", () => {
  it("liczba rat z odmianą, suma i okres", () => {
    const nbsp = (s: string) => s.replace(/\u00a0/g, " ");
    expect(nbsp(opisHarmonogramu(harmonogram))).toBe("12 rat, 94 421,65 zł, 10.07.2026–10.06.2027");
    expect(opisHarmonogramu(harmonogram.slice(0, 1))).toBe(
      "1 rata, 7868,48 zł, 10.07.2026–10.07.2026",
    );
    expect(opisHarmonogramu(harmonogram.slice(0, 3))).toMatch(/^3 raty, /);
    expect(opisHarmonogramu(null)).toBe("brak harmonogramu");
  });
});
