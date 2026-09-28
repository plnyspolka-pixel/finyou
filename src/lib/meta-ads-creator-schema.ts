// Schematy wejścia (zod) modułu Kreator Meta Ads (szkice, targetowanie, publikacja) — wspólne dla server functions
// panelu (meta-ads-creator.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const draftSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  ad_account_id: z.string().uuid().nullable().optional(),
  page_id: z.string().max(100).nullable().optional(),
  page_name: z.string().max(200).nullable().optional(),
  daily_budget: z.number().min(5).max(100000),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  targeting: z.record(z.string(), z.unknown()),
  creative: z.record(z.string(), z.unknown()),
  lead_form: z.record(z.string(), z.unknown()),
});

export const searchTargetingSchema = z.object({
  type: z.enum(["adgeolocation", "adinterest"]),
  q: z.string().min(1).max(200),
});
export type SearchTargetingInput = z.infer<typeof searchTargetingSchema>;

export const listAdPixelsSchema = z.object({ ad_account_id: z.string().uuid() });
export type ListAdPixelsInput = z.infer<typeof listAdPixelsSchema>;

export const createAdPixelSchema = z.object({
  ad_account_id: z.string().uuid(),
  name: z.string().min(1).max(120),
});
export type CreateAdPixelInput = z.infer<typeof createAdPixelSchema>;

export const suggestTargetingSchema = z.object({
  geo: z.string().max(120).optional(),
  interests: z.string().max(500).optional(),
});
export type SuggestTargetingInput = z.infer<typeof suggestTargetingSchema>;

export const saveAdDraftSchema = draftSchema;
export type SaveAdDraftInput = z.infer<typeof saveAdDraftSchema>;

export const getAdDraftSchema = z.object({ id: z.string().uuid() });
export type GetAdDraftInput = z.infer<typeof getAdDraftSchema>;

export const deleteAdDraftSchema = z.object({ id: z.string().uuid() });
export type DeleteAdDraftInput = z.infer<typeof deleteAdDraftSchema>;

export const publishAdDraftSchema = z.object({ id: z.string().uuid() });
export type PublishAdDraftInput = z.infer<typeof publishAdDraftSchema>;
