import { describe, it, expect } from "vitest";
import {
  SUMMARY_COLUMNS,
  contactCount,
  formatRelativeDay,
  matchesAnyRole,
  matchesRoleFilter,
  otherCount,
  sortOperatorRows,
  sumOperatorRows,
  type OperatorActivityRow,
} from "./operator-activity";

function row(patch: Partial<OperatorActivityRow>): OperatorActivityRow {
  return {
    user_id: "00000000-0000-0000-0000-000000000000",
    name: null,
    email: null,
    roles: ["operator"],
    role_main: "operator",
    calls: 0,
    sms: 0,
    emails: 0,
    messenger: 0,
    chats: 0,
    notes: 0,
    reveals: 0,
    documents: 0,
    status_changes: 0,
    assignments: 0,
    decisions: 0,
    lead_flags: 0,
    other: 0,
    total: 0,
    leads_touched: 0,
    active_days: 0,
    last_action_at: null,
    last_sign_in_at: null,
    ...patch,
  };
}

/** Wiersz, w którym każdy licznik jest inny — łatwiej wyłapać zgubioną kolumnę. */
const pelnyDzien = row({
  user_id: "11111111-1111-1111-1111-111111111111",
  name: "Anna Kowalska",
  calls: 3,
  sms: 5,
  emails: 7,
  messenger: 2,
  chats: 1,
  notes: 4,
  reveals: 6,
  documents: 8,
  status_changes: 9,
  assignments: 10,
  decisions: 11,
  lead_flags: 12,
  other: 13,
  total: 91,
  leads_touched: 20,
  active_days: 5,
});

describe("kolumny podsumowania", () => {
  it("kolumny tabeli sumują się dokładnie do 'Razem'", () => {
    // Gdyby któryś licznik z bazy nie miał swojej kolumny, wiersz nie zgadzałby
    // się sam ze sobą — admin liczyłby w głowie, skąd wzięła się różnica.
    const zKolumn = SUMMARY_COLUMNS.reduce((sum, c) => sum + c.value(pelnyDzien), 0);
    expect(zKolumn).toBe(pelnyDzien.total);
  });

  it("kontakty to telefon, SMS, e-mail, Messenger i czat", () => {
    expect(contactCount(pelnyDzien)).toBe(3 + 5 + 7 + 2 + 1);
  });

  it("'Inne' zbiera podglądy, przypisania, oznaczenia i resztę dziennika", () => {
    expect(otherCount(pelnyDzien)).toBe(6 + 10 + 12 + 13);
  });
});

describe("kolejność wierszy", () => {
  it("najpierw najaktywniejsi, a przy remisie alfabetycznie po polsku", () => {
    const rows = [
      row({ user_id: "a", name: "Łukasz Nowak", total: 4 }),
      row({ user_id: "b", name: "Zofia Wolna", total: 12 }),
      row({ user_id: "c", name: "Adam Bąk", total: 4 }),
    ];
    expect(sortOperatorRows(rows).map((r) => r.name)).toEqual([
      "Zofia Wolna",
      "Adam Bąk",
      "Łukasz Nowak",
    ]);
  });

  it("konta bez żadnego zdarzenia lądują na końcu, ale nie znikają", () => {
    const rows = [
      row({ user_id: "a", name: "Bez ruchu", total: 0 }),
      row({ user_id: "b", name: "Z ruchem", total: 1 }),
    ];
    const sorted = sortOperatorRows(rows);
    expect(sorted.map((r) => r.name)).toEqual(["Z ruchem", "Bez ruchu"]);
  });

  it("nie modyfikuje tablicy wejściowej", () => {
    const rows = [row({ user_id: "a", total: 1 }), row({ user_id: "b", total: 9 })];
    sortOperatorRows(rows);
    expect(rows.map((r) => r.user_id)).toEqual(["a", "b"]);
  });
});

describe("stopka", () => {
  it("sumuje liczniki zdarzeń i liczy, ilu operatorów w ogóle pracowało", () => {
    const totals = sumOperatorRows([
      row({ user_id: "a", calls: 2, total: 2, leads_touched: 3, active_days: 2 }),
      row({ user_id: "b", calls: 5, sms: 1, total: 6, leads_touched: 3, active_days: 2 }),
      row({ user_id: "c" }),
    ]);
    expect(totals.calls).toBe(7);
    expect(totals.sms).toBe(1);
    expect(totals.total).toBe(8);
    expect(totals.people).toBe(3);
    expect(totals.active_people).toBe(2);
  });

  it("nie sumuje leadów ani dni — te same leady i dni powtarzają się u kilku osób", () => {
    const totals = sumOperatorRows([
      row({ user_id: "a", leads_touched: 3, active_days: 2, total: 1 }),
      row({ user_id: "b", leads_touched: 3, active_days: 2, total: 1 }),
    ]);
    expect(totals).not.toHaveProperty("leads_touched");
    expect(totals).not.toHaveProperty("active_days");
  });
});

describe("filtr ról", () => {
  it("'Operatorzy' obejmuje też operatora wewnętrznego", () => {
    expect(matchesRoleFilter("operator_wewnetrzny", "operator")).toBe(true);
    expect(matchesRoleFilter("posrednik", "operator")).toBe(false);
  });

  it("konto z kilkoma rolami pasuje, gdy pasuje choć jedna", () => {
    expect(matchesAnyRole(["posrednik", "operator"], "operator")).toBe(true);
    expect(matchesAnyRole(["posrednik"], "administrator")).toBe(false);
    expect(matchesAnyRole([], "all")).toBe(true);
  });
});

describe("ostatnie działanie", () => {
  const now = new Date("2026-09-16T10:00:00Z");

  it("dziś, wczoraj, dni temu", () => {
    expect(formatRelativeDay("2026-09-16T08:00:00Z", now)).toBe("dziś");
    expect(formatRelativeDay("2026-09-15T08:00:00Z", now)).toBe("wczoraj");
    expect(formatRelativeDay("2026-09-06T08:00:00Z", now)).toBe("10 dni temu");
  });

  it("starsze niż 30 dni pokazujemy datą, a brak działania to 'nigdy'", () => {
    expect(formatRelativeDay("2026-01-02T08:00:00Z", now)).toMatch(/2026/);
    expect(formatRelativeDay(null, now)).toBe("nigdy");
  });
});
