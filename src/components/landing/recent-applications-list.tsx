import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MapPin } from "lucide-react";
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
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            Klienci po przejściu kalkulatora oferty — wybrane warunki czekają na inwestora.
          </p>
        </div>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  {it.first_name}
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(it.created_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {it.property_type ? PROPERTY_TYPE_LABELS[it.property_type] ?? "Nieruchomość" : "Nieruchomość"}
                </span>
                {it.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {it.city}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Kwota</div>
                  <div className="tabular-nums font-bold text-foreground">{formatPLN(it.loan_amount)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Okres</div>
                  <div className="tabular-nums font-bold text-foreground">{it.preferred_period_months} mies.</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Roczna stopa zwrotu</div>
                  <div className="tabular-nums font-bold text-emerald-600">
                    {it.annual_investor_rate.toFixed(1).replace(".", ",")}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Zysk inwestora</div>
                  <div className="tabular-nums font-bold text-foreground">{formatPLN(it.investor_profit)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
