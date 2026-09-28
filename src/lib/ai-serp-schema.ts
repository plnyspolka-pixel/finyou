// Schematy wejścia (zod) modułu Pozycje w Google (SERP) — wspólne dla server functions
// panelu (ai-serp.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const addKeywordSchema = z.object({
  keyword: z.string().min(1).max(200),
  target_url: z.string().url().optional().nullable(),
  location: z.string().max(80).default("Poland"),
  language: z.string().max(10).default("pl"),
  search_volume: z.number().int().min(0).optional().nullable(),
  difficulty: z.number().int().min(0).max(100).optional().nullable(),
  intent: z
    .enum(["informational", "navigational", "commercial", "transactional"])
    .optional()
    .nullable(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});
export type AddKeywordInput = z.infer<typeof addKeywordSchema>;

export const updateKeywordSchema = z.object({
  id: z.string().uuid(),
  keyword: z.string().min(1).max(200).optional(),
  target_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  search_volume: z.number().int().min(0).nullable().optional(),
  difficulty: z.number().int().min(0).max(100).nullable().optional(),
});
export type UpdateKeywordInput = z.infer<typeof updateKeywordSchema>;

export const deleteKeywordSchema = z.object({ id: z.string().uuid() });
export type DeleteKeywordInput = z.infer<typeof deleteKeywordSchema>;

export const checkKeywordRankingSchema = z.object({ keyword_id: z.string().uuid() });
export type CheckKeywordRankingInput = z.infer<typeof checkKeywordRankingSchema>;
