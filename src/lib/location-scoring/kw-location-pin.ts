// Zawężenie rozkładu lokalizacji do gminy wskazanej w dziale I-O księgi wieczystej.
//
// Sam prefiks KW wyznacza tylko okręg wydziału (kilka–kilkanaście gmin). Gdy
// mamy pobraną treść KW, dział I-O podaje urzędowe położenie (gmina,
// miejscowość) — wtedy zamiast rozkładu po całym okręgu bierzemy gminę z księgi.
// Warstwa czysta (bez Supabase) — testowalna.

import type { LocationCandidate } from "./types";

export type KwLocationHint = {
  gmina?: string | null;
  city?: string | null;
  powiat?: string | null;
};

export type KwLocationPin = {
  candidates: LocationCandidate[];
  /** Nazwy gmin, do których zawężono rozkład; null = brak zawężenia. */
  pinnedTo: string[] | null;
};

function norm(s: string | null | undefined): string {
  return (
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/ł/g, "l")
      .replace(/\(.*?\)/g, " ")
      // „SŁUPSK M." / „M. SŁUPSK" / „M. ST. WARSZAWA" → „slupsk" / „warszawa"
      .replace(/(^|\s)m\.\s*st\.?(\s|$)/g, " ")
      .replace(/(^|\s)m\.(\s|$)/g, " ")
      .replace(/(^|\s)(gmina|miasto|powiat)(\s|$)/g, " ")
      .replace(/[^a-z0-9 -]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Czy treść KW wskazuje gminę miejską / miasto na prawach powiatu (true), wiejską (false). */
function urbanHint(hint: KwLocationHint): boolean | null {
  const raw = `${hint.gmina ?? ""} | ${hint.powiat ?? ""}`;
  if (/wiejsk/i.test(hint.gmina ?? "")) return false;
  if (/(^|\s)m\.(\s|$)|(^|\s)m\.\s*st\.?|miejsk|na prawach powiatu/i.test(raw)) return true;
  return null;
}

export function pinCandidatesToKwLocation(
  candidates: LocationCandidate[],
  hint: KwLocationHint | null | undefined,
): KwLocationPin {
  const none: KwLocationPin = { candidates, pinnedTo: null };
  if (!hint || candidates.length === 0) return none;
  const wanted = [norm(hint.gmina), norm(hint.city)].filter(Boolean);
  if (wanted.length === 0) return none;

  // Najpierw gmina (jednostka TERYT w danych referencyjnych), potem miejscowość.
  let matched: LocationCandidate[] = [];
  for (const w of wanted) {
    matched = candidates.filter((c) => norm(c.area.name) === w);
    if (matched.length > 0) break;
  }
  if (matched.length === 0) return none;

  // Ta sama nazwa dla gminy miejskiej i wiejskiej (Słupsk, Ustka…) — rozstrzyga
  // oznaczenie z KW („M." / „gmina wiejska"); gęstość odróżnia miasto od wsi.
  if (matched.length > 1) {
    const urban = urbanHint(hint);
    if (urban !== null) {
      const sorted = [...matched].sort((a, b) => b.area.densityPerKm2 - a.area.densityPerKm2);
      matched = [urban ? sorted[0] : sorted[sorted.length - 1]];
    }
  }

  return { candidates: matched, pinnedTo: matched.map((c) => c.area.name) };
}
