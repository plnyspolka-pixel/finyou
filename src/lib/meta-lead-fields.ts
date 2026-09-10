// Odczyt pól z formularza leadowego Meta (`field_data`).
// Czyste funkcje — używa ich zarówno synchronizacja leadów Finance You,
// jak i przekazywanie leadów do panelu klienta zewnętrznego.

export function normPhone(p: string): string {
  const s = String(p ?? "").replace(/\s|-/g, "");
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 9) return `+48${d}`;
  if (d.length === 11 && d.startsWith("48")) return `+${d}`;
  return s.startsWith("+") ? s : `+${d}`;
}

export function splitName(full: string | null | undefined): { first: string; last: string } {
  const t = String(full ?? "").trim();
  if (!t) return { first: "Lead", last: "Meta" };
  const parts = t.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") || "—" };
}

export type PoleFormularza = { name?: string; values?: string[] | string };

export function extractField(fd: PoleFormularza[], names: string[]): string | null {
  if (!Array.isArray(fd)) return null;
  for (const f of fd) {
    const name = String(f.name ?? "").toLowerCase();
    if (names.some((n) => name.includes(n))) {
      return Array.isArray(f.values) ? f.values[0] : (f.values ?? null);
    }
  }
  return null;
}

// Odporny wychwyt telefonu: pola phone/telefon/…, a jeśli brak — 9-cyfrowy numer
// z dowolnego pola formularza lub z nazwy (gdy numer wkleił się w imię/nazwisko).
export function extractPhone(fd: PoleFormularza[], nameFallback?: string | null): string | null {
  const direct = extractField(fd, ["phone", "telefon", "tel", "mobile", "komórk", "komork"]);
  const digits = (p: string | null) => (p ? p.replace(/\D/g, "") : "");
  if (digits(direct).length >= 9) return direct;
  const hay = [
    ...(Array.isArray(fd)
      ? fd.map((f) => (Array.isArray(f?.values) ? f.values.join(" ") : String(f?.values ?? "")))
      : []),
    String(nameFallback ?? ""),
  ].join("  ");
  const m = hay.match(/(?<!\d)(?:\+?48[\s-]?)?(\d{3}[\s-]?\d{3}[\s-]?\d{3})(?!\d)/);
  return m ? m[0] : direct;
}

// Usuwa z nazwy wklejony numer telefonu (np. „Gadek691586905" → „Gadek").
export function cleanName(full: string | null | undefined): string | null {
  const t = String(full ?? "")
    .replace(/(?:\+?48[\s-]?)?\d[\d\s-]{7,}\d/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t || (full ?? null);
}
