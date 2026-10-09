// Telefon windykacyjny na atrapach (bez Supabase, ElevenLabs i Twilio):
// kwota i opóźnienie z harmonogramu rat, pożyczkodawca z umowy, odmowa
// telefonu, gdy nie ma nic do zapłaty.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const chain = {
      middleware: () => chain,
      inputValidator: (v: (d: unknown) => unknown) => {
        validate = v;
        return chain;
      },
      handler:
        (h: (a: { data: unknown; context: unknown }) => unknown) =>
        async ({ data, context }: { data: unknown; context: unknown }) =>
          h({ data: validate(data), context }),
    };
    return chain;
  },
}));
vi.mock("@/lib/investor-plan/pro-middleware", () => ({ requireInvestorPro: {} }));

// Klient z rolą serwisową: ustawienia agenta, profile, dziennik automatyzacji.
const profiles: Record<
  string,
  { first_name: string | null; last_name: string | null; email: string | null }
> = {};
const profileLookups: string[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      let userId: string | null = null;
      const q = {
        select: () => q,
        eq: (c: string, v: string) => {
          if (c === "user_id") userId = v;
          return q;
        },
        update: () => q,
        insert: async () => ({ error: null }),
        maybeSingle: async () => {
          if (table === "voicebot_settings") {
            return {
              data: { windykacja_agent_id: "agent_wind", agent_prompt_hashes: {} },
              error: null,
            };
          }
          if (table === "profiles" && userId) {
            profileLookups.push(userId);
            return { data: profiles[userId] ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      };
      return q;
    },
  }),
}));

const placeCall = vi.fn(async (_args: { dynamicVariables: Record<string, string> }) => ({
  ok: true,
  conversationId: "conv_1",
  callSid: "CA1",
}));
vi.mock("@/lib/voicebot.functions", () => ({
  placeOutboundCallInternal: (args: { dynamicVariables: Record<string, string> }) =>
    placeCall(args),
}));

import { placeWindCollectionCall } from "./windykacja-call.functions";
import { windDebtSnapshot } from "./windykacja-debt";
import { generateHarmonogram } from "./windykacja-harmonogram";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const OWNER = "owner-0000";
const CALLER = "caller-0000";

// Scenariusz z dokumentacji testu: 12 rat po 7 868,48 zł od 2026-07-10
// (ostatnia 7 868,37 zł), wpłaty 2026-07-09 7 868,48 zł i 2026-08-12
// 4 000 zł, stopa 18,5 %, stan na 2026-10-06 → do zapłaty 11 956,69 zł, 57 dni.
const harmonogram = generateHarmonogram({
  pierwszaRata: "2026-07-10",
  liczbaRat: 12,
  kwotaRaty: 7868.48,
  kwotaOstatniejRaty: 7868.37,
});
const wplata = (data: string, kwota: number) => ({
  typ: "wplata",
  data_zdarzenia: `${data}T12:00:00.000Z`,
  metadata: { kwota },
  oplata: 0,
});

type Loan = Record<string, unknown>;
function baseLoan(over: Loan = {}): Loan {
  return {
    numer_umowy: "FY/2026/014",
    data_umowy: "2026-06-15",
    termin_splaty: "2027-06-10",
    status: "w_zwloce",
    data_wypowiedzenia: null,
    rachunek_splaty: "12 3456 7890 1234 5678 9012 3456",
    numer_kw: null,
    kwota_hipoteki: null,
    akt_notarialny_777: null,
    kwota_777: null,
    oplaty_windykacyjne: { telefon: 50, zrodlo: "umowa" },
    pozyczkodawca: "Adam Inwestor",
    kwota_pozyczki: 80_000,
    kwota_calkowita: 94_421.65,
    prowizja: 0,
    oprocentowanie_roczne: 0,
    stopa_odsetek_max: 18.5,
    kwota_doplat: 0,
    harmonogram,
    borrower: { imie_nazwisko: "Jan Kowalski", typ: "osoba_fizyczna", pesel: null, telefon: null },
    ...over,
  };
}

let state: {
  kase: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  inserted: Array<Record<string, unknown>>;
};

function userDb() {
  return {
    from: (table: string) => {
      let payload: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        insert: (p: Record<string, unknown>) => {
          payload = p;
          return q;
        },
        maybeSingle: async () => ({
          data: table === "wind_collection_cases" ? state.kase : null,
          error: null,
        }),
        single: async () => {
          state.inserted.push(payload ?? {});
          return { data: { id: "ev_1", ...payload }, error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: table === "wind_events" ? state.events : [], error: null }),
      };
      return q;
    },
  };
}

function call(data: Record<string, unknown> = {}) {
  return placeWindCollectionCall({
    data: { caseId: CASE_ID, telefon: "+48600100200", ...data },
    context: { supabase: userDb(), userId: CALLER, claims: { email: "zespol@financeyou.pl" } },
  } as never) as Promise<{ ok: boolean; kwota: number; event: Record<string, unknown> }>;
}

const vars = () => placeCall.mock.calls.at(-1)![0].dynamicVariables;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Wtorek, 6 października 2026, 10:00 w Warszawie.
  vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
  );
  process.env.ELEVENLABS_API_KEY = "test";
  placeCall.mockClear();
  profileLookups.length = 0;
  for (const k of Object.keys(profiles)) delete profiles[k];
  state = {
    kase: {
      id: CASE_ID,
      investor_user_id: OWNER,
      sciezka: "miekka",
      etap: "kontakt_wstepny",
      opoznienie_dni: 0,
      kwota_zalegla: 11_744.94,
      data_otwarcia: "2026-09-01",
      loan: baseLoan(),
    },
    events: [wplata("2026-08-12", 4000), wplata("2026-07-09", 7868.48)],
    inserted: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("placeWindCollectionCall — kwota i opóźnienie z harmonogramu rat", () => {
  it("domyślnie: do zapłaty teraz (zaległe raty + odsetki), opóźnienie od najstarszej raty", async () => {
    const r = await call();
    expect(r.ok).toBe(true);
    expect(r.kwota).toBe(11_956.69);
    const v = vars();
    expect(v.kwota_zaleglosci).toBe("11 957");
    expect(v.dni_opoznienia).toBe("57");
    // 57 dni > 14 → monit, mimo ścieżki miękkiej i opoznienie_dni = 0 w sprawie.
    expect(v.etap).toBe("monit");
    expect(v.umowa_wypowiedziana).toBe("nie");
    expect(v.imie_inwestora).toBe("Adam Inwestor");
    expect(profileLookups).toEqual([]);

    const ev = state.inserted[0];
    expect(ev.oplata).toBe(50);
    expect(ev.tresc).toMatch(/Komunikowana kwota do zapłaty: 11\s957 zł/);
    expect(ev.tresc).toMatch(/zaległe raty 11\s744,94 zł/);
    expect(ev.tresc).toMatch(/odsetki za opóźnienie 211,75 zł/);
    const meta = ev.metadata as Record<string, unknown>;
    expect(meta.kwota_zaleglosci).toBe(11_956.69);
    expect(meta.kwota_zrodlo).toBe("wyliczenie");
    expect(meta.zadluzenie).toMatchObject({
      na_dzien: "2026-10-06",
      zrodlo: "harmonogram",
      zaleglosc: 11_744.94,
      odsetki_za_opoznienie: 211.75,
      do_zaplaty_teraz: 11_956.69,
      dni_opoznienia: 57,
      najstarsza_zalegla: "2026-08-10",
    });
  });

  it("kwota podana w formularzu ma pierwszeństwo", async () => {
    const r = await call({ kwota: 5000 });
    expect(r.kwota).toBe(5000);
    // Do 9 999 zł bez separatora tysięcy (zapis pl-PL).
    expect(vars().kwota_zaleglosci).toBe("5000");
    expect(state.inserted[0].tresc).toMatch(/kwota podana ręcznie/);
    // Opóźnienie i tak z harmonogramu.
    expect(vars().dni_opoznienia).toBe("57");
  });

  it("raty zapłacone na bieżąco — telefon odrzucony, bez połączenia i wpisu", async () => {
    state.events = [
      wplata("2026-07-09", 7868.48),
      wplata("2026-08-10", 7868.48),
      wplata("2026-09-10", 7868.48),
    ];
    await expect(call()).rejects.toThrow(/nie ma nic do zapłaty/);
    expect(placeCall).not.toHaveBeenCalled();
    expect(state.inserted).toEqual([]);
  });

  it("bez nazwy pożyczkodawcy — właściciel sprawy, nie osoba zlecająca telefon", async () => {
    profiles[OWNER] = { first_name: "Anna", last_name: "Nowak", email: "anna@example.com" };
    profiles[CALLER] = { first_name: "Operator", last_name: "Zespołu", email: null };
    state.kase.loan = baseLoan({ pozyczkodawca: "  " });
    await call();
    expect(profileLookups).toEqual([OWNER]);
    expect(vars().imie_inwestora).toBe("Anna Nowak");
  });

  it("egzekucja komornicza bez wypowiedzenia — zaległość, nie całe saldo; ton ostatniego wezwania", async () => {
    state.kase.loan = baseLoan({ status: "windykacja_komornicza" });
    const r = await call();
    // Komornik z aktu 777 może egzekwować same zaległe raty — umowa nie jest
    // wypowiedziana, więc agent nie mówi o wypowiedzeniu ani o całym saldzie.
    expect(r.kwota).toBe(11956.69);
    expect(vars().umowa_wypowiedziana).toBe("nie");
    expect(vars().etap).toBe("ostatnie_wezwanie");
  });

  it("wypowiedzenie z datą z przyszłości — jeszcze nie ma wypowiedzenia", async () => {
    state.kase.loan = baseLoan({ data_wypowiedzenia: "2026-10-20" });
    const r = await call();
    expect(r.kwota).toBe(11956.69);
    expect(vars().umowa_wypowiedziana).toBe("nie");
  });

  it("wypowiedzenie skuteczne — całe zadłużenie", async () => {
    state.kase.loan = baseLoan({ data_wypowiedzenia: "2026-09-20" });
    const r = await call();
    const expected = windDebtSnapshot({
      loan: baseLoan({ data_wypowiedzenia: "2026-09-20" }),
      kwotaZalegla: 0,
      events: state.events as never,
      asOf: "2026-10-06",
    });
    expect(expected.wypowiedziana).toBe(true);
    expect(r.kwota).toBe(expected.doZaplatyTeraz);
    expect(r.kwota).toBeGreaterThan(60_000);
    expect(vars().umowa_wypowiedziana).toBe("tak");
    expect(state.inserted[0].tresc).toMatch(/całe zadłużenie po wypowiedzeniu/);
  });

  it("pożyczka bez harmonogramu — kwota zaległa sprawy, opóźnienie jak dotąd", async () => {
    state.kase.loan = baseLoan({ harmonogram: null, termin_splaty: "2026-09-01" });
    state.kase.kwota_zalegla = 7000;
    state.events = [];
    const r = await call();
    expect(r.kwota).toBeGreaterThan(7000);
    expect(r.kwota).toBeLessThan(7200);
    // 35 dni od terminu spłaty (model jednoterminowy).
    expect(vars().dni_opoznienia).toBe("35");
    expect((state.inserted[0].metadata as Record<string, unknown>).zadluzenie).toMatchObject({
      zrodlo: "termin",
    });
  });
});
