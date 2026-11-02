// Finance You: one-shot access diagnostic, no KW numbers or personal data.
import https from "node:https";
import dns from "node:dns/promises";
const allowed = new Set(["ekw.ms.gov.pl","przegladarka-ekw.ms.gov.pl"]);
const endpoints = [
  ["home", "https://ekw.ms.gov.pl/eukw_ogol/menu.do"],
  ["official_entry", "https://ekw.ms.gov.pl/eukw_ogol/KsiegiWieczyste"]
];
async function requestOnce(url, redirects=0) {
  if (redirects>4) return {error:"TOO_MANY_REDIRECTS"};
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||!allowed.has(parsed.hostname))return {error:"UNEXPECTED_DESTINATION"};
  return new Promise(resolve=>{
    let total=0,body="";
    const req=https.get(parsed,{timeout:13000,headers:{"Accept":"text/html","Accept-Language":"pl-PL,pl;q=0.9"}},res=>{
      res.setEncoding("utf8");
      res.on("data",chunk=>{total+=chunk.length;if(total<100000)body+=chunk});
      res.on("error",e=>resolve({error:e.code||e.name}));
      res.on("end",async()=>{
        const status=res.statusCode||0,location=res.headers.location;
        if(status>=300&&status<400&&typeof location==="string") {
          try{resolve(await requestOnce(new URL(location,parsed).toString(),redirects+1))}
          catch{resolve({error:"BAD_REDIRECT"})}
          return;
        }
        const m=body.match(/(?:Support|Incident)\s*(?:ID|Id|id)\s*[:#]?\s*([0-9][0-9-]{8,70})/i);
        resolve({status,host:parsed.hostname,path:parsed.pathname,redirects,
          blocked:status===403||status===429||/Access Denied|Error 15|requested URL was rejected/i.test(body),
          incidentId:m?.[1]||null});
      });
    });
    req.on("timeout",()=>req.destroy(Object.assign(new Error("timeout"),{code:"TIMEOUT"})));
    req.on("error",e=>resolve({error:e.code||e.name}));
  });
}
console.log("EKW DIAG — no KW numbers, cookies or personal data.");
for(const host of allowed){
  try{const a=await dns.lookup(host);console.log("DNS",host,a.family===4?"IPv4":"IPv6","OK")}
  catch(e){console.log("DNS",host,e.code||"ERROR")}
}
for(const [label,url] of endpoints)console.log(label,JSON.stringify(await requestOnce(url)));
console.log("HTTP 403 / Error 15 = unavailable, not an empty land register.");
console.log("Compare with normal Chrome: https://ekw.ms.gov.pl/eukw_ogol/menu.do");
console.log("Send the actual Chrome Support/Incident ID to ekw@ms.gov.pl if blocked.");
