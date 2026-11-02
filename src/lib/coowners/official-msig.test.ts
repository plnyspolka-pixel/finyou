import { describe, expect, it } from "vitest";
import { classifyOfficialMsigRows, officialMsigPersonQuery, OFFICIAL_MSIG_ENDPOINT } from "./official-msig.server";

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


describe("MSiG — wyszukiwanie osób fizycznych po nazwisku",()=>{
  const person={kind:"person" as const, name:"Ryszard Kasprzak", firstName:"Ryszard",lastName:"Kasprzak"};
  const historicalNotice={
    id:6014927,monitorNumber:"123/2015",
    dateOfPublication:"2015-06-29T00:00:00",
    entityName:"Kasprzak Ryszard",
    signatureOfCase:"XII GU 42/15, XII GUp 30/15",
  };
  it("wymusza kolejność Nazwisko Imię, także gdy w KW jest odwrotnie",()=>{
    expect(officialMsigPersonQuery(person)).toBe("Kasprzak Ryszard");
    expect(officialMsigPersonQuery({kind:"person",name:"Ryszard Kasprzak"})).toBe("Kasprzak Ryszard");
  });
  it("wyłapuje historyczne ogłoszenie osoby fizycznej i sygnaturę bez dowodzenia tożsamości",()=>{
    expect(classifyOfficialMsigRows(person,[historicalNotice])).toMatchObject([{
      category:"court_notice",
      match:"name_only",
      publicationDate:"2015-06-29",
      caseSignature:"XII GU 42/15, XII GUp 30/15",
    }]);
  });
  it("nie przypisuje ogłoszenia osobie o innym imieniu",()=>{
    expect(classifyOfficialMsigRows({kind:"person",name:"Jan Kasprzak",firstName:"Jan",lastName:"Kasprzak"},[historicalNotice])).toEqual([]);
  });
  it("zwykłą wzmiankę nazywa neutralnie, a nie upadłością",()=>{
    const r=classifyOfficialMsigRows(person,[{...historicalNotice,id:6014929,signatureOfCase:null}]);
    expect(r).toHaveLength(1);
    expect(r[0].title).toContain("rodzaj sprawy nieustalony");
    expect(r[0].title.toLowerCase()).not.toContain("upadłość");
  });
  it("nigdy nie umieszcza PESEL w wydanym wyniku",()=>{
    const hits=classifyOfficialMsigRows({...person,pesel:"00000000000"} as typeof person,[historicalNotice]);
    expect(JSON.stringify(hits)).not.toContain("00000000000");
  });
});
