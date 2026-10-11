// Domykanie publikacji zaplanowanych postów agenta wzrostu:
//   • Facebook — publikuje tick Studia (social_publish_queue); tu tylko
//     odczytujemy wynik (external_post_id albo błąd),
//   • Instagram — post ze zdjęciem publikujemy sami o zaplanowanej porze
//     (kontener → media_publish), bo kolejka obsługuje tylko rolki.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { updateAgentAction, type ActionRow } from "@/lib/agent-toolkit/store.server";
import { listItems, type GrowthItemPayload } from "./state.server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function publishInstagram(
  p: GrowthItemPayload,
): Promise<{ mediaId?: string; error?: string }> {
  if (!p.imageUrl) return { error: "brak grafiki" };
  try {
    const m = await import("@/lib/meta-api.server");
    const creationId = await m.createIgContainer({
      imageUrl: p.imageUrl,
      caption: p.texts.instagram,
    });
    for (let i = 0; i < 5; i++) {
      const st = await m
        .getIgContainerStatus(creationId)
        .catch(() => ({ status_code: "", status: "" }));
      if (st.status_code === "FINISHED") break;
      if (st.status_code === "ERROR") return { error: `kontener IG: ${st.status}` };
      await sleep(2000);
    }
    return { mediaId: await m.publishIgContainer(creationId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Jeden wpis: aktualizacja stanu FB z kolejki i publikacja IG, gdy nadszedł termin. */
async function advance(row: ActionRow, now: Date): Promise<string | null> {
  const p = row.payload as unknown as GrowthItemPayload;
  if (!p?.plan) return null;
  const next: GrowthItemPayload = { ...p, fb: { ...(p.fb ?? {}) }, ig: { ...(p.ig ?? {}) } };
  let changed = false;

  if (p.platforms.includes("facebook") && next.fb?.queueId && !next.fb.postId && !next.fb.error) {
    const { data } = await supabaseAdmin
      .from("social_publish_queue")
      .select("status, external_post_id, last_error")
      .eq("id", next.fb.queueId)
      .maybeSingle();
    if (data?.status === "published" && data.external_post_id) {
      next.fb!.postId = data.external_post_id;
      changed = true;
    } else if (data?.status === "failed" || data?.status === "cancelled" || !data) {
      next.fb!.error = data?.last_error ?? (data ? data.status : "wpis usunięty z kolejki");
      changed = true;
    }
  }

  const due = new Date(p.plan.slotIso).getTime() <= now.getTime();
  if (due && p.platforms.includes("instagram") && !next.ig?.mediaId && !next.ig?.error) {
    const r = await publishInstagram(p);
    next.ig = { mediaId: r.mediaId ?? null, error: r.error ?? null };
    changed = true;
  }

  const fbDone = !p.platforms.includes("facebook") || Boolean(next.fb?.postId || next.fb?.error);
  const igDone = !p.platforms.includes("instagram") || Boolean(next.ig?.mediaId || next.ig?.error);
  if (fbDone && igDone) {
    const anyPublished = Boolean(next.fb?.postId || next.ig?.mediaId);
    next.stage = anyPublished ? "published" : "failed";
    next.publishedAt = anyPublished ? now.toISOString() : null;
    changed = true;
  }
  if (!changed) return null;
  await updateAgentAction(row.id, {
    payload: next as unknown as Record<string, unknown>,
    status: next.stage === "failed" ? "error" : "ok",
  });
  return `${row.id.slice(0, 8)}:${next.stage}${next.fb?.error ? ` fb=${next.fb.error.slice(0, 60)}` : ""}${next.ig?.error ? ` ig=${next.ig.error.slice(0, 60)}` : ""}`;
}

export async function publishDue(now = new Date()): Promise<string[]> {
  const rows = await listItems({ stage: "scheduled", limit: 30 });
  const out: string[] = [];
  for (const r of rows) {
    const res = await advance(r, now).catch(
      (e) => `${r.id.slice(0, 8)}:error ${e instanceof Error ? e.message : e}`,
    );
    if (res) out.push(res);
  }
  return out;
}
