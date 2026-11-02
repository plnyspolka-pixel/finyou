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
    return {...settings,configured:Boolean(process.env.ELEVENLABS_API_KEY),
      outboundEnabled:process.env.WINDYKATOR_VOICE_OUTBOUND_ENABLED==="true",
      inboundReady:Boolean(settings.phone_e164&&settings.agent_id)};
  });
export const provisionWindykatorVoiceAgent=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    await requireAdmin(context);
    const {ensureWindykatorVoiceAgent}=await import("./voice.server");
    return ensureWindykatorVoiceAgent();
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
