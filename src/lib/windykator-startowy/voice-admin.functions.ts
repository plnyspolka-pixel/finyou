import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context:any){
  const {data, error}=await context.supabase.from("user_roles")
    .select("role").eq("user_id",context.userId);
  if(error||!(data??[]).some((r:any)=>r.role==="administrator"))
    throw Error("Tylko administrator Finance You może zarządzać agentem A5.");
}
export const getWindykatorVoiceAdminState=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    await requireAdmin(context);
    const {readWindVoiceSettings}=await import("./voice.server");
    const settings=await readWindVoiceSettings();
    return {agent_id:settings.agent_id,phone_number_id:settings.phone_number_id,phone_e164:settings.phone_e164,
      configured:Boolean(process.env.ELEVENLABS_API_KEY),
      outboundEnabled:process.env.WINDYKATOR_VOICE_OUTBOUND_ENABLED==="true",
      inboundReady:Boolean(settings.phone_e164&&settings.agent_id),
      postcallReady:Boolean((settings as any).post_call_webhook_id)};
  });
export const provisionWindykatorVoiceAgent=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    await requireAdmin(context);
    if((process.env.WINDYKATOR_VOICE_INIT_SECRET??"").length<24)
      throw Error("Ustaw WINDYKATOR_VOICE_INIT_SECRET przed tworzeniem A5 — sekret chroni połączenia przychodzące.");
    if(!process.env.ELEVENLABS_API_KEY)
      throw Error("Brak ELEVENLABS_API_KEY na serwerze.");
    const {ensureWindykatorVoiceAgent,ensureWindykatorPostCallWebhook,ensureWindykatorInboundWebhook}=await import("./voice.server");
    const agent=await ensureWindykatorVoiceAgent();
    const postcall=await ensureWindykatorPostCallWebhook();
    const inbound=await ensureWindykatorInboundWebhook();
    return {...agent,postcallWebhookId:postcall.webhookId,inboundWebhookUrl:inbound.url};
  });
export const syncWindykatorVoiceAgent=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    await requireAdmin(context);
    const {syncWindykatorVoicePrompt}=await import("./voice.server");
    return syncWindykatorVoicePrompt();
  });
export const bindWindykatorPhone=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({phoneNumberId:z.string().min(8).max(100)}).parse(v))
  .handler(async ({context,data})=>{
    await requireAdmin(context);
    const {assignWindykatorDedicatedNumber}=await import("./voice.server");
    return assignWindykatorDedicatedNumber(data.phoneNumberId);
  });
