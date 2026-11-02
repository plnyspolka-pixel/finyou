import { createFileRoute } from "@tanstack/react-router";
import {verifyWindVoiceHmac} from "@/lib/windykator-startowy/voice-hmac";
import { windVoiceDb } from "@/lib/windykator-startowy/voice.server";
import { processWindykatorVoiceWebhook } from "@/lib/windykator-startowy/voice-webhook.server";

export const Route=createFileRoute("/api/public/windykator-voice-postcall")({
  server:{handlers:{POST:async({request})=>{
    const body=await request.text();
    if(body.length>2_000_000)return new Response("body_too_large",{status:413});
    const db=await windVoiceDb();
    const {data:settings}=await db.from("windykator_voice_settings")
      .select("post_call_webhook_secret").eq("id",1).maybeSingle();
    if(!settings?.post_call_webhook_secret)return new Response("not_configured",{status:503});
    if(!verifyWindVoiceHmac(body,request.headers.get("elevenlabs-signature"),settings.post_call_webhook_secret))
      return new Response("invalid_signature",{status:401});
    try{
      const event=JSON.parse(body);
      const handled=await processWindykatorVoiceWebhook(event);
      // Odrębny endpoint nie akceptuje zdarzeń innych agentów.
      if(!handled)return new Response("wrong_agent",{status:403});
      return new Response(JSON.stringify({ok:true}),{
        headers:{"content-type":"application/json"}
      });
    }catch(e){
      console.error("[windykator-a5] webhook processing failed",e);
      return new Response("retry_later",{status:500});
    }
  }}}
});
