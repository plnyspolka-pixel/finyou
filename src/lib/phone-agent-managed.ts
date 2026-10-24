// Agent telefoniczny zarządzany osobno w konsoli ElevenLabs — synchronizacja
// promptów z panelu nigdy go nie nadpisuje i nie zgłasza jako rozjechanego.
export const SEPARATELY_MANAGED_AGENT_IDS: ReadonlySet<string> = new Set([
  "agent_7201kshwfj22fcpr0bjpf31282dp",
]);

export function isSeparatelyManagedAgent(agentId: string | null | undefined): boolean {
  return !!agentId && SEPARATELY_MANAGED_AGENT_IDS.has(agentId);
}

/** Wynik kontroli agenta telefonu po synchronizacji promptów. */
export function phoneAgentSyncStatus(
  phoneAgentId: string | null | undefined,
  intakeId: string | null | undefined,
): { outOfSync: string | null; managedSeparately: string | null } {
  if (!phoneAgentId || phoneAgentId === intakeId) return { outOfSync: null, managedSeparately: null };
  if (isSeparatelyManagedAgent(phoneAgentId)) return { outOfSync: null, managedSeparately: phoneAgentId };
  return { outOfSync: phoneAgentId, managedSeparately: null };
}
