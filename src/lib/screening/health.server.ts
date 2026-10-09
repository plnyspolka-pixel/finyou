// Monitoring źródeł: data ostatniego udanego importu, liczba rekordów, błędy.
// Alert e-mail, gdy import źródła nie powiódł się dłużej niż przez N cykli
// (N = screening_settings.import_alert_failed_cycles, domyślnie 2).
import { getScreeningSettings, screeningAudit, sdb, type ScreeningSettings } from "./db.server";
import { notifyImportAlert } from "./notify.server";
import { PEP_SOURCES, SANCTION_SOURCES, SOURCE_LABELS, type SourceKey } from "./sources/types";

const PERIOD_MS: Record<string, number> = {
  daily: 24 * 3600_000,
  weekly: 7 * 24 * 3600_000,
  monthly: 31 * 24 * 3600_000,
};

export interface SourceHealth {
  source: SourceKey;
  label: string;
  kind: "pep" | "sanctions";
  enabled: boolean;
  frequency: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  recordCount: number;
  alert: boolean;
  alertReason: string | null;
}

async function countRecords(source: SourceKey): Promise<number> {
  const pep = (PEP_SOURCES as readonly string[]).includes(source);
  const q = pep
    ? sdb
        .from("pep_reference_persons")
        .select("id", { count: "exact", head: true })
        .eq("source", source)
    : sdb
        .from("sanctions_reference_entries")
        .select("id", { count: "exact", head: true })
        .eq("list_name", source)
        .eq("is_active", true);
  const { count } = await q;
  return count ?? 0;
}

export async function sourcesHealth(
  settings?: ScreeningSettings,
  now = new Date(),
): Promise<SourceHealth[]> {
  const s = settings ?? (await getScreeningSettings());
  const out: SourceHealth[] = [];
  for (const source of [...SANCTION_SOURCES, ...PEP_SOURCES] as SourceKey[]) {
    const enabled = !!s.sources[source]?.enabled;
    const frequency = s.frequencies[source] ?? "weekly";
    const { data: rows } = await sdb
      .from("screening_source_imports")
      .select("status, started_at, finished_at, error")
      .eq("source", source)
      .order("started_at", { ascending: false })
      .limit(20);
    const list = (rows ?? []) as Array<{
      status: string;
      started_at: string;
      finished_at: string | null;
      error: string | null;
    }>;
    const lastOk = list.find((r) => r.status === "success" || r.status === "unchanged");
    let consecutiveFailures = 0;
    for (const r of list) {
      if (r.status === "failed") consecutiveFailures++;
      else if (r.status !== "running") break;
    }
    const period = PERIOD_MS[frequency] ?? PERIOD_MS.weekly;
    const cycles = s.import_alert_failed_cycles;
    let alertReason: string | null = null;
    if (enabled) {
      const lastOkAt = lastOk ? new Date(lastOk.finished_at ?? lastOk.started_at).getTime() : null;
      if (consecutiveFailures > cycles)
        alertReason = `${consecutiveFailures} nieudanych importów z rzędu`;
      else if (lastOkAt && now.getTime() - lastOkAt > period * cycles + 6 * 3600_000) {
        alertReason = `brak udanego importu od ${new Date(lastOkAt).toLocaleString("pl-PL")}`;
      } else if (!lastOkAt && list.length > cycles)
        alertReason = "źródło nigdy nie zostało zaimportowane";
    }
    out.push({
      source,
      label: SOURCE_LABELS[source],
      kind: (PEP_SOURCES as readonly string[]).includes(source) ? "pep" : "sanctions",
      enabled,
      frequency,
      lastSuccessAt: lastOk ? (lastOk.finished_at ?? lastOk.started_at) : null,
      lastAttemptAt: list[0]?.started_at ?? null,
      lastStatus: list[0]?.status ?? null,
      lastError: list.find((r) => r.status === "failed")?.error ?? null,
      consecutiveFailures,
      recordCount: await countRecords(source),
      alert: !!alertReason,
      alertReason,
    });
  }
  return out;
}

/** Dzienny przegląd stanu źródeł + kolejki; wysyła alert e-mail i zapisuje go w audycie. */
export async function runHealthCheck(): Promise<{ alerts: string[]; queueBacklog: number }> {
  const settings = await getScreeningSettings();
  const health = await sourcesHealth(settings);
  const alerts = health
    .filter((h) => h.alert)
    .map(
      (h) =>
        `${h.label}: ${h.alertReason}${h.lastError ? ` (ostatni błąd: ${h.lastError.slice(0, 200)})` : ""}`,
    );
  const { count } = await sdb
    .from("screening_queue")
    .select("id", { count: "exact", head: true })
    .is("processed_at", null)
    .lt("enqueued_at", new Date(Date.now() - 6 * 3600_000).toISOString());
  if ((count ?? 0) > 0)
    alerts.push(`Kolejka screeningu: ${count} elementów czeka dłużej niż 6 godzin`);
  if (alerts.length) {
    await notifyImportAlert(settings, alerts);
    await screeningAudit({ eventType: "health.alert", entityType: "import", details: { alerts } });
  }
  return { alerts, queueBacklog: count ?? 0 };
}
