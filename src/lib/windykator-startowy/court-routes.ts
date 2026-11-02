/**
 * Wybór strategii sądowej bez ograniczenia do EPU.
 * Korzysta z terminologii istniejącego silnika Windykacja i jego typów dokumentów.
 * Nie wydaje decyzji sądowych, nie składa pism i nie nadaje klauzuli.
 */
import { PATH_STAGES, DOCUMENT_LABELS, type WindPath, type WindDocumentType } from "@/lib/windykacja-procedure";

export type CourtRoute="epu"|"ordinary_lawsuit"|"notarial_777_clause"|"enforcement"|"mortgage_enforcement";
export interface CourtEvidence {
  hasNotarial777:boolean;
  hasEnforceableTitle:boolean;
  hasMortgage:boolean;
  hasVerifiedDelivery:boolean;
  notarialReference:string|null;
  titleReference:string|null;
  landRegister:string|null;
}
export interface CourtRoutePlan {
  route:CourtRoute;
  label:string;
  legacyWindPath:WindPath;
  preparatoryDocuments:WindDocumentType[];
  stages:string[];
  missing:string[];
  reason:string;
  needsLegalCheck:true;
}
function epuWindowValid(dueDate:string, referenceDate:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate))return false;
  const end = new Date(referenceDate+"T12:00:00Z");
  end.setUTCDate(end.getUTCDate()+90);
  const earliest = new Date(end);
  earliest.setUTCFullYear(earliest.getUTCFullYear()-3);
  return dueDate>=earliest.toISOString().slice(0,10)&&dueDate<=referenceDate;
}
const common={needsLegalCheck:true as const};
export function chooseCourtRoute(input:{
  dueDate:string;
  today:string;
  evidence:CourtEvidence;
  disputed:boolean;
}):CourtRoutePlan {
  const e=input.evidence;
  const warnings:string[]=[];
  if(input.disputed)warnings.push("Roszczenie jest sporne — wymaga zbadania przed wniesieniem pozwu.");
  if(e.hasEnforceableTitle&&e.titleReference){
    const mortgage=e.hasMortgage&&!!e.landRegister;
    return {...common,route:mortgage?"mortgage_enforcement":"enforcement",
      label:mortgage?"Wniosek egzekucyjny z nieruchomości":"Wniosek do komornika",
      legacyWindPath:"twarda",preparatoryDocuments:["wniosek_komornik"],
      stages:PATH_STAGES.twarda.map(x=>x.label),
      missing:warnings,reason:"W dokumentacji wskazano istniejący tytuł wykonawczy; przed egzekucją zweryfikuj jego ważność, wykonalność i saldo."};
  }
  if(e.hasNotarial777&&e.notarialReference){
    return {...common,route:"notarial_777_clause",label:DOCUMENT_LABELS.wniosek_klauzula,
      legacyWindPath:"standardowa",preparatoryDocuments:["wezwanie","wniosek_klauzula"],
      stages:PATH_STAGES.standardowa.map(x=>x.label),
      missing:[...warnings,...(!e.hasVerifiedDelivery?["Sprawdź wymagane wezwanie i sposób wykazania spełnienia warunku z aktu 777."]:[])],
      reason:"Odnaleziono oświadczenie z art. 777 k.p.c.; weryfikacja warunków klauzuli przed wniesieniem."};
  }
  if(!input.disputed&&epuWindowValid(input.dueDate,input.today)){
    return {...common,route:"epu",label:"Elektroniczne postępowanie upominawcze",
      legacyWindPath:"miekka",preparatoryDocuments:["wezwanie"],
      stages:PATH_STAGES.miekka.map(x=>x.label),
      missing:["Uzupełnij identyfikatory stron, wymagane oświadczenia i pozostałe przesłanki EPU."],
      reason:"Roszczenie mieści się we wstępnie sprawdzonym przedziale czasowym EPU; wybór wymaga ostatecznej oceny procesowej."};
  }
  return {...common,route:"ordinary_lawsuit",label:"Pozew o zapłatę w sądzie powszechnym",
    legacyWindPath:"standardowa",preparatoryDocuments:["wezwanie"],
    stages:PATH_STAGES.standardowa.map(x=>x.label),
    missing:[...warnings,"Uzupełnij dane sądu, stron i dowody; skontroluj właściwy tryb postępowania i przedawnienie."],
    reason:"Sprawa nie ma udokumentowanego tytułu wykonawczego ani wykazanej możliwości skorzystania z EPU. Pozostaje zwykła droga sądowa."};
}
export function draftCourtPackage(input:{
  route:CourtRoutePlan;
  creditor:string;
  debtor:string;
  amount:number;
  dueDate:string;
  documentNo:string|null;
  evidenceList:string[];
}):string {
  const route=input.route;
  const lines=[
    "ROBOCZY PAKIET SĄDOWY — NIE ZŁOŻONO DO SĄDU",
    "Sugerowana ścieżka: "+route.label,
    "Wierzyciel: "+input.creditor,
    "Dłużnik: "+input.debtor,
    "Kwota deklarowana: "+input.amount.toFixed(2)+" PLN",
    "Wymagalność: "+input.dueDate,
    "Dokument: "+(input.documentNo??"wymaga uzupełnienia"),
    "Dowody: "+(input.evidenceList.join("; ")||"wymagają wskazania"),
    "Wyjaśnienie: "+route.reason,
    "Czynności poprzedzające: "+route.preparatoryDocuments.map(t=>DOCUMENT_LABELS[t]).join("; "),
    "Etapy istniejącego workflow Finance You: "+route.stages.join(" → "),
    ...route.missing.map(x=>"BRAK / KONTROLA: "+x),
    "Dane do uzupełnienia: adresy, identyfikatory stron, żądanie procesowe, odsetki, opłaty i podpis.",
    "Projekt wymaga prawnej oceny dopuszczalności, wymagalności, dowodów i aktualnego salda.",
    "Niniejszy dokument nie jest prawomocnym tytułem wykonawczym ani potwierdzeniem wniesienia pisma."
  ];
  return lines.join("\n");
}
export const EMPTY_COURT_EVIDENCE:CourtEvidence={
  hasNotarial777:false,hasEnforceableTitle:false,hasMortgage:false,
  hasVerifiedDelivery:false,notarialReference:null,titleReference:null,landRegister:null,
};
