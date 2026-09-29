// Sekcja „Przykładowe projekty" — jedyna lista projektów widoczna bez
// logowania (decyzja nadrzędna nr 7). Dane syntetyczne z `example-projects.ts`,
// etykieta „ilustracja, nie oferta" nad sekcją i na każdej karcie (LeadsTable
// pokazuje ją w kolumnie nieruchomości, gdy `is_example`).
import { useMemo } from "react";
import { LeadsTable } from "@/routes/embed.leady";
import {
  EXAMPLE_PROJECTS_LABEL,
  EXAMPLE_PROJECTS_NOTE,
  generateExampleProjects,
} from "@/lib/example-projects";

export function ExampleProjectsSection({ className }: { className?: string }) {
  const rows = useMemo(() => generateExampleProjects(new Date()), []);
  return (
    <div className={className}>
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-200">
        {EXAMPLE_PROJECTS_LABEL}
      </div>
      <LeadsTable leads={rows} />
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{EXAMPLE_PROJECTS_NOTE}</p>
    </div>
  );
}
