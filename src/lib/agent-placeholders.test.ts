import { describe, expect, it } from "vitest";
import { mergeAgentPlaceholders } from "./agent-placeholders";

describe("placeholder merge", () => {
  it("preserves provider-specific keys and values while adding missing defaults", () => {
    const result = mergeAgentPlaceholders({ forma: "Pani", imie_klienta: "Ewa", missing_documents: "KW", custom_flag: false });
    expect(result.forma).toBe("Pani");
    expect(result.imie_klienta).toBe("Ewa");
    expect(result.missing_documents).toBe("KW");
    expect(result.custom_flag).toBe(false);
    for (const key of ["lead_source", "lead_role", "lead_amount", "lead_created_at", "call_direction", "investor_id", "investor_access_token", "callback_reason"]) expect(result[key]).toBe("");
  });
});