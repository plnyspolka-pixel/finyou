import { describe, expect, it } from "vitest";
import {
  isTrustpilotAfsAddress,
  normalizeTrustpilotAfsAddress,
  parseTrustpilotConfig,
  trustpilotLeadMagnetBcc,
} from "./trustpilot";

describe("Trustpilot AFS — adres", () => {
  it("przyjmuje tylko adresy w domenie invite.trustpilot.com", () => {
    expect(isTrustpilotAfsAddress("1234567890@invite.trustpilot.com")).toBe(true);
    expect(isTrustpilotAfsAddress("  1234567890@Invite.Trustpilot.COM ")).toBe(true);
    expect(isTrustpilotAfsAddress("kontakt@financeyou.pl")).toBe(false);
    expect(isTrustpilotAfsAddress("x@invite.trustpilot.com.zly.pl")).toBe(false);
    expect(isTrustpilotAfsAddress("x@trustpilot.com")).toBe(false);
    expect(isTrustpilotAfsAddress("")).toBe(false);
    expect(isTrustpilotAfsAddress(null)).toBe(false);
    expect(isTrustpilotAfsAddress(undefined)).toBe(false);
  });

  it("normalizuje wielkość liter i spacje, odrzuca obce domeny", () => {
    expect(normalizeTrustpilotAfsAddress(" ABC@invite.trustpilot.com ")).toBe(
      "abc@invite.trustpilot.com",
    );
    expect(normalizeTrustpilotAfsAddress("abc@gmail.com")).toBeNull();
    expect(normalizeTrustpilotAfsAddress("")).toBeNull();
  });
});

describe("Trustpilot AFS — konfiguracja", () => {
  it("czyta configuration odpornie na braki i śmieci", () => {
    expect(parseTrustpilotConfig(null)).toEqual({
      afs_bcc_email: null,
      invite_lead_magnets: false,
    });
    expect(parseTrustpilotConfig("x")).toEqual({ afs_bcc_email: null, invite_lead_magnets: false });
    expect(parseTrustpilotConfig([])).toEqual({ afs_bcc_email: null, invite_lead_magnets: false });
    expect(
      parseTrustpilotConfig({
        afs_bcc_email: "1@invite.trustpilot.com",
        invite_lead_magnets: true,
      }),
    ).toEqual({ afs_bcc_email: "1@invite.trustpilot.com", invite_lead_magnets: true });
    expect(
      parseTrustpilotConfig({ afs_bcc_email: "1@gmail.com", invite_lead_magnets: "tak" }),
    ).toEqual({ afs_bcc_email: null, invite_lead_magnets: false });
  });

  it("BCC tylko gdy integracja włączona, adres poprawny i zaproszenia po lead magnetach włączone", () => {
    const cfg = { afs_bcc_email: "1@invite.trustpilot.com", invite_lead_magnets: true };
    expect(trustpilotLeadMagnetBcc({ is_enabled: true, configuration: cfg })).toEqual([
      "1@invite.trustpilot.com",
    ]);
    expect(trustpilotLeadMagnetBcc({ is_enabled: false, configuration: cfg })).toEqual([]);
    expect(trustpilotLeadMagnetBcc({ is_enabled: null, configuration: cfg })).toEqual([]);
    expect(
      trustpilotLeadMagnetBcc({
        is_enabled: true,
        configuration: { ...cfg, invite_lead_magnets: false },
      }),
    ).toEqual([]);
    expect(
      trustpilotLeadMagnetBcc({
        is_enabled: true,
        configuration: { ...cfg, afs_bcc_email: "kontakt@financeyou.pl" },
      }),
    ).toEqual([]);
    expect(trustpilotLeadMagnetBcc({ is_enabled: true, configuration: null })).toEqual([]);
    expect(trustpilotLeadMagnetBcc(null)).toEqual([]);
    expect(trustpilotLeadMagnetBcc(undefined)).toEqual([]);
  });
});
