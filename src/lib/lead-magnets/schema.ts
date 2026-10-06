// Schemat lead magnetu (zod) — wspólny dla server functions panelu
// (lead-magnets.functions.ts) i narzędzi MCP (create/update_lead_magnet).
import { z } from "zod";
import {
  DEFAULT_TEMPLATES,
  EMAIL_IN_DM_PLATFORMS,
  LEAD_MAGNET_AUDIENCES,
  LEAD_MAGNET_PLATFORMS,
} from "./core";

const optionalUrl = z.string().url().max(1000).optional().or(z.literal(""));

export const leadMagnetPostSchema = z.object({
  platform: z.enum(LEAD_MAGNET_PLATFORMS),
  /** FB: id posta strony (np. 1234_5678), IG: id mediów, YouTube: id filmu. */
  external_post_id: z.string().trim().min(3).max(120),
  label: z.string().max(160).optional(),
  post_url: optionalUrl,
});

export type LeadMagnetPostInput = z.infer<typeof leadMagnetPostSchema>;

/** Pola bez reguł krzyżowych — do `.omit()` / `.partial()` w narzędziach MCP. */
export const leadMagnetBaseSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "tylko małe litery, cyfry i myślniki"),
  title: z.string().min(1).max(200),
  audience: z.enum(LEAD_MAGNET_AUDIENCES),
  headline: z.string().min(1).max(300),
  subheadline: z.string().max(500).optional(),
  benefits: z.array(z.string().min(1).max(200)).max(12).default([]),
  cta_text: z.string().min(1).max(80).default(DEFAULT_TEMPLATES.cta),
  cover_image_url: optionalUrl,
  og_image_url: optionalUrl,
  meta_description: z.string().max(300).optional(),
  file_path: z.string().max(400).nullable().optional(),
  file_url: optionalUrl,
  file_name: z.string().max(200).nullable().optional(),
  file_size: z.number().int().nonnegative().nullable().optional(),
  mime_type: z.string().max(120).nullable().optional(),
  thank_you_message: z.string().min(1).max(500).default(DEFAULT_TEMPLATES.thank_you),
  instant_download: z.boolean().default(true),
  email_subject: z.string().min(1).max(200).default(DEFAULT_TEMPLATES.email_subject),
  email_body: z.string().min(1).max(5000).default(DEFAULT_TEMPLATES.email_body),
  subscriber_tags: z.array(z.string().min(1).max(60)).max(10).default([]),
  create_crm_lead: z.boolean().default(false),
  trigger_keywords: z.array(z.string().min(1).max(60)).max(20).default([]),
  match_any_post: z.boolean().default(false),
  reply_public_template: z.string().min(1).max(1000).default(DEFAULT_TEMPLATES.reply_public),
  reply_private_template: z.string().min(1).max(1900).default(DEFAULT_TEMPLATES.reply_private),
  reply_fallback_template: z.string().min(1).max(1000).default(DEFAULT_TEMPLATES.reply_fallback),
  /** Platformy, na których automat prosi o e-mail w wiadomości zamiast wysyłać link. */
  email_in_dm_platforms: z.array(z.enum(EMAIL_IN_DM_PLATFORMS)).max(2).default(["instagram"]),
  reply_ask_email_template: z.string().min(1).max(990).default(DEFAULT_TEMPLATES.reply_ask_email),
  reply_email_received_template: z
    .string()
    .min(1)
    .max(990)
    .default(DEFAULT_TEMPLATES.reply_email_received),
  published: z.boolean().default(false),
  /** Powiązane posty — zapis zastępuje całą listę. */
  posts: z.array(leadMagnetPostSchema).max(30).default([]),
});

/** Reguły krzyżowe wspólne dla panelu i MCP (po scaleniu zmian z wierszem). */
export function leadMagnetCrossChecks(v: {
  match_any_post: boolean;
  trigger_keywords: string[];
  published: boolean;
  file_path?: string | null;
  file_url?: string | null;
  reply_private_template: string;
  reply_fallback_template: string;
  email_body: string;
}): string | null {
  if (v.match_any_post && v.trigger_keywords.length === 0) {
    return "Reagowanie pod każdym postem wymaga przynajmniej jednego hasła.";
  }
  if (v.published && !v.file_path && !v.file_url) {
    return "Opublikowany lead magnet musi mieć plik albo adres URL materiału.";
  }
  for (const t of [v.reply_private_template, v.reply_fallback_template, v.email_body]) {
    if (!t.includes("{link}")) {
      return "Szablon wiadomości prywatnej, odpowiedzi publicznej z linkiem i mail muszą zawierać {link}.";
    }
  }
  return null;
}

export const leadMagnetSchema = leadMagnetBaseSchema.superRefine((v, ctx) => {
  if (v.match_any_post && v.trigger_keywords.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["trigger_keywords"],
      message: "Reagowanie pod każdym postem wymaga przynajmniej jednego hasła.",
    });
  }
  if (v.published && !v.file_path && !v.file_url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["file_url"],
      message: "Opublikowany lead magnet musi mieć plik albo adres URL materiału.",
    });
  }
  for (const t of [v.reply_private_template, v.reply_fallback_template, v.email_body]) {
    if (!t.includes("{link}")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reply_private_template"],
        message:
          "Szablon wiadomości prywatnej, odpowiedzi publicznej z linkiem i mail muszą zawierać {link}.",
      });
      break;
    }
  }
});

export type LeadMagnetInput = z.infer<typeof leadMagnetSchema>;

/** Wiersz do zapisu w lead_magnets: bez id i postów, puste adresy jako null. */
export function leadMagnetRowFromInput(input: LeadMagnetInput) {
  const { id: _id, posts: _posts, ...rest } = input;
  return {
    ...rest,
    subheadline: rest.subheadline || null,
    cover_image_url: rest.cover_image_url || null,
    og_image_url: rest.og_image_url || null,
    meta_description: rest.meta_description || null,
    file_path: rest.file_path || null,
    file_url: rest.file_url || null,
    file_name: rest.file_name || null,
    file_size: rest.file_size ?? null,
    mime_type: rest.mime_type || null,
  };
}
