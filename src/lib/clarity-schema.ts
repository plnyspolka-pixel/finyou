// Schematy wejścia (zod) modułu Microsoft Clarity (metryki, analiza AI) — wspólne dla server functions
// panelu (clarity.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const fetchClarityMetricsSchema = z.object({
  numOfDays: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
});
export type FetchClarityMetricsInput = z.infer<typeof fetchClarityMetricsSchema>;

export const analyzeClarityMetricsSchema = z.object({
  metrics: z.any(),
  question: z.string().max(2000).optional().default(""),
});
export type AnalyzeClarityMetricsInput = z.infer<typeof analyzeClarityMetricsSchema>;
