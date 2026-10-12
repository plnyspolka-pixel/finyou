// Pomiar wyników i uczenie: po 48 h od publikacji agent pobiera metryki
// z Meta, liczy zaangażowanie (scoring.ts), zamienia je na nagrodę względem
// mediany konta i aktualizuje bandytę (strategy.ts). Pierwsze uruchomienie
// robi „ciepły start" z dotychczasowych postów profilu, żeby agent nie
// zaczynał od zera.
import { getAgentState, setAgentState, updateAgentAction } from "@/lib/agent-toolkit/store.server";
import { engagementScore, median, rewardFromScore, type PostMetrics } from "./scoring";
import { reelScore, reelSlotForDate } from "./reel-plan";
import { reelMetrics, reelScoreFromMetrics } from "./reel.server";
import { classifyContent, slotForDate, updateArms, type ArmTable, type Features } from "./strategy";
import { getArms, isReel, listItems, saveArms, type GrowthItemPayload } from "./state.server";

const MEASURE_AFTER_H = 48;
const BASELINE_KEEP = 60;

const val = (rows: any[], name: string): number | null => {
  const r = rows.find((x) => x?.name === name);
  const v = r?.values?.[0]?.value ?? r?.total_value?.value;
  return typeof v === "number" ? v : null;
};

export async function facebookMetrics(postId: string): Promise<PostMetrics> {
  const m = await import("@/lib/meta-api.server");
  const post = await m.getPost(postId);
  const insights = await m
    .getPostInsights(postId, "post_total_media_view_unique,post_media_view,post_clicks")
    .catch(() => [] as any[]);
  return {
    likes: post?.likes?.summary?.total_count ?? null,
    comments: post?.comments?.summary?.total_count ?? null,
    shares: post?.shares?.count ?? null,
    reach: val(insights, "post_total_media_view_unique"),
    views: val(insights, "post_media_view"),
    clicks: val(insights, "post_clicks"),
  };
}

export async function instagramMetrics(mediaId: string): Promise<PostMetrics> {
  const m = await import("@/lib/meta-api.server");
  const insights = await m
    .getIgMediaInsights(mediaId, "reach,likes,comments,shares,saved")
    .catch(() => [] as any[]);
  if (insights.length) {
    return {
      reach: val(insights, "reach"),
      likes: val(insights, "likes"),
      comments: val(insights, "comments"),
      shares: val(insights, "shares"),
      saves: val(insights, "saved"),
    };
  }
  const media = await m.getIgMedia(mediaId);
  return { likes: media?.like_count ?? null, comments: media?.comments_count ?? null };
}

type Fmt = "post" | "reel";
const baselineKey = (f: Fmt) =>
  f === "reel" ? "growth_baseline_scores_reel" : "growth_baseline_scores";

async function baselineScores(f: Fmt = "post"): Promise<number[]> {
  return getAgentState<number[]>(baselineKey(f), []);
}

async function pushBaseline(scores: number[], f: Fmt = "post"): Promise<void> {
  const current = await baselineScores(f);
  await setAgentState(
    baselineKey(f),
    [...current, ...scores].slice(-BASELINE_KEEP),
    `wyniki bazowe (${f})`,
  );
}

/**
 * Pomiar treści opublikowanych ≥ 48 h temu, aktualizacja bandyty. Posty
 * i rolki mają osobne miary (rolka liczy też zasięg), osobne mediany
 * i osobne tabele bandyty.
 */
export async function measurePublished(now = new Date()): Promise<string[]> {
  const rows = await listItems({ stage: "published", limit: 30 });
  const due = rows.filter((r) => {
    const at = (r.payload as any)?.publishedAt as string | undefined;
    return at && now.getTime() - new Date(at).getTime() >= MEASURE_AFTER_H * 3600_000;
  });
  if (due.length === 0) return [];

  const arms: Record<Fmt, ArmTable> = { post: await getArms("post"), reel: await getArms("reel") };
  const base: Record<Fmt, number[]> = {
    post: await baselineScores("post"),
    reel: await baselineScores("reel"),
  };
  const fresh: Record<Fmt, number[]> = { post: [], reel: [] };
  const out: string[] = [];
  for (const r of due.slice(0, 10)) {
    const p = r.payload as unknown as GrowthItemPayload;
    const fmt: Fmt = isReel(p) ? "reel" : "post";
    let metrics: Record<string, PostMetrics> = {};
    try {
      if (fmt === "reel") {
        metrics = await reelMetrics(p);
        if (Object.keys(metrics).length === 0) throw new Error("brak metryk z platform");
      } else {
        if (p.fb?.postId) metrics.facebook = await facebookMetrics(p.fb.postId);
        if (p.ig?.mediaId) metrics.instagram = await instagramMetrics(p.ig.mediaId);
      }
    } catch (e) {
      const attempts = (p.measureAttempts ?? 0) + 1;
      const giveUp = attempts >= 3;
      await updateAgentAction(r.id, {
        payload: {
          ...p,
          measureAttempts: attempts,
          ...(giveUp ? { stage: "measured", score: null, measuredAt: now.toISOString() } : {}),
        } as unknown as Record<string, unknown>,
      });
      out.push(`${r.id.slice(0, 8)}:pomiar nieudany (${attempts}/3)`);
      continue;
    }
    const score =
      fmt === "reel"
        ? reelScoreFromMetrics(metrics)
        : (() => {
            const scores = Object.values(metrics).map(engagementScore);
            return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
          })();
    const reward = rewardFromScore(score, median([...base[fmt], ...fresh[fmt]]));
    const f: Features = {
      audience: p.plan.audience,
      pillar: p.plan.pillar,
      hook: p.plan.hook,
      slot: p.plan.slot,
    };
    arms[fmt] = updateArms(arms[fmt], f, reward);
    fresh[fmt].push(score);
    await updateAgentAction(r.id, {
      payload: {
        ...p,
        stage: "measured",
        metrics,
        score,
        reward,
        measuredAt: now.toISOString(),
      } as unknown as Record<string, unknown>,
    });
    out.push(`${r.id.slice(0, 8)}:${fmt} wynik ${score.toFixed(3)} nagroda ${reward.toFixed(2)}`);
  }
  for (const fmt of ["post", "reel"] as Fmt[]) {
    if (fresh[fmt].length) {
      await saveArms(arms[fmt], fmt);
      await pushBaseline(fresh[fmt], fmt);
    }
  }
  return out;
}

/**
 * Ciepły start (raz): dotychczasowe posty FB i IG → cechy (klasyfikacja
 * treści) + wynik → bandyta i mediana bazowa. Bez tego pierwsze tygodnie
 * agent losowałby na ślepo.
 */
export async function warmStart(): Promise<string> {
  const done = await getAgentState<boolean>("growth_warm_started", false);
  if (done) return "pominięto (już wykonany)";
  const m = await import("@/lib/meta-api.server");
  const samples: Array<{ f: Features; score: number }> = [];
  const fbPosts = await m.listPagePosts({ limit: 30 }).catch(() => [] as any[]);
  for (const post of fbPosts) {
    const text = String(post?.message ?? "");
    if (!text) continue;
    const insights = await m
      .getPostInsights(post.id, "post_total_media_view_unique")
      .catch(() => [] as any[]);
    const score = engagementScore({
      likes: post?.likes?.summary?.total_count,
      comments: post?.comments?.summary?.total_count,
      shares: post?.shares?.count,
      reach: val(insights, "post_total_media_view_unique"),
    });
    samples.push({ f: { ...classifyContent(text), slot: slotForDate(post.created_time) }, score });
  }
  const igMedia = await m.listIgMedia({ limit: 30 }).catch(() => [] as any[]);
  for (const media of igMedia) {
    const text = String(media?.caption ?? "");
    if (!text) continue;
    const insights = await m.getIgMediaInsights(media.id, "reach").catch(() => [] as any[]);
    const score = engagementScore({
      likes: media?.like_count,
      comments: media?.comments_count,
      reach: val(insights, "reach"),
    });
    samples.push({ f: { ...classifyContent(text), slot: slotForDate(media.timestamp) }, score });
  }
  const med = median(samples.map((s) => s.score));
  let arms = await getArms();
  for (const s of samples) arms = updateArms(arms, s.f, rewardFromScore(s.score, med));
  if (samples.length) {
    await saveArms(arms);
    await pushBaseline(samples.map((s) => s.score));
  }
  await setAgentState(
    "growth_warm_started",
    true,
    `ciepły start: ${samples.length} postów, mediana ${med.toFixed(4)}`,
  );
  return `ciepły start: ${samples.length} postów (FB ${fbPosts.length}, IG ${igMedia.length}), mediana ${med.toFixed(4)}`;
}

/**
 * Ciepły start rolek (raz): dotychczasowe rolki z Instagrama → cechy
 * + wynik (zaangażowanie i zasięg) → bandyta rolek i mediana bazowa.
 */
export async function warmStartReels(): Promise<string> {
  const done = await getAgentState<boolean>("growth_warm_started_reel", false);
  if (done) return "pominięto (już wykonany)";
  const m = await import("@/lib/meta-api.server");
  const media = await m.listIgMedia({ limit: 40 }).catch(() => [] as any[]);
  const samples: Array<{ f: Features; score: number }> = [];
  for (const item of media) {
    if (item?.media_product_type !== "REELS") continue;
    const text = String(item?.caption ?? "");
    if (!text) continue;
    const ins = await m
      .getIgMediaInsights(item.id, "views,reach,likes,comments,shares,saved")
      .catch(() => [] as any[]);
    const score = reelScore({
      views: val(ins, "views"),
      reach: val(ins, "reach"),
      likes: val(ins, "likes") ?? item?.like_count,
      comments: val(ins, "comments") ?? item?.comments_count,
      shares: val(ins, "shares"),
      saves: val(ins, "saved"),
    });
    samples.push({ f: { ...classifyContent(text), slot: reelSlotForDate(item.timestamp) }, score });
  }
  const med = median(samples.map((x) => x.score));
  let arms = await getArms("reel");
  for (const x of samples) arms = updateArms(arms, x.f, rewardFromScore(x.score, med));
  if (samples.length) {
    await saveArms(arms, "reel");
    await pushBaseline(
      samples.map((x) => x.score),
      "reel",
    );
  }
  await setAgentState(
    "growth_warm_started_reel",
    true,
    `ciepły start rolek: ${samples.length}, mediana ${med.toFixed(4)}`,
  );
  return `ciepły start rolek: ${samples.length} rolek z Instagrama, mediana ${med.toFixed(4)}`;
}
