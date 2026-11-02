import { describe, expect, it } from "vitest";
import { assembleStartPackage, type SourceFacts } from "./core";
const claim={
  creditorName:"Jan Kowalski",debtorName:"Anna Nowak",
  amount:2500,dueDate:"2026-10-10",claimKind:"invoice" as const
};
const facts:SourceFacts={
  documentType:"invoice",creditor:"Jan Kowalski",debtor:"Anna Nowak",
  amount:2500,dueDate:"2026-10-10",documentNumber:"FV/1/2026",
  summary:"Faktura za usługę",evidence:["faktura"],missing:[]
};
describe("Windykator AI — bezpieczny Pakiet Startowy",()=>{
  it("nie zrównuje analizy dokumentu z faktem braku wpłaty",()=>{
    const p=assembleStartPackage(claim,facts,"2026-11-02");
    expect(p.ready).toBe(true);
    expect(p.report).toContain("Brak integracji bankowej");
    expect(p.notice).toContain("NIEWYSŁANE");
    expect(p.epuDraft).toContain("NIE JEST POZWEM WNIESIONYM");
  });
  it("blokuje rozbieżność stron",()=>{
    const p=assembleStartPackage(claim,{...facts,debtor:"Inna osoba"},"2026-11-02");
    expect(p.ready).toBe(false);
    expect(p.epuDraft).toBeNull();
  });
  it("blokuje zmianę kwoty i terminu",()=>{
    const p=assembleStartPackage(claim,{...facts,amount:700,dueDate:"2026-10-09"},"2026-11-02");
    expect(p.ready).toBe(false);
    expect(p.report).toContain("kwoty");
    expect(p.notice).toContain("PROJEKT");
  });
  it("nie kwalifikuje automatycznie przyszłej należności",()=>{
    const p=assembleStartPackage({...claim,dueDate:"2027-01-01"},facts,"2026-11-02");
    expect(p.ready).toBe(false);
  });
  it("nie tworzy szkicu EPU dla roszczenia starszego niż 3 lata",()=>{
    const c={...claim,dueDate:"2021-01-01"};
    const p=assembleStartPackage(c,{...facts,dueDate:"2021-01-01"},"2026-11-02");
    expect(p.epuDraft).toBeNull();
  });
});
