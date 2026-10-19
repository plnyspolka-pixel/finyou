/**
 * Etap 2 — metryki per publikacja i lead magnet, mediany, outliery, raporty.
 * Czysta logika (testy obok); import danych w `metrics.server.ts`.
 */
import type { AudienceTrack } from "./compliance-rules";

export interface PublicationMetricRow {
  platform: string;
  external_id: string;
  audience_track: AudienceTrack | null;
  series?: string | null;
  format?: string | null;
  hook_text?: string | null;
  published_at?: string | null;
  views: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  follows?: number | null;
  cost_pln?: number | null;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export const OUTLIER_FACTOR = 3;
/** Poniżej tylu publikacji w grupie mediana jest szumem. */
export const MIN_GROUP_FOR_OUTLIERS = 5;

const groupKey = (r: PublicationMetricRow) => `${r.platform}|${r.audience_track ?? "?"}`;

/** Mediana wyświetleń per platforma i tor (punkt odniesienia z briefu 5.5). */
export function mediansByGroup(rows: PublicationMetricRow[]): Map<string, number> {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (r.views == null) continue;
    const k = groupKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r.views]);
  }
  const out = new Map<string, number>();
  for (const [k, v] of groups) {
    const m = median(v);
    if (m != null) out.set(k, m);
  }
  return out;
}

export interface Outlier {
  row: PublicationMetricRow;
  median: number;
  multiple: number;
}

/** Publikacje ≥ 3× mediany konta i toru → kontynuacja i ewentualne podbicie. */
export function findOutliers(rows: PublicationMetricRow[], factor = OUTLIER_FACTOR): Outlier[] {
  const counts = new Map<string, number>();
  for (const r of rows)
    if (r.views != null) counts.set(groupKey(r), (counts.get(groupKey(r)) ?? 0) + 1);
  const medians = mediansByGroup(rows);
  const out: Outlier[] = [];
  for (const r of rows) {
    const m = medians.get(groupKey(r));
    if (r.views == null || m == null || (counts.get(groupKey(r)) ?? 0) < MIN_GROUP_FOR_OUTLIERS)
      continue;
    const base = Math.max(m, 1);
    if (r.views >= base * factor)
      out.push({ row: r, median: m, multiple: Math.round((r.views / base) * 10) / 10 });
  }
  return out.sort((a, b) => b.multiple - a.multiple);
}

export function per1000(
  count: number | null | undefined,
  views: number | null | undefined,
): number | null {
  if (!views || views <= 0 || count == null) return null;
  return Math.round((count / views) * 1000 * 100) / 100;
}

/** Główna miara lead magnetu (brief 5.4): zapisy / odsłony strony. */
export function optInRate(signups: number, pageViews: number): number | null {
  if (pageViews <= 0) return null;
  return Math.round((signups / pageViews) * 1000) / 10; // %
}

// ── Raport dzienny / tygodniowy ─────────────────────────────────────────

export interface TrackSummary {
  publications: number;
  medianViews: number | null;
  shareRatePer1000: number | null;
  followsPer1000: number | null;
  signups: number;
  leads: number;
  costPln: number;
}

export interface ReportInput {
  period: "daily" | "weekly";
  label: string;
  tracks: Record<AudienceTrack, TrackSummary>;
  outliers: Outlier[];
  compliance: { checks: number; rejected: number; fixed: number };
  publishFailures: number;
  agentChanges: string[];
  alarms: string[];
  aiCostPln: number;
  aiBudgetPln: number;
  mode: string;
  paused: string | null;
}

const fmt = (n: number | null, suffix = "") =>
  n == null ? "—" : `${Math.round(n * 100) / 100}${suffix}`;
const TRACK_LABEL: Record<AudienceTrack, string> = {
  pozyczkobiorca: "Pożyczkobiorcy",
  inwestor: "Inwestorzy",
};

export function buildReportText(r: ReportInput): string {
  const lines: string[] = [];
  lines.push(
    `${r.period === "daily" ? "Raport dzienny" : "Raport tygodniowy"} agenta publikującego — ${r.label}`,
  );
  lines.push(
    `Tryb: ${r.mode}${r.paused ? ` · PAUZA: ${r.paused}` : ""} · koszt AI ${fmt(r.aiCostPln, " zł")} / ${fmt(r.aiBudgetPln, " zł")} dziennie`,
  );
  lines.push("");
  for (const t of ["pozyczkobiorca", "inwestor"] as AudienceTrack[]) {
    const s = r.tracks[t];
    const cpl = s.leads > 0 ? s.costPln / s.leads : null;
    lines.push(
      `${TRACK_LABEL[t]}: ${s.publications} publikacji, mediana wyświetleń ${fmt(s.medianViews)}, udostępnienia/1000 ${fmt(s.shareRatePer1000)}, obserwacje/1000 ${fmt(s.followsPer1000)}, zapisy na listę ${s.signups}, leady ${s.leads}, koszt/lead ${fmt(cpl, " zł")}`,
    );
  }
  lines.push("");
  lines.push(
    `Compliance: ${r.compliance.checks} sprawdzeń, ${r.compliance.fixed} uzupełnionych, ${r.compliance.rejected} odrzuconych. Nieudane publikacje: ${r.publishFailures}.`,
  );
  if (r.outliers.length) {
    lines.push("Outliery (≥3× mediany):");
    for (const o of r.outliers.slice(0, 5)) {
      lines.push(
        `- ${o.row.platform} · ${o.row.hook_text?.slice(0, 80) ?? o.row.external_id} — ${o.multiple}× mediany`,
      );
    }
  }
  if (r.agentChanges.length) {
    lines.push("Co agent zmienił i dlaczego:");
    for (const c of r.agentChanges.slice(0, 10)) lines.push(`- ${c}`);
  }
  if (r.alarms.length) {
    lines.push("Alarmy:");
    for (const a of r.alarms) lines.push(`- ${a}`);
  }
  lines.push("");
  lines.push(
    "Wyłącznik awaryjny: panel /admin/ai-growth-engine albo MCP set_publishing_agent_kill_switch.",
  );
  return lines.join("\n");
}

/** Czy pora na raport (godzina w Warszawie, raz na dobę / tydzień). */
export function reportDue(opts: {
  now: Date;
  hourWarsaw: number;
  dowWarsaw: number;
  reportHour: number;
  weeklyDow: number;
  lastDaily?: string | null;
  lastWeekly?: string | null;
}): { daily: boolean; weekly: boolean } {
  const hoursSince = (iso?: string | null) =>
    iso ? (opts.now.getTime() - new Date(iso).getTime()) / 3600_000 : Infinity;
  const atHour = opts.hourWarsaw === opts.reportHour;
  return {
    daily: atHour && hoursSince(opts.lastDaily) > 20,
    weekly: atHour && opts.dowWarsaw === opts.weeklyDow && hoursSince(opts.lastWeekly) > 6 * 24,
  };
}
