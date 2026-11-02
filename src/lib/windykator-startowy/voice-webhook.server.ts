import { classifyVoiceAnalysis } from "./voice-guard";
import { readWindVoiceSettings, windVoiceDb } from "./voice.server";

/** Wywoływane TYLKO po weryfikacji HMAC przez publiczny webhook ElevenLabs.
 * Zwraca true, jeśli zdarzenie należy do nowego A5 i nie może trafić do CRM A1.
 */
export async function processWindykatorVoiceWebhook(envelope:any):Promise<boolean>{
  const data=envelope?.data??envelope;
  const cfg=await readWindVoiceSettings();
  if(!cfg.agent_id || data?.agent_id!==cfg.agent_id)return false;
  const type=String(envelope?.type??"");
  if(!["post_call_transcription","call_initiation_failure"].includes(type))return true;
  const conversationId=String(data?.conversation_id??"").slice(0,120);
  if(!conversationId)return true;
  const db=await windVoiceDb();
  const {data:call,error:readError}=await db.from("windykator_voice_calls")
    .select("id,case_id,status").eq("conversation_id",conversationId).maybeSingle();
  if(readError||!call){
    // Brak autoryzowanej sesji z naszej bazy; payload ElevenLabs nie może
    // samodzielnie utworzyć sprawy na podstawie agent-controlled case_id.
    return true;
  }
  const isFailure=type==="call_initiation_failure";
  const results=data?.analysis?.data_collection_results??{};
  const parsed=Object.fromEntries(Object.entries(results).map(([k,v])=>
    [k,v&&typeof v==="object"&&"value" in (v as any)?(v as any).value:v]));
  const eventKind=isFailure?"call_failed":classifyVoiceAnalysis(parsed);
  const {data:order}=await db.from("windykator_orders")
    .select("id,collection_state,voice_opt_out").eq("id",call.case_id).maybeSingle();
  if(!order)return true;
  const payload={
    kind:eventKind,summary:String(data?.analysis?.transcript_summary??"").slice(0,1500),
    identityVerified:parsed.tozsamosc_potwierdzona===true,
    declaredPayment:parsed.zgloszona_wplata===true,
    disputed:parsed.status_sporny===true,
    promiseDate:typeof parsed.deklarowana_data==="string"?parsed.deklarowana_data.slice(0,10):null,
    promiseAmount:typeof parsed.deklarowana_kwota==="number"?parsed.deklarowana_kwota:null,
    // Nie przechowuj całego transkryptu ani nagrania w bazie.
    agentId:cfg.agent_id
  };
  const {error:insertError}=await db.from("windykator_voice_events").insert({
    event_key:"elevenlabs:"+type+":"+conversationId,
    case_id:call.case_id,call_id:call.id,event_kind:eventKind,payload
  });
  // Powtórzony webhook jest idempotentny — nie nadpisujemy późniejszych zdarzeń.
  if(insertError?.code==="23505")return true;
  if(insertError)throw new Error("Nie zapisano bezpiecznie zdarzenia A5: "+insertError.message);
  await db.from("windykator_voice_calls").update({
    status:isFailure?"failed":"completed",outcome:payload,
    ended_at:new Date().toISOString()
  }).eq("id",call.id);
  // Zgłoszenie spłaty NIE oznacza, że środki rzeczywiście wpłynęły.
  // Wierzyciel musi sprawdzić konto, zanim windykacja może być wznowiona.
  if(eventKind==="opt_out"){
    await db.from("windykator_orders").update({
      collection_state:"paused",voice_opt_out:true
    }).eq("id",call.case_id);
  }else if(eventKind==="disputed"){
    await db.from("windykator_orders").update({
      collection_state:"disputed"
    }).eq("id",call.case_id).eq("collection_state","active");
  }else if(eventKind==="payment_reported"){
    await db.from("windykator_orders").update({
      collection_state:"payment_reported"
    }).eq("id",call.case_id).eq("collection_state","active");
  }else if(eventKind==="promise"){
    await db.from("windykator_orders").update({
      collection_state:"paused"
    }).eq("id",call.case_id).eq("collection_state","active");
  }
  return true;
}
