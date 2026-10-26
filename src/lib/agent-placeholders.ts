import { AGENT_DYNAMIC_VARIABLE_DEFAULTS } from "./agent-channel-rules";

/** Existing provider values win; synchronization only fills missing keys. */
export function mergeAgentPlaceholders(
  existing: Record<string, string | number | boolean> = {},
  defaults: Record<string, string | number | boolean> = AGENT_DYNAMIC_VARIABLE_DEFAULTS,
) {
  return { ...AGENT_DYNAMIC_VARIABLE_DEFAULTS, ...defaults, ...existing };
}