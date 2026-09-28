// Schematy wejścia (zod) modułu Silnik wzrostu — landingi AI i ustawienia — wspólne dla server functions
// panelu (ai-growth.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const sectionSchema = z.object({
  kind: z.enum(["benefits", "how_it_works", "social_proof", "faq", "cta"]),
  heading: z.string(),
  body: z.string().optional().default(""),
  items: z
    .array(z.object({ title: z.string(), text: z.string().optional().default("") }))
    .optional()
    .default([]),
});

export const landingSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  meta_title: z.string(),
  meta_description: z.string(),
  hero_headline: z.string(),
  hero_subheadline: z.string(),
  cta_label: z.string(),
  keywords: z.array(z.string()).default([]),
  sections: z.array(sectionSchema).min(3).max(8),
});

export const generateAiLandingSchema = z.object({
  goal: z.string().min(3).max(500),
  audience: z.string().max(500).optional().default(""),
  keywords: z.string().max(500).optional().default(""),
  brief: z.string().max(3000).optional().default(""),
  ctaUrl: z.string().url().optional().nullable(),
  autoPublish: z.boolean().optional().default(false),
});
export type GenerateAiLandingInput = z.infer<typeof generateAiLandingSchema>;

export const setLandingStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "published", "archived"]),
});
export type SetLandingStatusInput = z.infer<typeof setLandingStatusSchema>;

export const deleteLandingSchema = z.object({ id: z.string().uuid() });
export type DeleteLandingInput = z.infer<typeof deleteLandingSchema>;

export const updateGrowthSettingsSchema = z.object({
  automation_mode: z.enum(["off", "manual_review", "semi_auto", "full_autopilot"]).optional(),
  daily_ai_budget_pln: z.number().min(0).max(10000).optional(),
  brand_name: z.string().max(120).optional(),
  brand_description: z.string().max(500).optional(),
  target_audience: z.string().max(500).optional(),
  primary_cta_url: z.string().url().optional(),
  default_model: z.string().max(80).optional(),
});
export type UpdateGrowthSettingsInput = z.infer<typeof updateGrowthSettingsSchema>;
