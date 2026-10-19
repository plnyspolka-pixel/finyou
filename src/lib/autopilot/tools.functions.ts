// Publiczne server functions narzędzi-lead-magnetów (/narzedzie/<slug>).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicToolFn = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ slug: z.string().min(1).max(80), token: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getPublicTool, verifyToolToken } = await import("./tools.server");
    const tool = await getPublicTool(data.slug);
    if (!tool) return { tool: null, unlocked: false };
    const unlocked = data.token ? await verifyToolToken(data.slug, data.token) : false;
    return { tool, unlocked };
  });

export const submitToolSignupFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        email: z.string().trim().email().max(255),
        first_name: z.string().trim().max(80).optional(),
        consent: z.literal(true, { errorMap: () => ({ message: "Zaznacz zgodę." }) }),
        /** Pułapka na boty. */
        website: z.string().max(200).optional(),
        values: z.record(z.string().max(40), z.union([z.number(), z.string().max(40)])),
        utm: z
          .object({
            source: z.string().max(200).optional(),
            medium: z.string().max(200).optional(),
            campaign: z.string().max(200).optional(),
            term: z.string().max(200).optional(),
            content: z.string().max(200).optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.website) return { ok: true as const, emailSent: false, unlocked: false };
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const ua = getRequestHeader("user-agent") || null;
    const { submitToolSignup } = await import("./tools.server");
    const res = await submitToolSignup({
      slug: data.slug,
      email: data.email,
      firstName: data.first_name ?? null,
      values: data.values,
      utm: data.utm ?? null,
      ip,
      userAgent: ua,
    });
    return { ok: true as const, emailSent: res.emailSent, unlocked: true };
  });
