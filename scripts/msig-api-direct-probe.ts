// Read-only verification of the public MSiG search endpoint observed in the
// official website's own browser requests. A single public company KRS only.
const url=new URL("https://wyszukiwarka-msig.ms.gov.pl/api/Monitor/Search");
const input={
  entityName:"",krs:"0000753937",nip:"",textInPosition:"",textInBody:"",
  signatureType:"A",signatureOfCase:"",signatureKRS:"",court:"",
  from:"2001-01-01",to:"2026-11-02",page:"1"
};
for(const [k,v] of Object.entries(input))url.searchParams.set(k,v);
const response=await fetch(url,{
  headers:{Accept:"application/json","Accept-Language":"pl-PL,pl;q=0.9"},
  signal:AbortSignal.timeout(18000),
});
const data=await response.json().catch(()=>null);
const rows=Array.isArray(data?.list)?data.list:[];
const sample=rows.slice(0,3).map((x:any)=>({
  id:x.id,monitorNumber:x.monitorNumber,
  dateOfPublication:x.dateOfPublication,entityName:x.entityName,
  signatureOfCase:x.signatureOfCase
}));
console.log(JSON.stringify({
  http:response.status,valid:!!data&&Array.isArray(data?.list),
  page:data?.page,countPages:data?.countPages,listLength:rows.length,sample,
},null,2));
if(!response.ok||!Array.isArray(data?.list))process.exitCode=1;
