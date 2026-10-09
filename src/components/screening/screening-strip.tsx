// Skrót statusu screeningu PEP / sankcji na stronie wniosku lub inwestora.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { PauseCircle, ShieldQuestion } from "lucide-react";
import { getScreeningOwnerCard } from "@/lib/screening/screening.functions";
import { PepStatusBadge, SanctionsStatusBadge } from "./shared";

export function ScreeningStrip({ kind, id }: { kind: "client" | "investor"; id: string }) {
  const getFn = useServerFn(getScreeningOwnerCard);
  const q = useQuery({
    queryKey: ["screening-owner", kind, id],
    queryFn: () => getFn({ data: { kind, id } }),
    retry: false,
  });
  if (q.isLoading || q.error || !q.data) return null;
  const main = q.data.subjects.find((s) => s.subject_type === kind) ?? q.data.subjects[0];
  const st = main ? q.data.statuses.find((s) => s.subject_id === main.id) : undefined;
  const openCases = q.data.cases.filter((c) => !c.decision);
  const held =
    q.data.statuses.some((s) => s.operations_hold) || openCases.some((c) => c.application_hold);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
      <PepStatusBadge status={st?.pep_status ?? "unknown"} />
      <SanctionsStatusBadge status={st?.sanctions_status ?? "unknown"} />
      {openCases.length > 0 && (
        <span className="text-amber-700">{openCases.length} otwarte sprawy</span>
      )}
      {held && (
        <span className="inline-flex items-center gap-1 font-medium text-red-700">
          <PauseCircle className="h-4 w-4" /> wstrzymane do decyzji compliance
        </span>
      )}
      <Link
        to="/admin/screening-podmiot/$kind/$id"
        params={{ kind, id }}
        className="ml-auto underline"
      >
        Karta screeningu
      </Link>
    </div>
  );
}
