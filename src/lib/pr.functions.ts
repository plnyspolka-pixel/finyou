// Server functions panelu Digital PR (/admin/pr-media).
// WYSYŁKA OUTREACH WYŁĄCZNIE PO KLIKNIĘCIU CZŁOWIEKA (sendPrOutreach w panelu
// albo send_pr_outreach w MCP po potwierdzeniu użytkownika) — żaden cron ani
// flaga nie wywołuje wysyłki automatycznie.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generatePrOpportunityDraftSchema,
  updatePrOpportunitySchema,
  sendPrOutreachSchema,
} from "./pr-schema";
// Logika: src/lib/pr/panel.server.ts (wspólna z narzędziami MCP).

export type PrOpportunity = {
  id: string;
  source: string;
  url: string;
  topic: string;
  snippet: string | null;
  matched_phrases: string[];
  article_published_at: string | null;
  deadline: string | null;
  status: string;
  draft_subject: string | null;
  draft_body: string | null;
  draft_generated_at: string | null;
  recipient_email: string | null;
  notes: string | null;
  created_at: string;
};

export type PrOutreachLogItem = {
  id: string;
  opportunity_id: string | null;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  error: string | null;
};
export const listPrOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./pr/panel.server");
    return mod.listPrOpportunities(context.supabase, context.userId);
  });

export const listPrOutreachLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./pr/panel.server");
    return mod.listPrOutreachLog(context.supabase, context.userId);
  });

export const generatePrOpportunityDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => generatePrOpportunityDraftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./pr/panel.server");
    return mod.generatePrOpportunityDraft(context.supabase, context.userId, data);
  });

export const updatePrOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updatePrOpportunitySchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./pr/panel.server");
    return mod.updatePrOpportunity(context.supabase, context.userId, data);
  });

export const sendPrOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => sendPrOutreachSchema.parse(i))
  .handler(async ({ data, context }) => {
    const mod = await import("./pr/panel.server");
    return mod.sendPrOutreach(context.supabase, context.userId, data);
  });
