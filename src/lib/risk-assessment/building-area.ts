// Powierzchnia budynku/lokalu do wyceny. Zasada: dla domu, mieszkania i lokalu
// powierzchnią jest WYŁĄCZNIE powierzchnia użytkowa (z KW albo z wniosku).
// Obszar działki z działu I-O KW nigdy nie jest powierzchnią domu — gdy innych
// danych brak, powierzchnia domu jest NIEZNANA (null), a nie równa działce.

/** Typy, w których przedmiotem wyceny jest budynek/lokal (zł/m² pow. użytkowej). */
const BUILDING_TYPES = new Set(["dom", "mieszkanie", "lokal_uslugowy"]);

export function isBuildingPropertyType(type: string | null | undefined): boolean {
  return BUILDING_TYPES.has(String(type ?? "").toLowerCase());
}

export const UNKNOWN_HOUSE_AREA_NOTE =
  "Powierzchnia domu nieznana — brak powierzchni użytkowej w KW i we wniosku; obszaru działki nie przyjęto jako powierzchni domu. Uzupełnij powierzchnię użytkową (np. z projektu, operatu, ogłoszenia lub od klienta).";

/** Czy wartość to w praktyce obszar działki (np. wcześniej przepisany z KW do area_sqm). */
function equalsLandArea(
  area: number,
  landAreaM2: number | null | undefined,
  landAreaHa: number | null | undefined,
): boolean {
  const candidates = [landAreaM2, landAreaHa != null ? landAreaHa * 10_000 : null].filter(
    (v): v is number => v != null && v > 0,
  );
  return candidates.some((land) => Math.abs(land - area) < 1);
}

export interface BuildingAreaResult {
  /** Powierzchnia użytkowa budynku/lokalu; null = nieznana. */
  areaM2: number | null;
  /** Odrzucono powierzchnię z rekordu, bo była obszarem działki. */
  discardedLandArea: boolean;
  /** Notatka dla raportu, gdy powierzchnia nieznana albo odrzucona. */
  note: string | null;
}

/**
 * Powierzchnia użytkowa budynku/lokalu: KW → rekord wniosku. Wartość z rekordu
 * równa obszarowi działki z KW jest odrzucana (stary backfill działki do area_sqm).
 */
export function resolveBuildingArea(args: {
  propertyType: string | null | undefined;
  kwUsableAreaM2?: number | null;
  recordAreaM2?: number | null;
  landAreaM2?: number | null;
  landAreaHa?: number | null;
}): BuildingAreaResult {
  if (args.kwUsableAreaM2 != null && args.kwUsableAreaM2 > 0) {
    return { areaM2: args.kwUsableAreaM2, discardedLandArea: false, note: null };
  }
  const rec = args.recordAreaM2 != null ? Number(args.recordAreaM2) : null;
  const isHouse = String(args.propertyType ?? "").toLowerCase() === "dom";
  if (rec != null && rec > 0) {
    if (equalsLandArea(rec, args.landAreaM2, args.landAreaHa)) {
      return {
        areaM2: null,
        discardedLandArea: true,
        note: isHouse
          ? `${UNKNOWN_HOUSE_AREA_NOTE} (Wartość ${rec.toLocaleString("pl-PL")} m² we wniosku to obszar działki z KW.)`
          : `Powierzchnia użytkowa nieznana — wartość ${rec.toLocaleString("pl-PL")} m² we wniosku to obszar działki z KW.`,
      };
    }
    return { areaM2: rec, discardedLandArea: false, note: null };
  }
  return {
    areaM2: null,
    discardedLandArea: false,
    note: isHouse ? UNKNOWN_HOUSE_AREA_NOTE : null,
  };
}
