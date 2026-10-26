import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { verifiedCallerPhone } from "./ania-loan-purpose.server";
describe("loan purpose caller binding", () => {
  it("uses the provider phone-call metadata", () => expect(verifiedCallerPhone({ metadata: { phone_call: { external_number: "+48732059898" } } })).toBe("+48732059898"));
  it("rejects model identity and user_id", () => expect(verifiedCallerPhone({ user_id: "+48732059898", phone: "+48732059898", dynamic_variables: { phone: "+48732059898" } })).toBeNull());
});