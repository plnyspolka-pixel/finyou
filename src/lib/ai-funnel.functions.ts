import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as publicClient } from "@/integrations/supabase/client";

export const trackFunnelEvent = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        session_id: z.string().min(8).max(80),
        landing_id: z.string().uuid().optional().nullable(),
        step: z.string().min(1).max(80),
        step_order: z.number().int().min(0).max(50).default(0),
        event_type: z
          .enum([
            "pageview",
            "click",
            "form_start",
            "form_submit",
            "scroll",
            "conversion",
            "purchase",
          ])
          .default("pageview"),
        value: z.number().min(0).max(10_000_000).optional().nullable(),
        source: z.string().max(80).optional().nullable(),
        medium: z.string().max(80).optional().nullable(),
        campaign: z.string().max(120).optional().nullable(),
        referrer: z.string().max(500).optional().nullable(),
        country: z.string().max(8).optional().nullable(),
        device: z.enum(["mobile", "tablet", "desktop"]).optional().nullable(),
        metadata: z.record(z.string(), z.any()).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { error } = await publicClient.from("ai_funnel_events").insert({
      session_id: data.session_id,
      landing_id: data.landing_id ?? null,
      step: data.step,
      step_order: data.step_order,
      event_type: data.event_type,
      value: data.value ?? null,
      source: data.source ?? null,
      medium: data.medium ?? null,
      campaign: data.campaign ?? null,
      referrer: data.referrer ?? null,
      country: data.country ?? null,
      device: data.device ?? null,
      metadata: data.metadata ?? {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFunnelStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        landing_id: z.string().uuid().optional().nullable(),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = new Date(Date.now() - data.days * 86400_000).toISOString();
    let q = supabase.from("ai_funnel_events").select("*").gte("created_at", from).limit(50000);
    if (data.landing_id) q = q.eq("landing_id", data.landing_id);
    const { data: events, error } = await q;
    if (error) throw new Error(error.message);

    const evs = events ?? [];
    // Aggregate by step+order
    const stepMap = new Map<
      string,
      { step: string; order: number; sessions: Set<string>; total: number; value: number }
    >();
    for (const e of evs) {
      const key = `${e.step_order}::${e.step}`;
      const cur = stepMap.get(key) ?? {
        step: e.step,
        order: e.step_order,
        sessions: new Set(),
        total: 0,
        value: 0,
      };
      cur.sessions.add(e.session_id);
      cur.total++;
      cur.value += Number(e.value ?? 0);
      stepMap.set(key, cur);
    }
    const steps = Array.from(stepMap.values())
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        step: s.step,
        order: s.order,
        unique_sessions: s.sessions.size,
        total_events: s.total,
        value: s.value,
      }));

    // Drop-off rates relative to first step
    const firstCount = steps[0]?.unique_sessions ?? 0;
    const stepsWithRates = steps.map((s, i) => ({
      ...s,
      conversion_rate: firstCount ? +((s.unique_sessions / firstCount) * 100).toFixed(2) : 0,
      drop_off_rate:
        i > 0 && steps[i - 1].unique_sessions
          ? +((1 - s.unique_sessions / steps[i - 1].unique_sessions) * 100).toFixed(2)
          : 0,
    }));

    // Source attribution (first-touch per session)
    const sessionFirstTouch = new Map<
      string,
      { source: string; medium: string; campaign: string }
    >();
    const sortedEvs = [...evs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    for (const e of sortedEvs) {
      if (!sessionFirstTouch.has(e.session_id)) {
        sessionFirstTouch.set(e.session_id, {
          source: e.source ?? "(direct)",
          medium: e.medium ?? "(none)",
          campaign: e.campaign ?? "(none)",
        });
      }
    }
    const sourceMap = new Map<
      string,
      { source: string; medium: string; sessions: number; conversions: number; revenue: number }
    >();
    for (const [sid, attr] of sessionFirstTouch) {
      const key = `${attr.source}/${attr.medium}`;
      const cur = sourceMap.get(key) ?? {
        source: attr.source,
        medium: attr.medium,
        sessions: 0,
        conversions: 0,
        revenue: 0,
      };
      cur.sessions++;
      const sessEvs = evs.filter((e) => e.session_id === sid);
      const conv = sessEvs.find(
        (e) => e.event_type === "conversion" || e.event_type === "purchase",
      );
      if (conv) {
        cur.conversions++;
        cur.revenue += Number(conv.value ?? 0);
      }
      sourceMap.set(key, cur);
    }
    const sources = Array.from(sourceMap.values())
      .sort((a, b) => b.sessions - a.sessions)
      .map((s) => ({
        ...s,
        conversion_rate: s.sessions ? +((s.conversions / s.sessions) * 100).toFixed(2) : 0,
      }));

    // Device split
    const deviceMap = new Map<string, number>();
    const sessionDevice = new Map<string, string>();
    for (const e of sortedEvs) {
      if (!sessionDevice.has(e.session_id) && e.device) sessionDevice.set(e.session_id, e.device);
    }
    for (const d of sessionDevice.values()) deviceMap.set(d, (deviceMap.get(d) ?? 0) + 1);
    const devices = Array.from(deviceMap.entries()).map(([device, sessions]) => ({
      device,
      sessions,
    }));

    const totalSessions = sessionFirstTouch.size;
    const totalConversions = sources.reduce((s, x) => s + x.conversions, 0);
    const totalRevenue = sources.reduce((s, x) => s + x.revenue, 0);

    return {
      steps: stepsWithRates,
      sources,
      devices,
      totals: {
        sessions: totalSessions,
        conversions: totalConversions,
        revenue: totalRevenue,
        conversion_rate: totalSessions ? +((totalConversions / totalSessions) * 100).toFixed(2) : 0,
      },
      period_from: from,
      period_to: new Date().toISOString(),
    };
  });

export const generateFunnelInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        landing_id: z.string().uuid().optional().nullable(),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Brak LOVABLE_API_KEY.");

    // Reuse stats logic inline
    const from = new Date(Date.now() - data.days * 86400_000).toISOString();
    let q = supabase.from("ai_funnel_events").select("*").gte("created_at", from).limit(50000);
    if (data.landing_id) q = q.eq("landing_id", data.landing_id);
    const { data: events } = await q;
    const evs = events ?? [];
    if (evs.length < 5) throw new Error("Za mało danych do analizy (minimum 5 zdarzeń).");

    // Build compact summary for AI
    const stepMap = new Map<string, { step: string; order: number; sessions: Set<string> }>();
    for (const e of evs) {
      const key = `${e.step_order}::${e.step}`;
      const cur = stepMap.get(key) ?? { step: e.step, order: e.step_order, sessions: new Set() };
      cur.sessions.add(e.session_id);
      stepMap.set(key, cur);
    }
    const steps = Array.from(stepMap.values())
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ step: s.step, order: s.order, sessions: s.sessions.size }));

    const sourceCounts: Record<string, number> = {};
    for (const e of evs) {
      const k = `${e.source ?? "(direct)"}/${e.medium ?? "(none)"}`;
      sourceCounts[k] = (sourceCounts[k] ?? 0) + 1;
    }

    const prompt = `Jesteś ekspertem od optymalizacji konwersji (CRO) i analityki marketingowej.
Przeanalizuj dane lejka konwersji z ostatnich ${data.days} dni i wskaż konkretne wąskie gardła oraz rekomendacje.

ETAPY LEJKA (unique sessions):
${steps.map((s) => `${s.order}. ${s.step}: ${s.sessions}`).join("\n")}

ŹRÓDŁA RUCHU (events):
${Object.entries(sourceCounts)
  .slice(0, 15)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}

Wygeneruj JSON:
{
  "summary": "2-3 zdania o stanie lejka",
  "bottlenecks": [{ "step": "...", "drop_off_pct": 45, "diagnosis": "..." }],
  "recommendations": [{ "title": "...", "action": "...", "expected_impact": "wysoki|średni|niski" }]
}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Zwracasz wyłącznie poprawny JSON, bez markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Limit AI osiągnięty. Spróbuj za chwilę.");
      if (res.status === 402) throw new Error("Brak kredytów AI.");
      throw new Error(`AI error ${res.status}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content, bottlenecks: [], recommendations: [] };
    }

    const { data: insight, error } = await supabase
      .from("ai_funnel_insights")
      .insert({
        user_id: userId,
        landing_id: data.landing_id ?? null,
        period_from: from,
        period_to: new Date().toISOString(),
        summary: String(parsed.summary ?? "").slice(0, 4000),
        bottlenecks: Array.isArray(parsed.bottlenecks) ? parsed.bottlenecks : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        metrics: { steps, source_counts: sourceCounts },
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { insight };
  });
