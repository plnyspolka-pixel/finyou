// `thread_key` rozmowy z agentem ElevenLabs: `web:<sesja>` (widget),
// `<kanał>:<lead_id>` (tura tekstowa Messenger/IG/czat), `e2e:<lead_id>` (test).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lead z `thread_key` tury tekstowej; `web:<sesja>` i inne — null. */
export function leadIdFromThreadKey(threadKey: unknown): string | null {
  if (typeof threadKey !== "string" || threadKey.startsWith("web:")) return null;
  const i = threadKey.indexOf(":");
  if (i < 0) return null;
  const id = threadKey.slice(i + 1);
  return UUID_RE.test(id) ? id : null;
}
