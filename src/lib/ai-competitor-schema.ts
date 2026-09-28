// Schematy wejścia (zod) modułu Monitoring konkurencji — wspólne dla server functions
// panelu (ai-competitor.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const addCompetitorSchema = z.object({
  name: z.string().min(1).max(150),
  domain: z.string().min(3).max(200),
  urls: z.array(z.string().url()).min(1).max(20),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});
export type AddCompetitorInput = z.infer<typeof addCompetitorSchema>;

export const updateCompetitorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(150).optional(),
  urls: z.array(z.string().url()).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateCompetitorInput = z.infer<typeof updateCompetitorSchema>;

export const deleteCompetitorSchema = z.object({ id: z.string().uuid() });
export type DeleteCompetitorInput = z.infer<typeof deleteCompetitorSchema>;

export const scanCompetitorSchema = z.object({ competitor_id: z.string().uuid() });
export type ScanCompetitorInput = z.infer<typeof scanCompetitorSchema>;
