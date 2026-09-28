// Schematy wejścia (zod) modułu Outreach AI (cele, wiadomości) — wspólne dla server functions
// panelu (ai-outreach.functions.ts) i narzędzi MCP. Plik czysty: tylko zod.
import { z } from "zod";

export const addOutreachTargetSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
  url: z.string().url().optional().nullable(),
  contact_name: z.string().max(120).optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  niche: z.string().max(120).optional().nullable(),
  priority: z.number().int().min(0).max(100).default(50),
  notes: z.string().max(2000).optional().nullable(),
  source: z.enum(["manual", "ai_discovery", "import"]).default("manual"),
});
export type AddOutreachTargetInput = z.infer<typeof addOutreachTargetSchema>;

export const updateOutreachTargetSchema = z.object({
  id: z.string().uuid(),
  contact_name: z.string().max(120).optional().nullable(),
  contact_email: z.string().email().optional().nullable().or(z.literal("")),
  niche: z.string().max(120).optional().nullable(),
  priority: z.number().int().min(0).max(100).optional(),
  status: z
    .enum(["new", "queued", "contacted", "responded", "won", "rejected", "blacklist"])
    .optional(),
  notes: z.string().max(2000).optional().nullable(),
});
export type UpdateOutreachTargetInput = z.infer<typeof updateOutreachTargetSchema>;

export const deleteOutreachTargetSchema = z.object({ id: z.string().uuid() });
export type DeleteOutreachTargetInput = z.infer<typeof deleteOutreachTargetSchema>;

export const discoverOutreachTargetsSchema = z.object({
  niche: z.string().min(3).max(300),
  count: z.number().int().min(1).max(20).default(10),
});
export type DiscoverOutreachTargetsInput = z.infer<typeof discoverOutreachTargetsSchema>;

export const generateOutreachMessageSchema = z.object({
  target_id: z.string().uuid(),
  goal: z.string().min(3).max(500),
  angle: z.string().max(500).optional().default(""),
  step: z.number().int().min(1).max(5).default(1),
  parent_id: z.string().uuid().optional().nullable(),
});
export type GenerateOutreachMessageInput = z.infer<typeof generateOutreachMessageSchema>;

export const updateOutreachMessageSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  status: z.enum(["draft", "approved", "sent", "replied", "bounced"]).optional(),
  reply_excerpt: z.string().max(5000).optional().nullable(),
  mark_sent: z.boolean().optional(),
});
export type UpdateOutreachMessageInput = z.infer<typeof updateOutreachMessageSchema>;

export const deleteOutreachMessageSchema = z.object({ id: z.string().uuid() });
export type DeleteOutreachMessageInput = z.infer<typeof deleteOutreachMessageSchema>;
