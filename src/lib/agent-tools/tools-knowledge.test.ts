// Narzędzia wiedzy: odbiorca bazy wiedzy wyznaczany przez rolę agenta (model
// nie poszerza zakresu), kalkulator na silniku umów z przycięciem stopy do
// odsetek maksymalnych i odmową błędnych danych, deterministyczny opis procesu.
// Silnik (`buildEngineSchedule`, `fees.ts`) jest czysty — nie jest mockowany;
// mockujemy tylko RAG (embedding + pgvector).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentKey, ToolContext, ToolSession } from "./types";

type Row = Record<string, any>;

const rag = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; k: number; audience: string }>,
  hits: [] as Array<{ title: string; content: string; similarity: number }>,
}));

vi.mock("@/lib/text-agent-knowledge.server", () => ({
  retrieveKnowledge: async (query: string, k: number, audience: string) => {
    rag.calls.push({ query, k, audience });
    return rag.hits;
  },
}));

import {
  KNOWLEDGE_EMPTY_SAY,
  LOAN_CALC_DISCLAIMER,
  TOOLS,
  defaultKnowledgeAudience,
} from "./tools-knowledge.server";

// Październik 2026 — odsetki maksymalne 14,5% (tabela od 2026-03-05).
const NOW = new Date("2026-10-06T08:00:00Z");

function session(agent: AgentKey): ToolSession {
  return {
    conversation_id: "conv_test",
    agent_key: agent,
    channel: "voice_phone",
    subject_kind: "unknown",
    subject_id: null,
    lead_id: null,
    case_id: null,
    loan_id: null,
    investor_user_id: null,
    identity_verified: false,
    identity_method: null,
    identity_verified_at: null,
    identity_attempts: 0,
    recording_consent: null,
    do_not_contact: false,
    needs: {},
  };
}

function ctx(args: Record<string, unknown>, agent: AgentKey = "intake"): ToolContext {
  return {
    tool: "test",
    body: {},
    args,
    session: session(agent),
    callerPhone: null,
    callerEmail: null,
    now: NOW,
    redactions: [],
  };
}

const tool = (name: string) => {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`brak narzędzia ${name}`);
  return t;
};

const run = (name: string, args: Record<string, unknown>, agent: AgentKey = "intake") =>
  tool(name).handler(ctx(args, agent));

const okResult = (r: Awaited<ReturnType<(typeof TOOLS)[number]["handler"]>>): Row => {
  if (!r.ok) throw new Error(`oczekiwano ok, dostano błąd: ${r.error}`);
  return r.result as Row;
};

/** Rata annuitetowa liczona wprost ze wzoru — niezależnie od silnika. */
const annuity = (K: number, ratePct: number, N: number) => {
  const r = ratePct / 100 / 12;
  const p = Math.pow(1 + r, N);
  return (K * r * p) / (p - 1);
};

beforeEach(() => {
  rag.calls = [];
  rag.hits = [];
});

describe("deklaracje narzędzi", () => {
  it("trzy narzędzia, bez zapisów i bez wymogu tożsamości, z limitami z kontraktu", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "search_knowledge",
      "get_loan_calculator",
      "get_process_overview",
    ]);
    for (const t of TOOLS) {
      expect(t.writes).toBe(false);
      expect(t.requiresIdentity).toBe(false);
    }
    expect(tool("search_knowledge").rateLimit).toEqual({ perConversation: 10, windowMinutes: 10 });
    expect(tool("get_loan_calculator").rateLimit).toEqual({
      perConversation: 10,
      windowMinutes: 10,
    });
    expect(tool("get_process_overview").rateLimit).toEqual({
      perConversation: 5,
      windowMinutes: 10,
    });
    expect(tool("search_knowledge").agents).toHaveLength(6);
    expect(tool("get_process_overview").agents).toHaveLength(6);
    expect([...tool("get_loan_calculator").agents].sort()).toEqual([
      "intake",
      "inwestor_presale",
      "recepcja",
    ]);
  });
});

describe("search_knowledge — odbiorca z roli agenta", () => {
  it("domyślny odbiorca wg agent_key", () => {
    expect(defaultKnowledgeAudience("intake")).toBe("klient");
    expect(defaultKnowledgeAudience("recepcja")).toBe("klient");
    expect(defaultKnowledgeAudience("inwestor_presale")).toBe("inwestor");
    expect(defaultKnowledgeAudience("inwestor_panel")).toBe("inwestor");
    expect(defaultKnowledgeAudience("windykacja")).toBe("klient");
    expect(defaultKnowledgeAudience("windykacja_tekst")).toBe("klient");
  });

  it.each([
    ["intake", "klient"],
    ["recepcja", "klient"],
    ["inwestor_presale", "inwestor"],
    ["inwestor_panel", "inwestor"],
    ["windykacja", "klient"],
    ["windykacja_tekst", "klient"],
  ] as Array<[AgentKey, string]>)("%s bez audience → %s, k = 4", async (agent, audience) => {
    const r = okResult(await run("search_knowledge", { query: "ile trwa proces?" }, agent));
    expect(r.audience).toBe(audience);
    expect(rag.calls).toEqual([{ query: "ile trwa proces?", k: 4, audience }]);
  });

  it("recepcja może wskazać odbiorcę (także z polskimi znakami i wielką literą)", async () => {
    okResult(
      await run("search_knowledge", { query: "cena abonamentu", audience: "Inwestor" }, "recepcja"),
    );
    expect(rag.calls[0].audience).toBe("inwestor");
  });

  it("recepcja z nieznanym odbiorcą → odmowa bez zapytania do RAG", async () => {
    const r = await run(
      "search_knowledge",
      { query: "cena abonamentu", audience: "admin" },
      "recepcja",
    );
    expect(r.ok).toBe(false);
    expect(rag.calls).toHaveLength(0);
  });

  it("agent spoza recepcji nie poszerza zakresu argumentem audience", async () => {
    const r1 = okResult(
      await run("search_knowledge", { query: "cena abonamentu", audience: "inwestor" }, "intake"),
    );
    expect(r1.audience).toBe("klient");
    const r2 = okResult(
      await run(
        "search_knowledge",
        { query: "prowizja klienta", audience: "klient" },
        "inwestor_panel",
      ),
    );
    expect(r2.audience).toBe("inwestor");
    const r3 = okResult(
      await run("search_knowledge", { query: "jak spłacić", audience: "inwestor" }, "windykacja"),
    );
    expect(r3.audience).toBe("klient");
    expect(rag.calls.map((c) => c.audience)).toEqual(["klient", "inwestor", "klient"]);
  });

  it("query 3–300 znaków (po przycięciu białych znaków)", async () => {
    expect((await run("search_knowledge", { query: "  a  " })).ok).toBe(false);
    expect((await run("search_knowledge", {})).ok).toBe(false);
    expect((await run("search_knowledge", { query: "x".repeat(301) })).ok).toBe(false);
    expect((await run("search_knowledge", { query: "abc" })).ok).toBe(true);
    expect((await run("search_knowledge", { query: "x".repeat(300) })).ok).toBe(true);
    expect(rag.calls).toHaveLength(2);
  });

  it("trafienia: treść ≤ 900 znaków, podobieństwo zaokrąglone, say_if_empty zawsze w wyniku", async () => {
    rag.hits = [
      { title: "Prowizja", content: "a".repeat(2000), similarity: 0.87654 },
      { title: "LTV", content: "Do 60% wartości.", similarity: 0.71 },
    ];
    const res = await run("search_knowledge", { query: "jaka prowizja?" });
    const r = okResult(res);
    expect(res.ok && res.rows).toBe(2);
    expect(r.hits).toHaveLength(2);
    expect(r.hits[0].content.length).toBeLessThanOrEqual(900);
    expect(r.hits[0].content.endsWith("…")).toBe(true);
    expect(r.hits[0].similarity).toBe(0.877);
    expect(r.hits[1]).toEqual({ title: "LTV", content: "Do 60% wartości.", similarity: 0.71 });
    expect(r.say_if_empty).toBe(KNOWLEDGE_EMPTY_SAY);
  });

  it("brak trafień → pusta lista i zdanie do powiedzenia", async () => {
    const r = okResult(await run("search_knowledge", { query: "czy macie kryptowaluty?" }));
    expect(r.hits).toEqual([]);
    expect(r.say_if_empty).toBe("Nie mam tego w materiałach — nie zgaduję.");
  });
});

describe("get_loan_calculator", () => {
  it("100 000 zł, 12 mies., 14,5% — rata annuitetowa jak ze wzoru (≈ 9 002 zł)", async () => {
    const expected = annuity(100_000, 14.5, 12);
    const r = okResult(
      await run("get_loan_calculator", {
        kwota_pln: 100_000,
        okres_miesiace: 12,
        oprocentowanie_roczne: 14.5,
        typ: "rowne",
      }),
    );
    expect(r.typ).toBe("rowne");
    expect(r.oprocentowanie_roczne).toBe(14.5);
    expect(r.oprocentowanie_przyciete).toBe(false);
    // Silnik zaokrągla ratę w górę do grosza (jak kalkulator na stronie).
    expect(Math.abs(r.rata_miesieczna - expected)).toBeLessThanOrEqual(0.01);
    expect(Math.round(r.rata_miesieczna)).toBe(9002);
    // Odsetki = suma rat − kapitał; ostatnia rata wyrównuje grosze.
    expect(Math.abs(r.odsetki_lacznie - (expected * 12 - 100_000))).toBeLessThan(0.2);
    expect(r.do_splaty).toBeCloseTo(100_000 + r.odsetki_lacznie, 2);
    expect(r.prowizja_finance_you).toBe(5000);
    expect(r.kwota_na_reke).toBe(95_000);
    expect(r.calkowity_koszt).toBeCloseTo(r.odsetki_lacznie + 5000, 2);
    expect(r.zastrzezenie).toBe(LOAN_CALC_DISCLAIMER);
    expect(r.zastrzezenie).toBe("Orientacyjnie; warunki ustala inwestor przy konkretnej sprawie.");
    expect(r).not.toHaveProperty("max_kwota_przy_ltv_60");
  });

  it("bez oprocentowania i typu → odsetki maksymalne (14,5%) i raty równe", async () => {
    const withRate = okResult(
      await run("get_loan_calculator", {
        kwota_pln: 100_000,
        okres_miesiace: 12,
        oprocentowanie_roczne: 14.5,
      }),
    );
    const r = okResult(
      await run("get_loan_calculator", { kwota_pln: 100_000, okres_miesiace: 12 }),
    );
    expect(r.oprocentowanie_roczne).toBe(14.5);
    expect(r.typ).toBe("rowne");
    expect(r.rata_miesieczna).toBe(withRate.rata_miesieczna);
  });

  it("stopa powyżej 14,5% jest przycinana — wynik jak przy 14,5% i uwaga do powiedzenia", async () => {
    const base = okResult(
      await run("get_loan_calculator", { kwota_pln: 100_000, okres_miesiace: 12 }),
    );
    const r = okResult(
      await run("get_loan_calculator", {
        kwota_pln: 100_000,
        okres_miesiace: 12,
        oprocentowanie_roczne: 24,
      }),
    );
    expect(r.oprocentowanie_roczne).toBe(14.5);
    expect(r.oprocentowanie_przyciete).toBe(true);
    expect(r.rata_miesieczna).toBe(base.rata_miesieczna);
    expect(r.odsetki_lacznie).toBe(base.odsetki_lacznie);
    expect(r.uwagi.join(" ")).toContain("14,5%");
  });

  it("stopa ujemna → 0% (rata = kapitał / liczba rat); „12,5%” jako tekst jest liczbą", async () => {
    const zero = okResult(
      await run("get_loan_calculator", {
        kwota_pln: 12_000,
        okres_miesiace: 12,
        oprocentowanie_roczne: -3,
      }),
    );
    expect(zero.oprocentowanie_roczne).toBe(0);
    expect(zero.oprocentowanie_przyciete).toBe(true);
    expect(zero.rata_miesieczna).toBe(1000);
    expect(zero.odsetki_lacznie).toBe(0);

    const txt = okResult(
      await run("get_loan_calculator", {
        kwota_pln: "100 000 zł",
        okres_miesiace: "24",
        oprocentowanie_roczne: "12,5%",
      }),
    );
    expect(txt.kwota_pln).toBe(100_000);
    expect(txt.okres_miesiace).toBe(24);
    expect(txt.oprocentowanie_roczne).toBe(12.5);
    expect(Math.abs(txt.rata_miesieczna - annuity(100_000, 12.5, 24))).toBeLessThanOrEqual(0.01);
  });

  it("raty malejące: pierwsza rata = K/N + odsetki od pełnego kapitału, odsetki = K·r·(N+1)/2", async () => {
    const K = 120_000;
    const N = 12;
    const r = 14.5 / 100 / 12;
    const res = okResult(
      await run("get_loan_calculator", { kwota_pln: K, okres_miesiace: N, typ: "malejące" }),
    );
    expect(res.typ).toBe("malejace");
    expect(res.rata_miesieczna).toBeCloseTo(K / N + K * r, 2); // 10 000 + 1 450
    expect(res.rata_ostatnia).toBeCloseTo(K / N + (K / N) * r, 2);
    expect(res.rata_ostatnia).toBeLessThan(res.rata_miesieczna);
    expect(Math.abs(res.odsetki_lacznie - (K * r * (N + 1)) / 2)).toBeLessThan(0.05);
    expect(res.do_splaty).toBeCloseTo(K + res.odsetki_lacznie, 2);
    // Przy tej samej stopie malejące dają mniej odsetek niż równe.
    const eq = okResult(await run("get_loan_calculator", { kwota_pln: K, okres_miesiace: N }));
    expect(res.odsetki_lacznie).toBeLessThan(eq.odsetki_lacznie);
  });

  it("wartość nieruchomości → maks. kwota przy LTV 60% i LTV wnioskowanej kwoty", async () => {
    const ok = okResult(
      await run("get_loan_calculator", {
        kwota_pln: 200_000,
        okres_miesiace: 24,
        wartosc_nieruchomosci: 500_000,
      }),
    );
    expect(ok.max_kwota_przy_ltv_60).toBe(300_000);
    expect(ok.ltv_proc).toBe(40);
    expect(ok.ltv_w_limicie).toBe(true);

    const over = okResult(
      await run("get_loan_calculator", {
        kwota_pln: 400_000,
        okres_miesiace: 24,
        wartosc_nieruchomosci: 500_000,
      }),
    );
    expect(over.ltv_proc).toBe(80);
    expect(over.ltv_w_limicie).toBe(false);
    expect(over.uwagi.join(" ")).toContain("60%");
  });

  it("mała kwota: minimalna prowizja 5 000 zł → kwota na rękę 0 i uwaga, bez odmowy", async () => {
    const r = okResult(await run("get_loan_calculator", { kwota_pln: 3000, okres_miesiace: 6 }));
    expect(r.prowizja_finance_you).toBe(5000);
    expect(r.kwota_na_reke).toBe(0);
    expect(r.uwagi.join(" ")).toContain("prowizja Finance You");
  });

  it.each([
    [{ okres_miesiace: 12 }, "brak kwoty"],
    [{ kwota_pln: 0, okres_miesiace: 12 }, "kwota 0"],
    [{ kwota_pln: -5000, okres_miesiace: 12 }, "kwota ujemna"],
    [{ kwota_pln: 10_000_001, okres_miesiace: 12 }, "kwota > 10 mln"],
    [{ kwota_pln: "dużo", okres_miesiace: 12 }, "kwota nieliczbowa"],
    [{ kwota_pln: 100_000 }, "brak okresu"],
    [{ kwota_pln: 100_000, okres_miesiace: 0 }, "okres 0"],
    [{ kwota_pln: 100_000, okres_miesiace: 121 }, "okres > 120"],
    [{ kwota_pln: 100_000, okres_miesiace: 12.5 }, "okres niecałkowity"],
    [{ kwota_pln: 100_000, okres_miesiace: 12, typ: "balonowy" }, "nieznany typ"],
    [
      { kwota_pln: 100_000, okres_miesiace: 12, oprocentowanie_roczne: "sporo" },
      "stopa nieliczbowa",
    ],
    [{ kwota_pln: 100_000, okres_miesiace: 12, wartosc_nieruchomosci: -1 }, "wartość ujemna"],
    [
      { kwota_pln: 100_000, okres_miesiace: 12, wartosc_nieruchomosci: "brak" },
      "wartość nieliczbowa",
    ],
  ] as Array<[Record<string, unknown>, string]>)("odmowa: %o (%s)", async (args) => {
    const r = await run("get_loan_calculator", args);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });

  it("granice zakresu są dozwolone (1 zł, 10 mln zł, 1 i 120 miesięcy)", async () => {
    expect((await run("get_loan_calculator", { kwota_pln: 1, okres_miesiace: 1 })).ok).toBe(true);
    expect(
      (await run("get_loan_calculator", { kwota_pln: 10_000_000, okres_miesiace: 120 })).ok,
    ).toBe(true);
  });
});

describe("get_process_overview", () => {
  it("domyślny odbiorca wg roli agenta", async () => {
    expect(okResult(await run("get_process_overview", {}, "intake")).audience).toBe("klient");
    expect(okResult(await run("get_process_overview", {}, "recepcja")).audience).toBe("klient");
    expect(okResult(await run("get_process_overview", {}, "inwestor_presale")).audience).toBe(
      "inwestor",
    );
    expect(okResult(await run("get_process_overview", {}, "windykacja_tekst")).audience).toBe(
      "pozyczkobiorca_windykacja",
    );
  });

  it("klient: inwestor sam się kontaktuje, brak oferty = brak zainteresowania, zakaz obietnic kontaktu", async () => {
    const r = okResult(await run("get_process_overview", { audience: "klient" }, "recepcja"));
    const kroki = r.kroki.map((k: Row) => `${k.krok} ${k.opis}`).join(" ");
    expect(r.kroki[0].nr).toBe(1);
    expect(kroki).toContain("inwestor sam kontaktuje się");
    expect(kroki).toContain("Brak oferty");
    expect(r.fakty.join(" ")).toContain("B2B");
    expect(r.fakty.join(" ")).toContain("14,5%");
    const nigdy = r.nigdy_nie_mow.join(" ");
    expect(nigdy).toContain("oddzwonimy");
    expect(nigdy).toContain("terminu decyzji");
  });

  it("inwestor: abonament → umowy → moduł ofert, ceny z cennika, zakaz obiecywania zysków", async () => {
    const r = okResult(
      await run("get_process_overview", { audience: "inwestor" }, "inwestor_presale"),
    );
    expect(r.kroki.map((k: Row) => k.krok)).toEqual([
      "Abonament",
      "Umowy",
      "Moduł ofert i zlecenia",
      "Decyzja i umowa pożyczki",
    ]);
    const abonament = r.kroki[0].opis.replace(/\u00a0/g, " ");
    expect(abonament).toContain("1 500 zł");
    expect(abonament).toContain("7 000 zł");
    expect(abonament).toContain("61%");
    expect(abonament).toContain("BLIK");
    expect(r.kroki[1].opis).toContain("NDA");
    expect(r.kroki[1].opis).toContain("RODO");
    expect(r.fakty.join(" ")).toContain("Fundacja Krzewienia Edukacji Finansowej im. Pieczaka");
    expect(r.nigdy_nie_mow.join(" ")).toContain("zysków");
  });

  it("windykacja: polubowne → wezwanie listem poleconym → wypowiedzenie → droga formalna; bez gróźb i rejestrów", async () => {
    const r = okResult(
      await run("get_process_overview", { audience: "pożyczkobiorca windykacja" }, "windykacja"),
    );
    expect(r.audience).toBe("pozyczkobiorca_windykacja");
    expect(r.kroki.map((k: Row) => k.krok)).toEqual([
      "Polubowne ustalenie",
      "Wezwanie do zapłaty",
      "Wypowiedzenie umowy",
      "Droga formalna",
    ]);
    expect(r.kroki[1].opis).toContain("listem poleconym");
    const nigdy = r.nigdy_nie_mow.join(" ");
    expect(nigdy).toContain("Nie groź");
    expect(nigdy).toContain("KRD");
  });

  it("deterministyczny wynik i odmowa nieznanego odbiorcy", async () => {
    const a = okResult(await run("get_process_overview", { audience: "klient" }));
    const b = okResult(await run("get_process_overview", { audience: "klient" }));
    expect(a).toEqual(b);
    const bad = await run("get_process_overview", { audience: "prokurator" });
    expect(bad.ok).toBe(false);
  });
});
