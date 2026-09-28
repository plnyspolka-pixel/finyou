// Schematy wejścia (zod) modułu AI SEO (plan tematów, artykuły z AI) — wspólne dla server functions
// panelu (ai-seo.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const planSeoTopicsSchema = z.object({
  seed: z.string().min(3).max(500),
  count: z.number().min(3).max(20).default(8),
});
export type PlanSeoTopicsInput = z.infer<typeof planSeoTopicsSchema>;

export const generateSeoArticleSchema = z.object({
  topicId: z.string().uuid(),
  autoPublish: z.boolean().default(false),
});
export type GenerateSeoArticleInput = z.infer<typeof generateSeoArticleSchema>;

export const setArticleStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "published", "archived"]),
});
export type SetArticleStatusInput = z.infer<typeof setArticleStatusSchema>;

export const deleteSeoArticleSchema = z.object({ id: z.string().uuid() });
export type DeleteSeoArticleInput = z.infer<typeof deleteSeoArticleSchema>;

export const deleteSeoTopicSchema = z.object({ id: z.string().uuid() });
export type DeleteSeoTopicInput = z.infer<typeof deleteSeoTopicSchema>;
