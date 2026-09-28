// Schematy wejścia (zod) modułu Kreator Google Ads (szkice, eksport CSV) — wspólne dla server functions
// panelu (google-ads.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  campaign_type: z.enum(["SEARCH", "DISPLAY"]),
  daily_budget_pln: z.number().min(1).max(100000),
  keywords: z.array(z.string().min(1).max(80)).max(200),
  negative_keywords: z.array(z.string().min(1).max(80)).max(200),
  headlines: z.array(z.string().min(1).max(30)).min(3).max(15),
  descriptions: z.array(z.string().min(1).max(90)).min(2).max(4),
  final_url: z.string().url().max(500),
  display_path1: z.string().max(15).optional().nullable(),
  display_path2: z.string().max(15).optional().nullable(),
  target_locations: z.array(z.string().min(1).max(100)).min(1).max(50),
  target_languages: z.array(z.string().min(1).max(10)).min(1).max(20),
  notes: z.string().max(2000).optional().nullable(),
});

export const saveGoogleAdDraftSchema = schema;
export type SaveGoogleAdDraftInput = z.infer<typeof saveGoogleAdDraftSchema>;

export const getGoogleAdDraftSchema = z.object({ id: z.string().uuid() });
export type GetGoogleAdDraftInput = z.infer<typeof getGoogleAdDraftSchema>;

export const deleteGoogleAdDraftSchema = z.object({ id: z.string().uuid() });
export type DeleteGoogleAdDraftInput = z.infer<typeof deleteGoogleAdDraftSchema>;

export const exportGoogleAdCsvSchema = z.object({ id: z.string().uuid() });
export type ExportGoogleAdCsvInput = z.infer<typeof exportGoogleAdCsvSchema>;
