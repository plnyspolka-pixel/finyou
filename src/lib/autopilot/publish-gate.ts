// Ostatnia bramka przed publikacją z kolejek (Meta, TikTok, X, YouTube) —
// czysta decyzja, bez I/O (testy: publish-gate.test.ts). Strona serwerowa:
// publish-gate.server.ts.
//
// Dlaczego w tickach, a nie tylko przy tworzeniu treści: do kolejek pisze
// kilka ścieżek (Studio, materiały, MCP `queue_social_publication`,
// auto-publikacja po renderze, autopilot). Sprawdzenie tuż przed wysyłką
// jest jedynym miejscem, którego nie da się ominąć (brief 5.7: „nie ma
// ścieżki ominięcia”). Tu działa tylko warstwa deterministyczna — recenzent
// LLM i pętla przepisywania są przy tworzeniu treści (compliance.server.ts).
import {
  applyMandatoryElements,
  checkHardRules,
  describeViolations,
  inferTrack,
  type ContentKind,
  type HardViolation,
  type TrackOrBoth,
} from "./compliance-rules";

export type GateItem = {
  platform: string;
  title: string | null;
  message: string | null;
  track: string | null;
  autopilot: boolean;
};

export type GateSettings = {
  killSwitch: boolean;
  disabledPlatforms: readonly string[];
};

export type GateDecision =
  | {
      action: "publish";
      title: string;
      message: string;
      track: TrackOrBoth;
      added: string[];
      changed: boolean;
    }
  | { action: "block"; track: TrackOrBoth; violations: HardViolation[]; reason: string }
  | { action: "defer"; reason: string }
  | { action: "disabled"; reason: string };

export function captionKindFor(platform: string): ContentKind {
  return platform === "facebook_post" || platform === "x" ? "post_caption" : "video_caption";
}

function normalizeTrack(t: string | null, text: string): TrackOrBoth {
  if (t === "pozyczkobiorca" || t === "inwestor" || t === "oba") return t;
  return inferTrack(text);
}

/** Platforma w kolejce → nazwa kanału w `disabled_platforms` (youtube = youtube). */
export function isPlatformDisabled(platform: string, disabled: readonly string[]): boolean {
  return disabled.includes(platform);
}

export function decidePublishGate(item: GateItem, settings: GateSettings): GateDecision {
  if (isPlatformDisabled(item.platform, settings.disabledPlatforms)) {
    return {
      action: "disabled",
      reason: `Kanał ${item.platform} jest wyłączony w ustawieniach autopilota (disabled_platforms).`,
    };
  }
  if (item.autopilot && settings.killSwitch) {
    return { action: "defer", reason: "Wyłącznik awaryjny autopilota — publikacja wstrzymana." };
  }
  const title = (item.title ?? "").trim();
  const message = (item.message ?? "").trim();
  const track = normalizeTrack(item.track, `${title}\n${message}`);
  const kind = captionKindFor(item.platform);

  const violations = [
    ...checkHardRules(title, { track, kind: "title" }),
    ...checkHardRules(message, { track, kind }),
  ];
  // Ta sama reguła z tytułu i opisu — raz.
  const unique = violations.filter(
    (v, i) => violations.findIndex((w) => w.ruleId === v.ruleId) === i,
  );
  if (unique.length) {
    return {
      action: "block",
      track,
      violations: unique,
      reason: `Bramka compliance: ${describeViolations(unique)}`,
    };
  }
  const mandatory = applyMandatoryElements(message, {
    track,
    kind,
    compact: item.platform === "x",
  });
  return {
    action: "publish",
    title,
    message: mandatory.text,
    track,
    added: mandatory.added,
    changed: mandatory.text !== (item.message ?? ""),
  };
}
