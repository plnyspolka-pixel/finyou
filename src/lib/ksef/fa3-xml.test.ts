// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFa3Xml,
  computeFa3Totals,
  isValidNip,
  normalizeNip,
  validateFa3,
  type Fa3Invoice,
  type Fa3Seller,
} from "./fa3-xml";

const XSD = path.resolve(__dirname, "__fixtures__/xsd/schemat_FA(3)_v1-0E.xsd");
const hasXmllint = spawnSync("xmllint", ["--version"]).status === 0;

/** Waliduje XML względem oficjalnego XSD FA(3); zwraca komunikat błędu albo "". */
function xsdErrors(xml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fa3-"));
  const file = path.join(dir, "fa.xml");
  writeFileSync(file, xml, "utf8");
  try {
    execFileSync("xmllint", ["--noout", "--schema", XSD, file], { stdio: "pipe" });
    return "";
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? e);
  }
}

const FINANCE_YOU: Fa3Seller = {
  legal_name: "Finance You Sp. z o.o.",
  nip: "7010611803",
  address_street: "ul. Nowogrodzka 31",
  address_postal_code: "00-511",
  address_city: "Warszawa",
  email: "biuro@financeyou.pl",
  bank_account: "96 1090 2688 0000 0001 6652 8680",
  regon: "365350668",
};

const FUNDACJA: Fa3Seller = {
  legal_name: "Fundacja im. Pieczaka",
  nip: "9462747637",
  address_street: "ul. Testowa 1",
  address_postal_code: "20-001",
  address_city: "Lublin",
};

const base: Fa3Invoice = {
  invoice_number: "FY/2026/0003",
  issue_date: "2026-09-25",
  sale_date: "2026-09-25",
  due_date: "2026-10-09",
  currency: "PLN",
  buyer_name: "Jan Kowalski",
  buyer_street: "ul. Kwiatowa 5",
  buyer_postal_code: "00-001",
  buyer_city: "Warszawa",
  items: [{ name: "Prowizja za udzielenie pożyczki", quantity: 1, unitNet: 1500, vatRate: "zw" }],
  vat_exemption_basis: "art. 43 ust. 1 pkt 38 ustawy o VAT",
  generated_at: new Date("2026-09-25T10:00:00Z"),
};

describe("NIP", () => {
  it("normalizuje i sprawdza sumę kontrolną", () => {
    expect(normalizeNip("PL 701-061-18-03")).toBe("7010611803");
    expect(isValidNip("7010611803")).toBe(true);
    expect(isValidNip("9462747637")).toBe(true);
    expect(isValidNip("7010611804")).toBe(false);
    expect(isValidNip("")).toBe(false);
  });
});

describe("computeFa3Totals", () => {
  it("grupuje po stawkach i używa zapisanych wartości pozycji", () => {
    const t = computeFa3Totals([
      { name: "A", quantity: 2, unitNet: 100, vatRate: "23" },
      { name: "B", quantity: 1, unitNet: 80.4878, vatRate: "23", net: 80.49, vat: 18.51 },
      { name: "C", quantity: 1, unitNet: 50, vatRate: "zw" },
    ]);
    expect(t.groups["23"]).toEqual({ net: 280.49, vat: 64.51 });
    expect(t.groups["zw"]).toEqual({ net: 50, vat: 0 });
    expect(t.gross).toBe(395);
  });
});

describe("validateFa3", () => {
  it("wymaga adresu sprzedawcy i podstawy zwolnienia", () => {
    const p = validateFa3(
      { ...base, vat_exemption_basis: null },
      { legal_name: "X", nip: "9462747637" },
    );
    expect(p.join(" ")).toMatch(/adres/);
    expect(p.join(" ")).toMatch(/podstawy zwolnienia/);
  });

  it("odrzuca waluty inne niż PLN i złe NIP-y", () => {
    const p = validateFa3({ ...base, currency: "EUR", buyer_nip: "1234567890" }, FINANCE_YOU);
    expect(p.join(" ")).toMatch(/PLN/);
    expect(p.join(" ")).toMatch(/NIP/);
  });

  it("przepuszcza poprawne dane", () => {
    expect(validateFa3(base, FINANCE_YOU)).toEqual([]);
  });
});

describe.skipIf(!hasXmllint)("zgodność z XSD FA(3)", () => {
  const cases: Array<[string, Fa3Invoice, Fa3Seller]> = [
    ["Finance You — zwolnienie przedmiotowe, konsument bez NIP", base, FINANCE_YOU],
    [
      "Fundacja — zwolnienie podmiotowe, firma z NIP, zapłacona",
      {
        ...base,
        invoice_number: "FV/2026/0001",
        buyer_name: "Firma Sp. z o.o.",
        buyer_nip: "PL7010611803",
        vat_exemption_basis: "art. 113 ust. 1 ustawy o VAT",
        paid_date: "2026-09-24",
        due_date: null,
      },
      FUNDACJA,
    ],
    [
      "mieszane stawki, sprzedaż w innym dniu, ilości ułamkowe",
      {
        ...base,
        sale_date: "2026-09-20",
        items: [
          {
            name: "Dostęp do platformy",
            quantity: 1,
            unitNet: 80.4878,
            vatRate: "23",
            net: 80.49,
            vat: 18.51,
          },
          { name: "Usługa <A&B>", quantity: 2.5, unit: "godz.", unitNet: 100, vatRate: "8" },
          { name: "Książka", quantity: 1, unitNet: 40, vatRate: "5" },
          { name: "Usługa 0%", quantity: 1, unitNet: 10, vatRate: "0" },
          { name: "Prowizja", quantity: 1, unitNet: 1000, vatRate: "zw" },
        ],
      },
      FINANCE_YOU,
    ],
    [
      "nabywca zagraniczny, bez adresu, bez konta",
      {
        ...base,
        buyer_nip: "DE123456789",
        buyer_country: "DE",
        buyer_street: null,
        buyer_city: null,
        items: [{ name: "Usługa", quantity: 1, unitNet: 100, vatRate: "23" }],
        vat_exemption_basis: null,
      },
      { ...FINANCE_YOU, bank_account: null, email: null, regon: null },
    ],
  ];

  for (const [label, inv, seller] of cases) {
    it(label, () => {
      const xml = buildFa3Xml(inv, seller);
      expect(xsdErrors(xml)).toBe("");
    });
  }

  it("zawiera kluczowe pola zwolnienia i sum", () => {
    const xml = buildFa3Xml(base, FINANCE_YOU);
    expect(xml).toContain("<P_13_7>1500.00</P_13_7>");
    expect(xml).toContain("<P_15>1500.00</P_15>");
    expect(xml).toContain("<P_19>1</P_19>");
    expect(xml).toContain("<P_19A>art. 43 ust. 1 pkt 38 ustawy o VAT</P_19A>");
    expect(xml).toContain("<BrakID>1</BrakID>");
    expect(xml).toContain("<NrRB>96109026880000000166528680</NrRB>");
  });
});
