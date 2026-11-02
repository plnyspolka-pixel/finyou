import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { elevenRequest } from "@/lib/elevenlabs-api.server";
import { eligibleForWindykatorCall } from "./voice-guard";
import { normalizeWindPhone, readWindVoiceSettings, windVoiceDb } from "./voice.server";

const caseInput=z.object({caseId:z.string().uuid()});
/** Wierzyciel potwierdza aktualne saldo, nie zakładamy danych o przelewach. */
export const confirmWindykatorVoiceBalance=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>caseInput.extend({
    remainsUnpaid:z.boolean(),isDisputed:z.boolean()
  }).parse(v))
  .handler(async ({data,context})=>{
    const db=await windVoiceDb();
    const {data:o}=await db.from("windykator_orders").select("id,status,paid_at,collection_state")
      .eq("id",data.caseId).eq("user_id",context.userId).eq("intake_source","shop").maybeSingle();
    if(!o||!o.paid_at||!["paid","analysis_ready","review_required"].includes(o.status))
      return {error:"Tylko właściciel opłaconej sprawy może aktualizować saldo."};
    const state=!data.remainsUnpaid?"settled":data.isDisputed?"disputed":"active";
    // Po sporze lub żądaniu zaprzestania kontaktu nie przywracaj telefonu samym potwierdzeniem salda.
    const {data:existing}=await db.from("windykator_orders").select("voice_opt_out").eq("id",o.id).maybeSingle();
    const target=existing?.voice_opt_out&&state==="active"?"paused":state;
    const {error}=await db.from("windykator_orders").update({
      collection_state:target,creditor_balance_confirmed_at:new Date().toISOString()
    }).eq("id",o.id).eq("user_id",context.userId);
    if(error)return {error:"Nie można zapisać potwierdzenia."};
    return {state:target};
  });

/** Głosowy A5 jest oddzielny od wszystkich dotychczasowych call_queue i wind_events. */
export const callWindykatorDebtor=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>caseInput.parse(v))
  .handler(async ({data,context})=>{
    if(process.env.WINDYKATOR_VOICE_OUTBOUND_ENABLED!=="true")
      return {error:"Połączenia A5 nie zostały jeszcze włączone na produkcji."};
    const db=await windVoiceDb();
    const {data:o}=await db.from("windykator_orders").select("*")
      .eq("id",data.caseId).eq("user_id",context.userId).eq("intake_source","shop").maybeSingle();
    if(!o)return {error:"Nie znaleziono sprawy."};
    const cfg=await readWindVoiceSettings();
    const number=normalizeWindPhone(o.debtor_phone??"");
    const {data:last}=await db.from("windykator_voice_calls").select("created_at")
      .eq("case_id",o.id).eq("direction","outbound")
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    const now=new Date();
    const guard=eligibleForWindykatorCall({
      status:o.status,collectionState:o.collection_state,paidAt:o.paid_at,
      activatedAt:o.collection_activated_at,expiresAt:o.collection_ends_at,
      latestBalanceConfirmedAt:o.creditor_balance_confirmed_at,phone:number,
      voiceOptOut:o.voice_opt_out===true,disputed:o.collection_state==="disputed",
      lastOutboundCallAt:last?.created_at??null,now,
      configured:!!cfg.agent_id&&!!cfg.phone_number_id&&!!cfg.phone_e164
    });
    if(!guard.ok)return {error:guard.reason};
    const {data:locked,error:lockError}=await db.from("windykator_voice_calls")
      .insert({case_id:o.id,direction:"outbound",agent_id:cfg.agent_id,
        phone_e164:number,status:"initiating"})
      .select("id").single();
    if(lockError||!locked)return {error:"Inne połączenie w tej sprawie jest już przetwarzane."};
    try{
      // Dane do modelu pochodzą z rekordu opłaconej sprawy, nie z frontendowych kwot.
      const init={
        dynamic_variables:{
          direction:"outbound",case_found:"true",case_id:o.id,
          debtor_name:o.debtor_name,
          creditor_name:o.creditor_name,claim_reference:String(o.qualification_facts?.documentNumber??""),
          claimed_amount:Number(o.claim_amount).toFixed(2)+" PLN",
          due_date:o.due_date,latest_case_status:o.collection_state,
          previous_topics:""
        }
      };
      const result=await elevenRequest("/v1/convai/twilio/outbound-call",{
        method:"POST",json:{agent_id:cfg.agent_id,
          agent_phone_number_id:cfg.phone_number_id,to_number:number,
          conversation_initiation_client_data:init,call_recording_enabled:false}
      });
      if(result.json?.success!==true)throw Error("ElevenLabs nie rozpoczął połączenia.");
      const {error:saveError}=await db.from("windykator_voice_calls").update({
        status:"in_progress",conversation_id:result.json?.conversation_id??null,
        call_sid:result.json?.callSid??null
      }).eq("id",locked.id);
      if(saveError)throw Error("Połączenie rozpoczęte, ale zapis identyfikatora się nie powiódł: "+saveError.message);
      return {ok:true,conversationId:result.json?.conversation_id??null};
    }catch(e){
      await db.from("windykator_voice_calls")
        .update({status:"failed",ended_at:new Date().toISOString(),
          outcome:{error:"Nie udało się rozpocząć połączenia lub zapisać jego identyfikatora."}})
        .eq("id",locked.id).eq("status","initiating");
      return {error:e instanceof Error?e.message:"Błąd połączenia."};
    }
  });

export const getWindykatorVoiceCaseState=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>caseInput.parse(v))
  .handler(async ({data,context})=>{
    const db=await windVoiceDb();
    const {data:o}=await db.from("windykator_orders")
      .select("id,collection_state,creditor_balance_confirmed_at,collection_activated_at,collection_ends_at,voice_opt_out,debtor_phone")
      .eq("id",data.caseId).eq("user_id",context.userId).maybeSingle();
    if(!o)return {error:"Nie znaleziono sprawy."};
    const {data:calls}=await db.from("windykator_voice_calls")
      .select("direction,status,created_at,ended_at,outcome")
      .eq("case_id",o.id).order("created_at",{ascending:false}).limit(20);
    return {caseId:o.id,state:o.collection_state,balanceConfirmedAt:o.creditor_balance_confirmed_at,
      voiceOptOut:o.voice_opt_out,phoneConfigured:!!o.debtor_phone,
      calls:calls??[]};
  });
