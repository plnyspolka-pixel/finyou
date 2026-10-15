// „Moje umowy" inwestora — server function. Umowy do wniosków (wygenerowane
// silnikiem umów albo wysłane do e-podpisu), podzielone na etapy.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MyContract } from "./my-contracts.server";

export type { MyContract };

export const getMyContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ contracts: MyContract[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMyContracts } = await import("./my-contracts.server");
    const e = (context as any).claims?.email;
    const myEmail = typeof e === "string" && e.includes("@") ? e.toLowerCase() : null;
    return { contracts: await loadMyContracts(supabaseAdmin, context.userId, myEmail) };
  });
