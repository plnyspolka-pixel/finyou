// Narzędzia windykacyjne na atrapie Supabase: brief liczony z harmonogramu
// (ta sama matematyka co karta sprawy), odmowa terminu po limicie etapu,
// zapis deklaracji w konwencji akt (metadata.conversation_id), sprzeciw
// wobec telefonów w sesji. windDebtSnapshot i buildWindCallVariables są
// czyste — nie są mockowane.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext, ToolSession } from "./types";

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  kase: null as Row | null,
  events: [] as Row[],
  documents: [] as Row[],
  profiles: {} as Record<string, Row>,
  inserted: [] as Array<{ table: string; row: Row }>,
  upserts: [] as Array<{ table: string; row: Row }>,
}));

vi.mock("@/integrations/supabase/client.server", () => {
  const exec = (
    st: { table: string; op: string; payload: Row | null; filters: Array<[string, unknown]> },
    single: boolean,
  ) => {
    if (st.op === "insert") {
      db.inserted.push({ table: st.table, row: st.payload ?? {} });
      const row = { id: `row_${db.inserted.length}`, ...(st.payload ?? {}) };
      return { data: single ? row : [row], error: null };
    }
    if (st.op === "upsert") {
      db.upserts.push({ table: st.table, row: st.payload ?? {} });
      return { data: null, error: null };
    }
    let rows: Row[] = [];
    switch (st.table) {
      case "wind_collection_cases":
        rows = db.kase ? [db.kase] : [];
        break;
      case "wind_events":
        rows = db.events;
        break;
      case "wind_documents":
        rows = db.documents;
        break;
      case "profiles":
        rows = Object.entries(db.profiles).map(([user_id, p]) => ({ user_id, ...p }));
        break;
    }
    // Filtr działa tylko po kolumnach obecnych w atrapie (zdarzenia nie mają case_id).
    for (const [c, v] of st.filters) rows = rows.filter((r) => !(c in r) || r[c] === v);
    return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
  };
  const builder = (table: string) => {
    const st = { table, op: "select", payload: null as Row | null, filters: [] as Array<[string, unknown]> };
    const api: any = {
      select: () => api,
      eq: (c: string, v: unknown) => {
        st.filters.push([c, v]);
        return api;
      },
      is: (c: string, v: unknown) => {
        st.filters.push([c, v]);
        return api;
      },
      order: () => api,
      limit: () => api,
      insert: (p: Row) => {
        st.op = "insert";
        st.payload = p;
        return api;
      },
      upsert: (p: Row) => {
        st.op = "upsert";
        st.payload = p;
        return api;
      },
      maybeSingle: async () => exec(st, true),
      single: async () => exec(st, true),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(exec(st, false)).then(res, rej),
    };
    return api;
  };
  return { supabaseAdmin: { from: builder } };
});

import { TOOLS, accountGroups, eventTypeFor, parsePromiseDate } from "./tools-collections.server";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const LOAN_ID = "22222222-2222-4222-8222-222222222222";
const OWNER = "owner-0000";
// Wtorek, 6 października 2026, 10:00 w Warszawie.
const NOW = new Date("2026-10-06T08:00:00Z");
const TODAY = "2026-10-06";
const PESEL = "44051401359";

function baseLoan(over: Row = {}): Row {
  return {
    numer_umowy: "FY/2026/014",
    data_umowy: "2026-08-01",
    termin_splaty: "2026-11-10",
    status: "w_zwloce",
    data_wypowiedzenia: null,
    rachunek_splaty: "12 3456 7890 1234 5678 9012 3456",
    numer_kw: "WA1M/00012345/6",
    kwota_hipoteki: 300000,
    akt_notarialny_777: null,
    kwota_777: null,
    oplaty_windykacyjne: { telefon: 50, pismo: 300, zrodlo: "umowa" },
    pozyczkodawca: "Adam Inwestor",
    kwota_pozyczki: 3000,
    kwota_calkowita: 3000,
    prowizja: 0,
    oprocentowanie_roczne: 0,
    stopa_odsetek_max: 18.5,
    kwota_doplat: 0,
    // Trzy raty; na 6 października zaległa jest tylko pierwsza (10 września).
    harmonogram: [
      { nr: 1, termin: "2026-09-10", kwota: 1000 },
      { nr: 2, termin: "2026-10-10", kwota: 1000 },
      { nr: 3, termin: "2026-11-10", kwota: 1000 },
    ],
    borrower: { imie_nazwisko: "Jan Kowalski", typ: "osoba", pesel: PESEL, telefon: "+48600100200" },
    ...over,
  };
}

function session(over: Partial<ToolSession> = {}): ToolSession {
  return {
    conversation_id: "conv_test",
    agent_key: "windykacja",
    channel: "voice_phone",
    subject_kind: "borrower",
    subject_id: "b-1",
    lead_id: null,
    case_id: CASE_ID,
    loan_id: LOAN_ID,
    investor_user_id: null,
    identity_verified: true,
    identity_method: "contract_number",
    identity_verified_at: NOW.toISOString(),
    identity_attempts: 1,
    recording_consent: true,
    do_not_contact: false,
    needs: {},
    ...over,
  };
}

function ctx(args: Record<string, unknown> = {}, over: Partial<ToolSession> = {}): ToolContext {
  return {
    tool: "test",
    body: {},
    args,
    session: session(over),
    callerPhone: "+48600100200",
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

const okResult = (r: Awaited<ReturnType<(typeof TOOLS)[number]["handler"]>>): Row => {
  if (!r.ok) throw new Error(`oczekiwano ok, dostano błąd: ${r.error}`);
  return r.result as Row;
};

beforeEach(() => {
  db.kase = {
    id: CASE_ID,
    investor_user_id: OWNER,
    loan_id: LOAN_ID,
    sciezka: "miekka",
    etap: "kontakt_wstepny",
    opoznienie_dni: 0,
    kwota_zalegla: 1000,
    data_otwarcia: "2026-10-01",
    data_zamkniecia: null,
    loan: baseLoan(),
  };
  db.events = [
    {
      id: "e1",
      typ: "sms",
      tytul: "SMS przypominający",
      data_zdarzenia: "2026-09-20T09:00:00.000Z",
      metadata: { numer: "+48600100200", tresc_sms: "tajne" },
      oplata: 0,
    },
  ];
  db.documents = [
    { typ: "wezwanie", tytul: "Wezwanie do zapłaty", status: "wyslany", data_nadania: "2026-09-25", data_odbioru: null, created_at: "2026-09-25T10:00:00Z" },
  ];
  db.profiles = { [OWNER]: { first_name: "Ewa", last_name: "Właścicielka" } };
  db.inserted = [];
  db.upserts = [];
});

describe("rejestr narzędzi windykacyjnych", () => {
  it("wszystkie narzędzia tylko dla agentów windykacyjnych, dane sprawy za tożsamością", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      "get_collection_case",
      "get_payment_instructions",
      "record_call_note",
      "record_payment_promise",
    ]);
    for (const t of TOOLS) expect([...t.agents].sort()).toEqual(["windykacja", "windykacja_tekst"]);
    expect(tool("get_collection_case").requiresIdentity).toBe(true);
    expect(tool("record_payment_promise").requiresIdentity).toBe(true);
    expect(tool("get_payment_instructions").requiresIdentity).toBe(true);
    // Notatka „odebrała osoba trzecia” musi dać się zapisać PRZED tożsamością.
    expect(tool("record_call_note").requiresIdentity).toBe(false);
    expect(tool("record_call_note").writes).toBe(true);
    expect(tool("record_payment_promise").writes).toBe(true);
    expect(tool("get_collection_case").rateLimit).toEqual({ perConversation: 4, windowMinutes: 10 });
    expect(tool("record_payment_promise").rateLimit).toEqual({ perConversation: 3, windowMinutes: 30 });
    expect(tool("record_call_note").rateLimit).toEqual({ perConversation: 6, windowMinutes: 30 });
    expect(tool("get_payment_instructions").rateLimit).toEqual({ perConversation: 3, windowMinutes: 10 });
  });
});

describe("get_collection_case — brief z harmonogramu", () => {
  it("jedna zaległa rata: kwota, skład, opóźnienie, etap, termin maksymalny i najbliższe raty", async () => {
    const r = okResult(await tool("get_collection_case").handler(ctx()));

    expect(r.umowa).toMatchObject({
      numer: "FY/2026/014",
      status: "w zwłoce",
      wypowiedziana: false,
      kwota_pozyczki: 3000,
    });
    expect(r.pozyczkodawca).toBe("Adam Inwestor");

    // Zaległa tylko rata z 10 września: 1000 zł + odsetki za opóźnienie, bez kosztów.
    expect(r.zadluzenie.sklad.zalegle_raty).toBe(1000);
    expect(r.zadluzenie.sklad.odsetki).toBeGreaterThan(0);
    expect(r.zadluzenie.sklad.koszty).toBe(0);
    expect(r.zadluzenie.do_zaplaty_teraz).toBeGreaterThan(1000);
    expect(r.zadluzenie.do_zaplaty_teraz).toBeLessThan(1100);
    expect(r.zadluzenie.dni_opoznienia).toBe(26);
    expect(r.zadluzenie.stan_na).toBe(TODAY);
    expect(r.zadluzenie.slownie).toMatch(/tysiąc/);

    // 26 dni opóźnienia na ścieżce miękkiej = monit → 5 dni; 11 października
    // to niedziela, więc poniedziałek 12 października.
    expect(r.etap).toBe("monit");
    expect(r.termin_maksymalny_iso).toBe("2026-10-12");
    expect(r.termin_maksymalny).toBe("poniedziałek, 12 października 2026");
    expect(r.zmienne.termin_maksymalny).toBe(r.termin_maksymalny);

    expect(r.zabezpieczenia).toEqual({ hipoteka: "tak", akt_777: "brak" });
    expect(r.oplaty_windykacyjne).toBe("monit telefoniczny 50 zł, wezwanie listem poleconym 300 zł");
    expect(r.rachunek_splaty).toBe("12 3456 7890 1234 5678 9012 3456");
    expect(r.poprzednia_deklaracja).toBe("brak");

    expect(r.harmonogram_najblizsze).toEqual([
      { termin: "2026-09-10", kwota: 1000, pozostalo: 1000, status: "zalegla" },
      { termin: "2026-10-10", kwota: 1000, pozostalo: 1000, status: "przyszla" },
      { termin: "2026-11-10", kwota: 1000, pozostalo: 1000, status: "przyszla" },
    ]);

    // Historia bez metadata, dokumenty bez treści i linków.
    expect(r.historia).toEqual([
      { data: "2026-09-20T09:00:00.000Z", typ: "sms", tytul: "SMS przypominający" },
    ]);
    expect(r.dokumenty).toEqual([
      { typ: "wezwanie", tytul: "Wezwanie do zapłaty", status: "wyslany", data_nadania: "2026-09-25", data_odbioru: null },
    ]);

    // Zmienne agenta głosowego — ten sam komplet, co w telefonie z panelu.
    expect(r.zmienne).toMatchObject({
      imie_inwestora: "Adam Inwestor",
      imie_dluznika: "Jan Kowalski",
      etap: "monit",
      hipoteka: "tak",
      umowa_wypowiedziana: "nie",
    });

    // PESEL i surowe metadata nigdy nie opuszczają serwera.
    const json = JSON.stringify(r);
    expect(json).not.toContain(PESEL);
    expect(json.toLowerCase()).not.toContain("pesel");
    expect(json).not.toContain("tajne");
  });

  it("pożyczkodawca z profilu właściciela sprawy, gdy umowa go nie podaje (bez e-maila)", async () => {
    db.kase!.loan = baseLoan({ pozyczkodawca: null });
    db.profiles[OWNER] = { first_name: null, last_name: null, email: "ewa@przyklad.pl" };
    const r = okResult(await tool("get_collection_case").handler(ctx()));
    expect(r.pozyczkodawca).toBe("inwestora Finance You");
    db.profiles[OWNER] = { first_name: "Ewa", last_name: "Właścicielka" };
    const r2 = okResult(await tool("get_collection_case").handler(ctx()));
    expect(r2.pozyczkodawca).toBe("Ewa Właścicielka");
  });

  it("sesja znająca tylko pożyczkę trafia do jej otwartej sprawy", async () => {
    const r = okResult(await tool("get_collection_case").handler(ctx({}, { case_id: null })));
    expect(r.umowa.numer).toBe("FY/2026/014");
  });

  it("bez sprawy i pożyczki w sesji — odmowa (id z body nic nie znaczy)", async () => {
    const r = await tool("get_collection_case").handler(ctx({ case_id: CASE_ID }, { case_id: null, loan_id: null }));
    expect(r.ok).toBe(false);
    expect(db.inserted).toHaveLength(0);
  });
});

describe("record_payment_promise", () => {
  it("termin po najpóźniejszym dopuszczalnym → accepted:false z datą do zaproponowania, bez zapisu", async () => {
    const r = okResult(
      await tool("record_payment_promise").handler(ctx({ kwota_pln: 1050, data: "2026-10-20", sposob: "przelew" })),
    );
    expect(r.accepted).toBe(false);
    expect(r.powod).toBe("po_terminie_maksymalnym");
    expect(r.termin_maksymalny).toBe("poniedziałek, 12 października 2026");
    expect(r.termin_maksymalny_iso).toBe("2026-10-12");
    expect(r.say).toContain("12 października 2026");
    expect(db.inserted).toHaveLength(0);
  });

  it("„w piątek” → 9 października: zapis w aktach z metadata.conversation_id i podsumowanie", async () => {
    const r = okResult(
      await tool("record_payment_promise").handler(
        ctx({
          kwota_pln: 1050,
          data: "w piątek",
          sposob: "przelew z aplikacji",
          przeszkody: "czeka na wypłatę",
          propozycja_reszty: { kwota_miesiecznie: 500, od_kiedy: "2026-11-10", ile_rat: 2 },
        }),
      ),
    );
    expect(r.accepted).toBe(true);
    expect(r.deklarowana_data).toBe("2026-10-09");
    expect(r.deklarowana_data_slownie).toBe("piątek, 9 października 2026");
    expect(r.deklarowana_kwota).toBe(1050);
    expect(r.czesciowa).toBe(false);
    expect(r.podsumowanie).toContain("1050 zł");
    expect(r.podsumowanie).toContain("piątek, 9 października 2026");
    expect(r.podsumowanie).toContain("FY/2026/014");

    expect(db.inserted).toHaveLength(1);
    const { table, row } = db.inserted[0];
    expect(table).toBe("wind_events");
    expect(row).toMatchObject({
      case_id: CASE_ID,
      typ: "telefon",
      kategoria: "automatyczne",
      tytul: "Deklaracja wpłaty (agent AI)",
      oplata: 0,
      autor: "agent AI",
      data_zdarzenia: NOW.toISOString(),
    });
    expect(row.metadata).toMatchObject({
      conversation_id: "conv_test",
      deklarowana_kwota: 1050,
      deklarowana_data: "2026-10-09",
      sposob: "przelew z aplikacji",
      przeszkody: "czeka na wypłatę",
      propozycja_reszty: { kwota_miesiecznie: 500, od_kiedy: "2026-11-10", ile_rat: 2 },
      agent_key: "windykacja",
      channel: "voice_phone",
    });
    expect(row.tresc).toContain("1050 zł");
    expect(row.tresc).toContain("500 zł miesięcznie");
  });

  it("agent tekstowy na SMS zapisuje zdarzenie typu sms; część kwoty oznaczona", async () => {
    const r = okResult(
      await tool("record_payment_promise").handler(
        ctx({ kwota_pln: "300", data: "jutro" }, { agent_key: "windykacja_tekst", channel: "sms" }),
      ),
    );
    expect(r.accepted).toBe(true);
    expect(r.deklarowana_data).toBe("2026-10-07");
    expect(r.czesciowa).toBe(true);
    expect(db.inserted[0].row.typ).toBe("sms");
  });

  it("niejasny termin albo brak kwoty → accepted:false z pytaniem, bez zapisu", async () => {
    const r1 = okResult(
      await tool("record_payment_promise").handler(ctx({ kwota_pln: 1000, data: "jak dostanę pieniądze" })),
    );
    expect(r1).toMatchObject({ accepted: false, powod: "data_nieczytelna" });
    const r2 = okResult(await tool("record_payment_promise").handler(ctx({ data: "jutro" })));
    expect(r2).toMatchObject({ accepted: false, powod: "brak_kwoty" });
    const r3 = okResult(await tool("record_payment_promise").handler(ctx({ kwota_pln: 10, data: "2026-10-01" })));
    expect(r3).toMatchObject({ accepted: false, powod: "data_przeszla" });
    expect(db.inserted).toHaveLength(0);
  });

  it("poprzednia deklaracja z akt (także z kanału tekstowego) trafia do briefu", async () => {
    db.events.unshift({
      id: "e0",
      typ: "sms",
      tytul: "Deklaracja wpłaty (agent AI)",
      data_zdarzenia: "2026-10-02T09:00:00.000Z",
      metadata: { conversation_id: "conv_prev", deklarowana_kwota: 1000, deklarowana_data: "2026-10-05" },
      oplata: 0,
    });
    const r = okResult(await tool("get_collection_case").handler(ctx()));
    expect(r.poprzednia_deklaracja).toContain("1000 zł do 5 października 2026");
    expect(r.poprzednia_deklaracja).toContain("według akt wpłata nie wpłynęła");
  });
});

describe("record_call_note", () => {
  it("„prosba_nie_dzwonic” przed tożsamością: notatka, sprzeciw w sesji, wpis w automation_events", async () => {
    const r = okResult(
      await tool("record_call_note").handler(
        ctx(
          { rodzaj: "prosba_nie_dzwonic", tresc: "Rozmówca prosi o kontakt wyłącznie pisemny." },
          { agent_key: "windykacja_tekst", channel: "chat", identity_verified: false },
        ),
      ),
    );
    expect(r).toMatchObject({ saved: true, do_not_contact: true, pilne: false });

    const event = db.inserted.find((i) => i.table === "wind_events")!.row;
    expect(event).toMatchObject({
      case_id: CASE_ID,
      typ: "notatka",
      kategoria: "automatyczne",
      oplata: 0,
      autor: "agent AI",
      tresc: "Rozmówca prosi o kontakt wyłącznie pisemny.",
    });
    expect(event.tytul).toMatch(/nie dzwonić/);
    expect(event.metadata).toMatchObject({
      conversation_id: "conv_test",
      rodzaj: "prosba_nie_dzwonic",
      agent_key: "windykacja_tekst",
      channel: "chat",
      identity_verified: false,
    });

    const upsert = db.upserts.find((u) => u.table === "agent_tool_sessions")!;
    expect(upsert.row).toMatchObject({ conversation_id: "conv_test", do_not_contact: true });

    const auto = db.inserted.find((i) => i.table === "automation_events")!.row;
    expect(auto.automation_type).toBe("wind_do_not_contact");
    expect(auto.sent_payload).toMatchObject({ case_id: CASE_ID, conversation_id: "conv_test" });
  });

  it("zgon i upadłość dostają prefiks PILNE; zwykła notatka nie zmienia sesji", async () => {
    const r = okResult(await tool("record_call_note").handler(ctx({ rodzaj: "zgon", tresc: "Żona informuje o śmierci." })));
    expect(r.pilne).toBe(true);
    expect(db.inserted[0].row.tytul).toMatch(/^PILNE: /);
    expect(db.inserted[0].row.typ).toBe("telefon");
    expect(db.upserts).toHaveLength(0);
    expect(db.inserted.some((i) => i.table === "automation_events")).toBe(false);
  });

  it("nieznany rodzaj albo brak sprawy w sesji → błąd bez zapisu", async () => {
    const r1 = await tool("record_call_note").handler(ctx({ rodzaj: "cokolwiek", tresc: "x" }));
    expect(r1.ok).toBe(false);
    const r2 = await tool("record_call_note").handler(
      ctx({ rodzaj: "osoba_trzecia", tresc: "x" }, { case_id: null, loan_id: null }),
    );
    expect(r2.ok).toBe(false);
    expect(db.inserted).toHaveLength(0);
  });
});

describe("get_payment_instructions", () => {
  it("rachunek z umowy grupami cyfr, tytuł z numerem umowy, odbiorca", async () => {
    const r = okResult(await tool("get_payment_instructions").handler(ctx()));
    expect(r).toMatchObject({
      available: true,
      rachunek_splaty: "12 3456 7890 1234 5678 9012 3456",
      tytul_przelewu: "Umowa nr FY/2026/014",
      odbiorca: "Adam Inwestor",
    });
    expect(r.rachunek_splaty_grupy).toEqual(["12", "3456", "7890", "1234", "5678", "9012", "3456"]);
    expect(r.say).toContain("Umowa nr FY/2026/014");
  });

  it("brak rachunku w umowie → available:false i odesłanie do umowy", async () => {
    db.kase!.loan = baseLoan({ rachunek_splaty: null });
    const r = okResult(await tool("get_payment_instructions").handler(ctx()));
    expect(r.available).toBe(false);
    expect(r.say).toMatch(/umowie/);
    expect(JSON.stringify(r)).not.toMatch(/\d{4} \d{4}/);
  });
});

describe("pomocnicze: daty, rachunek, typ zdarzenia", () => {
  it("parsePromiseDate — deterministycznie względem wtorku 6 października 2026", () => {
    expect(parsePromiseDate("2026-10-09", TODAY)).toBe("2026-10-09");
    expect(parsePromiseDate("09.10.2026", TODAY)).toBe("2026-10-09");
    expect(parsePromiseDate("9.10", TODAY)).toBe("2026-10-09");
    expect(parsePromiseDate("dziś", TODAY)).toBe("2026-10-06");
    expect(parsePromiseDate("jutro", TODAY)).toBe("2026-10-07");
    expect(parsePromiseDate("pojutrze", TODAY)).toBe("2026-10-08");
    expect(parsePromiseDate("za 3 dni", TODAY)).toBe("2026-10-09");
    expect(parsePromiseDate("za dwa dni", TODAY)).toBe("2026-10-08");
    expect(parsePromiseDate("za tydzień", TODAY)).toBe("2026-10-13");
    expect(parsePromiseDate("w piątek", TODAY)).toBe("2026-10-09");
    expect(parsePromiseDate("do piątku", TODAY)).toBe("2026-10-09");
    expect(parsePromiseDate("w środę", TODAY)).toBe("2026-10-07");
    expect(parsePromiseDate("we wtorek", TODAY)).toBe("2026-10-13"); // ten sam dzień = za tydzień
    expect(parsePromiseDate("w przyszły piątek", TODAY)).toBe("2026-10-16");
    expect(parsePromiseDate("do poniedziałku", TODAY)).toBe("2026-10-12");
    expect(parsePromiseDate("9 października", TODAY)).toBe("2026-10-09");
    expect(parsePromiseDate("do 15 października 2026", TODAY)).toBe("2026-10-15");
    expect(parsePromiseDate("5 stycznia", TODAY)).toBe("2027-01-05"); // już minął w tym roku
    expect(parsePromiseDate("do końca miesiąca", TODAY)).toBe("2026-10-31");
    expect(parsePromiseDate("do końca tygodnia", TODAY)).toBe("2026-10-09");
    expect(parsePromiseDate("po weekendzie", TODAY)).toBe("2026-10-12");
    expect(parsePromiseDate("jak dostanę pieniądze", TODAY)).toBeNull();
    expect(parsePromiseDate("", TODAY)).toBeNull();
    expect(parsePromiseDate("31.02.2026", TODAY)).toBeNull();
  });

  it("accountGroups — NRB 2+6×4, PL odcięte, inne czwórkami", () => {
    expect(accountGroups("PL12345678901234567890123456")).toEqual(["12", "3456", "7890", "1234", "5678", "9012", "3456"]);
    expect(accountGroups("12-3456-7890-1234-5678-9012-3456")).toEqual(["12", "3456", "7890", "1234", "5678", "9012", "3456"]);
    expect(accountGroups("DE89370400440532013000")).toEqual(["DE89", "3704", "0044", "0532", "0130", "00"]);
  });

  it("eventTypeFor — telefon dla agenta głosowego, kanał dla tekstowego, notatka dla czatu", () => {
    expect(eventTypeFor({ agent_key: "windykacja", channel: "voice_phone" })).toBe("telefon");
    expect(eventTypeFor({ agent_key: "windykacja_tekst", channel: "sms" })).toBe("sms");
    expect(eventTypeFor({ agent_key: "windykacja_tekst", channel: "email" })).toBe("email");
    expect(eventTypeFor({ agent_key: "windykacja_tekst", channel: "chat" })).toBe("notatka");
    expect(eventTypeFor({ agent_key: "windykacja_tekst", channel: "messenger" })).toBe("notatka");
  });
});
