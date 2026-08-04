import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { formatPLN } from "@/lib/labels";
import { fetchPublicLeads } from "@/lib/public-leads.functions";
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
  // landingu), żeby okienko dopasowało się idealnie i karty się nie ucinały.
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
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden pb-3 [scrollbar-width:thin]">
            {data.map((l) => (
              <div key={l.id} className="w-[300px] shrink-0 snap-start sm:w-[340px]">
                <LeadCard lead={l} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: import("@/lib/public-leads.functions").PublicLead }) {
  const icon = property3dIcon(lead.property_type);
  const label = propertyLabel(lead.property_type);
  const subtitle = lead.kw_masked ?? "KW w przygotowaniu";
  const dateStr = new Date(lead.created_at).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
  });

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-sky-400/20 bg-gradient-to-br from-[#0f1846] via-[#0c1338] to-[#0a1030] shadow-[0_8px_30px_-12px_rgba(56,189,248,0.35)] transition hover:border-sky-400/40 hover:shadow-[0_12px_40px_-12px_rgba(56,189,248,0.55)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/20 via-indigo-500/15 to-emerald-400/10 ring-1 ring-white/10 shadow-[0_6px_20px_-6px_rgba(56,189,248,0.55)]">
            <img
              src={icon}
              alt=""
              className="h-14 w-14 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-white sm:text-lg">{label}</h3>
            {lead.first_name && (
              <p className="mt-0.5 truncate text-xs text-slate-300">
                Klient: <span className="font-semibold text-white">{lead.first_name}</span>
              </p>
            )}
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{subtitle}</p>
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

      {/* Score + Grade */}
      <ScoreRow score={lead.score} grade={lead.grade} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/5 px-4 py-4 sm:px-5">
        <Stat label="Kwota" value={formatPLN(lead.loan_amount ?? 0)} />
        <Stat label="Dodano" value={dateStr} />
      </div>

      {/* CTA */}
      <div className="border-t border-white/5 bg-gradient-to-r from-sky-500/90 via-sky-500/80 to-indigo-500/80 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between text-sm font-semibold text-white">
          <span>Oferta szuka inwestora</span>
          <span aria-hidden className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>
    </article>
  );
}

// Kolor od czerwonego (0) do zielonego (100) przez pomarańcz/żółć.
function scoreColor(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  const hue = Math.round((s / 100) * 130); // 0=red, 130=green
  return `hsl(${hue} 85% 52%)`;
}

export function ScoreRow({ score, grade }: { score: number; grade: string }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = scoreColor(pct);
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="border-t border-white/5 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeWidth={stroke}
              className="fill-none stroke-white/10"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              stroke={color}
              strokeDasharray={`${dash} ${c - dash}`}
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black leading-none" style={{ color }}>
              {grade}
            </span>
            <span className="mt-0.5 text-[11px] font-bold tabular-nums text-white">
              {pct}
              <span className="text-[9px] text-slate-400">/100</span>
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Ocena ryzyka
          </p>
          <p className="mt-1 text-sm font-semibold text-white">Klasa {grade}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Skala 0–100 · A–E</p>
        </div>
      </div>
    </div>
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
