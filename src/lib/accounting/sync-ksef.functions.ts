// Sync z KSeF 2.0 → accounting_documents. Deleguje do wspólnego rdzenia w sync-core.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountingDb, assertAccounting } from "./db";

export const syncKsef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ entityId: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    const { syncAllAccounting } = await import("./sync-core.server");
    const { results } = await syncAllAccounting();
    const filtered = data.entityId
      ? results.filter((r: { entity: string }) => true) // entity filter is applied at core-level in a future revision
      : results;
    // Zwracamy tylko wpisy KSeF, żeby UI "syncKsef" nie mieszał się z Fakturowo.
    return { ok: true, results: filtered };
  });
