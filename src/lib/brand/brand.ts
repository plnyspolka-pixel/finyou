/**
 * Tokeny marki Finance You dla wszystkich generatorów agenta (PDF, strony
 * lead magnetów, narzędzia, maile, grafiki). Źródło: `brand.json`.
 */
import brand from "./brand.json";

export const BRAND = brand;
export type BrandColor = keyof typeof brand.colors;

/** Stopka każdego materiału (brief 5.4: logo, dane firmy, data/wersja, ryzyko, AI). */
export function brandFooter(opts: {
  version: string;
  date: Date;
  aiAssisted: boolean;
  riskLine: string;
}) {
  const d = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "long",
  }).format(opts.date);
  return [
    `${brand.legal.company}, KRS ${brand.legal.krs}, ${brand.legal.address} · ${brand.legal.email} · ${brand.legal.website.replace("https://", "")}`,
    `Wersja ${opts.version} · ${d}`,
    opts.riskLine,
    ...(opts.aiAssisted ? [brand.mandatory.aiNotice] : []),
  ].join("\n");
}
