// Tworzenie posta: plan (bandyta + ograniczenia) → treść z modelu → strażnik
// prawdy (z jedną próbą naprawy) → grafika → zaplanowanie publikacji.
//
// Facebook idzie przez istniejącą kolejkę social_publish_queue (widać go
// w Studiu publikacji, można anulować jak każdy wpis), Instagram — post
// ze zdjęciem, którego kolejka nie obsługuje — publikuje tick agenta
// o zaplanowanej porze (publish.server.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildLiveFactsBlock } from "@/lib/agent-toolkit/live-facts";
import { logAgentAction, updateAgentAction } from "@/lib/agent-toolkit/store.server";
import { listDataSources } from "@/lib/agent-toolkit/capabilities.server";
import { hostAllowed } from "@/lib/agent-toolkit/capabilities";
import { SHORTS_QUESTIONS } from "@/lib/shorts-question-bank";
import {
  GROWTH_SYSTEM_PROMPT,
  buildCreateUserPrompt,
  buildRepairPrompt,
  normalizeDraft,
  openingOf,
} from "./brief";
import { IMAGE_COST_PLN, growthLlmJson } from "./llm.server";
import { planNextPost, type HistoryItem, type PostPlan } from "./strategy";
import { describeBlocking, guardContent, type GuardResult } from "./truth-guard";
import {
  getArms,
  getPlaybook,
  isReel,
  listItems,
  type GrowthItemPayload,
  type GrowthPlatform,
  type GrowthSettings,
} from "./state.server";

export interface CreateResult {
  itemId: string | null;
  stage: GrowthItemPayload["stage"] | "dry_run";
  costPln: number;
  plan: PostPlan;
  texts: { facebook: string; instagram: string };
  imageUrl: string | null;
  violations: GuardResult["violations"];
  error?: string;
}

const guardAudience = (plan: PostPlan) =>
  (plan.audience === "inwestor" ? "inwestor" : "klient") as "inwestor" | "klient";

function runGuards(plan: PostPlan, texts: { facebook: string; instagram: string }, now: Date) {
  const fb = guardContent({
    text: texts.facebook,
    audience: guardAudience(plan),
    platform: "facebook_post",
    date: now,
  });
  const ig = guardContent({
    text: texts.instagram,
    audience: guardAudience(plan),
    platform: "instagram",
    date: now,
  });
  return { fb, ig };
}

/** Nagłówki z dozwolonych źródeł RSS — tylko do filaru „informacja". */
async function newsHeadlines(): Promise<string[]> {
  const sources = (await listDataSources()).filter((s) => s.kind === "rss" && hostAllowed(s.url));
  const out: string[] = [];
  for (const s of sources.slice(0, 3)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(s.url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "FinanceYouGrowthAgent/1.0" },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const xml = await res.text();
      for (const m of xml.matchAll(
        /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g,
      )) {
        const title = m[1].replace(/\s+/g, " ").trim();
        if (title) out.push(title);
        if (out.length >= 8) break;
      }
    } catch {
      // źródło niedostępne — post powstanie bez nagłówków
    }
  }
  return out;
}

async function takenSlots(now: Date): Promise<string[]> {
  const items = await listItems({ stage: ["scheduled", "awaiting_approval"], limit: 50 });
  const fromItems = items.map((r) => String(r.payload?.plan?.slotIso ?? "")).filter(Boolean);
  const { data } = await supabaseAdmin
    .from("social_publish_queue")
    .select("scheduled_at")
    .in("status", ["pending", "processing"])
    .gte("scheduled_at", now.toISOString())
    .limit(50);
  return [
    ...fromItems,
    ...((data ?? []) as Array<{ scheduled_at: string }>).map((r) => r.scheduled_at),
  ];
}

async function generateImage(prompt: string): Promise<string | null> {
  if (!prompt) return null;
  try {
    const { generateStudioImage } = await import("@/lib/studio-ai.server");
    const r = await generateStudioImage(`${prompt}. No text, no letters, no logos.`, null);
    return r.image_url;
  } catch (e) {
    console.warn("[growth-agent] image failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Wstawia post FB do kolejki Studia publikacji (publikuje istniejący tick). */
export async function queueFacebookPost(item: {
  message: string;
  imageUrl: string | null;
  scheduledAt: string;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("social_publish_queue")
    .insert({
      platform: "facebook_post",
      title: "",
      message: item.message,
      image_url: item.imageUrl,
      scheduled_at: item.scheduledAt,
      created_by: null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`social_publish_queue: ${error.message}`);
  return data.id as string;
}

export async function createPost(opts: {
  settings: GrowthSettings;
  now?: Date;
  dryRun?: boolean;
  /** Wymuszenie odbiorcy (np. z MCP). */
  audience?: PostPlan["audience"];
}): Promise<CreateResult> {
  const now = opts.now ?? new Date();
  const [arms, playbook, recent, taken] = await Promise.all([
    getArms(),
    getPlaybook(),
    listItems({ limit: 60 }),
    takenSlots(now),
  ]);
  const posts = recent.filter((r) => !isReel(r.payload));
  const history: HistoryItem[] = posts
    .filter((r) => r.payload?.plan)
    .map((r) => ({
      audience: r.payload!.plan.audience,
      pillar: r.payload!.plan.pillar,
      hook: r.payload!.plan.hook,
      questionId: r.payload!.plan.question?.id ?? null,
      createdAt: r.created_at,
    }));
  let plan = planNextPost({
    arms,
    history,
    now,
    rng: Math.random,
    takenSlotsIso: taken,
    questionBank: SHORTS_QUESTIONS,
  });
  if (opts.audience && opts.audience !== plan.audience) plan = { ...plan, audience: opts.audience };

  const factsBlock = buildLiveFactsBlock(plan.audience === "inwestor" ? "inwestor" : "klient", now);
  const recentOpenings = posts
    .map((r) => openingOf(String(r.payload?.texts?.facebook ?? "")))
    .filter(Boolean)
    .slice(0, 8);
  const news = plan.pillar === "informacja" ? await newsHeadlines() : [];

  let costPln = 0;
  const first = await growthLlmJson({
    system: GROWTH_SYSTEM_PROMPT,
    user: buildCreateUserPrompt({
      plan,
      factsBlock,
      playbook,
      recentOpenings,
      newsHeadlines: news,
    }),
  });
  costPln += first.costPln;
  let draft = normalizeDraft(first.data);
  let guards = runGuards(plan, draft, now);

  if (!guards.fb.ok || !guards.ig.ok) {
    const problems = [describeBlocking(guards.fb), describeBlocking(guards.ig)]
      .filter(Boolean)
      .join("\n");
    const second = await growthLlmJson({
      system: GROWTH_SYSTEM_PROMPT,
      user: `${buildCreateUserPrompt({ plan, factsBlock, playbook, recentOpenings, newsHeadlines: news })}\n\n${buildRepairPrompt(draft, problems)}`,
      temperature: 0.4,
    });
    costPln += second.costPln;
    draft = normalizeDraft(second.data);
    guards = runGuards(plan, draft, now);
  }

  const texts = { facebook: guards.fb.text, instagram: guards.ig.text };
  const violations = [...guards.fb.violations, ...guards.ig.violations];
  const platforms: GrowthPlatform[] = opts.settings.platforms.filter((p) =>
    p === "facebook" ? guards.fb.ok : guards.ig.ok,
  );

  const base: Omit<GrowthItemPayload, "stage"> = {
    plan,
    texts,
    summary: draft.summary,
    imagePrompt: draft.imagePrompt,
    imageUrl: null,
    altText: draft.altText,
    guard: { facebook: guards.fb.violations, instagram: guards.ig.violations },
    platforms,
  };

  if (platforms.length === 0) {
    const itemId = opts.dryRun
      ? null
      : await logAgentAction({
          module: "growth_agent",
          action: "item",
          status: "blocked",
          summary: `Strażnik prawdy zablokował post (${plan.audience}/${plan.pillar}): ${violations
            .filter((v) => v.severity === "block")
            .map((v) => v.code)
            .join(", ")}`,
          payload: { ...base, stage: "blocked" },
          costPln,
        });
    return { itemId, stage: "blocked", costPln, plan, texts, imageUrl: null, violations };
  }

  if (opts.dryRun)
    return { itemId: null, stage: "dry_run", costPln, plan, texts, imageUrl: null, violations };

  const imageUrl = await generateImage(draft.imagePrompt);
  if (imageUrl) costPln += IMAGE_COST_PLN;
  // Instagram bez grafiki nie opublikuje posta.
  const finalPlatforms = platforms.filter((p) => p !== "instagram" || imageUrl);
  const payload: GrowthItemPayload = {
    ...base,
    imageUrl,
    platforms: finalPlatforms,
    stage: opts.settings.mode === "draft" ? "awaiting_approval" : "scheduled",
  };
  const itemId = await logAgentAction({
    module: "growth_agent",
    action: "item",
    status: "ok",
    summary:
      `${payload.stage === "scheduled" ? "Zaplanowano" : "Szkic do akceptacji"}: ${draft.summary || openingOf(texts.facebook)}`.slice(
        0,
        480,
      ),
    payload: payload as unknown as Record<string, unknown>,
    costPln,
  });
  if (itemId && payload.stage === "scheduled") await scheduleItem(itemId, payload, now);
  return { itemId, stage: payload.stage, costPln, plan, texts, imageUrl, violations };
}

/**
 * Planowanie publikacji: FB do kolejki, IG czeka na tick. Termin z przeszłości
 * (np. szkic zaakceptowany po czasie) przesuwamy na „za 15 minut".
 */
export async function scheduleItem(
  itemId: string,
  payload: GrowthItemPayload,
  now = new Date(),
): Promise<GrowthItemPayload> {
  const minIso = new Date(now.getTime() + 15 * 60_000).toISOString();
  const slotIso = payload.plan.slotIso < minIso ? minIso : payload.plan.slotIso;
  const next: GrowthItemPayload = {
    ...payload,
    stage: "scheduled",
    plan: { ...payload.plan, slotIso },
  };
  if (next.platforms.includes("facebook") && !next.fb?.queueId) {
    try {
      const queueId = await queueFacebookPost({
        message: next.texts.facebook,
        imageUrl: next.imageUrl,
        scheduledAt: slotIso,
      });
      next.fb = { queueId, postId: null, error: null };
    } catch (e) {
      next.fb = { queueId: null, postId: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
  await updateAgentAction(itemId, { payload: next as unknown as Record<string, unknown> });
  return next;
}
