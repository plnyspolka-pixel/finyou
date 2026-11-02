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
/** Roboczy, ścieżkowy wzór pisma + lista kontrolna. Nie jest automatycznie podpisywany ani wnoszony. */
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
  const amount=input.amount.toFixed(2)+" PLN";
  const grounds=input.documentNo??"[NUMER I DATA DOKUMENTU]";
  const evidence=input.evidenceList.length?input.evidenceList.map((x,i)=>String(i+1)+". "+x).join("\n"):"[WYKAZ DOWODÓW]";
  const h=[
    "WSTĘPNY PROJEKT — NIE ZŁOŻONO DO SĄDU — WYMAGA UZUPEŁNIENIA, KONTROLI I PODPISANIA",
    "Sugerowana ścieżka: "+route.label,
    "Powód / wierzyciel: "+input.creditor+" [ADRES, IDENTYFIKATOR]",
    "Pozwany / dłużnik: "+input.debtor+" [ADRES, IDENTYFIKATOR]",
    "Kwota: "+amount,
    "Data wymagalności: "+input.dueDate,
    "Podstawa: "+grounds,
    ""
  ];
  let body:string[];
  if(route.route==="epu"){
    body=[
      "SZKIC POZWU O ZAPŁATĘ W ELEKTRONICZNYM POSTĘPOWANIU UPOMINAWCZYM",
      "Wnoszę o zasądzenie od pozwanego na rzecz powoda kwoty "+amount+
        " wraz z prawidłowo wyliczonymi odsetkami [UZUPEŁNIĆ RODZAJ I POCZĄTEK ODSETEK].",
      "Uzasadnienie: roszczenie wynika z "+grounds+
        ". Według oświadczenia wierzyciela do dnia przygotowania projektu nie zostało spłacone.",
      "Podstawa faktyczna, termin i wysokość należności wymagają ostatecznej kontroli.",
      "Dowody do wskazania w formularzu (nie dołącza się ich do pozwu EPU):\n"+evidence,
    ];
  } else if(route.route==="ordinary_lawsuit"){
    body=[
      "PROJEKT POZWU O ZAPŁATĘ — SĄD POWSZECHNY",
      "Sąd właściwy: [USTALIĆ WŁAŚCIWOŚĆ RZECZOWĄ I MIEJSCOWĄ]",
      "Wartość przedmiotu sporu: "+amount,
      "Wnoszę o zasądzenie od pozwanego na rzecz powoda kwoty "+amount+
        " wraz z należnymi, zweryfikowanymi odsetkami [UZUPEŁNIĆ].",
      "Wnoszę o przeprowadzenie dowodów:\n"+evidence,
      "Uzasadnienie faktyczne: [PRZEDSTAWIĆ ZAWARCIE UMOWY / WYKONANIE ŚWIADCZENIA / WYMIAR NALEŻNOŚCI].",
      "Termin wymagalności według wierzyciela: "+input.dueDate,
      "Próby polubownego rozwiązania: [UZUPEŁNIĆ FAKTYCZNĄ HISTORIĘ KONTAKTÓW].",
      "Załączniki i opłata: [LISTA DOKUMENTÓW, PEŁNOMOCNICTWO JEŚLI DOTYCZY, WYLICZENIE OPŁATY].",
    ];
  } else if(route.route==="notarial_777_clause"){
    body=[
      "PROJEKT WNIOSKU O NADANIE KLAUZULI WYKONALNOŚCI",
      "Sąd właściwy: [UZUPEŁNIĆ]",
      "Tytuł egzekucyjny: akt notarialny [REPERTORIUM A, DATA, NOTARIUSZ].",
      "Wniosek: o nadanie klauzuli wykonalności w granicach oświadczenia dłużnika",
      "o poddaniu się egzekucji z art. 777 k.p.c. do kwoty [LIMIT Z AKTU],",
      "zgodnie z zakresem i terminami wskazanymi w akcie.",
      "Warunki uruchomienia egzekucji: [ZWERYFIKOWAĆ W TREŚCI AKTU, DATY I DOKUMENTY].",
      "Dowody spełnienia warunków: "+evidence,
      "Brak lub wadliwość dowodów spełnienia warunku uniemożliwia automatyczne uznanie sprawy za gotową do wniosku.",
    ];
  } else {
    body=[
      "PROJEKT WNIOSKU O WSZCZĘCIE EGZEKUCJI",
      "Komornik: [WŁAŚCIWY ORGAN I ADRES]",
      "Tytuł wykonawczy: [RODZAJ, DATA, SYGNATURA, POTWIERDZONA WYKONALNOŚĆ]",
      "Wierzyciel wnosi o prowadzenie egzekucji należności "+amount+
        " wraz z należnymi świadczeniami ubocznymi po potwierdzeniu salda.",
      route.route==="mortgage_enforcement"
        ? "Żądany sposób: egzekucja z nieruchomości [NUMER KSIĘGI WIECZYSTEJ, WŁAŚCICIEL, PODSTAWA HIPOTEKI]."
        : "Żądane sposoby egzekucji: [OKREŚLIĆ ZGODNIE Z TYTUŁEM I WNIOSKIEM].",
      "Dokumenty: "+evidence,
      "Nie można rozpocząć egzekucji bez prawidłowego tytułu wykonawczego.",
    ];
  }
  return [...h,...body,"","KONTROLA PRZED WNIESIENIEM",
    route.reason,
    ...route.missing.map(x=>"- "+x),
    "- Zweryfikować aktualne saldo u wierzyciela (brak integracji bankowej).",
    "- Sprawdzić przedawnienie, wymagalność, opłaty, status dłużnika i podpis osoby uprawnionej.",
    "- Ten plik jest projektem. Nie wysłano go do sądu ani komornika."
  ].join("\n");
}
export const EMPTY_COURT_EVIDENCE:CourtEvidence={
  hasNotarial777:false,hasEnforceableTitle:false,hasMortgage:false,
  hasVerifiedDelivery:false,notarialReference:null,titleReference:null,landRegister:null,
};
