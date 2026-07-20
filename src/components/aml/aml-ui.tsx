// Drobne współdzielone elementy UI modułu AML.
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  SCREENING_STATUS_LABELS,
  RISK_LEVEL_LABELS,
  CASE_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  THRESHOLD_DECISION_LABELS,
  type AmlScreeningStatus,
  type AmlRiskLevel,
  type AmlCaseStatus,
  type AmlReportStatus,
  type AmlThresholdDecision,
} from "@/lib/aml/aml-types";

const GREEN = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
const AMBER = "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
const RED = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
const BLUE = "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
const MUTED = "bg-muted text-muted-foreground";

export function ScreeningBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    clear: GREEN,
    approved_after_review: GREEN,
    review_required: AMBER,
    in_progress: BLUE,
    blocked: RED,
    error: RED,
    invalidated: MUTED,
    not_started: MUTED,
  };
  return (
    <Badge className={cls[status] ?? MUTED}>
      {SCREENING_STATUS_LABELS[status as AmlScreeningStatus] ?? status}
    </Badge>
  );
}

export function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <Badge className={MUTED}>Brak oceny</Badge>;
  const cls: Record<string, string> = {
    low: GREEN,
    standard: BLUE,
    high: AMBER,
    unacceptable: RED,
  };
  return (
    <Badge className={cls[level] ?? MUTED}>
      {RISK_LEVEL_LABELS[level as AmlRiskLevel] ?? level}
    </Badge>
  );
}

export function CaseStatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    new: BLUE,
    in_analysis: BLUE,
    awaiting_information: AMBER,
    suspicion_confirmed: AMBER,
    report_in_preparation: AMBER,
    ready_for_signature: AMBER,
    signed: BLUE,
    submitted: BLUE,
    upo_received: GREEN,
    no_basis_for_report: GREEN,
    closed: MUTED,
    rejected: RED,
    correction_required: RED,
  };
  return (
    <Badge className={cls[status] ?? MUTED}>
      {CASE_STATUS_LABELS[status as AmlCaseStatus] ?? status}
    </Badge>
  );
}

export function ReportStatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    draft: MUTED,
    complete: BLUE,
    content_approved: BLUE,
    awaiting_signature: AMBER,
    signed: BLUE,
    encrypted: BLUE,
    queued: AMBER,
    submitted: BLUE,
    status_pending: AMBER,
    accepted: GREEN,
    upo_received: GREEN,
    rejected: RED,
    correction_required: RED,
    error: RED,
  };
  return (
    <Badge className={cls[status] ?? MUTED}>
      {REPORT_STATUS_LABELS[status as AmlReportStatus] ?? status}
    </Badge>
  );
}

export function ThresholdDecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <Badge className={AMBER}>Wymaga decyzji</Badge>;
  const cls: Record<string, string> = {
    reportable: AMBER,
    not_reportable: GREEN,
    verification_required: AMBER,
    report_prepared: BLUE,
    submitted: BLUE,
    accepted: GREEN,
    correction_required: RED,
  };
  return (
    <Badge className={cls[decision] ?? MUTED}>
      {THRESHOLD_DECISION_LABELS[decision as AmlThresholdDecision] ?? decision}
    </Badge>
  );
}

export function AmlEmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{children}</p>;
}

export function amlCustomerLabel(
  c: {
    entity_type?: string;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
  } | null,
): string {
  if (!c) return "—";
  return c.entity_type === "firma"
    ? (c.company_name ?? "—")
    : [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
}

/** Plik → base64 (dla wgrywania podpisanych plików i załączników). */
export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export const formatEUR = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "EUR" }).format(n);
