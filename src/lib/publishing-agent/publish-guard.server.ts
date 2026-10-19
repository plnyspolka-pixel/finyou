/**
 * Jeden strażnik dla wszystkich publikatorów (Meta, TikTok, X, YouTube):
 * wyłączone platformy, pauza agenta dla wpisów agenta i bramka compliance.
 * Publikator woła go po optymistycznym przejęciu wpisu, PRZED wysyłką.
 */
import {
  enforcePublicationGate,
  gateRejectMessage,
  type QueueTable,
} from "./compliance-gate.server";
import { getAgentSettings } from "./agent-settings.server";
import { isAgentPaused, isPlatformDisabled } from "./safeguards";

export type GuardOutcome =
  | { action: "publish"; body: string; aiGenerated: boolean }
  | { action: "reject"; message: string }
  | { action: "hold"; message: string; until: Date };

export interface GuardRow {
  id: string;
  platform: string;
  title: string;
  body: string;
  video_url?: string | null;
  image_url?: string | null;
  origin?: string | null;
  audience_track?: string | null;
}

const HOLD_MINUTES = 60;

export async function guardQueuePublication(
  table: QueueTable,
  row: GuardRow,
  opts: { appendMandatory?: boolean } = {},
): Promise<GuardOutcome> {
  const settings = await getAgentSettings();
  if (isPlatformDisabled(settings, row.platform)) {
    return {
      action: "reject",
      message: `Platforma ${row.platform} jest wyłączona w ustawieniach agenta publikującego (publishing_agent_settings.disabled_platforms).`,
    };
  }
  if (row.origin === "agent") {
    const pause = isAgentPaused(settings);
    if (pause.paused) {
      return {
        action: "hold",
        message: `${pause.reason} — wpis agenta wstrzymany, ruszy po zdjęciu pauzy.`,
        until: new Date(Date.now() + HOLD_MINUTES * 60_000),
      };
    }
  }
  const gate = await enforcePublicationGate(table, row.id, {
    platform: row.platform,
    title: row.title,
    body: row.body,
    videoUrl: row.video_url,
    imageUrl: row.image_url,
    origin: row.origin,
    track: row.audience_track,
    appendMandatory: opts.appendMandatory,
  });
  if (gate.decision === "reject") return { action: "reject", message: gateRejectMessage(gate) };
  return { action: "publish", body: gate.body, aiGenerated: gate.aiGenerated };
}
