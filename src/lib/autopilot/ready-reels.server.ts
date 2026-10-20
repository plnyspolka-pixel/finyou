// Etap 0 briefu: gotowe rolki Studia (status `ready`, jeszcze nie
// opublikowane) → pełna bramka compliance → wolne sloty toru w kolejkach.
// Działa wyłącznie w `full_autopilot` bez wyłącznika awaryjnego; woła go
// tick autopilota. Każda decyzja ląduje w dzienniku (module = autopilot).
//
// Scenariusza gotowego wideo nie da się przepisać bez nowego renderu, więc
// bramka scenariusza działa bez autora poprawek: naruszenie = odrzucenie
// rolki (compliance_status = 'rejected'), temat wraca do banku. Tytuł i opis
// mogą zostać przepisane.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueuePublication } from "@/lib/studio-enqueue.server";
import type { StudioPlatform } from "@/lib/studio-platforms";
import { llmGateDeps, runComplianceGate } from "./compliance-gate.server";
import { COMPLIANCE_RULES_VERSION } from "./compliance-rules";
import { evaluateGuards } from "./safety";
import { nextFreeSlot } from "./slots";
import { loadAutopilotConfig, loadUsage, logAutopilot } from "./state.server";
import type { PublishPlatform, Track } from "./types";

const db = supabaseAdmin as unknown as { from: (t: string) => any };

/** Platformy wideo planowane automatycznie (TikTok czeka na audyt, X wyłączony). */
const AUTO_PLATFORMS: PublishPlatform[] = ["instagram_reels", "facebook_reels", "youtube"];
const JOBS_PER_TICK = 2;
/** Szacunek kosztu bramki (recenzent + ewentualne poprawki) na rolkę. */
const GATE_COST_PLN = 0.3;

type ReadyJob = {
  id: string;
  script: string | null;
  prompt: string;
  publish_title: string | null;
  publish_description: string | null;
  video_url: string;
  material_audience: string | null;
  track: string | null;
  series: string | null;
  created_by: string | null;
  compliance_status: string | null;
};

function trackOf(job: ReadyJob): Track | null {
  if (job.track === "pozyczkobiorca" || job.track === "inwestor") return job.track;
  if (job.material_audience === "inwestor") return "inwestor";
  if (job.material_audience === "klient") return "pozyczkobiorca";
  return null;
}

/** Gate scenariusza bez autora poprawek: wyjątek z rewrite = odrzucenie. */
const NO_REWRITE = {
  review: llmGateDeps.review,
  rewrite: async () => {
    throw new Error("Wideo jest już wyrenderowane — scenariusza nie da się przepisać.");
  },
};

async function takenSlots(platform: PublishPlatform, since: Date): Promise<Date[]> {
  const q =
    platform === "youtube"
      ? db
          .from("youtube_publish_queue")
          .select("scheduled_at")
          .in("status", ["pending", "uploading", "published"])
      : db
          .from("social_publish_queue")
          .select("scheduled_at")
          .eq("platform", platform)
          .in("status", ["pending", "processing", "publishing", "published"]);
  const { data } = await q.gte("scheduled_at", since.toISOString()).limit(500);
  return ((data ?? []) as { scheduled_at: string }[]).map((r) => new Date(r.scheduled_at));
}

async function markJob(id: string, patch: Record<string, unknown>) {
  await db.from("studio_video_jobs").update(patch).eq("id", id);
}

export async function scheduleReadyReels(now = new Date()): Promise<{
  scheduled: number;
  rejected: number;
  skipped: string | null;
}> {
  const cfg = await loadAutopilotConfig();
  if (cfg.state.mode !== "full_autopilot" || cfg.state.paused) {
    return { scheduled: 0, rejected: 0, skipped: cfg.state.paused ? "paused" : cfg.state.mode };
  }
  const usage = await loadUsage(now);
  const budget = evaluateGuards(cfg.state, cfg.limits, usage, {
    kind: "llm",
    estCostPln: GATE_COST_PLN,
  });
  if (!budget.allowed) return { scheduled: 0, rejected: 0, skipped: budget.reasons.join(" ") };

  const { data: jobs } = await db
    .from("studio_video_jobs")
    .select(
      "id,script,prompt,publish_title,publish_description,video_url,material_audience,track,series,created_by,compliance_status",
    )
    .eq("status", "ready")
    .not("video_url", "is", null)
    .is("auto_published_at", null)
    // Nowe rolki i te, które przeszły bramkę, ale czekały na wolny slot.
    .or("compliance_status.is.null,compliance_status.in.(passed,rewritten)")
    .order("created_at", { ascending: true })
    .limit(JOBS_PER_TICK);

  let scheduled = 0;
  let rejected = 0;
  for (const job of (jobs ?? []) as ReadyJob[]) {
    const track = trackOf(job);
    if (!track) {
      // Bez toru nie wiadomo, jakie reguły i sloty — rolka czeka na
      // przypisanie odbiorcy (material_audience) w panelu.
      await logAutopilot({
        action: "ready_reel_no_track",
        status: "warning",
        summary: `Rolka ${job.id} bez toru (material_audience) — pominięta.`,
        payload: { job_id: job.id },
      });
      continue;
    }
    const ref = { studio_job_id: job.id };
    const alreadyPassed =
      job.compliance_status === "passed" || job.compliance_status === "rewritten";
    let title = (job.publish_title || job.prompt).slice(0, 100);
    let description = job.publish_description || job.publish_title || job.prompt;
    let gateStatus: "passed" | "rewritten" = alreadyPassed
      ? (job.compliance_status as "passed" | "rewritten")
      : "passed";

    if (!alreadyPassed) {
      let scriptOk = false;
      let scriptReason = "";
      try {
        const g = await runComplianceGate(
          { text: job.script || job.prompt, ctx: { kind: "script", track }, ref },
          NO_REWRITE,
        );
        scriptOk = g.status !== "rejected";
        scriptReason = g.reason ?? "";
      } catch (e) {
        scriptReason = e instanceof Error ? e.message : String(e);
      }
      if (!scriptOk) {
        await markJob(job.id, {
          compliance_status: "rejected",
          compliance_rules_version: COMPLIANCE_RULES_VERSION,
          track,
          last_error:
            `Autopilot: scenariusz nie przeszedł bramki compliance — ${scriptReason}`.slice(
              0,
              1000,
            ),
        });
        await logAutopilot({
          action: "ready_reel_rejected",
          status: "blocked",
          summary: `Rolka ${job.id} odrzucona (scenariusz): ${scriptReason}`,
          payload: { job_id: job.id, track },
          costPln: GATE_COST_PLN,
        });
        rejected += 1;
        continue;
      }

      const titleGate = await runComplianceGate({
        text: (job.publish_title || job.prompt).slice(0, 100),
        ctx: { kind: "title", track },
        ref,
      }).catch((e) => ({ status: "rejected" as const, text: "", reason: String(e) }));
      const descGate = await runComplianceGate({
        text: job.publish_description || job.publish_title || job.prompt,
        ctx: { kind: "description", track },
        ref,
      }).catch((e) => ({ status: "rejected" as const, text: "", reason: String(e) }));
      if (titleGate.status === "rejected" || descGate.status === "rejected") {
        await markJob(job.id, {
          compliance_status: "rejected",
          compliance_rules_version: COMPLIANCE_RULES_VERSION,
          track,
          last_error:
            `Autopilot: tytuł/opis nie przeszły bramki compliance — ${titleGate.reason ?? descGate.reason ?? ""}`.slice(
              0,
              1000,
            ),
        });
        rejected += 1;
        continue;
      }
      title = titleGate.text;
      description = descGate.text;
      gateStatus =
        titleGate.status === "rewritten" || descGate.status === "rewritten"
          ? "rewritten"
          : "passed";
      // Treść po bramce zostaje na zadaniu — ponowna próba (brak slotu) nie
      // płaci drugi raz za recenzenta.
      await markJob(job.id, {
        compliance_status: gateStatus,
        compliance_rules_version: COMPLIANCE_RULES_VERSION,
        track,
        publish_title: title,
        publish_description: description,
      });
    }

    // Stempel chroni przed podwójnym zaplanowaniem (tick vs panel).
    const { data: stamped } = await db
      .from("studio_video_jobs")
      .update({ auto_published_at: now.toISOString() })
      .eq("id", job.id)
      .is("auto_published_at", null)
      .select("id");
    if (!stamped?.length) continue;

    const profile = cfg.profiles[track];
    const placed: { platform: string; at: string }[] = [];
    const errors: string[] = [];
    for (const platform of AUTO_PLATFORMS) {
      const taken = await takenSlots(platform, new Date(now.getTime() - 86_400_000));
      const at = nextFreeSlot({
        slots: profile.slots,
        platform,
        now,
        taken,
        maxPerDay: cfg.limits.maxPostsPerDayPerPlatform,
      });
      if (!at) continue;
      try {
        await enqueuePublication({
          platforms: [platform as StudioPlatform],
          title,
          message: description,
          video_url: job.video_url,
          privacy_status: "public",
          scheduled_at: at.toISOString(),
          userId: job.created_by as string,
          autopilot: {
            track,
            series: job.series,
            studio_job_id: job.id,
            idempotency_key: `autopilot:${job.id}`,
          },
        });
        placed.push({ platform, at: at.toISOString() });
      } catch (e) {
        errors.push(`${platform}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!placed.length) {
      // Brak wolnego slotu (limit na dobę) — rolka wraca w następnym ticku.
      await markJob(job.id, {
        auto_published_at: null,
        ...(errors.length ? { last_error: `Autopilot: ${errors.join("; ")}`.slice(0, 1000) } : {}),
      });
    } else if (errors.length) {
      await markJob(job.id, { last_error: `Autopilot: ${errors.join("; ")}`.slice(0, 1000) });
    }
    await logAutopilot({
      action: "ready_reel_scheduled",
      status: errors.length ? "warning" : "ok",
      summary: `Rolka „${title.slice(0, 60)}” (${track}, ${gateStatus}): ${
        placed.map((p) => `${p.platform} ${p.at}`).join(", ") || "brak wolnych slotów"
      }`,
      payload: { job_id: job.id, placed, errors },
      costPln: alreadyPassed ? 0 : GATE_COST_PLN,
    });
    if (placed.length) scheduled += 1;
  }
  return { scheduled, rejected, skipped: null };
}
