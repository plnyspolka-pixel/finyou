// Wizualizacje otoczenia nieruchomości (ekran). Forma dobrana do zadania danych:
//  • karta lokalizacji        → kafelki (pojedyncze nagłówki, nie wykres),
//  • uciążliwości             → wykres odległości (punkt na osi 0–2 km + próg),
//  • powiat vs Polska         → słupek z markerem odniesienia (jedna oś na wiersz),
//  • zmiana ludności/migracje → słupki rozbieżne wokół zera (niebieski/czerwony),
//  • infrastruktura           → poziome słupki liczby punktów (jeden odcień),
//  • dożycie                  → e(x) regionu z markerem średniej Polski.
// Kolor: jeden odcień marki dla wielkości, status („blisko”) zawsze ze słowem,
// para rozbieżna zwalidowana (dataviz validate_palette — jasny i ciemny motyw).
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { LocationTile } from "@/lib/property-analysis/location-summary";
import {
  NUISANCE_ALERT_M,
  NUISANCE_LABEL,
  type NuisancesInfo,
  type PowiatStats,
} from "@/lib/property-analysis/surroundings";

const num = (x: number) => String(x).replace(".", ",");
const fmtDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`;

// Kolory ról (jasny / ciemny motyw).
const BAR = "bg-primary";
const TRACK = "bg-muted";
const POS = "bg-[#2a78d6] dark:bg-[#3987e5]";
const NEG = "bg-[#e34948] dark:bg-[#e66767]";
const ALERT = "#ec835a";

export function LocationTiles({ tiles }: { tiles: LocationTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={
            t.accent
              ? "rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40"
              : "rounded-lg border bg-muted/30 p-3"
          }
        >
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t.accent && <AlertTriangle className="h-3 w-3 text-amber-600" aria-label="uwaga" />}
            {t.label}
          </div>
          <div className="mt-1 text-lg font-semibold leading-tight">{t.value}</div>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; swatch: ReactNode }> }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.swatch}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Słupek z markerem odniesienia; każdy wiersz ma własną skalę 0–max. */
export function CompareBars({
  rows,
  barName,
  refName,
}: {
  rows: Array<{
    label: string;
    value: number;
    ref?: number | null;
    max: number;
    valueLabel: string;
  }>;
  barName: string;
  refName?: string;
}) {
  if (!rows.length) return null;
  return (
    <div>
      <Legend
        items={[
          { label: barName, swatch: <span className={`h-2.5 w-2.5 rounded-sm ${BAR}`} /> },
          ...(refName
            ? [{ label: refName, swatch: <span className="h-3 w-0.5 bg-foreground" /> }]
            : []),
        ]}
      />
      <div className="space-y-1.5">
        {rows.map((r) => {
          const w = Math.max(0, Math.min(100, (r.value / r.max) * 100));
          const rx = r.ref != null ? Math.max(0, Math.min(100, (r.ref / r.max) * 100)) : null;
          return (
            <div
              key={r.label}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs"
              title={`${r.label}: ${r.valueLabel}`}
            >
              <span className="truncate font-medium text-muted-foreground">{r.label}</span>
              <div className={`relative h-2 rounded-full ${TRACK}`}>
                <div className={`h-2 rounded-full ${BAR}`} style={{ width: `${w}%` }} />
                {rx != null && (
                  <span
                    className="absolute -top-1 h-4 w-0.5 bg-foreground"
                    style={{ left: `calc(${rx}% - 1px)` }}
                  />
                )}
              </div>
              <span className="whitespace-nowrap tabular-nums">{r.valueLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Słupki rozbieżne wokół zera; wiersz z własną skalą (różne jednostki). */
export function DivergingBars({
  rows,
  positiveName,
  negativeName,
}: {
  rows: Array<{ label: string; value: number; maxAbs: number; valueLabel: string }>;
  positiveName: string;
  negativeName: string;
}) {
  if (!rows.length) return null;
  return (
    <div>
      <Legend
        items={[
          { label: positiveName, swatch: <span className={`h-2.5 w-2.5 rounded-sm ${POS}`} /> },
          { label: negativeName, swatch: <span className={`h-2.5 w-2.5 rounded-sm ${NEG}`} /> },
        ]}
      />
      <div className="space-y-1.5">
        {rows.map((r) => {
          const w = Math.min(50, (Math.abs(r.value) / r.maxAbs) * 50);
          return (
            <div
              key={r.label}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs"
              title={`${r.label}: ${r.valueLabel}`}
            >
              <span className="truncate font-medium text-muted-foreground">{r.label}</span>
              <div className={`relative h-2 rounded-full ${TRACK}`}>
                <div
                  className={`absolute h-2 ${r.value >= 0 ? `${POS} rounded-r-full` : `${NEG} rounded-l-full`}`}
                  style={
                    r.value >= 0
                      ? { left: "50%", width: `${w}%` }
                      : { right: "50%", width: `${w}%` }
                  }
                />
                <span className="absolute -top-1 left-1/2 h-4 w-px bg-muted-foreground" />
              </div>
              <span className="whitespace-nowrap tabular-nums">{r.valueLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Wykres odległości uciążliwości: punkt na osi 0–promień, kreska progu „blisko”. */
export function NuisanceDistanceChart({ info }: { info: NuisancesInfo }) {
  if (!info.hits.length) return null;
  const max = info.radiusM;
  // Trzy podziałki (0, połowa, promień) — skrajne wyrównane do krawędzi, bez zawijania.
  const ticks = [0, max / 2, max];
  return (
    <div>
      <Legend
        items={[
          { label: "obiekt", swatch: <span className="h-2.5 w-2.5 rounded-full bg-primary" /> },
          {
            label: "bliżej niż próg uciążliwości",
            swatch: <span className="h-2.5 w-2.5 rounded-full" style={{ background: ALERT }} />,
          },
          { label: "próg", swatch: <span className="h-3 w-px bg-muted-foreground" /> },
        ]}
      />
      <div className="space-y-1">
        {info.hits.map((h) => {
          const x = Math.min(100, (h.distanceM / max) * 100);
          const t = Math.min(100, (NUISANCE_ALERT_M[h.key] / max) * 100);
          // Nazwa obiektu tylko, gdy nie powtarza kategorii („Cmentarz (Cmentarz …)”).
          const cat = NUISANCE_LABEL[h.key];
          const dup = h.name && h.name.toLowerCase().startsWith(cat.split(/[ /]/)[0].toLowerCase());
          const label = dup ? (h.name as string) : `${cat}${h.name ? ` (${h.name})` : ""}`;
          return (
            <div
              key={h.key}
              className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-2 text-xs"
              title={`${label}: ${fmtDistance(h.distanceM)}${h.alert ? " — blisko" : ""}`}
            >
              <span className="truncate font-medium text-muted-foreground">{label}</span>
              <div className="relative h-4">
                <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                <span
                  className="absolute top-0.5 h-3 w-px bg-muted-foreground"
                  style={{ left: `${t}%` }}
                />
                <span
                  className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${h.alert ? "" : "bg-primary"}`}
                  style={{ left: `${x}%`, ...(h.alert ? { background: ALERT } : {}) }}
                />
              </div>
              <span className={`whitespace-nowrap tabular-nums ${h.alert ? "font-semibold" : ""}`}>
                {fmtDistance(h.distanceM)}
                {h.alert ? " · blisko" : ""}
              </span>
            </div>
          );
        })}
        <div className="grid grid-cols-[minmax(0,12rem)_1fr_auto] gap-2 text-[10px] text-muted-foreground">
          <span />
          <div className="relative h-3">
            {ticks.map((tk, i) => (
              <span
                key={tk}
                className={`absolute whitespace-nowrap ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: `${(tk / max) * 100}%` }}
              >
                {fmtDistance(tk)}
              </span>
            ))}
          </div>
          <span className="invisible">0 m · blisko</span>
        </div>
      </div>
    </div>
  );
}

/** Poziome słupki jednej miary (np. liczba punktów infrastruktury). */
export function BarList({
  rows,
  max,
}: {
  rows: Array<{ label: string; value: number; valueLabel: string; title?: string }>;
  max: number;
}) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs"
          title={r.title ?? `${r.label}: ${r.valueLabel}`}
        >
          <span className="truncate font-medium text-muted-foreground">{r.label}</span>
          <div className={`h-2 rounded-full ${TRACK}`}>
            <div
              className={`h-2 rounded-full ${BAR}`}
              style={{ width: `${Math.max(2, Math.min(100, (r.value / max) * 100))}%` }}
            />
          </div>
          <span className="whitespace-nowrap tabular-nums">{r.valueLabel}</span>
        </div>
      ))}
    </div>
  );
}

/** Powiat na tle Polski: kafelki + słupki z markerem + słupki rozbieżne. */
export function PowiatPanel({ pw }: { pw: PowiatStats }) {
  const cmp: Array<{
    label: string;
    value: number;
    ref?: number | null;
    max: number;
    valueLabel: string;
  }> = [];
  if (pw.unemploymentPct != null)
    cmp.push({
      label: "Stopa bezrobocia",
      value: pw.unemploymentPct,
      ref: pw.unemploymentPolandPct,
      max: Math.max(pw.unemploymentPct, pw.unemploymentPolandPct ?? 0) * 1.4 || 10,
      valueLabel: `${num(pw.unemploymentPct)}% (PL ${pw.unemploymentPolandPct != null ? num(pw.unemploymentPolandPct) : "—"}%)`,
    });
  if (pw.wageIndexPl100 != null)
    cmp.push({
      label: "Wynagrodzenia",
      value: pw.wageIndexPl100,
      ref: 100,
      max: Math.max(150, pw.wageIndexPl100 * 1.1),
      valueLabel: `${num(pw.wageIndexPl100)}% średniej PL`,
    });
  const div: Array<{ label: string; value: number; maxAbs: number; valueLabel: string }> = [];
  if (pw.populationChange5yPct != null)
    div.push({
      label: "Zmiana ludności (5 lat)",
      value: pw.populationChange5yPct,
      maxAbs: Math.max(10, Math.abs(pw.populationChange5yPct)),
      valueLabel: `${pw.populationChange5yPct > 0 ? "+" : ""}${num(pw.populationChange5yPct)}%`,
    });
  if (pw.migrationPer1000 != null)
    div.push({
      label: "Saldo migracji",
      value: pw.migrationPer1000,
      maxAbs: Math.max(10, Math.abs(pw.migrationPer1000)),
      valueLabel: `${pw.migrationPer1000 > 0 ? "+" : ""}${num(pw.migrationPer1000)} ‰`,
    });
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">
        {pw.unitName} na tle Polski — GUS {pw.year}
        {pw.population != null && (
          <span className="ml-2 font-normal text-muted-foreground">
            {pw.population.toLocaleString("pl-PL")} mieszkańców
          </span>
        )}
      </div>
      <CompareBars rows={cmp} barName="powiat" refName="Polska" />
      <DivergingBars rows={div} positiveName="przyrost / napływ" negativeName="spadek / odpływ" />
    </div>
  );
}
