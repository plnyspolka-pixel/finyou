import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { formatPLN } from "@/lib/labels";
import { fetchPublicLeads } from "@/lib/public-leads.functions";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-documents";

const PROPERTY_EMOJI: Record<string, string> = {
  apartment: "🏢",
  mieszkanie: "🏢",
  house: "🏠",
  dom: "🏠",
  plot_building: "🌳",
  dzialka: "🌳",
  commercial: "🏬",
  lokal_uslugowy: "🏬",
  inna: "🏗️",
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

  return (
    <div className="min-h-screen bg-[#0a1030] p-4 sm:p-6 text-slate-100">
      <div className="mx-auto max-w-6xl">
        {data.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-sm text-slate-300">
            Brak okazji do wyświetlenia.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((l) => (
              <LeadCard key={l.id} lead={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: import("@/lib/public-leads.functions").PublicLead }) {
  const emoji = PROPERTY_EMOJI[lead.property_type] ?? "🏗️";
  const label = PROPERTY_TYPE_LABELS[lead.property_type] ?? lead.property_type;

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-sky-400/20 bg-gradient-to-br from-[#0f1846] via-[#0c1338] to-[#0a1030] shadow-[0_8px_30px_-12px_rgba(56,189,248,0.35)] transition hover:border-sky-400/40 hover:shadow-[0_12px_40px_-12px_rgba(56,189,248,0.55)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/30 via-indigo-500/25 to-emerald-400/20 ring-1 ring-white/15 shadow-[0_6px_20px_-6px_rgba(56,189,248,0.6)] text-3xl leading-none">
            <span aria-hidden className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">{emoji}</span>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-white sm:text-lg">{label}</h3>
            {lead.city && (
              <p className="mt-0.5 truncate text-sm text-slate-400">{lead.city}</p>
            )}
          </div>
        </div>
        {lead.is_new ? (
          <span className="shrink-0 rounded-full bg-amber-500/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-900 shadow-[0_4px_12px_-2px_rgba(245,158,11,0.6)]">
            Nowa oferta
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
            Szuka inwestora
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 border-t border-white/5 px-4 py-4 sm:px-5">
        <Stat label="Kwota" value={formatPLN(lead.loan_amount ?? 0)} />
        <Stat label="LTV" value={lead.ltv != null ? `${lead.ltv}%` : "—"} />
        <Stat label="Okres" value={lead.period_months != null ? `${lead.period_months} mies.` : "—"} />
      </div>

      {/* CTA */}
      <div className="border-t border-white/5 bg-gradient-to-r from-sky-500/90 via-sky-500/80 to-indigo-500/80 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between text-sm font-semibold text-white">
          <span>Oferta szuka inwestora</span>
          <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-white sm:text-base">{value}</p>
    </div>
  );
}
