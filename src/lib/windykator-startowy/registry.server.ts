/** Jedno wejście do produktu: sklep. Rejestry służą wyłącznie do oceny zlecającego.
 * Dane rejestrowe nie dowodzą własności roszczenia i nie zastępują dokumentu długu.
 */
import { lookupCeidgActivity } from "@/lib/risk-assessment/ceidg-lookup.server";
import { lookupKrsCompanyForVerification, type KrsCompany, type KrsPerson } from "@/lib/krs.functions";

export type CreditorKind="person"|"business"|"company";
export type RegistryVerification={
  verified:boolean;
  registry:"person"|"CEIDG"|"KRS";
  reason:string|null;
  registryName:string|null;
  nip:string|null;
  krs:string|null;
  identityMatch:boolean;
  representationMode:"self"|"single_board"|"independent_proxy"|"joint_requires_cosign"|"unverified";
  evidence:{registry:string;retrievedAt:string;representationMethod?:string};
};
const digits=(s:string|null|undefined)=>(s??"").replace(/\D/g,"");
export function normPerson(s:string) {
  return s.toLocaleLowerCase("pl-PL").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").replace(/ł/g,"l").replace(/[^a-z0-9]/g,"");
}
const words=(s:string)=>s.toLocaleLowerCase("pl-PL").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g,"").replace(/ł/g,"l").split(/[^a-z0-9]+/).filter(Boolean);
const containsFullName=(business:string,personal:string)=>{
  const full=words(personal);const comp=words(business);
  return full.length>=2 && full.every(w=>comp.includes(w));
};
function matchPerson(p:KrsPerson, fullName:string, pesel:string|null) {
  const verifiedPesel=digits(pesel);
  if(verifiedPesel.length===11&&digits(p.pesel).length===11)
    return verifiedPesel===digits(p.pesel);
  const regName=[p.firstName,p.lastName].filter(Boolean).join(" ");
  return !regName.includes("*") && containsFullName(regName,fullName);
}
function denied(registry:"person"|"CEIDG"|"KRS",reason:string):RegistryVerification{
  return {verified:false,registry,reason,registryName:null,nip:null,krs:null,
    identityMatch:false,representationMode:"unverified",
    evidence:{registry,retrievedAt:new Date().toISOString()}};
}
export function verifyKrsRepresentation(input:{
  company: Pick<KrsCompany,"name"|"nip"|"krs"|"status"|"flags"|"representation"|"managementBoard"|"proxies">;
  claimedName:string; claimedNip:string; identityName:string; identityPesel:string|null;
}):RegistryVerification{
  const c=input.company;
  if(digits(c.nip)!==digits(input.claimedNip)||digits(input.claimedNip).length!==10)
    return denied("KRS","Numer NIP z formularza nie odpowiada aktualnemu odpisowi KRS.");
  // Ścisła weryfikacja nazwy: normalizacja znaków i dozwolone warianty formy prawnej.
  const form=(s:string)=>normPerson(s).replace(/spolkazograniczonaodpowiedzialnoscia|spzoo|spzoo/g,"spzoo");
  if(form(c.name)!==form(input.claimedName))
    return denied("KRS","Firma z formularza nie odpowiada nazwie z rejestru KRS.");
  if(c.flags.deleted||c.flags.bankruptcy||c.flags.liquidation||c.flags.restructuring||c.status!=="Aktywny")
    return denied("KRS","Status firmy wymaga odrębnej oceny prawnej.");
  const method=c.representation.method.toLocaleLowerCase("pl-PL");
  const persons=c.representation.members.length?c.representation.members:c.managementBoard;
  const matched=persons.filter(p=>matchPerson(p,input.identityName,input.identityPesel));
  const proxies=c.proxies.filter(p=>matchPerson(p,input.identityName,input.identityPesel));
  const joint=/łącznie|lacznie|dwóch|dwaj|dwoch|wspólnie|wspolnie|dwóch członków|dwaj członkowie|członek zarządu z prokurentem/.test(method);
  const self=/samodzieln|jednoosobow|każdy członek|kazdy czlonek|jeden członek zarządu|jeden czlonek zarzadu/.test(method);
  const presidentOnly=/prezes.*samodzieln/.test(method);
  let mode:RegistryVerification["representationMode"]="unverified";
  if(matched.length&&self&&!joint){
    const matchesRole=!presidentOnly||matched.some(p=>/prezes/i.test(p.role??""));
    if(matchesRole)mode="single_board";
  }
  // Częsty wariant KRS: prezes reprezentuje samodzielnie, a pozostali członkowie łącznie.
  // Przesłanka indywidualna prezesa ma pierwszeństwo przed warunkiem wspólnym pozostałych.
  if(presidentOnly&&matched.some(p=>/prezes/i.test(p.role??"")))mode="single_board";
  if(!matched.length&&proxies.some(p=>/samoistna|samodzieln/i.test(p.role??"")))
    mode="independent_proxy";
  if(matched.length&&joint&&mode!=="single_board")mode="joint_requires_cosign";
  return {
    verified:mode==="single_board"||mode==="independent_proxy",
    registry:"KRS",reason:mode==="joint_requires_cosign"?"Zasady KRS wymagają reprezentacji łącznej; konieczny podpis drugiej osoby.":mode==="unverified"?"KRS nie potwierdza prawa do samodzielnej reprezentacji.":null,
    registryName:c.name,nip:digits(c.nip),krs:c.krs,identityMatch:matched.length>0||proxies.length>0,
    representationMode:mode,evidence:{registry:"KRS",retrievedAt:new Date().toISOString(),representationMethod:c.representation.method}
  };
}
export async function verifyCreditorRegistry(input:{
  creditorKind:CreditorKind;creditorName:string;creditorNip:string|null;
  creditorKrs:string|null;verifiedName:string;verifiedPesel:string|null;
}):Promise<RegistryVerification>{
  if(input.creditorKind==="person"){
    const matched=normPerson(input.creditorName)===normPerson(input.verifiedName);
    return {verified:matched,registry:"person",reason:matched?null:"Wierzyciel nie jest tożsamy z osobą zweryfikowaną w Didit.",
      registryName:input.verifiedName,nip:null,krs:null,identityMatch:matched,
      representationMode:matched?"self":"unverified",
      evidence:{registry:"Didit KYC",retrievedAt:new Date().toISOString()}};
  }
  if(input.creditorKind==="business"){
    const nip=digits(input.creditorNip);
    if(nip.length!==10)return denied("CEIDG","Do jednoznacznego sprawdzenia CEIDG potrzebny jest NIP.");
    const [firstName,...rest]=input.verifiedName.trim().split(/\s+/);
    const ceidg=await lookupCeidgActivity({nip,firstName:firstName??null,lastName:rest.join(" ")||null});
    if(!ceidg.available||ceidg.matchConfidence!=="high"||!ceidg.company)
      return denied("CEIDG","Nie udało się potwierdzić wpisu firmy po NIP w CEIDG.");
    if(ceidg.status!=="aktywny")return denied("CEIDG","Działalność nie jest aktywna w CEIDG.");
    const name=ceidg.company.name??"";
    if(digits(ceidg.company.nip)!==nip || !containsFullName(name,input.verifiedName))
      return denied("CEIDG","Wpis CEIDG nie potwierdza tożsamości właściciela na podstawie NIP i imienia/nazwiska.");
    if(normPerson(input.creditorName)!==normPerson(name))
      return denied("CEIDG","Nazwa działalności we wniosku musi odpowiadać wpisowi CEIDG.");
    return {verified:true,registry:"CEIDG",reason:null,registryName:name,nip,krs:null,
      identityMatch:true,representationMode:"self",
      evidence:{registry:"CEIDG",retrievedAt:new Date().toISOString()}};
  }
  if(!input.creditorKrs||!/^\d{1,10}$/.test(digits(input.creditorKrs)))
    return denied("KRS","Do weryfikacji spółki podaj numer KRS.");
  const result=await lookupKrsCompanyForVerification(input.creditorKrs);
  if(!result.success)return denied("KRS",result.message);
  return verifyKrsRepresentation({company:result.company,claimedName:input.creditorName,
    claimedNip:input.creditorNip??"",identityName:input.verifiedName,identityPesel:input.verifiedPesel});
}
