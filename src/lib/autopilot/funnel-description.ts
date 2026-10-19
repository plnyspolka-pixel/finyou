// Opis-lejek per platforma i tor (brief 5.3):
//   linia 1 – „Skomentuj HASŁO, a wyślę Ci [materiał]” albo link UTM,
//   linia 2 – narzędzie (kalkulator),
//   linia 3 – kim jesteśmy (KRS, lata na rynku),
//   zastrzeżenie o ryzyku + oznaczenie AI (wymuszane przez compliance).
// Czysty moduł – bez I/O.
import {
  AI_DISCLOSURE_LINE,
  RISK_LINES,
  SENDER_LINE,
  applyRequiredElements,
} from "./compliance-rules";
import type { PublishPlatform, Track } from "./types";

/** Limity znaków podpisu/opisu. */
export const CAPTION_LIMITS: Record<PublishPlatform, number> = {
  instagram_reels: 2200,
  facebook_reels: 2200,
  facebook_post: 5000,
  youtube: 5000,
  tiktok: 2200,
  x: 280,
};

/** Platformy, na których link w podpisie jest klikalny. */
const CLICKABLE_LINKS: PublishPlatform[] = ["facebook_post", "facebook_reels", "youtube", "x"];
/** Platformy z automatem „komentarz z hasłem → link/DM” (lead_magnet_posts). */
const KEYWORD_PLATFORMS: PublishPlatform[] = [
  "instagram_reels",
  "facebook_reels",
  "facebook_post",
  "youtube",
];

export interface FunnelInput {
  platform: PublishPlatform;
  track: Track;
  /** Teza rolki – 1–2 zdania. */
  thesis: string;
  keyword?: string | null;
  /** „wzór umowy”, „kalkulator LTV”… – co dostaje widz za hasło. */
  leadMagnetName?: string | null;
  /** Adres /pobierz/<slug> z UTM per publikacja. */
  leadMagnetUrl?: string | null;
  toolLabel?: string | null;
  toolUrl?: string | null;
  hashtags?: string[];
  followCta?: string;
}

/** UTM per publikacja: source = platforma, medium = social, campaign = tor/seria, content = id. */
export function withUtm(
  url: string,
  p: { platform: string; campaign: string; content?: string | null },
): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", p.platform);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", p.campaign);
  if (p.content) u.searchParams.set("utm_content", p.content);
  return u.toString();
}

export function buildFunnelDescription(input: FunnelInput): string {
  const { platform, track } = input;
  const links = CLICKABLE_LINKS.includes(platform);
  const lines: string[] = [];

  const kw = input.keyword?.trim().toUpperCase();
  if (kw && KEYWORD_PLATFORMS.includes(platform) && input.leadMagnetName) {
    lines.push(`👉 Skomentuj ${kw}, a wyślę Ci ${input.leadMagnetName}.`);
  } else if (links && input.leadMagnetUrl && input.leadMagnetName) {
    lines.push(`👉 ${capitalize(input.leadMagnetName)}: ${input.leadMagnetUrl}`);
  }
  if (input.toolLabel && input.toolUrl && links)
    lines.push(`🧮 ${input.toolLabel}: ${input.toolUrl}`);
  else if (input.toolLabel && !links) lines.push(`🧮 ${input.toolLabel} – link w bio.`);

  const head = [...lines];
  const tail: string[] = ["", input.followCta ?? "Obserwuj, żeby nie przegapić kolejnej części."];

  if (platform === "x") {
    // X: 280 znaków – teza + link, stopka skrócona (KRS i AI muszą zostać).
    const link = input.leadMagnetUrl ?? input.toolUrl ?? "";
    const footer = `Finance You, KRS 0000635207 · treść AI · ryzyko: decyzja należy do Ciebie.`;
    const budget = CAPTION_LIMITS.x - footer.length - (link ? link.length + 1 : 0) - 1;
    const thesis = truncate(input.thesis.trim(), Math.max(40, budget));
    return [thesis, link, footer].filter(Boolean).join("\n");
  }

  tail.push("", RISK_LINES[track], SENDER_LINE, AI_DISCLOSURE_LINE);
  const tags = (input.hashtags ?? []).filter(Boolean).slice(0, platform === "youtube" ? 3 : 5);
  if (tags.length) tail.push("", tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" "));

  const assemble = (thesis: string) =>
    [...head, "", thesis, ...tail]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  // Przy przekroczeniu limitu skracamy TEZĘ – stopka (ryzyko, KRS, AI) zostaje.
  const full = assemble(input.thesis.trim());
  const overflow = full.length - CAPTION_LIMITS[platform];
  const text =
    overflow > 0
      ? assemble(truncate(input.thesis.trim(), Math.max(20, input.thesis.trim().length - overflow)))
      : full;
  return applyRequiredElements(text, { kind: "description", track, platform });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
