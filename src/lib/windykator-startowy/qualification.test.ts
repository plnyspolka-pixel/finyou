import { describe, it, expect } from "vitest";
import { mayPurchaseQualifiedCase, qualifyWindykatorCase, type QualificationInput } from "./qualification";
const base:QualificationInput={
  claim:{creditorName:"Jan Kowalski",debtorName:"Anna Nowak",amount:1800,dueDate:"2026-10-01",claimKind:"invoice"},
  facts:{documentType:"invoice",creditor:"Jan Kowalski",debtor:"Anna Nowak",documentNumber:"FV 10/26",
    amount:1800,dueDate:"2026-10-01",evidence:["Faktura"],missing:[],summary:"Faktura VAT"},
  creditorKind:"person",identityVerified:true,identityMatchesCreditor:true,
  creditorRepresentationVerified:true,creditorDeclaredNoPayment:true,
  creditorDeclaredNoDispute:true,today:"2026-11-02"
};
describe("Windykator — kwalifikacja przed płatnością",()=>{
  it("akceptuje spójny dokument i zweryfikowaną osobę",()=>{
    expect(qualifyWindykatorCase(base).status).toBe("qualified");
  });
  it("bez KYC odrzuca sprawę, nie kieruje do płatności",()=>{
    expect(qualifyWindykatorCase({...base,identityVerified:false}).status).toBe("rejected");
  });
  it("nie otwiera checkout przy rozbieżności kwot",()=>{
    expect(qualifyWindykatorCase({...base,facts:{...base.facts,amount:100}}).status).toBe("needs_documents");
  });
  it("przyszła wymagalność blokuje przyjęcie",()=>{
    expect(qualifyWindykatorCase({...base,claim:{...base.claim,dueDate:"2027-01-01"}}).status).toBe("rejected");
  });
  it("nie uznaje samego checkboxa za weryfikację reprezentacji spółki",()=>{
    expect(qualifyWindykatorCase({...base,creditorKind:"company",creditorRepresentationVerified:false}).status).toBe("needs_documents");
  });
  it("przy pożyczce wymaga dowodu wydania środków",()=>{
    expect(qualifyWindykatorCase({...base,claim:{...base.claim,claimKind:"loan"},facts:{...base.facts,documentType:"loan"}}).status).toBe("needs_documents");
  });
  it("wymaga informacji o braku sporu i wpłaty",()=>{
    expect(qualifyWindykatorCase({...base,creditorDeclaredNoDispute:false}).status).toBe("needs_documents");
    expect(qualifyWindykatorCase({...base,creditorDeclaredNoPayment:false}).status).toBe("needs_documents");
  });
  it("nie wymaga EPU, jeśli możliwy jest pozew w zwykłym trybie",()=>{
    const old={...base.claim,dueDate:"2021-01-01"};
    const res=qualifyWindykatorCase({...base,claim:old,facts:{...base.facts,dueDate:"2021-01-01"}});
    expect(res.status).toBe("qualified");
  });
  it("wyklucza checkout przed pozytywnym statusem i po 7 dniach",()=>{
    const v={status:"qualified",qualifiedAt:"2026-11-01T09:00:00Z",now:"2026-11-02T09:00:00Z",identityValid:true};
    expect(mayPurchaseQualifiedCase(v)).toBe(true);
    expect(mayPurchaseQualifiedCase({...v,status:"draft"})).toBe(false);
    expect(mayPurchaseQualifiedCase({...v,identityValid:false})).toBe(false);
    expect(mayPurchaseQualifiedCase({...v,now:"2026-11-20T09:00:00Z"})).toBe(false);
    expect(mayPurchaseQualifiedCase({...v,qualifiedAt:null})).toBe(false);
  });
});
