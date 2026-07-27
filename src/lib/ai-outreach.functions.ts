import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------------- Targets ---------------- */

export const addOutreachTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
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
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_outreach_targets")
      .insert({
        ...data,
        domain: data.domain.toLowerCase(),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { target: row };
  });

export const updateOutreachTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        contact_name: z.string().max(120).optional().nullable(),
        contact_email: z.string().email().optional().nullable().or(z.literal("")),
        niche: z.string().max(120).optional().nullable(),
        priority: z.number().int().min(0).max(100).optional(),
        status: z
          .enum(["new", "queued", "contacted", "responded", "won", "rejected", "blacklist"])
          .optional(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    if (patch.contact_email === "") (patch as any).contact_email = null;
    const { error } = await context.supabase.from("ai_outreach_targets").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOutreachTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_outreach_targets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- AI Discovery ---------------- */

export const discoverOutreachTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        niche: z.string().min(3).max(300),
        count: z.number().int().min(1).max(20).default(10),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("ai_growth_settings")
      .select("default_model, brand_name")
      .limit(1)
      .maybeSingle();
    const model = settings?.default_model ?? "google/gemini-2.5-flash";

    const system =
      "Jesteś specjalistą SEO/PR. Proponujesz realne polskie portale, blogi i serwisy " +
      "branżowe nadające się do outreachu (link building, gościnne wpisy, partnerstwo). " +
      "Zwracasz wyłącznie wywołanie funkcji propose_targets z konkretnymi domenami (bez https://).";

    const userMsg = `Marka: ${settings?.brand_name ?? "Finance You"}\nNisza/temat: ${data.niche}\nPotrzebuję ${data.count} propozycji.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "propose_targets",
          description: "Lista propozycji portali do outreachu",
          parameters: {
            type: "object",
            properties: {
              targets: {
                type: "array",
                maxItems: 20,
                items: {
                  type: "object",
                  properties: {
                    domain: { type: "string", description: "Domena bez protokołu, np. money.pl" },
                    niche: { type: "string" },
                    why: { type: "string", description: "Krótko dlaczego ten portal" },
                    priority: { type: "integer", minimum: 0, maximum: 100 },
                  },
                  required: ["domain", "why"],
                  additionalProperties: false,
                },
              },
            },
            required: ["targets"],
            additionalProperties: false,
          },
        },
      },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "propose_targets" } },
      }),
    });
    if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status}`);
    const json: any = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI nie zwróciło propozycji");
    const parsed = JSON.parse(call.function.arguments);
    const items = Array.isArray(parsed.targets) ? parsed.targets : [];

    let inserted = 0;
    const skipped: string[] = [];
    for (const t of items) {
      const domain = String(t.domain || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");
      if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
        skipped.push(domain);
        continue;
      }
      const { error } = await supabase.from("ai_outreach_targets").insert({
        domain,
        niche: t.niche ?? data.niche,
        priority: Math.max(0, Math.min(100, Number(t.priority ?? 50))),
        notes: t.why ?? null,
        source: "ai_discovery",
        created_by: userId,
      });
      if (!error) inserted++;
      else skipped.push(domain);
    }

    await supabase.from("ai_growth_action_log").insert({
      module: "outreach",
      action: "ai_discovery",
      status: "ok",
      summary: `AI zaproponowało ${items.length} portali (${inserted} dodanych)`,
      payload: { niche: data.niche, inserted, skipped },
      actor: userId,
    });

    return { proposed: items.length, inserted, skipped };
  });

/* ---------------- Message generation ---------------- */

export const generateOutreachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        target_id: z.string().uuid(),
        goal: z.string().min(3).max(500),
        angle: z.string().max(500).optional().default(""),
        step: z.number().int().min(1).max(5).default(1),
        parent_id: z.string().uuid().optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");
    const { supabase, userId } = context;

    const { data: target, error: tErr } = await supabase
      .from("ai_outreach_targets")
      .select("*")
      .eq("id", data.target_id)
      .maybeSingle();
    if (tErr || !target) throw new Error("Target nie istnieje");

    const { data: settings } = await supabase
      .from("ai_growth_settings")
      .select("default_model, brand_name, brand_description, primary_cta_url")
      .limit(1)
      .maybeSingle();
    const model = settings?.default_model ?? "google/gemini-2.5-flash";
    const brand = settings?.brand_name ?? "Finance You";

    let parentCtx = "";
    if (data.parent_id) {
      const { data: parent } = await supabase
        .from("ai_outreach_messages")
        .select("subject, body, reply_excerpt")
        .eq("id", data.parent_id)
        .maybeSingle();
      if (parent)
        parentCtx = `\nPoprzedni mail:\nSubject: ${parent.subject}\n${parent.body}\n${parent.reply_excerpt ? `Odpowiedź odbiorcy: ${parent.reply_excerpt}` : "(brak odpowiedzi — to follow-up)"}`;
    }

    const stepName =
      data.step === 1
        ? "pierwszy kontakt"
        : data.step === 2
          ? "follow-up #1 (przypomnienie)"
          : `follow-up #${data.step - 1}`;

    const system =
      `Jesteś specjalistą outreach/PR dla marki ${brand} (${settings?.brand_description ?? ""}). ` +
      "Piszesz krótkie, ludzkie, personalizowane maile (3-7 zdań). " +
      "Bez sztucznego entuzjazmu, bez clickbaitu, bez bloków marketingowych. " +
      "Zwracasz wyłącznie wywołanie funkcji write_outreach.";

    const userMsg = [
      `Cel maila: ${data.goal}`,
      `Etap: ${stepName}`,
      data.angle ? `Kąt komunikacji: ${data.angle}` : "",
      `Domena odbiorcy: ${target.domain}`,
      target.niche ? `Nisza: ${target.niche}` : "",
      target.contact_name ? `Imię odbiorcy: ${target.contact_name}` : "",
      target.notes ? `Notatki o portalu: ${target.notes}` : "",
      settings?.primary_cta_url
        ? `Link do podlinkowania (jeśli stosowne): ${settings.primary_cta_url}`
        : "",
      parentCtx,
    ]
      .filter(Boolean)
      .join("\n");

    const tools = [
      {
        type: "function",
        function: {
          name: "write_outreach",
          description: "Pisze subject + body maila outreachowego",
          parameters: {
            type: "object",
            properties: {
              subject: { type: "string", description: "max 70 znaków, bez emoji" },
              body: { type: "string", description: "3-7 zdań, podpis: zespół Finance You" },
            },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "write_outreach" } },
      }),
    });
    if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status}`);
    const json: any = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI nie zwróciło wiadomości");
    const parsed = JSON.parse(call.function.arguments);

    const { data: msg, error } = await supabase
      .from("ai_outreach_messages")
      .insert({
        target_id: data.target_id,
        parent_id: data.parent_id ?? null,
        step: data.step,
        subject: String(parsed.subject ?? "").slice(0, 200),
        body: String(parsed.body ?? ""),
        status: "draft",
        goal: data.goal,
        angle: data.angle || null,
        model,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("ai_growth_action_log").insert({
      module: "outreach",
      action: "ai_generate_message",
      status: "ok",
      summary: `Wygenerowano ${stepName} dla ${target.domain}`,
      payload: { target_id: data.target_id, message_id: msg.id },
      actor: userId,
    });

    return { message: msg };
  });

/* ---------------- Status updates ---------------- */

export const updateOutreachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        subject: z.string().max(200).optional(),
        body: z.string().max(20000).optional(),
        status: z.enum(["draft", "approved", "sent", "replied", "bounced"]).optional(),
        reply_excerpt: z.string().max(5000).optional().nullable(),
        mark_sent: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = {};
    if (data.subject !== undefined) patch.subject = data.subject;
    if (data.body !== undefined) patch.body = data.body;
    if (data.status !== undefined) patch.status = data.status;
    if (data.reply_excerpt !== undefined) patch.reply_excerpt = data.reply_excerpt;
    if (data.mark_sent) {
      patch.status = "sent";
      patch.sent_at = new Date().toISOString();
    }
    const { data: msg, error } = await supabase
      .from("ai_outreach_messages")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (data.mark_sent && msg) {
      await supabase
        .from("ai_outreach_targets")
        .update({ status: "contacted" })
        .eq("id", msg.target_id)
        .neq("status", "won")
        .neq("status", "rejected");
      await supabase.from("ai_growth_action_log").insert({
        module: "outreach",
        action: "mark_sent",
        status: "ok",
        summary: `Mail wysłany (step ${msg.step})`,
        payload: { message_id: msg.id, target_id: msg.target_id },
        actor: userId,
      });
    }
    return { ok: true };
  });

export const deleteOutreachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_outreach_messages")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
