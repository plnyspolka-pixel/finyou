import { describe, it, expect } from "vitest";
import { isSeparatelyManagedAgent, phoneAgentSyncStatus } from "./phone-agent-managed";

const PHONE = "agent_7201kshwfj22fcpr0bjpf31282dp";
const A1 = "agent_7701m1kr4mmrfdja1x5h79w5ktwz";

describe("agent telefoniczny 7201", () => {
  it("jest zarządzany osobno — synchronizacja go pomija", () => {
    expect(isSeparatelyManagedAgent(PHONE)).toBe(true);
    expect(isSeparatelyManagedAgent(A1)).toBe(false);
  });
  it("nie jest flagowany jako rozjechany", () => {
    expect(phoneAgentSyncStatus(PHONE, A1)).toEqual({ outOfSync: null, managedSeparately: PHONE });
  });
  it("inny obcy agent telefonu nadal jest flagowany", () => {
    expect(phoneAgentSyncStatus("agent_other", A1).outOfSync).toBe("agent_other");
    expect(phoneAgentSyncStatus(A1, A1).outOfSync).toBeNull();
  });
});
