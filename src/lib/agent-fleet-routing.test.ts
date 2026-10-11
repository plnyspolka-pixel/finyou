// Wspólny kanał tekstowy: podpisany klucz wątku (nie da się podrobić ani
// przenieść na cudzy wątek) i trasa wybierana przez kod z zapisanej potrzeby.
import { describe, expect, it } from "vitest";
import { mintThreadKey, threadSessionId, verifyThreadKey } from "./agent-tools/thread-key.server";
import { ROUTE_TTL_DAYS, agentIdForRoute, routeFromSession } from "./agent-fleet-routing.server";
import { resolveConversationId } from "./agent-tools/guard.server";
import { EXISTING_AGENTS } from "./agent-fleet";

const SECRET = "test-secret-1234567890";

describe("klucz wątku", () => {
  it("weryfikuje własny podpis i zwraca id wątku", () => {
    const key = mintThreadKey("lead:abc", SECRET)!;
    expect(verifyThreadKey(key, SECRET)).toBe("lead:abc");
  });

  it("odrzuca podmieniony wątek, obcy sekret i śmieci", () => {
    const key = mintThreadKey("lead:abc", SECRET)!;
    const forged = key.replace("lead:abc", "lead:xyz");
    expect(verifyThreadKey(forged, SECRET)).toBeNull();
    expect(verifyThreadKey(key, "inny-sekret")).toBeNull();
    expect(verifyThreadKey("thr1.lead:abc.AAAA", SECRET)).toBeNull();
    expect(verifyThreadKey(undefined, SECRET)).toBeNull();
    expect(verifyThreadKey(`${key}.extra`, SECRET)).toBeNull();
  });

  it("bez sekretu nie wybija klucza", () => {
    expect(mintThreadKey("lead:abc", "")).toBeNull();
  });
});

describe("klucz sesji narzędzi", () => {
  it("podpisany wątek → sesja wątku; bez niego → id rozmowy", () => {
    const prev = process.env.AGENT_TOOLS_SECRET;
    process.env.AGENT_TOOLS_SECRET = SECRET;
    try {
      const key = mintThreadKey("lead:abc")!;
      expect(resolveConversationId({ thread_key: key, conversation_id: "conv_1" }, null)).toBe(threadSessionId("lead:abc"));
      expect(resolveConversationId({ thread_key: "thr1.lead:abc.zly", conversation_id: "conv_1" }, null)).toBe("conv_1");
    } finally {
      process.env.AGENT_TOOLS_SECRET = prev;
    }
  });

  it("bez id rozmowy klucz jest jednorazowy — nie wyprowadzamy go z telefonu", () => {
    const a = resolveConversationId({ phone: "+48600100200" }, "+48600100200");
    const b = resolveConversationId({ phone: "+48600100200" }, "+48600100200");
    expect(a).toMatch(/^ephemeral:/);
    expect(a).not.toBe(b);
  });

  it("id rozmowy udające wątek jest odrzucane", () => {
    expect(resolveConversationId({ conversation_id: "thread:lead:abc" }, null)).toMatch(/^ephemeral:/);
  });
});

describe("trasa wątku", () => {
  const now = new Date("2026-10-11T10:00:00Z");

  it("bez potrzeby → recepcja", () => {
    expect(routeFromSession(null, now)).toBe("recepcja_tekst");
    expect(routeFromSession({ needs: {} }, now)).toBe("recepcja_tekst");
    expect(routeFromSession({ needs: { intent: "inne" } }, now)).toBe("recepcja_tekst");
  });

  it("potrzeba → specjalista", () => {
    const fresh = { updated_at: "2026-10-10T10:00:00Z" };
    expect(routeFromSession({ ...fresh, needs: { intent: "nowe_finansowanie" } }, now)).toBe("intake");
    expect(routeFromSession({ ...fresh, needs: { intent: "trwajacy_wniosek" } }, now)).toBe("intake");
    expect(routeFromSession({ ...fresh, needs: { intent: "inwestowanie" } }, now)).toBe("inwestor_presale_tekst");
    expect(routeFromSession({ ...fresh, needs: { intent: "inwestor_z_kontem" } }, now)).toBe("inwestor_panel");
    expect(routeFromSession({ ...fresh, needs: { intent: "splata_umowy" } }, now)).toBe("windykacja_tekst");
  });

  it(`po ${ROUTE_TTL_DAYS} dniach ciszy wątek wraca do recepcji`, () => {
    const old = new Date(now.getTime() - (ROUTE_TTL_DAYS + 1) * 86_400_000).toISOString();
    expect(routeFromSession({ updated_at: old, needs: { intent: "splata_umowy" } }, now)).toBe("recepcja_tekst");
  });

  it("istniejące agenty jako cele, nowe z ustawień", () => {
    expect(agentIdForRoute("intake", {})).toBe(EXISTING_AGENTS.intake);
    expect(agentIdForRoute("inwestor_panel", {})).toBe(EXISTING_AGENTS.inwestor_panel);
    expect(agentIdForRoute("windykacja_tekst", {})).toBeNull();
    expect(agentIdForRoute("windykacja_tekst", { agents: { windykacja_tekst: "agent_x" } })).toBe("agent_x");
  });
});
