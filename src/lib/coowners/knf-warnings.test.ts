import { describe, expect, it } from "vitest";
import { companyCore, matchKnfWarnings, parseKnfWarnings } from "./knf-warnings";

// Struktura jak na knf.gov.pl (sekcja z nagłówkiem + tabela), dane syntetyczne.
const html = `
<section class="space-y-0 table-with-header-parent"><div class="w-full p-6 title"><p>Zawiadomienia z art. 171 ust. 1–3 ustawy Prawo bankowe</p></div>
<div><table class="warning-list-table"><thead><tr><th>Lp.</th><th>Nazwa</th><th>Numer</th><th>Prokuratura</th><th>Wzmianki</th><th>Informacje</th></tr></thead><tbody>
<tr><td>1<!-- -->.</td><td><span>„Testbank&quot; prowadzący działalność poprzez platformę home.testbank-fake.com.</span></td><td><span>brak danych</span></td><td><span>Prokuratura Okręgowa w Warszawie</span></td><td><span>-</span></td><td><span>Zawiadomienie złożone przez UKNF.</span></td></tr>
<tr><td>2<!-- -->.</td><td><span>1. Pożyczkowa Testowa sp. z o.o. z siedzibą w Krakowie
2. Jan Przykładowy prowadzący działalność gospodarczą pod nazwą JP Finanse</span></td><td><span>1. KRS 0000111111

2. NIP 1234563218</span></td><td><span>Prokuratura Rejonowa Kraków</span></td><td><span>-</span></td><td><span>-</span></td></tr>
</tbody></table></div></section>
<section class="table-with-header-parent"><div class="title"><p>Zawiadomienia z art. 178 ustawy o obrocie instrumentami finansowymi</p></div>
<table><tbody><tr><td>1.</td><td><span>Inwest Global Ltd. (www.inwest-global-fake.io)</span></td><td><span>podmiot nie jest zarejestrowany w Polsce</span></td><td><span>Prokuratura Okręgowa w Katowicach</span></td><td><span>Wyrok skazujący z 2025 r.</span></td><td><span>-</span></td></tr></tbody></table></section>`;

const entries = parseKnfWarnings(html);

describe("lista ostrzeżeń KNF — parser", () => {
  it("czyta kategorie, nazwy, identyfikatory i domeny", () => {
    expect(entries).toHaveLength(3);
    expect(entries[1]).toMatchObject({
      lp: "2",
      names: [
        "Pożyczkowa Testowa sp. z o.o. z siedzibą w Krakowie",
        "Jan Przykładowy prowadzący działalność gospodarczą pod nazwą JP Finanse",
      ],
      krs: ["0000111111"],
      nips: ["1234563218"],
      prosecutor: "Prokuratura Rejonowa Kraków",
      info: null,
    });
    expect(entries[0].names[0]).toContain('„Testbank"');
    expect(entries[0].domains).toEqual(["home.testbank-fake.com"]);
    expect(entries[2].category).toContain("art. 178");
    expect(entries[2].rulings).toBe("Wyrok skazujący z 2025 r.");
  });
});

describe("lista ostrzeżeń KNF — dopasowanie", () => {
  it("KRS / NIP = identyfikator", () => {
    expect(
      matchKnfWarnings(entries, { name: "Inna", kind: "company", krs: ["0000111111"] })[0],
    ).toMatchObject({ match: "identifier", matchedOn: "KRS 0000111111" });
    expect(
      matchKnfWarnings(entries, { name: "Inna", kind: "company", nips: ["1234563218"] })[0].match,
    ).toBe("identifier");
  });
  it("domena strony (także subdomena)", () => {
    expect(
      matchKnfWarnings(entries, { name: "X", kind: "company", domains: ["testbank-fake.com"] })[0]
        .match,
    ).toBe("domain");
    expect(
      matchKnfWarnings(entries, {
        name: "X",
        kind: "company",
        domains: ["inwest-global-fake.io"],
      })[0].match,
    ).toBe("domain");
  });
  it("nazwa spółki bez formy prawnej i siedziby", () => {
    expect(companyCore("Pożyczkowa Testowa sp. z o.o. z siedzibą w Krakowie")).toBe(
      "pozyczkowa testowa",
    );
    expect(
      matchKnfWarnings(entries, {
        name: "POŻYCZKOWA TESTOWA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
        kind: "company",
      })[0].match,
    ).toBe("name");
    expect(
      matchKnfWarnings(entries, { name: "Testowa Budowlana sp. z o.o.", kind: "company" }),
    ).toEqual([]);
  });
  it("osoba: imię + nazwisko obok siebie, w dowolnej kolejności", () => {
    expect(
      matchKnfWarnings(entries, {
        name: "Jan Przykładowy",
        kind: "person",
        firstName: "Jan",
        lastName: "Przykładowy",
      })[0].match,
    ).toBe("name");
    expect(
      matchKnfWarnings(entries, {
        name: "Anna Przykładowy",
        kind: "person",
        firstName: "Anna",
        lastName: "Przykładowy",
      }),
    ).toEqual([]);
  });
});
