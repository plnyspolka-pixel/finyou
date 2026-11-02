// Jednorazowy test użycia oficjalnego interfejsu wyszukiwarki MSiG
// dla historycznego ogłoszenia o osobie fizycznej, dostępnego publicznie.
// Nie pobieramy PESEL, nie logujemy danych osobowych / adresów.
// Testowane ogłoszenie: MSiG 123/2015, poz. 9228 (publiczna pozycja).
const base="https://wyszukiwarka-msig.ms.gov.pl/api/Monitor/Search";
const examples=[
  {label:"person_last_first_2015",entityName:"Kasprzak Ryszard",textInPosition:"",textInBody:"",from:"2015-01-01",to:"2015-12-31"},
  {label:"person_first_last_2015",entityName:"Ryszard Kasprzak",textInPosition:"",textInBody:"",from:"2015-01-01",to:"2015-12-31"},
  {label:"person_last_name_2015",entityName:"Kasprzak",textInPosition:"",textInBody:"",from:"2015-06-20",to:"2015-06-30"},
  {label:"person_phrase_2015",entityName:"",textInPosition:"Kasprzak",textInBody:"",from:"2015-06-20",to:"2015-06-30"},
];
for(const e of examples){
  const u=new URL(base);
  for(const [k,v] of Object.entries({
    entityName:e.entityName,krs:"",nip:"",textInPosition:e.textInPosition,
    textInBody:e.textInBody,signatureType:"A",signatureOfCase:"",
    signatureKRS:"",court:"",from:e.from,to:e.to,page:"1"
  }))u.searchParams.set(k,v);
  try{
    const response=await fetch(u,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(14000)});
    const data=await response.json().catch(()=>null);
    const list=Array.isArray(data?.list)?data.list:[];
    const known=list.filter((r:any)=>r.id&&/kasprzak/i.test(String(r.entityName??"")));
    console.log(JSON.stringify({
      label:e.label,http:response.status,valid:Array.isArray(data?.list),
      countPages:data?.countPages??null,listLength:list.length,
      knownNameCount:known.length,
      sampleMetadata:known.slice(0,2).map((r:any)=>({
        id:r.id,monitorNumber:r.monitorNumber,date:r.dateOfPublication,
        hasSignature:Boolean(r.signatureOfCase),
      })),
      message:"Należy potwierdzić osobę po identyfikatorze w pełnym ogłoszeniu; nazwisko nie wystarcza.",
    }));
  }catch(e){console.log(JSON.stringify({label:e.label,status:"unavailable",error:String((e as Error)?.message??e).slice(0,90)}))}
}
