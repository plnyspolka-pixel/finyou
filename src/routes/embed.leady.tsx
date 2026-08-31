import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { formatPLN } from "@/lib/labels";
import { fetchPublicLeads, type PublicLead } from "@/lib/public-leads.functions";
import { property3dIcon, propertyLabel } from "@/lib/property-3d-icons";

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
      {
        name: "description",
        content: "Zanonimizowana lista ostatnich okazji inwestycyjnych Finance You.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedLeads,
});

function EmbedLeads() {
  const { data } = useSuspenseQuery(leadsQO);

  // Tło pod treścią (widoczne, zanim iframe dopasuje wysokość) musi być tak
  // samo ciemne jak karta — inaczej prześwituje jasny motyw aplikacji.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#0a1030";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  // Zgłaszamy rzeczywistą wysokość treści do strony-rodzica (iframe na
  // landingu), żeby okienko dopasowało się idealnie i tabela się nie ucinała.
  useEffect(() => {
    if (window.parent === window) return;
    const post = () => {
      window.parent.postMessage(
        { type: "fy:leady-embed:height", height: document.body.scrollHeight },
        "*",
      );
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="bg-[#0a1030] p-4 sm:p-6 text-slate-100">
      <div className="mx-auto max-w-6xl">
        {data.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-sm text-slate-300">
            Brak okazji do wyświetlenia.
          </div>
        ) : (
          <LeadsTable leads={data} />
        )}
      </div>
    </div>
  );
}

// Kolor od czerwonego (0) do zielonego (100) przez pomarańcz/żółć.
function scoreColor(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  const hue = Math.round((s / 100) * 130); // 0=red, 130=green
  return `hsl(${hue} 85% 52%)`;
}

const TH_CLASS =
  "whitespace-nowrap px-3 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
const TD_CLASS =
  "whitespace-nowrap px-3 py-3 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";

/** Tabela okazji — używana w publicznym embedzie i w podglądzie admina. */
export function LeadsTable({ leads }: { leads: PublicLead[] }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-sky-400/20 bg-gradient-to-br from-[#0f1846] via-[#0c1338] to-[#0a1030] shadow-[0_8px_30px_-12px_rgba(56,189,248,0.35)] [scrollbar-width:thin]">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className={TH_CLASS}>Nieruchomość</th>
              <th className={TH_CLASS}>Kwota</th>
              <th className={TH_CLASS}>LTV</th>
              <th className={TH_CLASS}>Okres</th>
              <th className={TH_CLASS}>Ocena ryzyka</th>
              <th className={TH_CLASS}>Potencjał lokalizacji</th>
              <th className={TH_CLASS}>Dodano</th>
              <th className={TH_CLASS}>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <LeadRow key={l.id} lead={l} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Ocena ryzyka (skala 0–100, klasy A–E) i potencjał lokalizacyjny (skala 0–100) są wartościami
        szacunkowymi. Oznaczenie „szac." przy potencjale to wartość orientacyjna dla wydziału ksiąg
        wieczystych. Dane nie stanowią oferty ani rekomendacji inwestycyjnej.
      </p>
    </div>
  );
}

function LeadRow({ lead }: { lead: PublicLead }) {
  const icon = property3dIcon(lead.property_type);
  const label = propertyLabel(lead.property_type);
  const subtitle = lead.kw_masked ?? "KW w przygotowaniu";
  const dateStr = new Date(lead.created_at).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
  });

  return (
    <tr className="border-b border-white/5 last:border-b-0 transition-colors hover:bg-white/[0.04]">
      <td className={TD_CLASS}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400/20 via-indigo-500/15 to-emerald-400/10 ring-1 ring-white/10">
            <img
              src={icon}
              alt=""
              className="h-9 w-9 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
            />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white">
              {label}
              {lead.first_name && (
                <span className="ml-2 text-xs font-normal text-slate-300">
                  Klient: <span className="font-semibold text-white">{lead.first_name}</span>
                </span>
              )}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>
      </td>
      <td className={`${TD_CLASS} font-bold tabular-nums text-white`}>
        {formatPLN(lead.loan_amount ?? 0)}
      </td>
      <td className={`${TD_CLASS} tabular-nums text-slate-200`}>
        {lead.ltv != null ? `${lead.ltv}%` : "—"}
      </td>
      <td className={`${TD_CLASS} tabular-nums text-slate-200`}>
        {lead.period_months != null ? `${lead.period_months} mies.` : "—"}
      </td>
      <td className={TD_CLASS}>
        <GradeCell score={lead.score} grade={lead.grade} />
      </td>
      <td className={TD_CLASS}>
        <LocationCell
          score={lead.location_score}
          confidence={lead.location_confidence}
          scope={lead.location_scope}
        />
      </td>
      <td className={`${TD_CLASS} tabular-nums text-slate-200`}>{dateStr}</td>
      <td className={TD_CLASS}>
        {lead.is_new ? (
          <span className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-900 shadow-[0_4px_12px_-2px_rgba(245,158,11,0.6)]">
            Nowa oferta
          </span>
        ) : (
          <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
            Szuka inwestora
          </span>
        )}
      </td>
    </tr>
  );
}

function GradeCell({ score, grade }: { score: number; grade: string }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = scoreColor(pct);
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-black"
        style={{
          color,
          backgroundColor: "rgba(255,255,255,0.06)",
          boxShadow: `inset 0 0 0 1px ${color}`,
        }}
      >
        {grade}
      </span>
      <span className="text-xs font-bold tabular-nums text-white">
        {pct}
        <span className="font-normal text-slate-400">/100</span>
      </span>
    </div>
  );
}

// Potencjał lokalizacyjny: wartość 0–100 z paskiem; „szac." = wynik orientacyjny
// dla wydziału KW (prefiksu), nie dla konkretnej nieruchomości.
function LocationCell({
  score,
  confidence,
  scope,
}: {
  score: number | null;
  confidence: number | null;
  scope: PublicLead["location_scope"];
}) {
  if (score == null) return <span className="text-xs text-slate-500">w analizie</span>;
  const pct = Math.max(0, Math.min(100, score));
  const color = scoreColor(pct);
  const title = [
    `Potencjał lokalizacyjny: ${pct}/100`,
    confidence != null ? `Pewność: ${confidence}%` : null,
    scope === "prefix" ? "Wartość orientacyjna dla wydziału KW" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="text-xs font-bold tabular-nums text-white">
        {pct}
        <span className="font-normal text-slate-400">/100</span>
      </span>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </span>
      {scope === "prefix" && (
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          szac.
        </span>
      )}
    </div>
  );
}
