import {describe,expect,it} from "vitest";
import {nextCollectionStep,type CollectionSnapshot} from "./workflow";
const base:CollectionSnapshot={
  status:"active",elapsedDays:90,creditorAuthorized:true,debtorContactVerified:true,
  creditorBalanceConfirmedAt:"2026-11-02T09:00:00Z",hasPendingPaymentPromise:false,
  contactOptOut:false,completedStageDays:[],today:"2026-11-02",
};
describe("90 dni — automat nigdy nie wysyła sam",()=>{
  it("blokuje brak potwierdzenia salda",()=>{
    expect(nextCollectionStep({...base,creditorBalanceConfirmedAt:null}).ok).toBe(false);
    expect(nextCollectionStep({...base,creditorBalanceConfirmedAt:"2026-10-25T09:00:00Z"}).ok).toBe(false);
  });
  it("wstrzymuje spory i informacje o spłacie",()=>{
    expect(nextCollectionStep({...base,status:"disputed"}).ok).toBe(false);
    expect(nextCollectionStep({...base,status:"payment_reported"}).ok).toBe(false);
    expect(nextCollectionStep({...base,hasPendingPaymentPromise:true}).ok).toBe(false);
  });
  it("wymaga potwierdzonego wierzyciela i kanału",()=>{
    expect(nextCollectionStep({...base,creditorAuthorized:false}).ok).toBe(false);
    expect(nextCollectionStep({...base,debtorContactVerified:false}).ok).toBe(false);
  });
  it("ponowne e-maile i telefony rozróżnia po dniach",()=>{
    const p=nextCollectionStep({...base,completedStageDays:[0,7,14]});
    expect(p).toEqual({ok:true,action:"email",stageDay:21,needsHumanApproval:true});
    const q=nextCollectionStep({...base,completedStageDays:[0,7,14,21]});
    expect(q).toEqual({ok:true,action:"voice",stageDay:45,needsHumanApproval:true});
  });
  it("nigdy nie daje automatycznego zatwierdzenia kontaktu",()=>{
    const p=nextCollectionStep(base);
    expect(p.ok&&p.needsHumanApproval).toBe(true);
  });
});
