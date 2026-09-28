import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  saveGoogleAdDraftSchema,
  getGoogleAdDraftSchema,
  deleteGoogleAdDraftSchema,
  exportGoogleAdCsvSchema,
} from "./google-ads-schema";
// Logika: src/lib/google-ads.server.ts (wspólna z narzędziami MCP).

export const saveGoogleAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveGoogleAdDraftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./google-ads.server");
    return mod.saveGoogleAdDraft(context.supabase, context.userId, data);
  });

export const listGoogleAdDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./google-ads.server");
    return mod.listGoogleAdDrafts(context.supabase, context.userId);
  });

export const getGoogleAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => getGoogleAdDraftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./google-ads.server");
    return mod.getGoogleAdDraft(context.supabase, context.userId, data);
  });

export const deleteGoogleAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => deleteGoogleAdDraftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./google-ads.server");
    return mod.deleteGoogleAdDraft(context.supabase, context.userId, data);
  });

export const exportGoogleAdCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => exportGoogleAdCsvSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./google-ads.server");
    return mod.exportGoogleAdCsv(context.supabase, context.userId, data);
  });
