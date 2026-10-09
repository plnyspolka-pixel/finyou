// Przetwarzanie kolejki screeningu (trigger w bazie → screening_queue → tick
// co 5 minut). Każdy element kolejki to klient / inwestor / oświadczenie /
// podmiot; synchronizujemy podmioty i uruchamiamy screening każdego z nich.
import { getScreeningSettings, screeningAudit, sdb, sourcesVersions } from "./db.server";
import { screenSubject, type RunScope, type RunTrigger, type ScreenResult } from "./engine.server";
import { syncClientSubjects, syncInvestorSubjects, type SubjectRow } from "./subjects.server";

const MAX_ATTEMPTS = 5;

interface QueueRow {
  id: number;
  source_table: "clients" | "investors" | "pep_declarations" | "screening_subjects";
  source_id: string;
  trigger: RunTrigger;
  scope: RunScope;
  attempts: number;
}

async function subjectsFor(item: QueueRow): Promise<SubjectRow[]> {
  switch (item.source_table) {
    case "clients":
      return syncClientSubjects(item.source_id);
    case "investors":
      return syncInvestorSubjects(item.source_id);
    case "pep_declarations": {
      const { data } = await sdb
        .from("pep_declarations")
        .select("subject_type, subject_id")
        .eq("id", item.source_id)
        .maybeSingle();
      if (!data) return [];
      return data.subject_type === "client"
        ? syncClientSubjects(data.subject_id)
        : syncInvestorSubjects(data.subject_id);
    }
    case "screening_subjects": {
      const { data } = await sdb
        .from("screening_subjects")
        .select("*")
        .eq("id", item.source_id)
        .maybeSingle();
      return data ? [data as SubjectRow] : [];
    }
  }
}

/** Screening wszystkich podmiotów elementu kolejki; zwraca wyniki per podmiot. */
export async function processQueueItem(
  item: QueueRow,
  actorId?: string | null,
): Promise<ScreenResult[]> {
  const settings = await getScreeningSettings();
  const versions = await sourcesVersions();
  const subjects = await subjectsFor(item);
  const out: ScreenResult[] = [];
  for (const s of subjects) {
    out.push(
      await screenSubject(s, {
        trigger: item.trigger,
        scope: item.scope,
        settings,
        versions,
        actorId,
      }),
    );
  }
  return out;
}

export async function processQueue(
  opts: { limit?: number; budgetMs?: number } = {},
): Promise<{ processed: number; failed: number; remaining: number }> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 50_000;
  const { data, error } = await sdb
    .from("screening_queue")
    .select("id, source_table, source_id, trigger, scope, attempts")
    .is("processed_at", null)
    .lte("not_before", new Date().toISOString())
    .order("enqueued_at", { ascending: true })
    .limit(opts.limit ?? 40);
  if (error) throw new Error(error.message);
  let processed = 0;
  let failed = 0;
  for (const item of (data ?? []) as QueueRow[]) {
    if (Date.now() - t0 > budget) break;
    try {
      await processQueueItem(item);
      await sdb
        .from("screening_queue")
        .update({
          processed_at: new Date().toISOString(),
          attempts: item.attempts + 1,
          last_error: null,
        })
        .eq("id", item.id);
      processed++;
    } catch (e) {
      failed++;
      const attempts = item.attempts + 1;
      const msg = (e as Error).message.slice(0, 1000);
      const giveUp = attempts >= MAX_ATTEMPTS;
      await sdb
        .from("screening_queue")
        .update({
          attempts,
          last_error: msg,
          not_before: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
          processed_at: giveUp ? new Date().toISOString() : null,
        })
        .eq("id", item.id);
      if (giveUp) {
        await screeningAudit({
          eventType: "queue.failed",
          entityType: "queue",
          entityId: String(item.id),
          details: { ...item, error: msg },
        });
      }
    }
  }
  const { count } = await sdb
    .from("screening_queue")
    .select("id", { count: "exact", head: true })
    .is("processed_at", null);
  return { processed, failed, remaining: count ?? 0 };
}

/** Rescreening aktywnego portfela (klienci z otwartym wnioskiem / pożyczką, aktywni inwestorzy). */
export async function enqueuePortfolio(
  scope: RunScope,
  trigger: RunTrigger = "rescreening",
): Promise<number> {
  const { data, error } = await sdb.rpc("screening_enqueue_portfolio", {
    p_scope: scope,
    p_trigger: trigger,
  });
  if (error) throw new Error(error.message);
  await screeningAudit({
    eventType: "rescreening.enqueued",
    entityType: "queue",
    details: { scope, trigger, enqueued: data },
  });
  return Number(data ?? 0);
}
