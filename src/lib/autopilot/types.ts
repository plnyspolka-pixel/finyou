// Wspólne typy modułu autopilota (fabryka wideo, lead magnety, dwa tory).

/** Tory odbiorców (brief 2.2): pożyczkobiorcy (tylko firmy) i inwestorzy. */
export const TRACKS = ["pozyczkobiorca", "inwestor"] as const;
export type Track = (typeof TRACKS)[number];

/** Tor → audience używane przez lead magnety i marketing_materials. */
export const TRACK_TO_AUDIENCE: Record<Track, "klient" | "inwestor"> = {
  pozyczkobiorca: "klient",
  inwestor: "inwestor",
};

/** Tryby automatyzacji – te same wartości co ai_growth_settings.automation_mode. */
export const AUTOPILOT_MODES = ["off", "manual_review", "semi_auto", "full_autopilot"] as const;
export type AutopilotMode = (typeof AUTOPILOT_MODES)[number];

/** Rodzaje treści przechodzących przez bramkę compliance (brief 5.7). */
export const CONTENT_KINDS = [
  "script",
  "title",
  "description",
  "comment_reply",
  "email",
  "lead_magnet",
  "landing",
  "ad",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const PUBLISH_PLATFORMS = [
  "instagram_reels",
  "facebook_reels",
  "facebook_post",
  "youtube",
  "tiktok",
  "x",
] as const;
export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number];

export const AUTOPILOT_LOG_MODULE = "autopilot";
export const COMPLIANCE_LOG_MODULE = "compliance_gate";
