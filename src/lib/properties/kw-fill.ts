// Uzupełnianie pustych pól nieruchomości (tabela `properties`) z działu I-O
// księgi wieczystej (pkt 4 zlecenia „przypadki graniczne"). Moduł czysty.
//
// Zasada: wypełniamy wyłącznie pola puste. Pole wpisane ręcznie przez
// operatora nie jest nadpisywane — przy rozbieżności z KW zwracamy
// ostrzeżenie. Źródło każdego uzupełnionego pola trafia do `field_sources`.
import { parseKwAddress } from "@/lib/kw-address-core";
import { parseKwPropertyParams } from "@/lib/risk-assessment/kw-parse-core";

export interface PropertyRow {
  street?: string | null;
  building_number?: string | null;
  unit_number?: string | null;
  address?: string | null;
  city?: string | null;
  voivodeship?: string | null;
  area_sqm?: number | null;
  usage?: string | null;
  field_sources?: Record<string, unknown> | null;
}

export interface KwFillResult {
  /** Zmiany do zapisania (tylko puste pola). */
  patch: Record<string, unknown>;
  /** Pola uzupełnione z KW. */
  filled: string[];
  /** Rozbieżności z polami wpisanymi ręcznie (nie nadpisane). */
  conflicts: { field: string; current: string; kw: string }[];
  /** Czy zmienił się adres (wymaga ponownego geokodowania i przeliczenia ryzyka). */
  addressChanged: boolean;
}

function clean(v: unknown): string | null {
  const s = String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s && s !== "---" && s !== "—" ? s : null;
}

function norm(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/^(ul\.?|al\.?|pl\.?|os\.?)\s+/, "")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();
}

/** „POWSTAŃCÓW WARSZAWSKICH” → „Powstańców Warszawskich”. */
function tytul(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Wyznacza uzupełnienia `properties` z treści działu I-O. */
export function propertyFillFromKw(
  current: PropertyRow,
  dzial1o: string | null | undefined,
  kwNumber?: string | null,
): KwFillResult {
  const res: KwFillResult = { patch: {}, filled: [], conflicts: [], addressChanged: false };
  if (!dzial1o) return res;
  const a = parseKwAddress(dzial1o);
  const pp = parseKwPropertyParams(dzial1o);
  const street = clean(a.street) ? tytul(clean(a.street)!) : null;
  const building = clean(a.buildingNumber);
  const unit = clean(a.unitNumber);
  const city = clean(a.city) ? tytul(clean(a.city)!) : null;
  const voiv = clean(a.voivodeship) ? clean(a.voivodeship)!.toLowerCase() : null;
  const area = pp.usableAreaM2 ?? null;
  const usage = clean(pp.kind);
  const adres =
    street || city
      ? [
          [street, building ? (unit ? `${building}/${unit}` : building) : null]
            .filter(Boolean)
            .join(" "),
          city,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  const kandydaci: [keyof PropertyRow, string | number | null, boolean][] = [
    ["street", street, true],
    ["building_number", building, true],
    ["unit_number", unit, true],
    ["address", adres, true],
    ["city", city, true],
    ["voivodeship", voiv, false],
    ["area_sqm", area, false],
    ["usage", usage, false],
  ];
  const zrodla: Record<string, unknown> = { ...(current.field_sources ?? {}) };
  for (const [pole, wartosc, adresowe] of kandydaci) {
    if (wartosc == null || wartosc === "") continue;
    const teraz = current[pole];
    const pusty = teraz == null || String(teraz).trim() === "";
    if (pusty) {
      res.patch[pole] = wartosc;
      res.filled.push(pole);
      zrodla[pole] = { source: "kw_dzial_1o", kw_number: kwNumber ?? null };
      if (adresowe) res.addressChanged = true;
      continue;
    }
    const zgodne =
      typeof wartosc === "number"
        ? Math.abs(Number(teraz) - wartosc) < 0.5
        : norm(teraz) === norm(wartosc) || norm(teraz).includes(norm(wartosc));
    if (!zgodne) res.conflicts.push({ field: pole, current: String(teraz), kw: String(wartosc) });
  }
  if (res.filled.length) res.patch.field_sources = zrodla;
  return res;
}
