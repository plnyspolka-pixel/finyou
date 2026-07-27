import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------- Subscribers ----------------

export const listSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_subscribers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return { subscribers: data ?? [] };
  });

export const addSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email(),
        first_name: z.string().max(120).optional(),
        last_name: z.string().max(120).optional(),
        tags: z.array(z.string().min(1).max(60)).max(20).default([]),
        source: z.string().max(60).default("manual"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_subscribers").upsert(
      {
        email: data.email.toLowerCase().trim(),
        first_name: data.first_name ?? null,
        last_name: data.last_name ?? null,
        tags: data.tags,
        source: data.source,
      },
      { onConflict: "email" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        first_name: z.string().max(120).nullable().optional(),
        last_name: z.string().max(120).nullable().optional(),
        tags: z.array(z.string().min(1).max(60)).max(20).optional(),
        status: z.enum(["active", "unsubscribed", "bounced"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("email_subscribers").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_subscribers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importSubscribersFromLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: leads, error } = await context.supabase
      .from("meta_leads")
      .select("id, email, full_name, received_at")
      .not("email", "is", null)
      .limit(5000);
    if (error) throw new Error(error.message);

    const rows = (leads ?? [])
      .filter((l) => l.email)
      .map((l) => {
        const parts = (l.full_name ?? "").trim().split(/\s+/);
        return {
          email: String(l.email).toLowerCase().trim(),
          first_name: parts[0] ?? null,
          last_name: parts.slice(1).join(" ") || null,
          source: "lead",
          source_id: l.id,
          tags: ["lead"],
        };
      });

    if (!rows.length) return { imported: 0 };

    const { error: upErr } = await context.supabase
      .from("email_subscribers")
      .upsert(rows, { onConflict: "email", ignoreDuplicates: true });
    if (upErr) throw new Error(upErr.message);
    return { imported: rows.length };
  });

// ---------------- Segments ----------------

export const listSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_segments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { segments: data ?? [] };
  });

export const saveSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        filters: z
          .object({
            tags: z.array(z.string()).optional(),
            sources: z.array(z.string()).optional(),
            status: z.array(z.string()).optional(),
            createdFrom: z.string().optional(),
            createdTo: z.string().optional(),
          })
          .default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { resolveSegmentRecipients } = await import("./email-marketing.server");
    const recipients = await resolveSegmentRecipients(data.filters);
    const row = {
      name: data.name,
      description: data.description ?? null,
      filters: data.filters,
      subscriber_count: recipients.length,
    };
    if (data.id) {
      const { error } = await context.supabase.from("email_segments").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id, count: recipients.length };
    }
    const { data: ins, error } = await context.supabase
      .from("email_segments")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id, count: recipients.length };
  });

export const deleteSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_segments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Campaigns ----------------

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { campaigns: data ?? [] };
  });

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        subject: z.string().min(1).max(300),
        preview_text: z.string().max(300).optional(),
        from_name: z.string().min(1).max(120),
        from_email: z.string().email(),
        reply_to: z.string().email().optional().or(z.literal("")),
        html_body: z.string().min(1),
        text_body: z.string().optional(),
        segment_id: z.string().uuid().nullable().optional(),
        ai_brief: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = {
      name: data.name,
      subject: data.subject,
      preview_text: data.preview_text ?? null,
      from_name: data.from_name,
      from_email: data.from_email,
      reply_to: data.reply_to || null,
      html_body: data.html_body,
      text_body: data.text_body ?? null,
      segment_id: data.segment_id ?? null,
      ai_brief: data.ai_brief ?? null,
      audience_type: "segment",
      audience_filter: {},
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("email_campaigns")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("email_campaigns")
      .insert({ ...row, status: "szkic", created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateCampaignCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brief: z.string().min(10).max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const { generateEmailCopy } = await import("./email-marketing.server");
    return await generateEmailCopy(data.brief);
  });

export const sendCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ campaign_id: z.string().uuid(), test_email: z.string().email().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { resolveSegmentRecipients, sendViaResend } = await import("./email-marketing.server");

    const { data: campaign, error: cErr } = await context.supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", data.campaign_id)
      .single();
    if (cErr || !campaign) throw new Error(cErr?.message ?? "Brak kampanii");

    // Tryb testowy — 1 mail na podany adres
    if (data.test_email) {
      await sendViaResend({
        from: `${campaign.from_name} <${campaign.from_email}>`,
        to: data.test_email,
        subject: `[TEST] ${campaign.subject}`,
        html: campaign.html_body,
        reply_to: campaign.reply_to ?? undefined,
        tags: [
          { name: "campaign", value: data.campaign_id },
          { name: "mode", value: "test" },
        ],
      });
      return { sent: 1, mode: "test" };
    }

    // Audiencja: z segmentu lub wszyscy aktywni
    let recipients: Array<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
    }>;
    if (campaign.segment_id) {
      const { data: seg, error: sErr } = await context.supabase
        .from("email_segments")
        .select("filters")
        .eq("id", campaign.segment_id)
        .single();
      if (sErr || !seg) throw new Error("Segment nie istnieje");
      recipients = await resolveSegmentRecipients(seg.filters as any);
    } else {
      recipients = await resolveSegmentRecipients({});
    }

    if (!recipients.length) throw new Error("Brak odbiorców w segmencie");

    await context.supabase
      .from("email_campaigns")
      .update({
        status: "wysylanie",
        started_at: new Date().toISOString(),
        recipients_total: recipients.length,
      })
      .eq("id", data.campaign_id);

    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      try {
        const { id: resendId } = await sendViaResend({
          from: `${campaign.from_name} <${campaign.from_email}>`,
          to: r.email,
          subject: campaign.subject,
          html: campaign.html_body,
          reply_to: campaign.reply_to ?? undefined,
          tags: [{ name: "campaign", value: data.campaign_id }],
          headers: { "X-Campaign-Id": data.campaign_id, "X-Subscriber-Id": r.id },
        });
        await context.supabase.from("email_campaign_recipients").insert({
          campaign_id: data.campaign_id,
          recipient_email: r.email,
          recipient_name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
          subscriber_id: r.id,
          resend_id: resendId,
          status: "wyslane",
          sent_at: new Date().toISOString(),
        });
        sent++;
      } catch (e) {
        await context.supabase.from("email_campaign_recipients").insert({
          campaign_id: data.campaign_id,
          recipient_email: r.email,
          subscriber_id: r.id,
          status: "blad",
          error_message: e instanceof Error ? e.message : String(e),
        });
        failed++;
      }
      // mały throttle, żeby nie wyczerpać rate-limita
      await new Promise((res) => setTimeout(res, 60));
    }

    await context.supabase
      .from("email_campaigns")
      .update({
        status: "wyslane",
        finished_at: new Date().toISOString(),
        sent_count: sent,
        failed_count: failed,
      })
      .eq("id", data.campaign_id);

    return { sent, failed, total: recipients.length };
  });

export const getCampaignStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("email_campaign_recipients")
      .select("status, opened_at, clicked_at, bounced_at, delivered_at")
      .eq("campaign_id", data.campaign_id);
    if (error) throw new Error(error.message);
    const total = rows?.length ?? 0;
    const sent = rows?.filter((r: any) => r.status === "wyslane").length ?? 0;
    const opened = rows?.filter((r: any) => r.opened_at).length ?? 0;
    const clicked = rows?.filter((r: any) => r.clicked_at).length ?? 0;
    const bounced = rows?.filter((r: any) => r.bounced_at).length ?? 0;
    const delivered = rows?.filter((r: any) => r.delivered_at).length ?? 0;
    return {
      total,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      openRate: sent ? (opened / sent) * 100 : 0,
      clickRate: sent ? (clicked / sent) * 100 : 0,
    };
  });
