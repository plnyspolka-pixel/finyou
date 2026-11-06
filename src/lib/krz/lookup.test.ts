import { describe, expect, it } from "vitest";
import { krzCoverageNote, matchKrzRow, matchKrzRows, type KrzRow } from "./lookup";

const row = (over: Partial<KrzRow> = {}): KrzRow => ({
  id_zewnetrzny: "a",
  numer_obwieszczenia: "20261106/00001",
  data_obwieszczenia: "2026-11-06",
  rodzaj_sprawy: "U",
  kategoria: "Zabezpieczenie majątku",
  podkategoria: "Obwieszczenie postanowienia o ustanowieniu tymczasowego nadzorcy sądowego",
  sygnatura: "WR1F/GU/865/2026",
  sad: "Sąd Rejonowy dla Wrocławia-Fabrycznej",
  podmiot_rodzaj: "podmiot",
  podmiot_nazwa: "SKYWOOD SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
  podmiot_krs: "0000859953",
  podmiot_nip: "8992885588",
  podmiot_miejscowosc: "Bielany Wrocławskie",
  analiza: null,
  ...over,
});

describe("matchKrzRow", () => {
  it("NIP → identyfikator, nawet gdy nazwa inna", () => {
    expect(matchKrzRow({ kind: "company", name: "Inna nazwa", nip: "899-288-55-88" }, row())).toBe(
      "identifier",
    );
  });
  it("KRS → identyfikator", () => {
    expect(matchKrzRow({ kind: "company", name: "x", krs: "0000859953" }, row())).toBe(
      "identifier",
    );
  });
  it("sama nazwa → name_only (bez względu na wielkość liter i ogonki)", () => {
    expect(
      matchKrzRow(
        { kind: "company", name: "skywood spółka z ograniczoną odpowiedzialnością" },
        row(),
      ),
    ).toBe("name_only");
  });
  it("osoba: imię nazwisko i nazwisko imię", () => {
    const r = row({
      podmiot_rodzaj: "osoba_fizyczna",
      podmiot_nazwa: "Jan Testowy",
      podmiot_nip: null,
      podmiot_krs: null,
    });
    expect(matchKrzRow({ kind: "person", name: "Jan Testowy" }, r)).toBe("name_only");
    expect(matchKrzRow({ kind: "person", name: "Testowy Jan" }, r)).toBe("name_only");
    expect(matchKrzRow({ kind: "person", name: "Jan Testowski" }, r)).toBeNull();
  });
  it("nie dopasowuje po samym nazwisku", () => {
    const r = row({ podmiot_nazwa: "Jan Testowy", podmiot_nip: null, podmiot_krs: null });
    expect(matchKrzRow({ kind: "person", name: "Testowy" }, r)).toBeNull();
  });
});

describe("matchKrzRows", () => {
  it("identyfikator przed nazwą, najnowsze pierwsze; detail z analizą AI", () => {
    const rows = [
      row({
        id_zewnetrzny: "n1",
        data_obwieszczenia: "2026-11-01",
        podmiot_nip: null,
        podmiot_krs: null,
      }),
      row({
        id_zewnetrzny: "i1",
        data_obwieszczenia: "2026-10-01",
        analiza: {
          etap: "zabezpieczenie",
          rodzajPodmiotu: "spolka",
          streszczenie: "Ustanowiono TNS.",
          kluczoweFakty: [],
          terminDlaWierzycieli: null,
          sygnalRyzyka: "sredni",
          uzasadnienieRyzyka: "",
          wartoSprawdzicWBazie: true,
          identyfikatory: { krs: "0000859953", nip: "8992885588" },
        },
      }),
      row({ id_zewnetrzny: "x", podmiot_nazwa: "KTOŚ INNY", podmiot_nip: null, podmiot_krs: null }),
    ];
    const hits = matchKrzRows(
      {
        kind: "company",
        name: "SKYWOOD SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
        nip: "8992885588",
      },
      rows,
    );
    expect(hits).toHaveLength(2);
    expect(hits[0].match).toBe("identifier");
    expect(hits[0].detail).toContain("AI: zabezpieczenie majątku, ryzyko sredni");
    expect(hits[0].caseSignature).toBe("WR1F/GU/865/2026");
    expect(hits[1].match).toBe("name_only");
    expect(hits[0].source).toContain("KRZ");
  });
});

describe("krzCoverageNote", () => {
  it("bez kopii — jasny komunikat", () => {
    expect(krzCoverageNote(null, 0)).toMatch(/nie była jeszcze pobrana/);
  });
  it("z zakresem", () => {
    expect(krzCoverageNote({ from: "2026-11-01", to: "2026-11-06", rows: 4000 }, 0)).toContain(
      "2026-11-01…2026-11-06",
    );
    expect(krzCoverageNote({ from: "2026-11-01", to: "2026-11-06", rows: 4000 }, 2)).toContain(
      "2 obwieszcz.",
    );
  });
});
