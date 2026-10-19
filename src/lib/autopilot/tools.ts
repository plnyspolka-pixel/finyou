// Narzędzia-lead-magnety (kalkulatory) jako lead magnety systemu: każde
// narzędzie ma rekord w `lead_magnets` (ten sam slug, hasło w komentarzach,
// zgoda RODO, licznik zapisów, automat „komentarz z hasłem → link”), a mail
// po zapisie zawiera PEŁNY wynik z założeniami. Czysty moduł – bez I/O.
import type { CalculatorConfig, CalculatorRun } from "./calculator-engine";
import { RISK_LINES, SENDER_LINE } from "./compliance-rules";
import { TRACK_TO_AUDIENCE } from "./types";

export const TOOL_PATH_PREFIX = "/narzedzie";

export function toolPath(slug: string): string {
  return `${TOOL_PATH_PREFIX}/${slug}`;
}

/** Wiersz lead_magnets dla narzędzia (bez id / created_by). */
export function toolMagnetRow(cfg: CalculatorConfig, siteUrl: string, publish: boolean) {
  const url = `${siteUrl}${toolPath(cfg.slug)}`;
  const audience = TRACK_TO_AUDIENCE[cfg.track];
  return {
    slug: cfg.slug,
    title: cfg.title,
    audience,
    headline: cfg.title,
    subheadline: cfg.promise,
    benefits: cfg.assumptions.slice(0, 3),
    cta_text: "Pokaż pełny wynik",
    meta_description: cfg.promise.slice(0, 300),
    file_url: url,
    thank_you_message: "Gotowe – pełny wynik jest na stronie i w mailu.",
    instant_download: true,
    email_subject: `${cfg.title} – Twój wynik`,
    email_body:
      "Dzień dobry,\n\noto narzędzie „{tytul}”, o które prosisz: {link}\n\nPozdrawiamy,\nFinance You",
    subscriber_tags: ["narzedzie", `narzedzie:${cfg.slug}`, cfg.track],
    create_crm_lead: false,
    trigger_keywords: [cfg.keyword],
    match_any_post: false,
    published: publish,
  };
}

/** Treść maila z pełnym wynikiem (zwykły tekst; branding dokleja wrapper). */
export function toolResultEmail(
  cfg: CalculatorConfig,
  run: CalculatorRun,
  firstName: string | null,
): { subject: string; text: string } {
  const lines = [
    `Cześć${firstName ? ` ${firstName}` : ""}!`,
    "",
    `Pełny wynik narzędzia „${cfg.title}”:`,
    "",
    ...run.visible.map((r) => `• ${r.label}: ${r.value}`),
    "",
    "Założenia:",
    ...cfg.assumptions.map((a) => `– ${a}`),
    "",
    "Wynik możesz w każdej chwili przeliczyć ponownie: {link}",
    "",
    RISK_LINES[cfg.track],
    SENDER_LINE,
  ];
  return { subject: `${cfg.title} – Twój pełny wynik`, text: lines.join("\n") };
}
