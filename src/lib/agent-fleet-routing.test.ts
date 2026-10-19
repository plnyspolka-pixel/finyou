// Wspólny kanał tekstowy: podpisany klucz wątku (nie da się podrobić ani
// przenieść na cudzy wątek) i trasa wybierana przez kod z zapisanej potrzeby.
import { describe, expect, it } from "vitest";
import {
  mintThreadKey,
  readThreadKey,
  threadSessionId,
  verifyThreadKey,
} from "./agent-tools/thread-key.server";
import {
  ROUTE_TTL_DAYS,
  agentIdForRoute,
  routeFromSession,
  threadFor,
} from "./agent-fleet-routing.server";
import {
  redactDeep,
  resolveConversationId,
  resolveTrustedContact,
} from "./agent-tools/guard.server";
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

describe("wątek = lead + nadawca z kanału (AUTH-2)", () => {
  it("ta sama osoba w tym samym kanale → ten sam wątek; obca sesja czatu na tym samym leadzie → inny wątek", () => {
    const a = threadFor("11111111-2222-3333-4444-555555555555", {
      kind: "chat",
      value: "sess-ofiary",
    });
    const b = threadFor("11111111-2222-3333-4444-555555555555", {
      kind: "chat",
      value: "sess-ofiary",
    });
    const attacker = threadFor("11111111-2222-3333-4444-555555555555", {
      kind: "chat",
      value: "sess-atakujacego",
    });
    expect(a.threadId).toBe(b.threadId);
    expect(attacker.threadId).not.toBe(a.threadId);
    // Id sesji czatu nie trafia do klucza wprost (klucz widzi model).
    expect(a.threadId).not.toContain("sess-ofiary");
    expect(a.threadId.length).toBeLessThanOrEqual(96);
  });

  it("SMS / e-mail: kontakt z kanału jedzie podpisany w kluczu i staje się kontaktem zaufanym narzędzi", async () => {
    const prev = process.env.AGENT_TOOLS_SECRET;
    process.env.AGENT_TOOLS_SECRET = SECRET;
    try {
      const sms = threadFor("lead-1", { kind: "sms", value: "+48600100200" });
      const key = mintThreadKey(sms.threadId, undefined, sms.contact)!;
      expect(readThreadKey(key)).toMatchObject({ threadId: sms.threadId, phone: "+48600100200" });
      expect(await resolveTrustedContact({ thread_key: key })).toMatchObject({
        phone: "+48600100200",
        source: "thread",
      });

      // Podrobiony kontakt w kluczu (bez podpisu) — ignorowany.
      const [, payload, sig] = key.split(".");
      const forged = Buffer.from(
        JSON.stringify({ t: sms.threadId, p: "+48999888777", e: null }),
      ).toString("base64url");
      expect(readThreadKey(`thr2.${forged}.${sig}`)).toBeNull();
      expect(payload).not.toBe(forged);

      // Numer z args nigdy nie jest kontaktem zaufanym.
      expect(await resolveTrustedContact({ args: { phone: "+48600100200" } })).toMatchObject({
        phone: null,
        source: null,
      });
    } finally {
      process.env.AGENT_TOOLS_SECRET = prev;
    }
  });
});

describe("redakcja wartości (LEAK-4)", () => {
  it("PESEL ze spacjami i myślnikami, NIP, dowód — maskowane; telefon +48 i daty nie", () => {
    const out = redactDeep({
      a: "PESEL 440514 01458",
      b: "NIP 526-104-08-28",
      c: "dowód ABA300000",
      d: "tel. +48600100200, data 2026-10-11, umowa FY/2026/0012",
    });
    expect(out.a).toContain("[PESEL ukryty]");
    expect(out.b).toContain("[NIP ukryty]");
    expect(out.c).toContain("[numer dowodu ukryty]");
    expect(out.d).toBe("tel. +48600100200, data 2026-10-11, umowa FY/2026/0012");
  });

  it("rachunek_splaty przepuszczony wprost nie jest maskowany, w innym polu — tak", () => {
    const acc = "12 3456 7890 1234 5678 9012 3456";
    const out = redactDeep({ rachunek_splaty: acc, inne: acc }, ["rachunek_splaty"]);
    expect(out.rachunek_splaty).toBe(acc);
    expect(out.inne).toBe("…3456");
  });
});

describe("klucz sesji narzędzi", () => {
  it("podpisany wątek → sesja wątku; bez niego → id rozmowy", () => {
    const prev = process.env.AGENT_TOOLS_SECRET;
    process.env.AGENT_TOOLS_SECRET = SECRET;
    try {
      const key = mintThreadKey("lead:abc")!;
      expect(resolveConversationId({ thread_key: key, conversation_id: "conv_1" }, null)).toBe(
        threadSessionId("lead:abc"),
      );
      expect(
        resolveConversationId({ thread_key: "thr1.lead:abc.zly", conversation_id: "conv_1" }, null),
      ).toBe("conv_1");
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
    expect(resolveConversationId({ conversation_id: "thread:lead:abc" }, null)).toMatch(
      /^ephemeral:/,
    );
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
    expect(routeFromSession({ ...fresh, needs: { intent: "nowe_finansowanie" } }, now)).toBe(
      "intake",
    );
    expect(routeFromSession({ ...fresh, needs: { intent: "trwajacy_wniosek" } }, now)).toBe(
      "intake",
    );
    expect(routeFromSession({ ...fresh, needs: { intent: "inwestowanie" } }, now)).toBe(
      "inwestor_presale_tekst",
    );
    expect(routeFromSession({ ...fresh, needs: { intent: "inwestor_z_kontem" } }, now)).toBe(
      "inwestor_panel",
    );
    expect(routeFromSession({ ...fresh, needs: { intent: "splata_umowy" } }, now)).toBe(
      "windykacja_tekst",
    );
  });

  it(`po ${ROUTE_TTL_DAYS} dniach ciszy wątek wraca do recepcji`, () => {
    const old = new Date(now.getTime() - (ROUTE_TTL_DAYS + 1) * 86_400_000).toISOString();
    expect(routeFromSession({ updated_at: old, needs: { intent: "splata_umowy" } }, now)).toBe(
      "recepcja_tekst",
    );
  });

  it("istniejące agenty jako cele, nowe z ustawień", () => {
    expect(agentIdForRoute("intake", {})).toBe(EXISTING_AGENTS.intake);
    expect(agentIdForRoute("inwestor_panel", {})).toBe(EXISTING_AGENTS.inwestor_panel);
    expect(agentIdForRoute("windykacja_tekst", {})).toBeNull();
    expect(agentIdForRoute("windykacja_tekst", { agents: { windykacja_tekst: "agent_x" } })).toBe(
      "agent_x",
    );
  });
});
