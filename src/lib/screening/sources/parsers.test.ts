// Testy integracyjne parserów źródeł na zapisanych próbkach prawdziwych
// odpowiedzi (pobranych 2026-10-09, przycięte do kilku rekordów).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEuFsf, parseUnSc, parseOfacSdn, parseMswia, parseCsv } from "./sanctions-parsers";
import {
  parseSejmMps,
  parseWikidataHolders,
  wikidataHoldersQuery,
  wikidataPositionsQuery,
  parseKprm,
} from "./pep-parsers";

const fx = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("UE — skonsolidowana lista sankcji finansowych", () => {
  const recs = parseEuFsf(fx("eu_fsf_sample.xml"));
  it("parsuje osoby i podmioty z aliasami, datami i obywatelstwem", () => {
    expect(recs).toHaveLength(4);
    const saddam = recs.find((r) => r.primaryName.includes("Saddam"))!;
    expect(saddam.entityType).toBe("person");
    expect(saddam.birthDates).toContain("1937-04-28");
    expect(saddam.nationalities).toEqual(["IQ"]);
    expect(saddam.names.map((n) => n.name)).toContain("Abu Ali");
    expect(saddam.programme).toBe("IRQ");
    expect(saddam.sourceId).toBe("13");
    expect(recs.some((r) => r.entityType === "entity")).toBe(true);
  });
  it("zachowuje warianty nazw w innych alfabetach (cyrylica)", () => {
    expect(recs.some((r) => r.names.some((n) => /[Ѐ-ӿ]/.test(n.name)))).toBe(true);
  });
  it("obsługuje datę urodzenia znaną tylko co do roku", () => {
    expect(recs.some((r) => r.birthDates.some((d) => /^\d{4}$/.test(d)))).toBe(true);
  });
});

describe("ONZ — skonsolidowana lista Rady Bezpieczeństwa", () => {
  const recs = parseUnSc(fx("un_sc_sample.xml"));
  it("parsuje osoby (daty dokładne, rok, przedział) i podmioty", () => {
    expect(recs.filter((r) => r.entityType === "person")).toHaveLength(4);
    expect(recs.filter((r) => r.entityType === "entity")).toHaveLength(1);
    const withYearRange = recs.find((r) => r.birthDates.length > 1);
    expect(withYearRange).toBeDefined();
    expect(recs.every((r) => r.sourceId && r.primaryName)).toBe(true);
    expect(recs[0].listedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("OFAC SDN", () => {
  it("parsuje CSV z cudzysłowami i wyciąga DOB z uwag", () => {
    const recs = parseOfacSdn(
      fx("ofac_sdn_sample.csv"),
      '15582,1,"aka","ROTENBERG, Arkadiy",-0- \n',
    );
    const abbas = recs.find((r) => r.sourceId === "2674")!;
    expect(abbas.primaryName).toBe("Abu ABBAS");
    expect(abbas.birthDates).toEqual(["1948-12-10"]);
    const entity = recs.find((r) => r.entityType === "entity");
    expect(entity).toBeDefined();
    const rot = recs.find((r) => r.primaryName.includes("ROTENBERG") && r.entityType === "person");
    expect(rot).toBeDefined();
  });
  it("parseCsv obsługuje przecinki i cudzysłowy wewnątrz pól", () => {
    expect(parseCsv('1,"a, ""b""",c\n2,x,y\n')).toEqual([
      ["1", 'a, "b"', "c"],
      ["2", "x", "y"],
    ]);
  });
});

describe("MSWiA — lista sankcyjna (ustawa z 13.04.2022)", () => {
  const { records, listVersion } = parseMswia(fx("mswia_sample.html"));
  it("parsuje osoby i podmioty oraz wersję listy", () => {
    const people = records.filter((r) => r.entityType === "person");
    const ents = records.filter((r) => r.entityType === "entity");
    expect(people.length).toBe(3);
    expect(ents.length).toBe(3);
    const a = people.find((r) => r.primaryName === "Apti Aronovich ALAUDINOV")!;
    expect(a.birthDates).toEqual(["1973-10-05"]);
    expect(a.listedAt).toBe("2022-10-27");
    expect(listVersion).toBe("168.0");
  });
});

describe("API Sejmu", () => {
  it("scala posłów z kadencji i zachowuje zakończone mandaty", () => {
    const mps = JSON.parse(fx("sejm_term10_mp_sample.json"));
    const recs = parseSejmMps([
      { term: { num: 10, from: "2023-11-13", current: true }, mps },
      { term: { num: 9, from: "2019-11-12", to: "2023-11-12" }, mps: [mps[0]] },
    ]);
    expect(recs).toHaveLength(3);
    const first = recs[0];
    expect(first.positions).toHaveLength(2);
    expect(first.current).toBe(true);
    expect(first.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const inactive = recs.find((r) => !r.current)!;
    expect(inactive.positions[0].to).toBe("2025-08-07");
  });
});

describe("Wikidata", () => {
  it("buduje zapytania SPARQL z filtrem dat i trybem podklas", () => {
    expect(wikidataHoldersQuery(["Q1054799"], 2000)).toContain("YEAR(?end) >= 2000");
    expect(wikidataPositionsQuery(["Q83307"], "subclass_pl")).toContain("wdt:P1001 wd:Q36");
  });
  it("agreguje wiersze SPARQL do osób z datą urodzenia i obywatelstwem", () => {
    const recs = parseWikidataHolders(JSON.parse(fx("wikidata_holders_sample.json")), {
      Q1054799: "PL-001",
      Q15051532: "PL-003",
    });
    expect(recs.length).toBeGreaterThan(5);
    const kw = recs.find((r) => r.fullName === "Aleksander Kwaśniewski")!;
    expect(kw.birthDate).toBe("1954-11-15");
    expect(kw.nationality).toContain("PL");
    expect(kw.positions[0].catalogCode).toBe("PL-001");
    expect(kw.sourceUrl).toBe("https://www.wikidata.org/wiki/Q55758");
  });
});

describe("KPRM — skład Rady Ministrów", () => {
  it("parsuje członków rządu i mapuje funkcje na pozycje katalogu", () => {
    const recs = parseKprm(
      fx("kprm_sample.html"),
      "https://www.gov.pl/web/premier/sklad-rady-ministrow",
    );
    expect(recs).toHaveLength(5);
    expect(recs[0].fullName).toBe("Donald Tusk");
    expect(recs[0].positions[0].catalogCode).toBe("PL-002");
    expect(recs[1].positions[0].catalogCode).toBe("PL-003");
    expect(recs.every((r) => r.current && r.birthDate === null)).toBe(true);
  });
});
