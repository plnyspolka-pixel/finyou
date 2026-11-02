import {createHmac,timingSafeEqual} from "node:crypto";
export function verifyWindVoiceHmac(body:string,signature:string|null,secret:string,now=Date.now()):boolean{
  if(!signature||!secret)return false;
  const pairs=Object.fromEntries(signature.split(",").map(x=>x.trim().split("=")));
  const t=pairs.t,v=pairs.v0;
  if(!t||!v||!/^\d{10}$/.test(t)||!/^[a-f0-9]{64}$/i.test(v))return false;
  if(Math.abs(now/1000-Number(t))>300)return false;
  const key=secret.startsWith("wsec_")?secret.slice(5):secret;
  const expected=createHmac("sha256",key).update(t+"."+body).digest("hex");
  const a=Buffer.from(v,"hex"),b=Buffer.from(expected,"hex");
  return a.length===b.length&&timingSafeEqual(a,b);
}
