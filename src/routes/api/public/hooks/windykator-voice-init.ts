/** Połączenia przychodzące A5: osobny numer + webhook inicjujący ElevenLabs.
 * Nie przechwytuje inbound obecnych agentów, ani nie tworzy nowych zleceń.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireWebhookSecret } from "@/lib/cron-auth.server";
import { normalizeWindPhone, readWindVoiceSettings, windVoiceDb } from "@/lib/windykator-startowy/voice.server";
import { WINDYKATOR_VOICE_PLACEHOLDERS } from "@/lib/windykator-startowy/voice-prompt";

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
}
export const Route=createFileRoute("/api/public/hooks/windykator-voice-init")({
  server:{handlers:{POST:async({request})=>{
    const deny=requireWebhookSecret(request,"WINDYKATOR_VOICE_INIT_SECRET");
    if(deny)return deny;
    const payload=await request.json().catch(()=>({})) as Record<string,unknown>;
    const cfg=await readWindVoiceSettings();
    if(!cfg.agent_id||!cfg.phone_e164||payload.agent_id!==cfg.agent_id)
      return json({error:"agent_not_authorized"},403);
    const to=normalizeWindPhone(String(payload.called_number??""));
    const from=normalizeWindPhone(String(payload.caller_id??""));
    const conv=String(payload.conversation_id??"").slice(0,120);
    if(to!==cfg.phone_e164)return json({error:"wrong_phone"},403);
    const vars:Record<string,string>={...WINDYKATOR_VOICE_PLACEHOLDERS,direction:"inbound"};
    if(!from || !conv)return json({type:"conversation_initiation_client_data",dynamic_variables:vars});
    const db=await windVoiceDb();
    const {data:matches,error}=await db.from("windykator_orders")
      .select("id,debtor_name,creditor_name,claim_amount,due_date,qualification_facts,collection_state,collection_ends_at,voice_opt_out,status")
      .eq("debtor_phone",from).eq("intake_source","shop")
      .in("status",["paid","analysis_ready","review_required"])
      .gt("collection_ends_at",new Date().toISOString()).limit(3);
    // Brak dopasowania lub więcej niż jedno: nie zgaduj, o czyim długu jest rozmowa.
    if(error||matches?.length!==1||matches[0].voice_opt_out)
      return json({type:"conversation_initiation_client_data",dynamic_variables:vars});
    const c=matches[0];
    const {error:callError}=await db.from("windykator_voice_calls").upsert({
      case_id:c.id,direction:"inbound",agent_id:cfg.agent_id,
      phone_e164:from,conversation_id:conv,status:"in_progress"
    },{onConflict:"conversation_id",ignoreDuplicates:true});
    if(callError)return json({type:"conversation_initiation_client_data",dynamic_variables:vars});
    // Agent może zidentyfikować rozmówcę tylko po pytaniu o imię/nazwisko.
    // Bez poprawnej identyfikacji nie wolno odczytywać tych pól na głos.
    Object.assign(vars,{
      case_found:"true",case_id:c.id,debtor_name:c.debtor_name,
      creditor_name:c.creditor_name,
      claim_reference:String(c.qualification_facts?.documentNumber??""),
      claimed_amount:Number(c.claim_amount).toFixed(2)+" PLN",
      due_date:c.due_date,latest_case_status:c.collection_state
    });
    return json({type:"conversation_initiation_client_data",dynamic_variables:vars});
  }}}
});
