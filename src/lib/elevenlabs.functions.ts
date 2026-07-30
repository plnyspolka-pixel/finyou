import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Pobiera token konwersacyjny dla wybranego agenta ElevenLabs
export const getElevenLabsToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ agentId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY nie skonfigurowany");
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(data.agentId)}`,
      { headers: { "xi-api-key": apiKey } },
    );
    if (!res.ok) throw new Error(`ElevenLabs: ${res.status}`);
    const json: any = await res.json();
    return { token: json.token };
  });

// Dodaje numer do kolejki rozmów voicebota
export const enqueueCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid().optional(),
        loanApplicationId: z.string().uuid().optional(),
        phoneNormalized: z.string().min(5),
        agentId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("call_queue").insert({
      client_id: data.clientId,
      loan_application_id: data.loanApplicationId,
      phone_normalized: data.phoneNormalized,
      agent_id: data.agentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
