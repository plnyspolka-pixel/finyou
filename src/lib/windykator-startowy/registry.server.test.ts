import {describe,it,expect} from "vitest";
import {verifyKrsRepresentation} from "./registry.server";
const company:any={
  name:"FIRMA TESTOWA SP. Z O.O.",nip:"1234567890",krs:"0000123456",status:"Aktywny",
  flags:{deleted:false,bankruptcy:false,liquidation:false,restructuring:false},
  representation:{method:"Każdy członek zarządu samodzielnie",bodyName:"Zarząd",
    members:[{firstName:"Jan",lastName:"Kowalski",pesel:"82010112345",role:"Prezes zarządu"}]},
  managementBoard:[],proxies:[]
};
const args={company,claimedName:"FIRMA TESTOWA SP. Z O.O.",claimedNip:"1234567890",
  identityName:"Jan Kowalski",identityPesel:"82010112345"};
describe("KRS: samodzielna reprezentacja to warunek",()=>{
  it("zgodny członek zarządu reprezentujący samodzielnie",()=>{
    expect(verifyKrsRepresentation(args).verified).toBe(true);
  });
  it("reprezentacja łączna nie przechodzi bez dodatkowego umocowania",()=>{
    const c={...company,representation:{...company.representation,method:"Dwóch członków zarządu łącznie"}};
    const result=verifyKrsRepresentation({...args,company:c});
    expect(result.verified).toBe(false);
    expect(result.representationMode).toBe("joint_requires_cosign");
  });
  it("NIP i KRS nie są dowodem, że anonimowy użytkownik reprezentuje firmę",()=>{
    expect(verifyKrsRepresentation({...args,identityName:"Obca Osoba",identityPesel:null}).verified).toBe(false);
    expect(verifyKrsRepresentation({...args,claimedNip:"0000000000"}).verified).toBe(false);
  });
  it("upadłość blokuje automatyczne rozpoczęcie",()=>{
    const c={...company,flags:{...company.flags,bankruptcy:true}};
    expect(verifyKrsRepresentation({...args,company:c}).verified).toBe(false);
  });
});