import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2 } from "lucide-react";
import { getRecentLoanApplications, type RecentLoanApplicationItem } from "@/lib/landing-application.functions";
import { formatPLN } from "@/lib/loan-math";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-documents";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h temu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
}

export function RecentApplicationsList({ initial }: { initial?: RecentLoanApplicationItem[] }) {
  const fn = useServerFn(getRecentLoanApplications);
  const { data } = useQuery({
    queryKey: ["recent-loan-applications"],
    queryFn: () => fn(),
    initialData: initial,
    staleTime: 60_000,
  });

  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <section id="ostatnie-wnioski" className="border-t border-border bg-secondary/30 scroll-mt-20">
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Ostatnio przyjęte wnioski</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            Pożyczki pod zastaw nieruchomości — realne wnioski
          </h2>
        </div>

        <ul className="mt-8 overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
          {items.map((it) => (
            <li key={it.id} className="grid grid-cols-2 items-center gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_1.2fr_1fr_0.8fr_auto] md:px-6">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                {it.first_name}
              </div>
              <div className="text-muted-foreground">
                {it.property_type ? PROPERTY_TYPE_LABELS[it.property_type] ?? "Nieruchomość" : "Nieruchomość"}
              </div>
              <div className="tabular-nums font-bold text-foreground">{formatPLN(it.loan_amount)}</div>
              <div className="tabular-nums text-muted-foreground">{it.preferred_period_months} mies.</div>
              <div className="col-span-2 text-xs text-muted-foreground md:col-span-1 md:text-right">{timeAgo(it.created_at)}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
