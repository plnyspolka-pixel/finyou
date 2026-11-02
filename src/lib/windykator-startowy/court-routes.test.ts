import {describe,it,expect} from "vitest";
import {chooseCourtRoute,EMPTY_COURT_EVIDENCE,draftCourtPackage} from "./court-routes";
const base={dueDate:"2026-10-01",today:"2026-11-02",evidence:EMPTY_COURT_EVIDENCE,disputed:false};
describe("Dobór ścieżek sądowych, nie tylko EPU",()=>{
  it("EPU jest wariantem, ale nie jedynym",()=>expect(chooseCourtRoute(base).route).toBe("epu"));
  it("poza 3-letnim oknem sugeruje zwykły pozew — nie odrzuca sprawy",()=>{
    const route=chooseCourtRoute({...base,dueDate:"2021-01-01"});
    expect(route.route).toBe("ordinary_lawsuit");
    expect(route.preparatoryDocuments).toContain("wezwanie");
  });
  it("rozpoznany akt 777 kieruje do klauzuli, a nie EPU",()=>{
    const route=chooseCourtRoute({...base,evidence:{...EMPTY_COURT_EVIDENCE,
      hasNotarial777:true,notarialReference:"Rep A nr 123/2025"}});
    expect(route.route).toBe("notarial_777_clause");
    expect(route.preparatoryDocuments).toContain("wniosek_klauzula");
  });
  it("tytuł wykonawczy wygrywa nad pozwem; hipoteka wskazuje egzekucję nieruchomości",()=>{
    const route=chooseCourtRoute({...base,evidence:{...EMPTY_COURT_EVIDENCE,
      hasEnforceableTitle:true,titleReference:"I Nc 123/25",
      hasMortgage:true,landRegister:"LU1I/00000001/1"}});
    expect(route.route).toBe("mortgage_enforcement");
    expect(route.preparatoryDocuments).toContain("wniosek_komornik");
  });
  it("bez numeru aktu samo zaznaczenie 777 niczego nie dowodzi",()=>{
    const r=chooseCourtRoute({...base,evidence:{...EMPTY_COURT_EVIDENCE,hasNotarial777:true}});
    expect(r.route).toBe("epu");
  });
  it("spór skutkuje analizą trybu zwykłego",()=>{
    expect(chooseCourtRoute({...base,disputed:true}).route).toBe("ordinary_lawsuit");
  });
  it("pakiet nie udaje dokumentu wniesionego do sądu",()=>{
    const plan=chooseCourtRoute({...base,dueDate:"2021-01-01"});
    const txt=draftCourtPackage({route:plan,creditor:"Jan Kowalski",debtor:"Anna Nowak",
      amount:123,dueDate:"2021-01-01",documentNo:"FV/1",evidenceList:["faktura"]});
    expect(txt).toContain("NIE ZŁOŻONO DO SĄDU");
    expect(txt).toContain("zwyk");
  });
});