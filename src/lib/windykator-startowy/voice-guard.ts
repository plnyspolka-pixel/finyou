/** Warunki bezpiecznego kontaktu, niezależne od ElevenLabs. */
export interface VoiceCaseGuardInput {
  status:string;
  collectionState:string;
  paidAt:string|null;
  activatedAt:string|null;
  expiresAt:string|null;
  latestBalanceConfirmedAt:string|null;
  phone:string|null;
  voiceOptOut:boolean;
  disputed:boolean;
  lastOutboundCallAt:string|null;
  now:Date;
  configured:boolean;
}
export function eligibleForWindykatorCall(i:VoiceCaseGuardInput):{ok:boolean;reason:string}{
  if(!i.configured)return {ok:false,reason:"Brak dedykowanego agenta albo numeru."};
  if(!["paid","analysis_ready"].includes(i.status))return {ok:false,reason:"Pakiet nie został opłacony i wykonany."};
  if(i.collectionState!=="active"||i.disputed||i.voiceOptOut)
    return {ok:false,reason:"Sprawa wstrzymana, sporna lub zgłoszono rezygnację z telefonów."};
  if(!i.paidAt||!i.activatedAt||!i.expiresAt||i.now.getTime()<Date.parse(i.activatedAt)||
    i.now.getTime()>=Date.parse(i.expiresAt))
    return {ok:false,reason:"Poza opłaconym okresem 90 dni."};
  if(!i.phone||!/^\+[1-9]\d{8,14}$/.test(i.phone))
    return {ok:false,reason:"Brak poprawnego numeru dłużnika."};
  if(!i.latestBalanceConfirmedAt||!Number.isFinite(Date.parse(i.latestBalanceConfirmedAt))||
    i.now.getTime()-Date.parse(i.latestBalanceConfirmedAt)>48*3600000||
    i.now.getTime()<Date.parse(i.latestBalanceConfirmedAt))
    return {ok:false,reason:"Wierzyciel musi ponownie potwierdzić saldo w ciągu 48 godzin."};
  if(i.lastOutboundCallAt&&i.now.getTime()-Date.parse(i.lastOutboundCallAt)<7*86400000)
    return {ok:false,reason:"Limit: nie częściej niż jeden telefon na siedem dni."};
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/Warsaw",hour:"2-digit",hour12:false,weekday:"short"
  }).formatToParts(i.now).map(x=>[x.type,x.value]));
  if(["Sat","Sun"].includes(parts.weekday)||Number(parts.hour)<9||Number(parts.hour)>=18)
    return {ok:false,reason:"Połączenia tylko od poniedziałku do piątku, 9:00–18:00."};
  return {ok:true,reason:"Można wykonać pojedynczy telefon."};
}
export type VoiceEventClass="disputed"|"payment_reported"|"opt_out"|"promise"|"callback_request"|"identity_unverified"|"call_completed";
export function classifyVoiceAnalysis(raw:Record<string,unknown>):VoiceEventClass{
  const get=(k:string)=>{const v=raw[k];return typeof v==="object"&&v!==null&&"value" in v?(v as {value:unknown}).value:v;};
  const bool=(k:string)=>get(k)===true || ["true","tak","1"].includes(String(get(k)).toLowerCase());
  const result=String(get("wynik_rozmowy")??"");
  if(bool("nie_kontaktowac"))return "opt_out";
  if(bool("status_sporny")||["kwestionuje_kwote","upadlosc_lub_restrukturyzacja"].includes(result))return "disputed";
  if(bool("zgloszona_wplata")||result==="juz_zaplacone")return "payment_reported";
  if(get("tozsamosc_potwierdzona")!==true&&String(get("tozsamosc_potwierdzona"))!=="true")
    return "identity_unverified";
  if(["deklaracja_calosci","deklaracja_czesci","prosba_o_raty"].includes(result))return "promise";
  if(bool("prosba_o_kontakt"))return "callback_request";
  return "call_completed";
}
