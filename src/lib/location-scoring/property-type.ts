// Mapowanie między enumem property_type z bazy (public.property_type) a typem
// modułu scoringowego (apartment/house/plot). Enum bazy:
//   'mieszkanie','dom','lokal_uslugowy','dzialka_budowlana','grunt_rolny',
//   'udzial_w_nieruchomosci','inna'.

import type { PlotType, PropertyType } from "./types";

export function toScoringPropertyType(dbType: string | null | undefined): PropertyType | null {
  switch ((dbType ?? "").toLowerCase()) {
    case "mieszkanie":
      return "apartment";
    case "dom":
      return "house";
    case "dzialka_budowlana":
    case "grunt_rolny":
      return "plot";
    // Lokale usługowe / udziały / inne — nie klasyfikujemy jako mieszkanie/dom/działka.
    default:
      return null;
  }
}

export function toDbPropertyType(t: PropertyType): string {
  switch (t) {
    case "apartment":
      return "mieszkanie";
    case "house":
      return "dom";
    case "plot":
      return "dzialka_budowlana";
  }
}

export function plotTypeFromDb(dbType: string | null | undefined): PlotType | undefined {
  switch ((dbType ?? "").toLowerCase()) {
    case "dzialka_budowlana":
      return "building";
    case "grunt_rolny":
      return "agricultural";
    default:
      return undefined;
  }
}
