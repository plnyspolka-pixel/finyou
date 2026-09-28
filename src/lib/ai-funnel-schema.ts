// Schematy wejścia (zod) modułu Lejek AI (statystyki, insighty) — wspólne dla server functions
// panelu (ai-funnel.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const getFunnelStatsSchema = z.object({
  landing_id: z.string().uuid().optional().nullable(),
  days: z.number().int().min(1).max(365).default(30),
});
export type GetFunnelStatsInput = z.infer<typeof getFunnelStatsSchema>;

export const generateFunnelInsightsSchema = z.object({
  landing_id: z.string().uuid().optional().nullable(),
  days: z.number().int().min(1).max(365).default(30),
});
export type GenerateFunnelInsightsInput = z.infer<typeof generateFunnelInsightsSchema>;
