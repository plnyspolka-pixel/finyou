// Schematy wejścia (zod) modułu Digital PR (okazje, szkice, wysyłka) — wspólne dla server functions
// panelu (pr.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const generatePrOpportunityDraftSchema = z.object({ id: z.string().uuid() });
export type GeneratePrOpportunityDraftInput = z.infer<typeof generatePrOpportunityDraftSchema>;

export const updatePrOpportunitySchema = z.object({
  id: z.string().uuid(),
  draft_subject: z.string().max(300).optional(),
  draft_body: z.string().max(20000).optional(),
  recipient_email: z.string().email().or(z.literal("")).optional(),
  deadline: z.string().datetime().nullable().optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(["new", "drafted", "approved", "rejected"]).optional(),
});
export type UpdatePrOpportunityInput = z.infer<typeof updatePrOpportunitySchema>;

export const sendPrOutreachSchema = z.object({ id: z.string().uuid() });
export type SendPrOutreachInput = z.infer<typeof sendPrOutreachSchema>;
