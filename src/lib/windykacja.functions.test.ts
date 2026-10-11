// Funkcje serwerowe windykacji na atrapie bazy (bez Supabase): zakładanie
// sprawy z harmonogramem, edycja pożyczki (lista pól, przeliczenie sprawy),
// wpłata rozliczana na raty i pisma w imieniu inwestora (wierzyciel z profilu).
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

// Klient z rolą serwisową: profile inwestorów (investors) i is_internal_staff.
// Sortuje jak Postgres (DESC domyślnie NULLS FIRST, nullsFirst: false — NULLS
// LAST), żeby wybór najnowszego profilu był naprawdę sprawdzany.
const admin = vi.hoisted(() => ({
  investors: [] as Array<Record<string, unknown>>,
  staff: new Set<string>(),
  queries: 0,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let ids: unknown[] = [];
      let limit = Infinity;
      const orders: Array<{ col: string; asc: boolean; nullsFirst: boolean }> = [];
      const cmp = (a: Record<string, unknown>, b: Record<string, unknown>) => {
        for (const o of orders) {
          const x = a[o.col] ?? null;
          const y = b[o.col] ?? null;
          if (x === y) continue;
          if (x === null) return o.nullsFirst ? -1 : 1;
          if (y === null) return o.nullsFirst ? 1 : -1;
          return (String(x) < String(y) ? -1 : 1) * (o.asc ? 1 : -1);
        }
        return 0;
      };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          if (c === "user_id") ids = [v];
          return q;
        },
        in: (c: string, vs: unknown[]) => {
          if (c === "user_id") ids = vs;
          return q;
        },
        order: (col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
          const asc = opts.ascending ?? true;
          orders.push({ col, asc, nullsFirst: opts.nullsFirst ?? !asc });
          return q;
        },
        limit: (n: number) => {
          limit = n;
          return q;
        },
        maybeSingle: () => {
          throw new Error("investors.user_id nie jest unikalne — maybeSingle zabronione");
        },
        then: (res: (v: unknown) => unknown) => {
          if (table === "investors") admin.queries++;
          const rows =
            table === "investors"
              ? admin.investors.filter((r) => ids.includes(r.user_id)).sort(cmp)
              : [];
          return Promise.resolve({ data: rows.slice(0, limit), error: null }).then(res);
        },
      };
      return q;
    },
    rpc: async (_fn: string, args: { _user_id: string }) => ({
      data: admin.staff.has(args._user_id),
      error: null,
    }),
  },
}));

// Wysyłka SMS / e-mail (performWindContact) — bez sieci.
const sent = vi.hoisted(() => ({ emails: [] as Array<Record<string, unknown>>, sms: 0 }));
vi.mock("@/lib/resend-send.server", () => ({
  sendResendEmail: async (opts: Record<string, unknown>) => {
    sent.emails.push(opts);
    return { ok: true, id: "em_1" };
  },
}));
vi.mock("@/lib/voicebot.functions", () => ({
  sendSmsInternal: async () => {
    sent.sms++;
    return { ok: true, sid: "SM1" };
  },
}));

import {
  addWindWplata,
  createWindCase,
  generateWindDocument,
  performWindContact,
  recordWindGeneratedDoc,
  seedWindDemo,
  updateWindBorrower,
  updateWindCase,
  updateWindLoan,
} from "./windykacja.functions";
import { generateHarmonogram } from "./windykacja-harmonogram";
import { windCreditorNames } from "./windykacja-creditor.server";

// ── Atrapa klienta Supabase (tylko to, czego używają testowane funkcje) ──
type Row = Record<string, unknown>;
const DEFAULTS: Record<string, () => Row> = {
  wind_events: () => ({ data_zdarzenia: new Date().toISOString(), oplata: 0, metadata: {} }),
  wind_loans: () => ({ status: "aktywna", saldo_pozostale: 0, harmonogram: null }),
  wind_collection_cases: () => ({ data_zamkniecia: null }),
};

function fakeDb() {
  const tables: Record<string, Row[]> = {};
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const from = (table: string) => {
    const t = (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: unknown = null;
    let returning = false;
    let single: "one" | "maybe" | null = null;
    const q = {
      select: () => {
        returning = true;
        return q;
      },
      insert: (rows: Row | Row[]) => {
        op = "insert";
        payload = rows;
        return q;
      },
      update: (patch: Row) => {
        op = "update";
        payload = patch;
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
      in: (c: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[c]));
        return q;
      },
      order: () => q,
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
    const exec = () => {
      let rows: Row[];
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        rows = list.map((r) => ({
          id: uuid(),
          ...(DEFAULTS[table]?.() ?? {}),
          ...structuredClone(r),
        }));
        t.push(...rows);
      } else {
        rows = t.filter((r) => filters.every((f) => f(r)));
        if (op === "update") for (const r of rows) Object.assign(r, structuredClone(payload));
      }
      const out = rows.map((r) => structuredClone(r));
      if (op !== "select" && !returning) return { data: null, error: null };
      if (single === "one") {
        return out.length === 1
          ? { data: out[0], error: null }
          : { data: null, error: { message: `oczekiwano 1 wiersza, jest ${out.length}` } };
      }
      if (single === "maybe") return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };
    return q;
  };
  return { tables, from };
}

let db: ReturnType<typeof fakeDb>;
let userId: string | undefined;
const ctx = () => ({
  supabase: { from: db.from },
  userId,
  claims: { email: "test@financeyou.pl" },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- atrapa createServerFn przyjmuje { data, context }
const call = <T>(fn: unknown, data: unknown): Promise<T> => (fn as any)({ data, context: ctx() });

// Scenariusz z dokumentacji: 12 rat po 7 868,48 zł od 2026-07-10 (ostatnia
// 7 868,37 zł), wpłaty 2026-07-09 7 868,48 zł i 2026-08-12 4 000 zł, stan na
// 2026-10-06 przy stopie 18,5 %.
const harmonogram = generateHarmonogram({
  pierwszaRata: "2026-07-10",
  liczbaRat: 12,
  kwotaRaty: 7868.48,
  kwotaOstatniejRaty: 7868.37,
});
const baseCase = {
  imie_nazwisko: "Jan Testowy",
  numer_umowy: "FY/2026/0100",
  data_umowy: "2026-06-15",
  kwota_pozyczki: 80_000,
  kwota_calkowita: 94_421.65,
  prowizja: 4_000,
};

beforeEach(() => {
  db = fakeDb();
  userId = undefined;
  admin.investors.length = 0;
  admin.staff.clear();
  admin.queries = 0;
  sent.emails.length = 0;
  sent.sms = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createWindCase — pożyczka z harmonogramem", () => {
  it("kwota zaległa, opóźnienie i saldo z rat (ręczna kwota zaległa ignorowana)", async () => {
    const res = await call<{ caseId: string; kwota_zalegla: number }>(createWindCase, {
      ...baseCase,
      harmonogram: harmonogram.map((r) => ({ termin: r.termin, kwota: r.kwota })),
      pozyczkodawca: "  Finance You sp. z o.o. ",
      rachunek_splaty: "61109010140000071219812874",
      kwota_zalegla: 4_000,
      wplaty: [
        { kwota: 7868.48, data: "2026-07-09" },
        { kwota: "4 000,00", data: "12.08.2026" },
      ],
    });
    expect(res.kwota_zalegla).toBe(11_744.94);

    const [loan] = db.tables.wind_loans;
    expect(loan.harmonogram).toEqual(harmonogram);
    expect(loan.pozyczkodawca).toBe("Finance You sp. z o.o.");
    expect(loan.rachunek_splaty).toBe("61 1090 1014 0000 0712 1981 2874");
    // Termin spłaty = termin ostatniej raty; stopa = odsetki maksymalne z dnia umowy.
    expect(loan.termin_splaty).toBe("2027-06-10");
    expect(loan.stopa_odsetek_max).toBe(18.5);
    expect(loan.saldo_pozostale).toBe(82_561.15);
    expect(loan.status).toBe("w_zwloce");
    expect(loan.data_ostatniej_wplaty).toBe("2026-08-12");

    const [kase] = db.tables.wind_collection_cases;
    expect(kase.kwota_zalegla).toBe(11_744.94);
    expect(kase.opoznienie_dni).toBe(57);
    expect(kase.data_otwarcia).toBe("2026-10-06");

    const wplaty = db.tables.wind_events.filter((e) => e.typ === "wplata");
    expect(wplaty.map((e) => [e.data_zdarzenia, (e.metadata as Row).kwota])).toEqual([
      ["2026-07-09T12:00:00.000Z", 7868.48],
      ["2026-08-12T12:00:00.000Z", 4000],
    ]);
    const otwarcie = db.tables.wind_events.find((e) => e.tytul === "Sprawa windykacyjna otwarta");
    expect(otwarcie?.tresc).toContain("Harmonogram: 12 rat");
    expect(otwarcie?.tresc).toContain("opóźnienie 57 dni");
  });

  it("błędny wiersz harmonogramu i zły rachunek → czytelny błąd, nic nie zapisane", async () => {
    await expect(
      call(createWindCase, {
        ...baseCase,
        harmonogram: [
          { termin: "2026-07-10", kwota: 100 },
          { termin: "31.02.2026", kwota: 100 },
        ],
        rachunek_splaty: "123",
      }),
    ).rejects.toThrow(
      "Rachunek do spłaty: podaj 26 cyfr numeru rachunku (NRB) albo IBAN PL. Rata 2: nieprawidłowy termin płatności (RRRR-MM-DD).",
    );
    expect(db.tables.wind_loans).toBeUndefined();
  });
});

describe("createWindCase — model jednoterminowy", () => {
  it("ręczna kwota zaległa NIE nadpisuje salda pożyczki", async () => {
    await call(createWindCase, {
      ...baseCase,
      kwota_calkowita: 96_000,
      termin_splaty: "2026-09-28",
      kwota_zalegla: 4_000,
      wplaty: [{ kwota: 10_000, data: "2026-08-01" }],
    });
    expect(db.tables.wind_loans[0].saldo_pozostale).toBe(86_000);
    expect(db.tables.wind_loans[0].harmonogram).toBeNull();
    expect(db.tables.wind_collection_cases[0].kwota_zalegla).toBe(4_000);
    expect(db.tables.wind_collection_cases[0].opoznienie_dni).toBe(8);
  });

  it("bez ręcznej kwoty — zaległe całe saldo; spłata całości → saldo 0", async () => {
    await call(createWindCase, { ...baseCase, kwota_calkowita: 96_000, termin_splaty: null });
    expect(db.tables.wind_collection_cases[0].kwota_zalegla).toBe(96_000);
    expect(db.tables.wind_collection_cases[0].opoznienie_dni).toBe(0);

    db = fakeDb();
    await call(createWindCase, {
      ...baseCase,
      kwota_calkowita: 96_000,
      wplaty: [{ kwota: 96_000, data: "2026-09-01" }],
    });
    expect(db.tables.wind_loans[0].saldo_pozostale).toBe(0);
  });

  it("podana stopa odsetek za opóźnienie zostaje", async () => {
    await call(createWindCase, { ...baseCase, stopa_odsetek_max: 19 });
    expect(db.tables.wind_loans[0].stopa_odsetek_max).toBe(19);
  });
});

async function seedLoan(loan: Row = {}) {
  const res = await call<{ caseId: string }>(createWindCase, {
    ...baseCase,
    termin_splaty: "2027-06-10",
    ...loan,
  });
  const kase = db.tables.wind_collection_cases.find((c) => c.id === res.caseId)!;
  return { caseId: res.caseId, loanId: kase.loan_id as string };
}

describe("updateWindLoan — lista pól i przeliczenie sprawy", () => {
  it("odrzuca pola spoza listy", async () => {
    const { loanId } = await seedLoan();
    await expect(
      call(updateWindLoan, { id: loanId, patch: { status: "splacona", saldo_pozostale: 0 } }),
    ).rejects.toThrow("Tych pól nie można zmienić tutaj: status, saldo_pozostale.");
  });

  it("harmonogram dodany na karcie sprawy → przeliczona sprawa, saldo i ślad w aktach", async () => {
    const { caseId, loanId } = await seedLoan({
      kwota_zalegla: 50_000,
      wplaty: [
        { kwota: 7868.48, data: "2026-07-09" },
        { kwota: 4000, data: "2026-08-12" },
      ],
    });
    const res = await call<{ ok: true; loan: Row }>(updateWindLoan, {
      id: loanId,
      caseId,
      patch: {
        harmonogram: harmonogram.map((r) => ({ termin: r.termin, kwota: String(r.kwota) })),
        pozyczkodawca: "Jan Inwestor",
        akt_notarialny_777: "Rep. A nr 1234/2026",
        kwota_777: "150 000",
        stopa_odsetek_max: "",
      },
    });
    expect(res.ok).toBe(true);
    expect(res.loan.harmonogram).toEqual(harmonogram);
    expect(res.loan.pozyczkodawca).toBe("Jan Inwestor");
    expect(res.loan.kwota_777).toBe(150_000);
    // Pusta stopa = odsetki maksymalne z dnia umowy.
    expect(res.loan.stopa_odsetek_max).toBe(18.5);
    expect(res.loan.saldo_pozostale).toBe(82_561.15);

    const kase = db.tables.wind_collection_cases.find((c) => c.id === caseId)!;
    expect(kase.kwota_zalegla).toBe(11_744.94);
    expect(kase.opoznienie_dni).toBe(57);

    const zmiana = db.tables.wind_events.find((e) => e.tytul === "Zmieniono dane pożyczki")!;
    expect(zmiana.tresc).toContain("Harmonogram rat");
    expect(zmiana.tresc).toContain("Pożyczkodawca");
    expect(zmiana.tresc).toContain("opóźnienie 57 dni");
  });

  it("bez caseId przelicza otwarte sprawy pożyczki; niezmienione pola bez wpisu w aktach", async () => {
    const { caseId, loanId } = await seedLoan({ harmonogram });
    db.tables.wind_collection_cases[0].kwota_zalegla = 1;
    await call(updateWindLoan, {
      id: loanId,
      patch: { numer_umowy: baseCase.numer_umowy },
    });
    const kase = db.tables.wind_collection_cases.find((c) => c.id === caseId)!;
    expect(kase.kwota_zalegla).toBe(23_605.44); // raty 1–3 bez wpłat
    const n = db.tables.wind_events.length;
    await call(updateWindLoan, { id: loanId, caseId, patch: { numer_umowy: " FY/2026/0100 " } });
    expect(db.tables.wind_events).toHaveLength(n);
  });

  it("sprawa innej pożyczki → błąd", async () => {
    const a = await seedLoan();
    const b = await seedLoan();
    await expect(
      call(updateWindLoan, { id: a.loanId, caseId: b.caseId, patch: { numer_kw: "WA1M/1/1" } }),
    ).rejects.toThrow("Sprawa nie dotyczy tej pożyczki");
  });

  it("harmonogram null → powrót do modelu jednoterminowego", async () => {
    const { caseId, loanId } = await seedLoan({ harmonogram });
    const res = await call<{ loan: Row }>(updateWindLoan, {
      id: loanId,
      caseId,
      patch: { harmonogram: null },
    });
    expect(res.loan.harmonogram).toBeNull();
  });
});

describe("addWindWplata", () => {
  it("pożyczka z harmonogramem — wpłata rozliczana na raty", async () => {
    const { caseId, loanId } = await seedLoan({
      harmonogram,
      wplaty: [{ kwota: 7868.48, data: "2026-07-09" }],
    });
    const res = await call<{ kwota_zalegla: number; saldo_pozostale: number }>(addWindWplata, {
      caseId,
      loanId,
      kwota: 4000,
      data: "2026-08-12",
    });
    expect(res.kwota_zalegla).toBe(11_744.94);
    expect(res.saldo_pozostale).toBe(82_561.15);
    const loan = db.tables.wind_loans.find((l) => l.id === loanId)!;
    expect(loan.saldo_pozostale).toBe(82_561.15);
    expect(loan.data_ostatniej_wplaty).toBe("2026-08-12");

    // Wpłata wpisana wstecz nie cofa daty ostatniej wpłaty.
    await call(addWindWplata, { caseId, loanId, kwota: 1, data: "2026-07-20" });
    expect(db.tables.wind_loans.find((l) => l.id === loanId)!.data_ostatniej_wplaty).toBe(
      "2026-08-12",
    );
  });

  it("model jednoterminowy — wpłata pomniejsza saldo i kwotę zaległą", async () => {
    const { caseId, loanId } = await seedLoan({ kwota_zalegla: 5_000 });
    const res = await call<{ kwota_zalegla: number; saldo_pozostale: number }>(addWindWplata, {
      caseId,
      loanId,
      kwota: 2_000,
      data: "2026-10-01",
    });
    expect(res).toMatchObject({ kwota_zalegla: 3_000, saldo_pozostale: 92_421.65 });
  });

  it("wpłata do sprawy innej pożyczki → błąd, nic nie zapisane", async () => {
    const a = await seedLoan();
    const b = await seedLoan();
    const n = db.tables.wind_events.length;
    await expect(
      call(addWindWplata, { caseId: a.caseId, loanId: b.loanId, kwota: 100, data: "2026-10-01" }),
    ).rejects.toThrow("Wpłata nie dotyczy pożyczki tej sprawy");
    expect(db.tables.wind_events).toHaveLength(n);
  });
});

describe("updateWindBorrower / updateWindCase — lista pól", () => {
  it("dłużnik: NIP osobno od PESEL, walidacja formatu", async () => {
    await seedLoan();
    const id = db.tables.wind_borrowers[0].id as string;
    const res = await call<{ borrower: Row }>(updateWindBorrower, {
      id,
      patch: { nip: "PL 522-345-67-89", pesel: "", telefon: " +48 600 100 200 " },
    });
    expect(res.borrower).toMatchObject({
      nip: "5223456789",
      pesel: null,
      telefon: "+48 600 100 200",
    });
    await expect(call(updateWindBorrower, { id, patch: { pesel: "5223456789" } })).rejects.toThrow(
      "PESEL: PESEL ma 11 cyfr.",
    );
    await expect(
      call(updateWindBorrower, { id, patch: { investor_user_id: "x" } }),
    ).rejects.toThrow("Tych pól nie można zmienić tutaj: investor_user_id.");
  });

  it("sprawa: dozwolone pola zapisane, inne odrzucone", async () => {
    const { caseId } = await seedLoan();
    const res = await call<{ case: Row }>(updateWindCase, {
      id: caseId,
      patch: { priorytet: "wysoki", wynik: "", opoznienie_dni: "12" },
    });
    expect(res.case).toMatchObject({ priorytet: "wysoki", wynik: null, opoznienie_dni: 12 });
    await expect(call(updateWindCase, { id: caseId, patch: { loan_id: caseId } })).rejects.toThrow(
      "Tych pól nie można zmienić tutaj: loan_id.",
    );
  });
});

describe("seedWindDemo", () => {
  it("jedna sprawa demonstracyjna z harmonogramem, pozostałe w modelu jednoterminowym", async () => {
    await call(seedWindDemo, undefined);
    const loans = db.tables.wind_loans;
    expect(loans).toHaveLength(4);
    const zRatami = loans.filter((l) => Array.isArray(l.harmonogram));
    expect(zRatami).toHaveLength(1);
    const loan = zRatami[0];
    expect(loan.harmonogram).toHaveLength(24);
    expect(loan.termin_splaty).toBe("2028-02-28");
    // Demo nie podaje Finance You jako pożyczkodawcy (bez profilu — puste).
    expect(loan.pozyczkodawca).toBeNull();
    // 6 rat zapłaconych w terminie, 7. (2026-09-28) zaległa, 17 przyszłych.
    expect(loan.saldo_pozostale).toBe(72_000);
    const kase = db.tables.wind_collection_cases.find((c) => c.loan_id === loan.id)!;
    expect(kase.kwota_zalegla).toBe(4_000);
    expect(kase.opoznienie_dni).toBe(8);
    // Stopa odsetek za opóźnienie = odsetki maksymalne z dnia umowy, nie 24,5 %.
    for (const l of loans) expect(l.stopa_odsetek_max).toBeLessThanOrEqual(22.5);
  });
});

// ── Wierzyciel = inwestor, właściciel sprawy (profil z public.investors) ──
const OWNER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const jdgProfile = {
  user_id: OWNER,
  entity_variant: "jdg",
  entity_type: "osoba_fizyczna",
  first_name: "Anna",
  last_name: "Nowak",
  company_name: "Nowak Finanse",
  nip: "5223456789",
  street: "ul. Długa 1",
  postal_code: "80-001",
  city: "Gdańsk",
  email: "anna@nowak.pl",
};

/** Sprawa właściciela OWNER z pożyczką i dłużnikiem (atrapa nie robi złączeń). */
async function ownedCase(loan: Row = {}) {
  const { caseId, loanId } = await seedLoan(loan);
  const kase = db.tables.wind_collection_cases.find((c) => c.id === caseId)!;
  const loanRow = db.tables.wind_loans.find((l) => l.id === loanId)!;
  kase.investor_user_id = OWNER;
  kase.loan = { ...loanRow, borrower: db.tables.wind_borrowers[0] };
  return caseId;
}

describe("generateWindDocument — pismo w imieniu inwestora", () => {
  it("wierzyciel z profilu właściciela sprawy, nie Finance You; migawka w metadata", async () => {
    admin.investors.push(jdgProfile);
    const caseId = await ownedCase();
    // Generuje operator (inna osoba niż właściciel) — wierzycielem zostaje właściciel.
    userId = STAFF;
    admin.staff.add(STAFF);
    const res = await call<{ event: Row; document: Row }>(generateWindDocument, {
      caseId,
      typ: "wezwanie",
    });
    const tresc = String(res.event.tresc);
    expect(tresc).toContain("Wierzyciel: Nowak Finanse");
    expect(tresc).toContain("Działając jako pożyczkodawca");
    expect(tresc).toMatch(/Z poważaniem,\n\nAnna Nowak\nwłaściciel\nNowak Finanse$/);
    expect(tresc.startsWith("Gdańsk, dnia")).toBe(true);
    expect(tresc).not.toMatch(/Finance You|Bielak/);
    expect(res.event.metadata).toEqual({
      wierzyciel: {
        kind: "jdg",
        legalName: "Nowak Finanse",
        nip: "5223456789",
        krs: null,
        source: "investor",
      },
    });
    expect(db.tables.wind_documents).toHaveLength(1);
  });

  it("niekompletny profil → czytelny błąd z brakami i odesłaniem do Profilu; nic nie zapisane", async () => {
    admin.investors.push({ ...jdgProfile, postal_code: null, city: "" });
    const caseId = await ownedCase();
    userId = OWNER;
    const n = db.tables.wind_events.length;
    await expect(call(generateWindDocument, { caseId, typ: "wezwanie" })).rejects.toThrow(
      /Brakuje danych: kod pocztowy, miejscowość\. Uzupełnij je w zakładce Profil \(\/inwestor\/profil\)/,
    );
    expect(db.tables.wind_events).toHaveLength(n);
    expect(db.tables.wind_documents).toBeUndefined();
  });

  it("wniosek do komornika: osoba fizyczna bez PESEL → blokada; notatka bez wymagań", async () => {
    admin.investors.push({
      user_id: OWNER,
      entity_variant: "osoba_fizyczna",
      first_name: "Jan",
      last_name: "Kowalski",
      street: "ul. Polna 5",
      postal_code: "00-001",
      city: "Warszawa",
    });
    const caseId = await ownedCase();
    userId = OWNER;
    await expect(call(generateWindDocument, { caseId, typ: "wniosek_komornik" })).rejects.toThrow(
      "Brakuje danych: PESEL",
    );
    const res = await call<{ event: Row }>(generateWindDocument, { caseId, typ: "notatka" });
    expect(String(res.event.tresc)).toContain("Wierzyciel: Jan Kowalski");
  });

  it("właściciel bez profilu inwestora → błąd; personel bez profilu → Finance You", async () => {
    const caseId = await ownedCase();
    userId = OWNER;
    await expect(call(generateWindDocument, { caseId, typ: "wezwanie" })).rejects.toThrow(
      "Uzupełnij dane w zakładce Profil (/inwestor/profil)",
    );

    admin.staff.add(OWNER);
    const res = await call<{ event: Row }>(generateWindDocument, { caseId, typ: "wezwanie" });
    const tresc = String(res.event.tresc);
    expect(tresc).toContain("Działając w imieniu Finance You sp. z o.o.");
    expect(tresc).toMatch(/Filip Bielak\nPrezes Zarządu\nFinance You sp\. z o\.o\.$/);
    expect((res.event.metadata as Row).wierzyciel).toMatchObject({ source: "finance_you" });
  });
});

describe("recordWindGeneratedDoc — DOCX z migawką wierzyciela", () => {
  it("zapisuje wierzyciela i braki profilu w metadata zdarzenia", async () => {
    admin.investors.push({ ...jdgProfile, nip: null });
    const caseId = await ownedCase();
    userId = OWNER;
    const res = await call<{ event: Row }>(recordWindGeneratedDoc, {
      caseId,
      typ: "wniosek_klauzula",
      tytul: "Wniosek o klauzulę",
      plik_url: "generated/x.docx",
    });
    expect(res.event.metadata).toEqual({
      wierzyciel: {
        kind: "jdg",
        legalName: "Nowak Finanse",
        nip: null,
        krs: null,
        source: "investor",
      },
      braki: ["NIP"],
    });
  });
});

describe("createWindCase — domyślny pożyczkodawca z profilu", () => {
  it("puste pole → krótka nazwa z profilu zakładającego; wpisane — bez zmian", async () => {
    admin.investors.push(jdgProfile);
    userId = OWNER;
    await call(createWindCase, { ...baseCase, termin_splaty: "2027-06-10", pozyczkodawca: " " });
    expect(db.tables.wind_loans[0].pozyczkodawca).toBe("Nowak Finanse");
    await call(createWindCase, { ...baseCase, pozyczkodawca: "Jan Inwestor" });
    expect(db.tables.wind_loans[1].pozyczkodawca).toBe("Jan Inwestor");
  });
});

describe("wybór profilu inwestora — user_id w investors nie jest unikalne", () => {
  it("najpierw profil z ukończonym krokiem danych pożyczkodawcy (NULL na końcu), potem najnowszy", async () => {
    // Nowszy, ale niekompletny wiersz (bez lender_data_completed_at) dodany pierwszy.
    admin.investors.push(
      {
        ...jdgProfile,
        company_name: "Szkic Nowak",
        lender_data_completed_at: null,
        updated_at: "2026-10-01T00:00:00Z",
      },
      {
        ...jdgProfile,
        lender_data_completed_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
      {
        ...jdgProfile,
        company_name: "Stary Nowak",
        lender_data_completed_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    );
    const caseId = await ownedCase();
    userId = OWNER;
    const res = await call<{ event: Row }>(generateWindDocument, { caseId, typ: "wezwanie" });
    expect(String(res.event.tresc)).toContain("Wierzyciel: Nowak Finanse");
  });

  it("nazwy wierzycieli do panelu: jedno zapytanie o profile, personel bez profilu → Finance You", async () => {
    const OTHER = "33333333-3333-4333-8333-333333333333";
    admin.investors.push(
      { ...jdgProfile, company_name: "Szkic", lender_data_completed_at: null },
      { ...jdgProfile, lender_data_completed_at: "2026-05-01T00:00:00Z" },
    );
    admin.staff.add(STAFF);
    const names = await windCreditorNames([OWNER, STAFF, OTHER, OWNER, null]);
    expect(names).toEqual({ [OWNER]: "Nowak Finanse", [STAFF]: "Finance You" });
    expect(admin.queries).toBe(1);
  });
});

describe("performWindContact — nadawca SMS-a i e-maila", () => {
  it("e-mail w imieniu wierzyciela z profilu; błędny e-mail profilu nie trafia do reply-to", async () => {
    admin.investors.push({ ...jdgProfile, email: "anna(at)nowak" });
    const caseId = await ownedCase();
    userId = OWNER;
    await call(performWindContact, {
      caseId,
      typ: "email",
      target: "dluznik@example.com",
      tresc: "Prosimy o spłatę.",
    });
    expect(sent.emails[0]).toMatchObject({
      fromName: '"Nowak Finanse (przez Finance You)"',
      subject: "Zaległość w spłacie pożyczki — Nowak Finanse",
      replyTo: undefined,
    });
  });

  it("bez profilu — pożyczkodawca z umowy; bez profilu i bez pożyczkodawcy — blokada", async () => {
    const caseId = await ownedCase({ pozyczkodawca: "Jan Inwestor" });
    userId = OWNER;
    await call(performWindContact, {
      caseId,
      typ: "email",
      target: "dluznik@example.com",
      tresc: "Prosimy o spłatę.",
    });
    expect(sent.emails[0]).toMatchObject({ fromName: '"Jan Inwestor (przez Finance You)"' });

    const bez = await ownedCase();
    await expect(
      call(performWindContact, { caseId: bez, typ: "sms", target: "600100200", tresc: "SMS" }),
    ).rejects.toThrow(/w Twoim imieniu.*Profil \(\/inwestor\/profil\)/);
    expect(sent.sms).toBe(0);
  });
});
