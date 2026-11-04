// Karta lokalizacji — najważniejsze ustalenia jako kafelki (PDF i ekran).
// Czysta logika: bez zależności serwerowych i bez pdf-lib.
import type { PropertyAnalysisResult } from "./types";

const fmtNum = (n: number) => n.toLocaleString("pl-PL");

export interface LocationTile {
  label: string;
  value: string;
  /** Ustalenie wymagające uwagi (ryzyko) — wyróżnione, zawsze z opisem słownym. */
  accent?: boolean;
}

/** Karta lokalizacji — najważniejsze ustalenia jako kafelki (nagłówki, bez wykresu). */
export function locationTiles(c: PropertyAnalysisResult): LocationTile[] {
  const m = c.mpzp;
  const fr = c.floodRisk;
  const pa = c.surroundings?.protectedAreas;
  const nu = c.surroundings?.nuisances;
  const loc = c.locationScore;
  const close = nu?.hits.filter((h) => h.alert).length ?? 0;
  return [
    {
      label: "Plan miejscowy",
      value:
        m?.status === "found"
          ? (m.plans[0]?.symbol ?? "objęty planem")
          : m?.status === "none"
            ? "brak planu (WZ)"
            : "nie ustalono",
    },
    {
      label: "Zagrożenie powodziowe",
      value: !fr?.available
        ? "nie ustalono"
        : fr.riskLevel === "none"
          ? "brak"
          : fr.riskLevel === "low"
            ? "niskie (0,2%)"
            : fr.riskLevel === "medium"
              ? "średnie (1%)"
              : fr.riskLevel === "high"
                ? "wysokie (10%)"
                : fr.riskLevel === "very_high"
                  ? "bardzo wysokie"
                  : "nieznane",
      accent: Boolean(fr?.available && ["high", "very_high"].includes(fr.riskLevel)),
    },
    {
      label: "Ochrona przyrody",
      value:
        pa?.status === "checked"
          ? pa.areas.length
            ? `tak (${pa.areas.length})`
            : "poza obszarami"
          : "nie ustalono",
      accent: Boolean(pa?.areas.length),
    },
    {
      label: "Uciążliwości blisko",
      value: nu?.status === "checked" ? (close ? `${close} — sprawdź` : "brak") : "nie ustalono",
      accent: close > 0,
    },
    {
      label: "Infrastruktura 1,5 km",
      value: loc?.available === false ? "nie oceniono" : `${Math.round(loc?.score ?? 0)}/100`,
    },
    {
      label: "Działka (ULDK)",
      value: c.property.parcel?.areaM2
        ? `${fmtNum(c.property.parcel.areaM2)} m²`
        : c.property.parcel
          ? c.property.parcel.number
          : "nie ustalono",
    },
  ];
}
