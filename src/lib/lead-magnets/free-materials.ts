// Dział „Darmowe materiały” na landingach /dla-klienta i /dla-inwestora:
// opublikowane lead magnety grupy (PDF-y do pobrania za e-mail) + kalkulatory
// toru. Czysta logika (kolejność, wykluczenie narzędzi) – bez bazy i bez
// treści PDF, żeby nie ciągnąć katalogu do bundla klienta.
import { CATALOG_SLUGS, type CatalogSlug } from "./catalog-slugs";
import type { LeadMagnetAudience } from "./core";

export type FreeMaterialRow = {
  slug: string;
  title: string;
  headline: string;
  subheadline: string | null;
  benefits: string[] | null;
  cta_text: string | null;
  file_name: string | null;
  audience: string;
  signup_count?: number | null;
};

export type FreeMaterial = {
  slug: string;
  title: string;
  headline: string;
  subheadline: string | null;
  /** Pierwsze dwa punkty strony zapisu – zajawka „co w środku”. */
  benefits: string[];
  cta_text: string;
  /** Materiał z katalogu startowego ma PDF generowany z kodu – zawsze do pobrania. */
  catalog: CatalogSlug | null;
};

export type FreeTool = {
  slug: string;
  title: string;
  promise: string;
  keyword: string;
  url: string;
};

export type FreeMaterials = {
  audience: LeadMagnetAudience;
  materials: FreeMaterial[];
  tools: FreeTool[];
};

export const EMPTY_FREE_MATERIALS = (audience: LeadMagnetAudience): FreeMaterials => ({
  audience,
  materials: [],
  tools: [],
});

const CATALOG_ORDER = new Map<string, number>(CATALOG_SLUGS.map((s, i) => [s, i]));

/**
 * Materiały grupy w kolejności lejka: najpierw katalog startowy (kolejność
 * z CATALOG_SLUGS – od świadomości do decyzji), potem materiały własne zespołu
 * wg liczby zapisów. Narzędzia (kalkulatory) mają własne wiersze w
 * `lead_magnets` – pomijamy je, bo pokazujemy je osobno jako kalkulatory.
 */
export function orderFreeMaterials(
  rows: readonly FreeMaterialRow[],
  opts: { audience: LeadMagnetAudience; toolSlugs: readonly string[]; max?: number },
): FreeMaterial[] {
  const tools = new Set(opts.toolSlugs);
  const max = opts.max ?? 6;
  return rows
    .filter((r) => r.audience === opts.audience && !tools.has(r.slug))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ca = CATALOG_ORDER.get(a.r.slug);
      const cb = CATALOG_ORDER.get(b.r.slug);
      if (ca !== undefined && cb !== undefined) return ca - cb;
      if (ca !== undefined) return -1;
      if (cb !== undefined) return 1;
      const sa = a.r.signup_count ?? 0;
      const sb = b.r.signup_count ?? 0;
      return sb - sa || a.i - b.i;
    })
    .slice(0, max)
    .map(({ r }) => ({
      slug: r.slug,
      title: r.title,
      headline: r.headline,
      subheadline: r.subheadline,
      benefits: (r.benefits ?? []).filter((b) => b.trim().length > 0).slice(0, 2),
      cta_text: r.cta_text?.trim() || "Pobierz bezpłatnie",
      catalog: CATALOG_ORDER.has(r.slug) ? (r.slug as CatalogSlug) : null,
    }));
}

/** Parametry UTM linku z działu na stronę zapisu – żeby w raporcie było widać, że zapis przyszedł ze strony. */
export function freeMaterialSearch(audience: LeadMagnetAudience) {
  return {
    utm_source: "financeyou",
    utm_medium: "landing",
    utm_campaign: `darmowe-materialy-${audience}`,
  } as const;
}

export const FREE_MATERIALS_SECTION_ID = "materialy";

export const FREE_MATERIALS_COPY: Record<
  LeadMagnetAudience,
  { eyebrow: string; title: string; sub: string; toolsLabel: string }
> = {
  klient: {
    eyebrow: "Darmowe materiały",
    title: "Zanim złożysz wniosek, przygotuj firmę. Bezpłatnie.",
    sub: "Przewodnik o finansowaniu firmy pod nieruchomość wyślemy na e-mail. Orientacyjną kwotę finansowania policzysz online bez zapisu — bez opłat i bez zobowiązań.",
    toolsLabel: "Policz sam, zanim zapytasz",
  },
  inwestor: {
    eyebrow: "Darmowe materiały",
    title: "Zacznij od bezpłatnych materiałów dla inwestora",
    sub: "Przewodniki i checklisty pokazują, jak działa pożyczka pod hipotekę i na co zwracać uwagę, a kalkulator liczy bufor bezpieczeństwa. Wysyłamy na e-mail, bez opłat.",
    toolsLabel: "Policz sam",
  },
};

export const FREE_MATERIALS_NOTE =
  "Materiały edukacyjne przygotowane z użyciem AI i zweryfikowane przez zespół Finance You. Nie stanowią porady prawnej, podatkowej ani inwestycyjnej. Finansowanie wyłącznie na cel gospodarczy; inwestowanie wiąże się z ryzykiem, w tym utraty kapitału.";

export function freeMaterialHref(audience: LeadMagnetAudience, slug: string): string {
  const q = new URLSearchParams(freeMaterialSearch(audience));
  return `/pobierz/${slug}?${q.toString()}`;
}
