import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

describe("stalledJobAction", () => {
  it("pierwsze ucięcie → z powrotem do kolejki, drugie → failed", async () => {
    const { stalledJobAction, STALL_RETRY_NOTE } = await import("./studio-video-queue.server");
    expect(stalledJobAction(null)).toBe("requeue");
    expect(stalledJobAction("jakaś notatka")).toBe("requeue");
    expect(stalledJobAction(STALL_RETRY_NOTE)).toBe("fail");
  });
});
