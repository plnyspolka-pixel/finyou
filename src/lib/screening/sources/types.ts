// Wspólne typy rekordów referencyjnych zwracanych przez parsery źródeł.

export interface PepPosition {
  title: string;
  catalogCode: string | null;
  from: string | null; // YYYY-MM-DD
  to: string | null; // YYYY-MM-DD; null = trwa lub brak danych
}

export interface PepRecord {
  sourceId: string;
  fullName: string;
  lastName: string | null;
  aliases: string[];
  birthDate: string | null;
  birthYear: number | null;
  nationality: string[];
  positions: PepPosition[];
  /** true, gdy źródło wprost mówi, że funkcja trwa. */
  current: boolean;
  sourceUrl: string | null;
}

export interface SanctionName {
  name: string;
  first?: string | null;
  last?: string | null;
  strong?: boolean;
  lang?: string | null;
}

export interface SanctionRecord {
  sourceId: string;
  entityType: "person" | "entity" | "vessel" | "aircraft" | "unknown";
  names: SanctionName[];
  primaryName: string;
  birthDates: string[]; // 'YYYY-MM-DD' albo 'YYYY'
  nationalities: string[];
  programme: string | null;
  listedAt: string | null;
  delistedAt: string | null;
  remarks: string | null;
  sourceUrl: string | null;
}

export const PEP_SOURCES = ["sejm_api", "wikidata", "senat", "kprm", "krs"] as const;
export const SANCTION_SOURCES = ["eu_fsf", "un_sc", "mswia", "ofac_sdn"] as const;
export type PepSource = (typeof PEP_SOURCES)[number];
export type SanctionSource = (typeof SANCTION_SOURCES)[number];
export type SourceKey = PepSource | SanctionSource;

export const SOURCE_LABELS: Record<SourceKey, string> = {
  sejm_api: "API Sejmu (posłowie)",
  wikidata: "Wikidata (SPARQL, CC0)",
  senat: "Senat RP (senatorowie)",
  kprm: "KPRM / gov.pl (Rada Ministrów)",
  krs: "API KRS (spółki Skarbu Państwa)",
  eu_fsf: "UE — skonsolidowana lista sankcji finansowych",
  un_sc: "ONZ — skonsolidowana lista Rady Bezpieczeństwa",
  mswia: "MSWiA — lista sankcyjna (ustawa z 13.04.2022)",
  ofac_sdn: "OFAC SDN (USA)",
};
