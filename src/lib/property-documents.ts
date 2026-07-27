// Wspólne źródło prawdy: jakie dokumenty/zdjęcia wymagamy od klienta dla danego
// typu nieruchomości. Używane przez landing (PropertyTypesShowcase) oraz
// kalkulator postępu wniosku / przypomnienia dla voicebota.

export type DocRequirementKind =
  | "kw_number" // numer księgi wieczystej (pole tekstowe)
  | "photos_exterior" // zdjęcia z zewnątrz
  | "photos_interior" // zdjęcia każdego pomieszczenia
  | "mpzp" // MPZP / warunki zabudowy
  | "land_registry" // wypis z rejestru gruntów
  | "usable_area"; // powierzchnia użytkowa (pole liczbowe)

export interface DocRequirement {
  kind: DocRequirementKind;
  label: string;
}

// Klucze odpowiadają wartościom enum property_type w bazie.
export const REQUIREMENTS_BY_TYPE: Record<string, DocRequirement[]> = {
  mieszkanie: [
    { kind: "kw_number", label: "Numer księgi wieczystej" },
    { kind: "photos_interior", label: "Zdjęcia każdego pomieszczenia" },
    { kind: "photos_exterior", label: "Zdjęcia z zewnątrz" },
  ],
  dom: [
    { kind: "kw_number", label: "Numer księgi wieczystej" },
    { kind: "photos_exterior", label: "Zdjęcia z zewnątrz całego budynku" },
    { kind: "photos_interior", label: "Zdjęcia każdego pomieszczenia (bez piwnicy i strychu)" },
    { kind: "usable_area", label: "Powierzchnia użytkowa" },
  ],
  lokal_uslugowy: [
    { kind: "kw_number", label: "Numer księgi wieczystej" },
    { kind: "photos_interior", label: "Zdjęcia każdego pomieszczenia" },
    { kind: "photos_exterior", label: "Zdjęcia z zewnątrz" },
    { kind: "usable_area", label: "Powierzchnia użytkowa (jeśli lokal nie jest w bloku)" },
  ],
  grunt_rolny: [
    { kind: "land_registry", label: "Wypis z rejestru gruntów" },
    { kind: "kw_number", label: "Numer księgi wieczystej (jeśli nie ma go na wypisie)" },
  ],
  dzialka_budowlana: [
    { kind: "kw_number", label: "Numer księgi wieczystej" },
    { kind: "mpzp", label: "MPZP albo warunki zabudowy" },
  ],
  udzial_w_nieruchomosci: [
    { kind: "kw_number", label: "Numer księgi wieczystej" },
    { kind: "photos_exterior", label: "Zdjęcia z zewnątrz" },
  ],
  inna: [{ kind: "kw_number", label: "Numer księgi wieczystej" }],
};

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  mieszkanie: "Mieszkanie",
  dom: "Dom",
  lokal_uslugowy: "Lokal użytkowy",
  dzialka_budowlana: "Działka budowlana",
  grunt_rolny: "Grunt rolny",
  udzial_w_nieruchomosci: "Udział w nieruchomości",
  inna: "Inna",
};

// Mapowanie keywordów dokumentów wgranych do kategorii wymagań.
// Dopasowujemy do `document_type` / nazwy pliku.
export function classifyDocument(doc: {
  document_type?: string | null;
  file_name?: string | null;
}): DocRequirementKind | null {
  const t = `${doc.document_type ?? ""} ${doc.file_name ?? ""}`.toLowerCase();
  if (/(mpzp|warunki zabudowy|wz_)/.test(t)) return "mpzp";
  if (/(rejestr.gruntow|wypis|ewidencja.grunt)/.test(t)) return "land_registry";
  if (/(kw|ksiega|księga|wieczyst)/.test(t)) return "kw_number";
  if (/(wnetrz|wewnetrz|interior|pokoj|salon|kuchnia|łazienk)/.test(t)) return "photos_interior";
  if (/(zewnetrz|exterior|elewacj|front|fasad)/.test(t)) return "photos_exterior";
  return null;
}
