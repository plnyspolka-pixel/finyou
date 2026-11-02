import { elevenRequest } from "@/lib/elevenlabs-api.server";
import { WINDYKATOR_VOICE_COLLECTION, WINDYKATOR_VOICE_FIRST_MESSAGE,
  WINDYKATOR_VOICE_NAME, WINDYKATOR_VOICE_PLACEHOLDERS, WINDYKATOR_VOICE_PROMPT
} from "./voice-prompt";

/** A5 ma własne ustawienia i numer: żaden call nie wykorzystuje A1/A4. */
export async function windVoiceDb():Promise<any>{
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
export async function readWindVoiceSettings(){
  const db=await windVoiceDb();
  const {data,error}=await db.from("windykator_voice_settings").select("*").eq("id",1).maybeSingle();
  if(error||!data)throw Error("Zastosuj migrację Windykator AI przed utworzeniem agenta.");
  return data as {agent_id:string|null;phone_number_id:string|null;phone_e164:string|null};
}
export function normalizeWindPhone(raw:string):string|null{
  const p=raw.replace(/[ ()-]/g,"");
  const n=p.startsWith("00")?"+"+p.slice(2):p;
  const v=n.startsWith("+")?n:"+48"+n;
  return /^\+[1-9]\d{8,14}$/.test(v)?v:null;
}
export function voiceCallAllowedAt(now:Date):boolean {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:"Europe/Warsaw",weekday:"short",hour:"2-digit",hour12:false
  }).formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return !["Sat","Sun"].includes(parts.weekday) && Number(parts.hour)>=9 && Number(parts.hour)<18;
}
function agentPayload(includeAnalysis:boolean){
  return {
    name:WINDYKATOR_VOICE_NAME,
    tags:["financeyou","windykator-ai","90dni","separate-a5"],
    conversation_config:{
      agent:{
        first_message:WINDYKATOR_VOICE_FIRST_MESSAGE,language:"pl",
        prompt:{prompt:WINDYKATOR_VOICE_PROMPT,
          built_in_tools:{end_call:{type:"system",name:"end_call",description:"",params:{system_tool_type:"end_call"}},
            voicemail_detection:{type:"system",name:"voicemail_detection",description:"",
              params:{system_tool_type:"voicemail_detection",voicemail_message:""}}}},
        dynamic_variables:{dynamic_variable_placeholders:WINDYKATOR_VOICE_PLACEHOLDERS}
      },
      tts:{model_id:"eleven_flash_v2_5"}
    },
    ...(includeAnalysis?{platform_settings:{data_collection:WINDYKATOR_VOICE_COLLECTION}}:{})
  };
}
/** Tworzy agenta na koncie ElevenLabs; ID zapisuje atomowo w naszej osobnej tabeli. */
export async function ensureWindykatorVoiceAgent():Promise<{agentId:string;created:boolean}>{
  const s=await readWindVoiceSettings();
  if(s.agent_id){
    // Nie zmieniaj promptu istniejącego agenta przy zwykłej obsłudze — do tego służy świadomy sync.
    return {agentId:s.agent_id,created:false};
  }
  let agentId:string|null=null;
  let lastError:Error|null=null;
  for(const includeAnalysis of [true,false]){
    try{
      const result=await elevenRequest("/v1/convai/agents/create",{
        method:"POST",json:agentPayload(includeAnalysis)
      });
      agentId=String(result.json?.agent_id||"");
      if(agentId)break;
      lastError=new Error("ElevenLabs nie zwrócił agent_id.");
    }catch(e){lastError=e instanceof Error?e:new Error(String(e));}
  }
  if(!agentId)throw lastError??new Error("ElevenLabs: nie utworzono agenta.");
  const db=await windVoiceDb();
  const {data:saved,error}=await db.from("windykator_voice_settings")
    .update({agent_id:agentId,updated_at:new Date().toISOString()})
    .eq("id",1).is("agent_id",null).select("agent_id").maybeSingle();
  if(error||!saved){
    // W przypadku równoległego żądania drugi agent zostaje osierocony,
    // ale nie zostaje użyty do rozmów. Równoległe provision chroni panel admina.
    throw Error("Utworzono agenta ElevenLabs, ale zapis ID nie powiódł się. Sprawdź konsolę, aby uniknąć duplikatu: "+agentId);
  }
  return {agentId,created:true};
}
/** Dedykowany post-call HMAC webhook, nie przekierowujemy rezultatów do A1/A4. */
export async function ensureWindykatorPostCallWebhook():Promise<{webhookId:string}>{
  const settings=await readWindVoiceSettings();
  if(!settings.agent_id)throw Error("Najpierw utwórz agenta A5.");
  const db=await windVoiceDb();
  const {data:row}=await db.from("windykator_voice_settings")
    .select("post_call_webhook_id,post_call_webhook_secret").eq("id",1).single();
  if(row?.post_call_webhook_id&&row?.post_call_webhook_secret)
    return {webhookId:row.post_call_webhook_id};
  const {resolveAppBaseUrl}=await import("@/lib/access/urls.server");
  const url=resolveAppBaseUrl()+"/api/public/windykator-voice-postcall";
  const created=await elevenRequest("/v1/workspace/webhooks",{method:"POST",json:{
    settings:{auth_type:"hmac",name:"Finance You — Windykator AI A5 (post-call)",webhook_url:url}
  }});
  const webhookId=String(created.json?.webhook_id??"");
  const secret=String(created.json?.webhook_secret??"");
  if(!webhookId||!secret)throw Error("ElevenLabs nie zwrócił webhook_id i bezpiecznego sekretu.");
  const {error}=await db.from("windykator_voice_settings").update({
    post_call_webhook_id:webhookId,post_call_webhook_secret:secret,updated_at:new Date().toISOString()
  }).eq("id",1);
  if(error)throw Error("Nie zapisano sekretu webhooka: "+error.message);
  // Aktualizacja TYLKO A5, a nie globalnych webhooków całego workspace.
  await elevenRequest("/v1/convai/agents/"+encodeURIComponent(settings.agent_id),{
    method:"PATCH",json:{platform_settings:{webhooks:{
      post_call_webhook_id:webhookId,
      events:["transcript","call_initiation_failure"],
      transcript_format:"json",send_audio:false
    }}}
  });
  return {webhookId};
}
export async function syncWindykatorVoicePrompt():Promise<{agentId:string}>{
  const s=await readWindVoiceSettings();
  if(!s.agent_id)throw Error("Najpierw utwórz agenta A5.");
  const body=agentPayload(false);
  await elevenRequest("/v1/convai/agents/"+encodeURIComponent(s.agent_id),{
    method:"PATCH",json:{conversation_config:body.conversation_config}
  });
  return {agentId:s.agent_id};
}
/** Nie nadpisujemy istniejącego numeru A1/A4. Tylko nowy, wolny import w ElevenLabs. */
export async function assignWindykatorDedicatedNumber(phoneNumberId:string){
  const s=await readWindVoiceSettings();
  if(!s.agent_id)throw Error("Najpierw utwórz agenta A5.");
  const id=phoneNumberId.trim();
  if(!/^[A-Za-z0-9_-]{8,90}$/.test(id))throw Error("Nieprawidłowy identyfikator numeru ElevenLabs.");
  const current=await elevenRequest("/v1/convai/phone-numbers/"+encodeURIComponent(id));
  const phone=current.json?.phone_number??current.json?.twilio?.phone_number;
  const assigned=current.json?.assigned_agent?.agent_id;
  if(assigned&&assigned!==s.agent_id)throw Error("Ten numer jest już przypisany do innego agenta. Nie przejmuję numerów A1/A4.");
  const number=typeof phone==="string"?normalizeWindPhone(phone):null;
  if(!number)throw Error("ElevenLabs nie zwrócił jednoznacznego numeru telefonu.");
  await elevenRequest("/v1/convai/phone-numbers/"+encodeURIComponent(id),{
    method:"PATCH",json:{agent_id:s.agent_id}
  });
  const db=await windVoiceDb();
  const {error}=await db.from("windykator_voice_settings")
    .update({phone_number_id:id,phone_e164:number,updated_at:new Date().toISOString()})
    .eq("id",1);
  if(error)throw Error("Numer połączono z agentem ElevenLabs, ale błąd zapisu ustawień: "+error.message);
  return {agentId:s.agent_id,phoneNumberId:id,phone:number};
}
