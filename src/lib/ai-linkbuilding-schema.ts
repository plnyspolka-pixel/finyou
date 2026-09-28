// Schematy wejścia (zod) modułu Link building AI (backlinki, propozycje) — wspólne dla server functions
// panelu (ai-linkbuilding.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const addBacklinkSchema = z.object({
  source_url: z.string().url(),
  target_url: z.string().url(),
  anchor_text: z.string().max(300).optional().nullable(),
  link_type: z
    .enum(["editorial", "guest_post", "directory", "forum", "comment", "partnership", "other"])
    .default("editorial"),
  dofollow: z.boolean().default(true),
  domain_authority: z.number().int().min(0).max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  outreach_target_id: z.string().uuid().optional().nullable(),
});
export type AddBacklinkInput = z.infer<typeof addBacklinkSchema>;

export const updateBacklinkSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["live", "lost", "pending", "rejected"]).optional(),
  dofollow: z.boolean().optional(),
  domain_authority: z.number().int().min(0).max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  last_checked_at: z.string().datetime().optional().nullable(),
});
export type UpdateBacklinkInput = z.infer<typeof updateBacklinkSchema>;

export const deleteBacklinkSchema = z.object({ id: z.string().uuid() });
export type DeleteBacklinkInput = z.infer<typeof deleteBacklinkSchema>;

export const generateLinkBuildingSuggestionsSchema = z.object({
  niche: z.string().min(3).max(500),
  notes: z.string().max(2000).optional().default(""),
});
export type GenerateLinkBuildingSuggestionsInput = z.infer<
  typeof generateLinkBuildingSuggestionsSchema
>;

export const updateLbSuggestionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "in_progress", "won", "rejected", "archived"]).optional(),
  priority: z.number().int().min(1).max(5).optional(),
});
export type UpdateLbSuggestionInput = z.infer<typeof updateLbSuggestionSchema>;

export const promoteSuggestionToOutreachSchema = z.object({ id: z.string().uuid() });
export type PromoteSuggestionToOutreachInput = z.infer<typeof promoteSuggestionToOutreachSchema>;
