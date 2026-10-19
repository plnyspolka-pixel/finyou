// Analityka i pętla uczenia (brief 5.5): mediany per tor, outliery,
// decyzje A/B, metryki lead magnetów i treść raportów do właściciela.
// Czysty moduł – bez I/O.
import type { PublishPlatform, Track } from "./types";

export interface PublicationMetric {
  platform: PublishPlatform;
  externalPostId: string;
  track: Track | null;
  series?: string | null;
  hookText?: string | null;
  hookVariant?: string | null;
  views: number;
  shares?: number | null;
  saves?: number | null;
  follows?: number | null;
  comments?: number | null;
  publishedAt?: string | null;
}

export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export const OUTLIER_FACTOR = 3;
/** Minimalna liczba publikacji w grupie, by mediana była punktem odniesienia. */
export const MIN_SAMPLE = 5;

/** Klucz grupy odniesienia: konto (platforma) + tor. */
const groupKey = (m: PublicationMetric) => `${m.platform}|${m.track ?? "brak"}`;

/**
 * Outliery: wyświetlenia ≥ 3× mediany własnej grupy (platforma + tor).
 * Grupa z mniej niż 5 publikacjami nie ma jeszcze punktu odniesienia.
 */
export function findOutliers(
  rows: PublicationMetric[],
  factor = OUTLIER_FACTOR,
): Array<PublicationMetric & { median: number; ratio: number }> {
  const groups = new Map<string, PublicationMetric[]>();
  for (const r of rows) {
    const k = groupKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: Array<PublicationMetric & { median: number; ratio: number }> = [];
  for (const list of groups.values()) {
    if (list.length < MIN_SAMPLE) continue;
    const med = median(list.map((r) => r.views));
    if (med <= 0) continue;
    for (const r of list) {
      const ratio = r.views / med;
      if (ratio >= factor) out.push({ ...r, median: med, ratio: Math.round(ratio * 100) / 100 });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

export function mediansByTrack(rows: PublicationMetric[]): Record<string, number> {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const k = groupKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r.views]);
  }
  return Object.fromEntries([...groups].map(([k, v]) => [k, median(v)]));
}

/** Udostępnienia i obserwacje na 1 000 wyświetleń (KPI serii). */
export function per1000(count: number, views: number): number {
  if (!views) return 0;
  return Math.round((count / views) * 1000 * 100) / 100;
}

// ── A/B hooków i wykonań (decyzja po 72 h) ───────────────────────────────────

export interface VariantStats {
  id: string;
  views: number;
  /** Średni % obejrzenia (0–1) lub inna metryka retencji; opcjonalne. */
  retention?: number | null;
  shares?: number | null;
}

export const AB_DECISION_HOURS = 72;
export const AB_MIN_VIEWS = 200;
export const AB_MIN_LIFT = 0.15;

/**
 * Zwycięzca testu A/B: po 72 h, z min. 200 wyświetleniami na wariant,
 * gdy przewaga ≥ 15% w wyniku (wyświetlenia × (1 + retencja) + 5 × udostępnienia).
 */
export function decideAb(
  a: VariantStats,
  b: VariantStats,
  hoursSinceStart: number,
): { decided: boolean; winner?: string; reason: string } {
  if (hoursSinceStart < AB_DECISION_HOURS)
    return { decided: false, reason: `Za wcześnie (${Math.floor(hoursSinceStart)} h < 72 h).` };
  if (a.views < AB_MIN_VIEWS || b.views < AB_MIN_VIEWS)
    return { decided: false, reason: "Za mało wyświetleń na wariant." };
  const score = (v: VariantStats) => v.views * (1 + (v.retention ?? 0)) + 5 * (v.shares ?? 0);
  const sa = score(a);
  const sb = score(b);
  const [hi, lo, winner] = sa >= sb ? [sa, sb, a.id] : [sb, sa, b.id];
  if (lo > 0 && (hi - lo) / lo < AB_MIN_LIFT)
    return { decided: true, winner: a.id, reason: "Remis w granicy 15% – zostaje wariant A." };
  return {
    decided: true,
    winner,
    reason: `Przewaga ${Math.round(((hi - lo) / Math.max(1, lo)) * 100)}%.`,
  };
}

// ── lead magnety: zapis na listę jako główna metryka ─────────────────────────

export interface LeadMagnetStats {
  slug: string;
  track: Track;
  pageViews: number;
  signups: number;
  /** Wyświetlenia publikacji podpiętych pod lead magnet. */
  linkedViews: number;
}

export function optInRate(s: LeadMagnetStats): number {
  return s.pageViews ? Math.round((s.signups / s.pageViews) * 10000) / 10000 : 0;
}

export function signupsPer1000Views(s: LeadMagnetStats): number {
  return per1000(s.signups, s.linkedViews);
}

/**
 * Ocena lead magnetu: wycofaj / popraw (A/B) / promuj. Decyzja dopiero przy
 * 100+ odsłonach strony. Progi startowe – do kalibracji na własnych danych.
 */
export function judgeLeadMagnet(
  s: LeadMagnetStats,
  peerMedianOptIn: number,
): "za_malo_danych" | "wycofaj" | "popraw" | "utrzymaj" | "promuj" {
  if (s.pageViews < 100) return "za_malo_danych";
  const r = optInRate(s);
  if (peerMedianOptIn > 0 && r >= peerMedianOptIn * 1.5) return "promuj";
  if (r < 0.05) return s.pageViews >= 300 ? "wycofaj" : "popraw";
  if (peerMedianOptIn > 0 && r < peerMedianOptIn * 0.7) return "popraw";
  return "utrzymaj";
}

// ── raporty (informacyjne, bez czekania na odpowiedź) ────────────────────────

export interface TrackReport {
  track: Track;
  publications: number;
  medianViews: number;
  signups: number;
  leads: number;
  costPln: number;
}

export interface ReportInput {
  periodLabel: string;
  tracks: TrackReport[];
  outliers: number;
  changes: string[];
  alarms: string[];
  paused: boolean;
}

const TRACK_LABEL: Record<Track, string> = {
  pozyczkobiorca: "Pożyczkobiorcy",
  inwestor: "Inwestorzy",
};

export function costPerLead(t: TrackReport): number | null {
  return t.leads > 0 ? Math.round((t.costPln / t.leads) * 100) / 100 : null;
}

export function buildReportText(r: ReportInput): string {
  const lines = [`Autopilot Finance You – ${r.periodLabel}${r.paused ? " (PAUZA)" : ""}`];
  for (const t of r.tracks) {
    const cpl = costPerLead(t);
    lines.push(
      `${TRACK_LABEL[t.track]}: ${t.publications} publ., mediana ${Math.round(t.medianViews)} wyśw., ` +
        `${t.signups} zapisów, ${t.leads} leadów, koszt ${t.costPln.toFixed(2)} zł` +
        (cpl != null ? ` (${cpl.toFixed(2)} zł/lead)` : ""),
    );
  }
  if (r.outliers) lines.push(`Outliery: ${r.outliers}.`);
  if (r.changes.length) lines.push(`Zmiany agenta: ${r.changes.join("; ")}`);
  if (r.alarms.length) lines.push(`ALARMY: ${r.alarms.join("; ")}`);
  return lines.join("\n");
}

/** Wersja SMS – maks. ~300 znaków (2 segmenty). */
export function buildReportSms(r: ReportInput): string {
  const parts = r.tracks.map(
    (t) => `${t.track === "inwestor" ? "INW" : "POZ"} ${t.publications}p/${t.signups}z/${t.leads}l`,
  );
  const alarm = r.alarms.length ? ` ALARM: ${r.alarms[0]}` : "";
  return `FY autopilot ${r.periodLabel}: ${parts.join(", ")}.${alarm}`.slice(0, 300);
}
