// Wspólne drobiazgi panelu administratora modułu projektów.
import { Badge } from "@/components/ui/badge";
import {
  MODULE_ACCESS_STATUS_LABELS,
  APPLICATION_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  SCREENING_RESULT_LABELS,
  type ModuleAccessStatus,
  type ModuleApplicationStatus,
  type ProjectPoolStatus,
  type AssignmentStatus,
  type ProposalStatus,
  type ModuleScreeningResult,
} from "@/lib/projects/module-types";

type Tone = "default" | "secondary" | "destructive" | "outline";

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

export function AccessBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "approved_investor"
      ? "default"
      : ["access_revoked", "module_application_rejected"].includes(status)
        ? "destructive"
        : status === "access_suspended"
          ? "outline"
          : "secondary";
  return (
    <Badge variant={tone}>
      {MODULE_ACCESS_STATUS_LABELS[status as ModuleAccessStatus] ?? status}
    </Badge>
  );
}

export function ApplicationBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "conditionally_qualified"
      ? "default"
      : status === "rejected"
        ? "destructive"
        : "secondary";
  return (
    <Badge variant={tone}>
      {APPLICATION_STATUS_LABELS[status as ModuleApplicationStatus] ?? status}
    </Badge>
  );
}

export function ProjectBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "available_internal_pool"
      ? "default"
      : ["withdrawn", "closed"].includes(status)
        ? "destructive"
        : ["under_review", "paused"].includes(status)
          ? "outline"
          : "secondary";
  return (
    <Badge variant={tone}>{PROJECT_STATUS_LABELS[status as ProjectPoolStatus] ?? status}</Badge>
  );
}

export function AssignmentBadge({ status }: { status: string }) {
  const tone: Tone = ["interested"].includes(status)
    ? "default"
    : ["rejected", "expired", "cancelled_by_admin", "cancelled_project_update"].includes(status)
      ? "destructive"
      : "secondary";
  return (
    <Badge variant={tone}>{ASSIGNMENT_STATUS_LABELS[status as AssignmentStatus] ?? status}</Badge>
  );
}

export function ProposalBadge({ status }: { status: string }) {
  const tone: Tone = ["accepted", "converted_to_transaction"].includes(status)
    ? "default"
    : ["rejected", "expired", "withdrawn"].includes(status)
      ? "destructive"
      : "secondary";
  return <Badge variant={tone}>{PROPOSAL_STATUS_LABELS[status as ProposalStatus] ?? status}</Badge>;
}

export function ScreeningBadge({ result }: { result: string | null }) {
  if (!result) return <Badge variant="outline">brak</Badge>;
  const tone: Tone =
    result === "clear"
      ? "default"
      : result === "confirmed_sanctions_match"
        ? "destructive"
        : "outline";
  return (
    <Badge variant={tone}>
      {SCREENING_RESULT_LABELS[result as ModuleScreeningResult] ?? result}
    </Badge>
  );
}
