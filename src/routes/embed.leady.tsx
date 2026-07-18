import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Home, Building2, Trees, Store } from "lucide-react";
import { formatPLN, formatRelative } from "@/lib/labels";
import { fetchPublicLeads } from "@/lib/public-leads.functions";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-documents";

const PROPERTY_ICONS: Record<string, typeof Home> = {
  apartment: Building2,
  house: Home,
  plot_building: Trees,
  commercial: Store,
};

const leadsQO = queryOptions({
  queryKey: ["embed", "public-leads"],
  queryFn: () => fetchPublicLeads(),
  staleTime: 2 * 60 * 1000,
});

export const Route = createFileRoute("/embed/leady")({
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsQO),
  head: () => ({
    meta: [
      { title: "Ostatnie okazje inwestycyjne — Finance You" },
      { name: "description", content: "Zanonimizowana lista ostatnich okazji inwestycyjnych Finance You." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedLeads,
});

function EmbedLeads() {
  const { data } = useSuspenseQuery(leadsQO);
  const total = data.reduce((acc, r) => acc + (r.loan_amount ?? 0), 0);
  const withAmount = data.filter((r) => r.loan_amount != null).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-end justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-sky-300/80">Finance You</p>
            <h1 className="text-xl sm:text-2xl font-semibold">Ostatnie okazje inwestycyjne</h1>
            <p className="mt-1 text-xs text-slate-400">
              {data.length} najnowszych wniosków.
            </p>
          </div>
          {withAmount > 0 && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-widest text-slate-400">Suma</p>
              <p className="text-lg sm:text-xl font-semibold tabular-nums text-emerald-300">
                {formatPLN(total)}
              </p>
            </div>
          )}
        </header>

        {data.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-300">
            Brak okazji do wyświetlenia.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.map((l) => {
              const Icon = PROPERTY_ICONS[l.property_type] ?? Home;
              const label = PROPERTY_TYPE_LABELS[l.property_type] ?? l.property_type;
              return (
                <li
                  key={l.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur px-3 py-3 sm:px-4 sm:py-3 flex items-center gap-3 hover:bg-white/[0.07] transition"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-emerald-500/20 text-sky-100 ring-1 ring-white/10">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm text-slate-200">{label}</div>
                    <div className="mt-0.5 text-xs text-slate-400 tabular-nums">
                      {formatRelative(l.created_at)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {l.loan_amount != null ? (
                      <div className="text-sm sm:text-base font-semibold tabular-nums text-emerald-300">
                        {formatPLN(l.loan_amount)}
                      </div>
                    ) : (
                      <div className="text-[11px] uppercase tracking-wider text-slate-500">—</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="pt-3 text-center text-[11px] text-slate-500">
          financeyou.pl • zestawienie odświeżane automatycznie
        </footer>
      </div>
    </div>
  );
}

