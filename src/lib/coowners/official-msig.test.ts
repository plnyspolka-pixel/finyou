import { describe, expect, it } from "vitest";
import { classifyOfficialMsigRows, OFFICIAL_MSIG_ENDPOINT } from "./official-msig.server";

const company = {kind:"company" as const, name:"ANSYS POLAND SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",krs:"0000753937"};
const notice = {
  id:19407882,sequenceNumber:1,monitorNumber:"213/2026",
  dateOfPublication:"2026-11-02T00:00:00",
  entityName:"ANSYS POLAND SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ W LIKWIDACJI w Warszawie.",
  signatureOfCase:null,signatureKRS:null,
};

describe("oficjalny MSiG JSON",()=>{
  it("adres jest wyłącznie publiczną wyszukiwarką MS",()=>{
    expect(new URL(OFFICIAL_MSIG_ENDPOINT).hostname).toBe("wyszukiwarka-msig.ms.gov.pl");
  });
  it("rozpoznaje wpis o likwidacji z numerem Monitora, nie udaje potwierdzenia długu",()=>{
    const hits=classifyOfficialMsigRows(company,[notice]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      category:"court_notice",match:"name_only",publicationDate:"2026-11-02",
      source:"MSiG — Ministerstwo Sprawiedliwości",
    });
    expect(hits[0].title).toContain("likwidacji");
    expect(hits[0].detail).toContain("213/2026");
  });
  it("nie generuje alertu dla zwykłego ogłoszenia o zmianie zarządu",()=>{
    const hits=classifyOfficialMsigRows(company,[{
      ...notice,id:19407883,entityName:"ANSYS POLAND SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
    }]);
    expect(hits).toEqual([]);
  });
  it("nie dopasowuje wyników po samym nazwisku w niepotwierdzonych wyszukaniach",()=>{
    const other={kind:"company" as const,name:"BETA spółka jawna"};
    expect(classifyOfficialMsigRows(other,[notice])).toEqual([]);
  });
  it("ignoruje zły format daty i duplikaty",()=>{
    expect(classifyOfficialMsigRows(company,[{...notice,dateOfPublication:"błędna"}])).toEqual([]);
    expect(classifyOfficialMsigRows(company,[notice,notice])).toHaveLength(1);
  });
});
