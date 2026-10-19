// Tokeny marki dla generatorów (PDF, strony, maile, grafiki). Szablony
// czytają WYŁĄCZNIE stąd – agent nie składa layoutu od zera (brief 5.4).
import brandJson from "./brand.json";
import { COMPANY_DATA, COMPANY_REGISTRY_LINE } from "@/lib/company";

export const BRAND = brandJson;
export type BrandColors = typeof brandJson.colors;

/** Hex → [r, g, b] w zakresie 0–1 (pdf-lib `rgb()`). */
export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Stopka każdego materiału (brief 5.4): dane firmy, wersja/data, AI. */
export function brandFooterLines(opts: {
  version: string;
  date: string;
  aiAssisted: boolean;
}): string[] {
  return [
    `${COMPANY_DATA.legalName} · ${COMPANY_DATA.addressFull}`,
    COMPANY_REGISTRY_LINE,
    `${COMPANY_DATA.email} · ${COMPANY_DATA.phone.display} · ${COMPANY_DATA.website.replace("https://", "")}`,
    `Wersja ${opts.version} · ${opts.date}${opts.aiAssisted ? " · Treść przygotowana z użyciem AI" : ""}`,
  ];
}

/** Kontrast WCAG (do automatycznej kontroli wizualnej szablonów). */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = hexToRgb01(hex).map((c) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(fgHex);
  const b = lum(bgHex);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}
