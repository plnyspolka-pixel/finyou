// Smoke test independent paid EKW API, NOT a production switch.
// Usage: set APIFY_API_TOKEN in your session, then node apify-probe.mjs KW
// Never prints KW owner data, PESEL, mortgage details or the API token.
import { queryApify } from "./apify-client.mjs";
const kw=process.argv[2];
if(!kw){console.error("Usage: node apify-probe.mjs XXXX/00000000/0");process.exit(2)}
const token=process.env.APIFY_API_TOKEN;
try{
  const result=await queryApify(kw,{token});
  console.log(JSON.stringify({provider:"Apify community EKW actor",...result.assessment},null,2));
  console.log("UWAGA: wzmianki i zgodność z urzędową EKW nadal NIEZWERYFIKOWANE. Bez automatycznego zapisu do produkcji.");
}catch(err){
  console.error(JSON.stringify({ok:false,code:err.code||"NETWORK_OR_TIMEOUT",message:err.message}));
  process.exitCode=1;
}
