import { describe, expect, it } from "vitest";
import { ANIA_IDENTITY_RULES, buildChannelRulesSection, channelRules } from "./agent-channel-rules";
import { buildAgentPrompt } from "./elevenlabs-agents.server";
import { buildIntakeChecklistRules } from "./property-intake-checklist";
import { INVESTOR_SELF_SERVICE_RULES } from "./investor-prompt-policy";
import { buildInvestorSalesScript } from "./investor-sales-script";

describe("shared Ania identity routing", () => {
  it.each(["intake", "investor_info", "investor_panel"] as const)("appends shared identity to %s without changing stored content", (surface) => {
    const stored = "Original stored prompt\nwith unchanged content.";
    const built = buildAgentPrompt(surface, stored);
    if (surface === "intake") {
      // Procedura przyjmowania zgłoszenia idzie na samą górę, potem prompt z panelu bez zmian.
      expect(built.startsWith(buildIntakeChecklistRules() + stored)).toBe(true);
    } else if (surface === "investor_info") {
      expect(built.startsWith(buildInvestorSalesScript() + INVESTOR_SELF_SERVICE_RULES + stored)).toBe(true);
    } else {
      expect(built.startsWith(INVESTOR_SELF_SERVICE_RULES + stored)).toBe(true);
    }
    expect(built.split(ANIA_IDENTITY_RULES)).toHaveLength(2);
  });
  it.each(["voice_phone", "voice_web", "chat", "chat_inwestor", "messenger", "instagram", "email", "sms"])("shares the identity across %s", (channel) => {
    expect(channelRules(channel).endsWith(ANIA_IDENTITY_RULES)).toBe(true);
  });
  it("uses the same identity for dynamic-channel agents", () => {
    expect(buildChannelRulesSection().endsWith(ANIA_IDENTITY_RULES)).toBe(true);
  });
});