// Narzędzia MCP windykacji na atrapie bazy (bez Supabase): zadłużenie
// z harmonogramu w odczytach, edycja pożyczki (walidacja, przeliczenie
// sprawy, ślad w aktach), wpłata z kwotą, maskowanie rachunku.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wiersze atrapy bazy
type Row = Record<string, any>;

// ── Atrapa klienta Supabase (to, czego używają narzędzia windykacji) ──
function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  let seq = 0;
  const from = (table: string) => {
    const t = (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: unknown = null;
    let returning = false;
    let cols = "";
    let single: "one" | "maybe" | null = null;
    let range: [number, number] | null = null;
    let limit: number | null = null;
    let order: { col: string; asc: boolean } | null = null;
    let count = false;
    const q = {
      select: (c = "*", opts?: { count?: string }) => {
        returning = true;
        if (op === "select") cols = c;
        if (opts?.count) count = true;
        return q;
      },
      insert: (p: unknown) => {
        op = "insert";
        payload = p;
        return q;
      },
      update: (p: unknown) => {
        op = "update";
        payload = p;
        return q;
      },
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v);
        return q;
      },
      is: (c: string, v: unknown) => {
        filters.push((r) => (r[c] ?? null) === v);
        return q;
      },
      not: (c: string, _op: string, v: unknown) => {
        filters.push((r) => (r[c] ?? null) !== v);
        return q;
      },
      in: (c: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[c]));
        return q;
      },
      or: (expr: string) => {
        const parts = expr.split(",").map((p) => {
          const [c, o, ...rest] = p.split(".");
          const v = rest.join(".");
          return (r: Row) =>
            o === "eq" ? String(r[c]) === v : o === "gt" ? Number(r[c]) > Number(v) : false;
        });
        filters.push((r) => parts.some((f) => f(r)));
        return q;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        order = { col, asc: opts?.ascending ?? true };
        return q;
      },
      range: (a: number, b: number) => {
        range = [a, b];
        return q;
      },
      limit: (n: number) => {
        limit = n;
        return q;
      },
      maybeSingle: () => {
        single = "maybe";
        return q;
      },
      single: () => {
        single = "one";
        return q;
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    };
    const embed = (r: Row): Row => {
      if (table !== "wind_collection_cases" || !cols.includes("loan:wind_loans")) return r;
      const loan = tables.wind_loans?.find((l) => l.id === r.loan_id) ?? null;
      const borrower = loan
        ? (tables.wind_borrowers?.find((b) => b.id === loan.borrower_id) ?? null)
        : null;
      return { ...r, loan: loan ? { ...loan, borrower } : null };
    };
    const exec = () => {
      let rows: Row[];
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        rows = list.map((r) => ({ id: `ins-${++seq}`, ...structuredClone(r) }));
        t.push(...rows);
      } else {
        rows = t.filter((r) => filters.every((f) => f(r)));
        if (op === "update") for (const r of rows) Object.assign(r, structuredClone(payload));
      }
      if (order) {
        const { col, asc } = order;
        rows = [...rows].sort(
          (a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1),
        );
      }
      const total = rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (limit != null) rows = rows.slice(0, limit);
      // Limit wierszy odpowiedzi PostgREST.
      if (op === "select") rows = rows.slice(0, 1000);
      const out = rows.map((r) => embed(structuredClone(r)));
      if (op !== "select" && !returning) return { data: null, error: null };
      if (single === "one") {
        return out.length === 1
          ? { data: out[0], error: null }
          : { data: null, error: { message: `oczekiwano 1 wiersza, jest ${out.length}` } };
      }
      if (single === "maybe") return { data: out[0] ?? null, error: null };
      return { data: out, error: null, count: count ? total : null };
    };
    return q;
  };
  return { tables, from };
}

let db: ReturnType<typeof fakeDb>;
let isAdmin = false;
vi.mock("../_helpers", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../_helpers")>();
  return {
    ...orig,
    requireUser: () => db,
    userClient: () => db,
    hasRole: async () => isAdmin,
  };
});

import { generateHarmonogram } from "@/lib/windykacja-harmonogram";
import { defaultDelayRate, type WindDebtEvent } from "@/lib/windykacja-debt";
import {
  getCollectionCase,
  harmonogramSkrot,
  listWindLoans,
  loadWindDebtEvents,
  mainCaseByLoan,
  maskWindAccount,
  windZadluzenie,
} from "./collections-extra";
import listCollectionCases, { caseStatusFilter } from "./list-collection-cases";
import {
  addCollectionEvent,
  buildWindLoanPatch,
  updateWindLoan,
  windPaymentDay,
} from "./writes-finance";

const OWNER = "owner-1";
const OPERATOR = "operator-1";
const LOAN = "loan-1";
const CASE = "case-1";
const BORROWER = "borrower-1";

// Scenariusz z dokumentacji: 12 rat po 7 868,48 zł od 2026-07-10 (ostatnia
// 7 868,37 zł), wpłaty 2026-07-09 7 868,48 zł i 2026-08-12 4 000 zł,
// stopa 18,5 %, stan na 2026-10-06 → zaległe raty 11 744,94 zł, odsetki
// 211,75 zł, do zapłaty 11 956,69 zł, 57 dni.
const harmonogram = generateHarmonogram({
  pierwszaRata: "2026-07-10",
  liczbaRat: 12,
  kwotaRaty: 7868.48,
  kwotaOstatniejRaty: 7868.37,
});
const sumaRat = 94_421.65;
const wplata = (id: string, data: string, kwota: number) => ({
  id,
  case_id: CASE,
  typ: "wplata",
  data_zdarzenia: `${data}T12:00:00.000Z`,
  metadata: { kwota },
  oplata: 0,
});

function seed(loanOver: Row = {}, caseOver: Row = {}): Record<string, Row[]> {
  return {
    wind_borrowers: [{ id: BORROWER, imie_nazwisko: "Jan Kowalski", typ: "osoba_fizyczna" }],
    wind_loans: [
      {
        id: LOAN,
        borrower_id: BORROWER,
        investor_user_id: OWNER,
        numer_umowy: "FY/2026/014",
        data_umowy: "2026-06-15",
        kwota_pozyczki: 80_000,
        kwota_calkowita: sumaRat,
        prowizja: 0,
        termin_splaty: "2027-06-10",
        numer_kw: null,
        kwota_hipoteki: null,
        akt_notarialny_777: null,
        kwota_777: null,
        rachunek_splaty: "61 1090 1014 0000 0712 1981 2874",
        oprocentowanie_roczne: 0,
        stopa_odsetek_max: 18.5,
        kwota_doplat: 0,
        oplaty_windykacyjne: null,
        harmonogram,
        pozyczkodawca: "Adam Inwestor",
        status: "w_zwloce",
        saldo_pozostale: sumaRat,
        data_ostatniej_wplaty: "2026-08-12",
        data_wypowiedzenia: null,
        created_at: "2026-09-01T10:00:00Z",
        ...loanOver,
      },
    ],
    wind_collection_cases: [
      {
        id: CASE,
        loan_id: LOAN,
        investor_user_id: OWNER,
        sciezka: "miekka",
        etap: "kontakt_wstepny",
        kwota_zalegla: 0,
        opoznienie_dni: 0,
        data_otwarcia: "2026-09-01",
        data_zamkniecia: null,
        wynik: null,
        created_at: "2026-09-01T10:00:00Z",
        ...caseOver,
      },
    ],
    wind_events: [
      wplata("ev-1", "2026-07-09", 7868.48),
      wplata("ev-2", "2026-08-12", 4000),
      {
        id: "ev-3",
        case_id: CASE,
        typ: "notatka",
        data_zdarzenia: "2026-09-02T10:00:00Z",
        metadata: {},
        oplata: 0,
      },
    ],
  };
}

const ctxFor = (userId: string) => ({
  isAuthenticated: () => true,
  getToken: () => "token",
  getUserId: () => userId,
  getUserEmail: () => `${userId}@example.com`,
});

type ToolResult = {
  isError?: boolean;
  content: Array<{ text: string }>;
  structuredContent?: Row;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handler narzędzia MCP z atrapą kontekstu
const run = async (tool: { handler: any }, args: Row, userId = OWNER) =>
  (await tool.handler(args, ctxFor(userId))) as ToolResult;
const okData = (r: ToolResult) => {
  if (r.isError) throw new Error(r.content[0].text);
  return r.structuredContent as Row;
};

beforeEach(() => {
  db = fakeDb(seed());
  isAdmin = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

// ── Czyste funkcje ───────────────────────────────────────────────────

describe("windZadluzenie", () => {
  const events = seed().wind_events as WindDebtEvent[];
  it("scenariusz testowy: do zapłaty teraz, zaległe raty, odsetki, opóźnienie i stan rat", () => {
    const z = windZadluzenie({
      loan: seed().wind_loans[0],
      kwotaZalegla: 0,
      events,
      asOf: "2026-10-06",
      zRatami: true,
    });
    expect(z).toMatchObject({
      asOf: "2026-10-06",
      zrodlo: "harmonogram",
      wypowiedziana: false,
      zaleglosc: 11_744.94,
      odsetkiZaOpoznienie: 211.75,
      koszty: 0,
      doZaplatyTeraz: 11_956.69,
      dniOpoznienia: 57,
      najstarszaZalegla: "2026-08-10",
      najblizszaRata: "2026-10-10",
    });
    // Całość = do zapłaty teraz + raty przyszłe.
    expect(z.calosc).toBe(Math.round((z.doZaplatyTeraz + z.pozostaleRatyPrzyszle!) * 100) / 100);
    expect(z.raty!.slice(0, 4).map((r) => r.status)).toEqual([
      "zaplacona",
      "zalegla",
      "zalegla",
      "przyszla",
    ]);
    expect(z.raty![1]).toMatchObject({ termin: "2026-08-10", dniOpoznienia: 57 });
  });

  it("bez zRatami — bez listy rat (odpowiedź listy)", () => {
    const z = windZadluzenie({
      loan: seed().wind_loans[0],
      kwotaZalegla: 0,
      events,
      asOf: "2026-10-06",
    });
    expect(z.raty).toBeUndefined();
  });

  it("pożyczka bez harmonogramu — model z jednym terminem i kwotą zaległą sprawy", () => {
    const z = windZadluzenie({
      loan: { ...seed().wind_loans[0], harmonogram: null, termin_splaty: "2026-09-01" },
      kwotaZalegla: 7000,
      events: [],
      asOf: "2026-10-06",
    });
    expect(z.zrodlo).toBe("termin");
    expect(z.zaleglosc).toBe(7000);
    expect(z.dniOpoznienia).toBe(35);
    expect(z.pozostaleRatyPrzyszle).toBeNull();
  });
});

describe("harmonogramSkrot, mainCaseByLoan, maskWindAccount, caseStatusFilter", () => {
  it("skrót harmonogramu do list", () => {
    expect(harmonogramSkrot(harmonogram)).toEqual({
      liczba_rat: 12,
      suma_rat: sumaRat,
      pierwsza_rata: "2026-07-10",
      ostatnia_rata: "2027-06-10",
    });
    expect(harmonogramSkrot(null)).toBeNull();
    expect(harmonogramSkrot([])).toBeNull();
  });

  it("sprawa pożyczki: najnowsza otwarta, a bez otwartej — najnowsza", () => {
    const m = mainCaseByLoan([
      { id: "a", loan_id: "L", data_otwarcia: "2026-01-01", data_zamkniecia: null },
      { id: "b", loan_id: "L", data_otwarcia: "2026-05-01", data_zamkniecia: "2026-06-01" },
      { id: "c", loan_id: "M", data_otwarcia: "2026-01-01", data_zamkniecia: "2026-02-01" },
      { id: "d", loan_id: "M", data_otwarcia: "2026-03-01", data_zamkniecia: "2026-04-01" },
    ]);
    expect(m.get("L")?.id).toBe("a");
    expect(m.get("M")?.id).toBe("d");
  });

  it("rachunek do spłaty: właściciel i administrator widzą, reszta zespołu — ukryty", () => {
    const row = { investor_user_id: OWNER, rachunek_splaty: "61 1090 …" };
    expect(maskWindAccount(row, { userId: OWNER, admin: false }).rachunek_splaty).toBe("61 1090 …");
    expect(maskWindAccount(row, { userId: OPERATOR, admin: true }).rachunek_splaty).toBe(
      "61 1090 …",
    );
    expect(maskWindAccount(row, { userId: OPERATOR, admin: false }).rachunek_splaty).toBe(
      "(ukryte)",
    );
    expect(maskWindAccount(null, { userId: OPERATOR, admin: false })).toBeNull();
  });

  it("status listy spraw: otwarte / zamknięte / wynik", () => {
    expect(caseStatusFilter("otwarte")).toEqual({ kind: "otwarte" });
    expect(caseStatusFilter(" Zamknięte ")).toEqual({ kind: "zamkniete" });
    expect(caseStatusFilter("ugoda")).toEqual({ kind: "wynik", wynik: "ugoda" });
    expect(caseStatusFilter("aktywna")).toBeNull();
  });

  it("dzień wpłaty: data jak podana, domyślnie dziś, bez przyszłych dat", () => {
    expect(windPaymentDay(undefined, "2026-10-06")).toEqual({ day: "2026-10-06" });
    expect(windPaymentDay("05.10.2026", "2026-10-06")).toEqual({ day: "2026-10-05" });
    // Czas z przesunięciem strefy nie zmienia dnia kalendarzowego.
    expect(windPaymentDay("2026-10-05T00:30:00+02:00", "2026-10-06")).toEqual({
      day: "2026-10-05",
    });
    expect(windPaymentDay("2026-10-07", "2026-10-06")).toEqual({
      error: "Data wpłaty 07.10.2026 jest z przyszłości.",
    });
    expect(windPaymentDay("31.02.2026", "2026-10-06")).toHaveProperty("error");
  });
});

describe("buildWindLoanPatch — walidacja jak w panelu", () => {
  const before = seed({ harmonogram: null, rachunek_splaty: null }).wind_loans[0];

  it("rachunek NRB / IBAN PL w grupach, błędny numer odrzucony", () => {
    expect(
      buildWindLoanPatch({ rachunek_splaty: "PL61109010140000071219812874" }, before).patch,
    ).toEqual({ rachunek_splaty: "PL61 1090 1014 0000 0712 1981 2874" });
    expect(buildWindLoanPatch({ rachunek_splaty: "1234" }, before).errors[0]).toMatch(/26 cyfr/);
    expect(buildWindLoanPatch({ rachunek_splaty: "  " }, before).patch).toEqual({});
  });

  it("pusta stopa odsetek za opóźnienie = odsetki maksymalne z dnia umowy", () => {
    const r = buildWindLoanPatch({ stopa_odsetek_max: null, data_umowy: "01.01.2025" }, before);
    expect(r.patch.data_umowy).toBe("2025-01-01");
    expect(r.patch.stopa_odsetek_max).toBe(defaultDelayRate("2025-01-01"));
    expect(buildWindLoanPatch({ stopa_odsetek_max: 0 }, before).zmienione).toEqual([]);
    expect(buildWindLoanPatch({ stopa_odsetek_max: 14 }, before).patch).toEqual({
      stopa_odsetek_max: 14,
    });
  });

  it("harmonogram: kwoty w zapisie polskim, błędy z numerem raty, null usuwa", () => {
    const r = buildWindLoanPatch(
      {
        harmonogram: [
          { termin: "10.08.2026", kwota: "7 868,48" },
          { termin: "2026-07-10", kwota: 7868.48, odsetki: "1 200,00" },
        ],
      },
      before,
    );
    expect(r.errors).toEqual([]);
    expect(r.harmonogram).toEqual([
      { nr: 1, termin: "2026-07-10", kwota: 7868.48, odsetki: 1200 },
      { nr: 2, termin: "2026-08-10", kwota: 7868.48 },
    ]);
    const bad = buildWindLoanPatch(
      {
        harmonogram: [
          { termin: "2026-07-10", kwota: 100 },
          { termin: "x", kwota: -1 },
        ],
      },
      before,
    );
    expect(bad.errors.join(" ")).toMatch(/Rata 2/);
    expect(buildWindLoanPatch({ harmonogram: [] }, before).errors[0]).toMatch(/bez rat/);
    const withH = seed().wind_loans[0];
    const removed = buildWindLoanPatch({ harmonogram: null }, withH);
    expect(removed.patch).toEqual({ harmonogram: null });
    expect(removed.harmonogram).toBeNull();
  });

  it("saldo ręcznie tylko bez harmonogramu", () => {
    expect(buildWindLoanPatch({ saldo_pozostale: 500 }, before).patch).toEqual({
      saldo_pozostale: 500,
    });
    expect(buildWindLoanPatch({ saldo_pozostale: 500 }, seed().wind_loans[0]).errors[0]).toMatch(
      /liczone jest z rat/,
    );
  });

  it("daty, teksty i kwoty: błędna data odrzucona, puste → null, bez zmian = bez zapisu", () => {
    expect(buildWindLoanPatch({ data_wypowiedzenia: "jutro" }, before).errors[0]).toMatch(
      /Data wypowiedzenia/,
    );
    const r = buildWindLoanPatch(
      {
        numer_umowy: "FY/2026/014",
        pozyczkodawca: "  Finance You sp. z o.o. ",
        akt_notarialny_777: "",
        kwota_777: 120_000.456,
      },
      before,
    );
    expect(r.zmienione).toEqual(["pozyczkodawca", "kwota_777"]);
    expect(r.patch).toEqual({ pozyczkodawca: "Finance You sp. z o.o.", kwota_777: 120_000.46 });
  });
});

describe("loadWindDebtEvents", () => {
  it("wczytuje wszystkie wpłaty i opłaty stronami (ponad limit 1000 wierszy)", async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({
      ...wplata(`p-${String(i).padStart(5, "0")}`, "2026-08-01", 1),
    }));
    db = fakeDb({
      wind_events: [
        ...many,
        {
          id: "fee",
          case_id: CASE,
          typ: "sms",
          data_zdarzenia: "2026-08-02T10:00:00Z",
          oplata: 25,
        },
        {
          id: "note",
          case_id: CASE,
          typ: "notatka",
          data_zdarzenia: "2026-08-02T10:00:00Z",
          oplata: 0,
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- atrapa klienta
    const m = await loadWindDebtEvents(db as any, [CASE]);
    const list = m.get(CASE)!;
    expect(list).toHaveLength(2501);
    expect(list.filter((e) => e.typ === "sms")).toHaveLength(1);
  });
});

// ── Narzędzia (handler na atrapie bazy) ─────────────────────────────

describe("get_collection_case / list_wind_loans / list_collection_cases", () => {
  it("get_collection_case: zadłużenie na dziś z rat, pełny harmonogram, rachunek dla właściciela", async () => {
    const d = okData(await run(getCollectionCase, { id: CASE }));
    expect(d.zadluzenie).toMatchObject({
      zrodlo: "harmonogram",
      doZaplatyTeraz: 11_956.69,
      zaleglosc: 11_744.94,
      dniOpoznienia: 57,
    });
    expect(d.zadluzenie.raty).toHaveLength(12);
    expect(d.loan.harmonogram).toHaveLength(12);
    expect(d.loan.pozyczkodawca).toBe("Adam Inwestor");
    expect(d.loan.rachunek_splaty).toBe("61 1090 1014 0000 0712 1981 2874");
    expect(d.errors).toEqual([]);
  });

  it("get_collection_case: operator bez roli administratora — rachunek ukryty", async () => {
    const d = okData(await run(getCollectionCase, { id: CASE }, OPERATOR));
    expect(d.loan.rachunek_splaty).toBe("(ukryte)");
    isAdmin = true;
    const a = okData(await run(getCollectionCase, { id: CASE }, OPERATOR));
    expect(a.loan.rachunek_splaty).toBe("61 1090 1014 0000 0712 1981 2874");
  });

  it("list_wind_loans: skrót harmonogramu, sprawa i zadłużenie, dłużnik", async () => {
    const d = okData(await run(listWindLoans, {}));
    expect(d.total).toBe(1);
    const loan = d.loans[0];
    expect(loan.harmonogram).toBeUndefined();
    expect(loan.harmonogram_skrot).toMatchObject({ liczba_rat: 12 });
    expect(loan.sprawa).toMatchObject({ id: CASE });
    expect(loan.zadluzenie).toMatchObject({ doZaplatyTeraz: 11_956.69, dniOpoznienia: 57 });
    expect(loan.borrower).toMatchObject({ imie_nazwisko: "Jan Kowalski" });
  });

  it("list_collection_cases: zadłużenie na dziś zamiast nieaktualnej migawki, filtr statusu", async () => {
    const d = okData(await run(listCollectionCases, {}));
    const c = d.cases[0];
    expect(c.opoznienie_dni).toBe(0); // zapisana migawka
    expect(c.zadluzenie).toMatchObject({ dniOpoznienia: 57, doZaplatyTeraz: 11_956.69 });
    expect(c.loan).toMatchObject({
      pozyczkodawca: "Adam Inwestor",
      harmonogram_skrot: { liczba_rat: 12 },
    });
    expect(c.borrower).toMatchObject({ imie_nazwisko: "Jan Kowalski" });
    expect(okData(await run(listCollectionCases, { status: "zamkniete" })).cases).toEqual([]);
    expect((await run(listCollectionCases, { status: "xyz" })).isError).toBe(true);
  });
});

describe("update_wind_loan", () => {
  it("harmonogram dodany do pożyczki: przeliczenie sprawy i saldo z rat, wpis w aktach", async () => {
    db = fakeDb(seed({ harmonogram: null, saldo_pozostale: 82_553.17 }, { kwota_zalegla: 4000 }));
    const d = okData(
      await run(updateWindLoan, {
        loan_id: LOAN,
        harmonogram: harmonogram.map((r) => ({ termin: r.termin, kwota: r.kwota })),
      }),
    );
    expect(d.zmienione).toEqual(["Harmonogram rat"]);
    expect(d.przeliczenie).toEqual([
      expect.objectContaining({
        case_id: CASE,
        kwota_zalegla: 11_744.94,
        opoznienie_dni: 57,
        do_zaplaty_teraz: 11_956.69,
      }),
    ]);
    const kase = db.tables.wind_collection_cases[0];
    expect(kase).toMatchObject({ kwota_zalegla: 11_744.94, opoznienie_dni: 57 });
    const loan = db.tables.wind_loans[0];
    // Saldo = zaległe raty + raty przyszłe (8 × 7 868,48 + 7 868,37). Część
    // wpłaty z 12.08 poszła na odsetki za opóźnienie (WIN_04), nie na raty.
    expect(loan.saldo_pozostale).toBe(82_561.15);
    const ev = db.tables.wind_events.find((e) => e.tytul === "Zmieniono dane pożyczki (MCP)");
    expect(ev).toMatchObject({ case_id: CASE, typ: "notatka", investor_user_id: OWNER });
    expect(ev!.tresc).toMatch(/Harmonogram: 12 rat/);
    expect(ev!.tresc).toMatch(/opóźnienie 57 dni/);
  });

  it("błędne dane — nic nie zapisane", async () => {
    const r = await run(updateWindLoan, { loan_id: LOAN, rachunek_splaty: "123", kwota_777: 5 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/26 cyfr/);
    expect(db.tables.wind_loans[0].kwota_777).toBeNull();
  });

  it("status podany wprost zostaje — przeliczenie nie cofa „spłaconej”", async () => {
    okData(await run(updateWindLoan, { loan_id: LOAN, status: "splacona" }));
    expect(db.tables.wind_loans[0].status).toBe("splacona");
  });

  it("operator: zapis dozwolony (RLS), rachunek w odpowiedzi ukryty", async () => {
    const d = okData(
      await run(
        updateWindLoan,
        { loan_id: LOAN, pozyczkodawca: "Finance You sp. z o.o." },
        OPERATOR,
      ),
    );
    expect(db.tables.wind_loans[0].pozyczkodawca).toBe("Finance You sp. z o.o.");
    expect(d.loan.rachunek_splaty).toBe("(ukryte)");
  });

  it("brak pól → błąd; te same wartości → bez zapisu", async () => {
    expect((await run(updateWindLoan, { loan_id: LOAN })).isError).toBe(true);
    const d = okData(await run(updateWindLoan, { loan_id: LOAN, numer_umowy: "FY/2026/014" }));
    expect(d.zmienione).toEqual([]);
    expect(db.tables.wind_events).toHaveLength(3);
  });
});

describe("add_collection_event — wpłata z kwotą", () => {
  it("pożyczka z harmonogramem: kwota w metadata, sprawa przeliczona z rat", async () => {
    const d = okData(
      await run(addCollectionEvent, {
        case_id: CASE,
        typ: "wplata",
        tytul: "Wpłata od klienta",
        kwota: 11_956.69,
        data_zdarzenia: "2026-10-06",
        sposob: "przelew",
      }),
    );
    const ev = db.tables.wind_events.at(-1)!;
    expect(ev).toMatchObject({
      typ: "wplata",
      data_zdarzenia: "2026-10-06T12:00:00.000Z",
      metadata: { kwota: 11_956.69, sposob: "przelew", zrodlo: "mcp" },
      investor_user_id: OWNER,
    });
    expect(d.rozliczenie).toMatchObject({
      model: "harmonogram",
      kwota_zalegla: 0,
      opoznienie_dni: 0,
    });
    expect(db.tables.wind_collection_cases[0]).toMatchObject({
      kwota_zalegla: 0,
      opoznienie_dni: 0,
    });
    expect(db.tables.wind_loans[0].data_ostatniej_wplaty).toBe("2026-10-06");
  });

  it("pożyczka bez harmonogramu: wpłata pomniejsza saldo i kwotę zaległą (jak w panelu)", async () => {
    db = fakeDb(seed({ harmonogram: null, saldo_pozostale: 10_000 }, { kwota_zalegla: 3000 }));
    const d = okData(
      await run(addCollectionEvent, {
        case_id: CASE,
        typ: "wplata",
        tytul: "Wpłata",
        kwota: 1000,
        data_zdarzenia: "2026-08-01",
      }),
    );
    expect(d.rozliczenie).toEqual({ model: "termin", saldo_pozostale: 9000, kwota_zalegla: 2000 });
    // Wpłata wpisana wstecz nie cofa daty ostatniej wpłaty.
    expect(db.tables.wind_loans[0].data_ostatniej_wplaty).toBe("2026-08-12");
  });

  it("wpłata bez kwoty, z przyszłą datą albo kwota przy innym typie — odrzucone", async () => {
    const n = db.tables.wind_events.length;
    expect(
      (await run(addCollectionEvent, { case_id: CASE, typ: "wplata", tytul: "Wpłata" })).isError,
    ).toBe(true);
    expect(
      (
        await run(addCollectionEvent, {
          case_id: CASE,
          typ: "wplata",
          tytul: "Wpłata",
          kwota: 100,
          data_zdarzenia: "2026-10-07",
        })
      ).isError,
    ).toBe(true);
    expect(
      (await run(addCollectionEvent, { case_id: CASE, typ: "notatka", tytul: "x", kwota: 5 }))
        .isError,
    ).toBe(true);
    expect(db.tables.wind_events).toHaveLength(n);
  });

  it("zdarzenie inne niż wpłata — jak dotąd", async () => {
    okData(
      await run(addCollectionEvent, { case_id: CASE, typ: "notatka", tytul: "Rozmowa z klientem" }),
    );
    expect(db.tables.wind_events.at(-1)).toMatchObject({ typ: "notatka", kategoria: "manualne" });
  });
});
