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

// Ciasny padding na mobile, wygodniejszy od sm w górę — tabela ma się mieścić
// na szerokości ekranu telefonu bez przewijania poziomego.
const TH_CLASS =
  "whitespace-nowrap px-1.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500 first:pl-2.5 last:pr-2.5 sm:px-3 sm:py-3 sm:text-[10px] sm:tracking-widest sm:first:pl-5 sm:last:pr-5";
const TD_CLASS =
  "whitespace-nowrap px-1.5 py-2.5 align-middle first:pl-2.5 last:pr-2.5 sm:px-3 sm:py-3 sm:first:pl-5 sm:last:pr-5";

/** Tabela okazji — używana w publicznym embedzie i w podglądzie admina. */
export function LeadsTable({ leads }: { leads: PublicLead[] }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-sky-400/20 bg-gradient-to-br from-[#0f1846] via-[#0c1338] to-[#0a1030] shadow-[0_8px_30px_-12px_rgba(56,189,248,0.35)] [scrollbar-width:thin]">
        <table className="w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className={TH_CLASS}>Nieruchomość</th>
              <th className={TH_CLASS}>Kwota</th>
              <th className={TH_CLASS}>
                <span className="sm:hidden">Ryzyko</span>
                <span className="hidden sm:inline">Ocena ryzyka</span>
              </th>
              <th className={TH_CLASS}>
                <span className="sm:hidden">Lokalizacja</span>
                <span className="hidden sm:inline">Potencjał lokalizacji</span>
              </th>
              <th className={`${TH_CLASS} hidden md:table-cell`}>Dodano</th>
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
        szacunkowymi. Oznaczenie „szac." (na węższych ekranach „*") przy potencjale to wartość
        orientacyjna dla wydziału ksiąg wieczystych. Dane nie stanowią oferty ani rekomendacji
        inwestycyjnej.
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
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/20 via-indigo-500/15 to-emerald-400/10 ring-1 ring-white/10 sm:h-11 sm:w-11 sm:rounded-xl">
            <img
              src={icon}
              alt=""
              className="h-6 w-6 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] sm:h-9 sm:w-9"
            />
          </div>
          <div className="min-w-0">
            <p className="max-w-[92px] truncate text-[12px] font-bold text-white sm:max-w-none sm:text-sm">
              {label}
              {lead.first_name && (
                <span className="ml-2 hidden text-xs font-normal text-slate-300 sm:inline">
                  Klient: <span className="font-semibold text-white">{lead.first_name}</span>
                </span>
              )}
            </p>
            <p className="mt-0.5 max-w-[92px] truncate font-mono text-[9px] text-slate-400 sm:max-w-none sm:text-[11px]">
              {subtitle}
            </p>
          </div>
        </div>
      </td>
      <td className={`${TD_CLASS} text-[11px] font-bold tabular-nums text-white sm:text-sm`}>
        {formatPLN(lead.loan_amount ?? 0)}
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
      <td className={`${TD_CLASS} hidden tabular-nums text-slate-200 md:table-cell`}>{dateStr}</td>
    </tr>
  );
}

function GradeCell({ score, grade }: { score: number; grade: string }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = scoreColor(pct);
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black sm:h-7 sm:w-7 sm:text-sm"
        style={{
          color,
          backgroundColor: "rgba(255,255,255,0.06)",
          boxShadow: `inset 0 0 0 1px ${color}`,
        }}
      >
        {grade}
      </span>
      <span className="text-[11px] font-bold tabular-nums text-white sm:text-xs">
        {pct}
        <span className="hidden font-normal text-slate-400 sm:inline">/100</span>
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
    <div className="flex items-center gap-1 sm:gap-2" title={title}>
      <span className="text-[11px] font-bold tabular-nums text-white sm:text-xs">
        {pct}
        <span className="hidden font-normal text-slate-400 sm:inline">/100</span>
        {/* Na mobile „szac." zastępuje gwiazdka — pełny opis w atrybucie title. */}
        {scope === "prefix" && <span className="text-slate-400 sm:hidden">*</span>}
      </span>
      <span className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/10 sm:block">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </span>
      {scope === "prefix" && (
        <span className="hidden text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:inline">
          szac.
        </span>
      )}
    </div>
  );
}
