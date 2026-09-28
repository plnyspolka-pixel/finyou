// Schemat landing page'a (zod) — wspólny dla server functions panelu
// (landing-pages.functions.ts) i narzędzi MCP (create/update_landing_page).
import { z } from "zod";

export const formFieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z_][a-z0-9_]*$/i),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "email", "tel", "textarea", "select"]),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string().max(120)).max(20).optional(),
});

export const sectionSchema = z.object({
  type: z.enum(["text", "features", "testimonial", "stats", "cta"]),
  title: z.string().max(200).optional(),
  content: z.string().max(5000).optional(),
  items: z
    .array(
      z.object({
        title: z.string().max(200).optional(),
        description: z.string().max(1000).optional(),
        label: z.string().max(120).optional(),
        value: z.string().max(120).optional(),
        icon: z.string().max(60).optional(),
      }),
    )
    .max(20)
    .optional(),
  author: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
});

export const landingSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "tylko małe litery, cyfry i myślniki"),
  title: z.string().min(1).max(200),
  headline: z.string().min(1).max(300),
  subheadline: z.string().max(500).optional(),
  cta_text: z.string().min(1).max(80).default("Zapisz się"),
  hero_image_url: z.string().url().optional().or(z.literal("")),
  og_image_url: z.string().url().optional().or(z.literal("")),
  meta_description: z.string().max(300).optional(),
  sections: z.array(sectionSchema).max(30).default([]),
  form_fields: z.array(formFieldSchema).min(1).max(15),
  thank_you_message: z.string().min(1).max(500),
  redirect_url: z.string().url().optional().or(z.literal("")),
  theme: z
    .object({
      primary: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#0ea5e9"),
      background: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#ffffff"),
    })
    .default({ primary: "#0ea5e9", background: "#ffffff" }),
  published: z.boolean().default(false),
});

export type LandingInput = z.infer<typeof landingSchema>;

/** Wiersz do zapisu: puste URL-e jako null (jak w panelu). */
export function landingRowFromInput(input: Omit<LandingInput, "id">) {
  return {
    ...input,
    hero_image_url: input.hero_image_url || null,
    og_image_url: input.og_image_url || null,
    redirect_url: input.redirect_url || null,
  };
}
