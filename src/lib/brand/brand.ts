// Typowany dostęp do systemu marki (brand.json) — wspólny dla szablonów PDF,
// stron lead magnetów i narzędzi, maili i grafik. Spójność z COMPANY_DATA
// i z regułami compliance pilnuje brand.test.ts.
import brandJson from "./brand.json";

export type Brand = typeof brandJson;
export const BRAND: Brand = brandJson;

/** Kontrast WCAG (stosunek luminancji) dwóch kolorów #rrggbb. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Linia wersji materiału: „Wersja 3 · 19.10.2026”. */
export function versionLine(version: string | number, date: string): string {
  return BRAND.mandatory.versionLine.replace("{version}", String(version)).replace("{date}", date);
}
