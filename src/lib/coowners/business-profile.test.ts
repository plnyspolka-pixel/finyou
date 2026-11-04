import { describe, expect, it } from "vitest";
import {
  ceidgFlags,
  companyFlags,
  extractLinks,
  identifiersInText,
  normalizeWebsite,
  overdueFilingNote,
  parseCeidgDetails,
  parseKrsCompanyProfile,
  parseVatSubject,
  rankPages,
  robotsAllows,
  vatFlags,
} from "./business-profile";

// Dane syntetyczne w formacie API KRS (odpis aktualny + pełny).
const aktualny = {
  odpis: {
    naglowekA: { numerKRS: "0000123456", dataRejestracjiWKRS: "10.03.2026" },
    dane: {
      dzial1: {
        danePodmiotu: {
          formaPrawna: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
          nazwa: "TESTOWA SP. Z O.O.",
          identyfikatory: { nip: "1234563218", regon: "123456785" },
        },
        siedzibaIAdres: {
          siedziba: { miejscowosc: "KRAKÓW", wojewodztwo: "MAŁOPOLSKIE" },
          adresStronyInternetowej: "WWW.TESTOWA.PL",
        },
        kapital: { wysokoscKapitaluZakladowego: { wartosc: "5000,00", waluta: "PLN" } },
        wspolnicySpzoo: [{ nazwa: "MATKA SA", posiadaneUdzialy: "100 UDZIAŁÓW" }],
      },
      dzial2: {
        reprezentacja: { sposobReprezentacji: "KAŻDY CZŁONEK ZARZĄDU SAMODZIELNIE", sklad: [] },
      },
      dzial3: {
        przedmiotDzialalnosci: {
          przedmiotPrzewazajacejDzialalnosci: [
            { opis: "ROBOTY BUDOWLANE", kodDzial: "41", kodKlasa: "20", kodPodklasa: "Z" },
          ],
        },
        wzmiankiOZlozonychDokumentach: {},
        informacjaODniuKonczacymRokObrotowy: { dzienKonczacyPierwszyRokObrotowy: "31.12.2026" },
      },
      dzial4: { zaleglosci: [{ wysokoscZaleglosci: "ZALEGŁOŚĆ WOBEC ZUS 120 000 ZŁ" }] },
      dzial6: {},
    },
  },
};
const pelny = {
  odpis: {
    naglowekP: {
      wpis: [
        { numerWpisu: 1, dataWpisu: "10.03.2026" },
        { numerWpisu: 2, dataWpisu: "01.06.2026" },
        { numerWpisu: 3, dataWpisu: "01.09.2026" },
      ],
    },
    dane: {
      dzial1: {
        danePodmiotu: {
          nazwa: [
            { nazwa: "A", nrWpisuWprow: "1", nrWpisuWykr: "2" },
            { nazwa: "B", nrWpisuWprow: "2" },
          ],
        },
        siedzibaIAdres: { adres: [{ nrWpisuWprow: "1" }] },
        kapital: { wysokoscKapitaluZakladowego: [{ wartosc: "5000,00", nrWpisuWprow: "1" }] },
        wspolnicySpzoo: [],
      },
      dzial2: {
        reprezentacja: [
          {
            sklad: [
              {
                nazwisko: [
                  { nazwisko: { nazwiskoICzlon: "K*****" }, nrWpisuWprow: "1", nrWpisuWykr: "2" },
                ],
              },
              {
                nazwisko: [
                  { nazwisko: { nazwiskoICzlon: "N*****" }, nrWpisuWprow: "2", nrWpisuWykr: "3" },
                ],
              },
              { nazwisko: [{ nazwisko: { nazwiskoICzlon: "W*****" }, nrWpisuWprow: "3" }] },
            ],
          },
        ],
      },
    },
  },
};

describe("profil spółki z KRS", () => {
  const p = parseKrsCompanyProfile(aktualny, pelny, { krs: "0000123456", today: "2026-11-04" })!;
  it("odczytuje dane podstawowe, kapitał, PKD, stronę i reprezentację", () => {
    expect(p).toMatchObject({
      name: "TESTOWA SP. Z O.O.",
      nip: "1234563218",
      registeredOn: "2026-03-10",
      capital: "5000,00 PLN",
      website: "WWW.TESTOWA.PL",
      representationRule: "KAŻDY CZŁONEK ZARZĄDU SAMODZIELNIE",
    });
    expect(p.mainPkd).toContain("41.20.Z");
    expect(p.shareholders).toEqual([{ name: "MATKA SA", shares: "100 UDZIAŁÓW" }]);
  });
  it("dział 4 i historia zmian z odpisu pełnego", () => {
    expect(p.dzial4[0]).toContain("Zaległości");
    expect(p.dzial4[0]).toContain("ZUS 120 000");
    expect(p.history).toMatchObject({ entriesTotal: 3, nameChanges: 1, boardChangesLast24m: 4 });
  });
  it("sygnały: dział 4, młoda spółka z minimalnym kapitałem, rotacja zarządu", () => {
    const f = companyFlags(p, "2026-11-04");
    expect(f.find((x) => x.source === "KRS dział 4")?.level).toBe("alert");
    expect(f.some((x) => /< 12 mies.*kapitał minimalny/.test(x.text))).toBe(true);
    expect(f.some((x) => /zmian w organach/.test(x.text) && x.level === "warning")).toBe(true);
  });
  it("pierwszy rok obrotowy jeszcze trwa — brak zaległego sprawozdania", () => {
    expect(p.overdueFiling).toBeNull();
  });
  it("połączenie spółek to informacja, nie alarm", () => {
    const merged = parseKrsCompanyProfile(
      {
        odpis: {
          ...aktualny.odpis,
          dane: {
            ...aktualny.odpis.dane,
            dzial4: {},
            dzial6: { polaczeniePodzialPrzeksztalcenie: [{ opis: "PRZEJĘCIE INNEJ SPÓŁKI" }] },
          },
        },
      },
      null,
      { krs: "0000123456", today: "2026-11-04" },
    )!;
    expect(companyFlags(merged, "2026-11-04").find((x) => x.source === "KRS dział 6")?.level).toBe(
      "info",
    );
  });
});

describe("zaległe sprawozdania", () => {
  it("ostatnie za 2023 → po 7,5 mies. od końca 2024 zaległe", () => {
    expect(
      overdueFilingNote({
        lastPeriodEnd: "2023-12-31",
        firstFiscalYearEnd: null,
        registeredOn: "2015-01-01",
        today: "2025-09-01",
      }),
    ).toContain("2024-12-31");
  });
  it("w terminie — brak uwag", () => {
    expect(
      overdueFilingNote({
        lastPeriodEnd: "2024-12-31",
        firstFiscalYearEnd: null,
        registeredOn: "2015-01-01",
        today: "2025-11-01",
      }),
    ).toBeNull();
  });
  it("kilka lat zaległości", () => {
    expect(
      overdueFilingNote({
        lastPeriodEnd: "2021-12-31",
        firstFiscalYearEnd: null,
        registeredOn: "2015-01-01",
        today: "2025-09-01",
      }),
    ).toContain("i 2 kolejnych");
  });
});

describe("wykaz VAT i CEIDG", () => {
  it("wykreślenie z VAT z powodu braku kontaktu = alarm", () => {
    const v = parseVatSubject({
      name: "X",
      nip: "1234563218",
      statusVat: null,
      removalDate: "2025-02-01",
      removalBasis: "Art. 96 ust. 9 pkt 2 — brak kontaktu z podatnikiem",
      accountNumbers: [],
      representatives: [{ firstName: "Jan", lastName: "Testowy" }],
    })!;
    expect(v.representatives).toEqual(["Jan Testowy"]);
    expect(vatFlags(v)[0].level).toBe("alert");
  });
  it("CEIDG: zawieszenie bez wznowienia i wspólność majątkowa", () => {
    const c = parseCeidgDetails({
      nazwa: "Jan Testowy Usługi",
      wlasciciel: { nip: "1234563218" },
      dataRozpoczecia: "2015-01-01",
      dataZawieszenia: "2026-05-01",
      wspolnoscMajatkowa: true,
      pkd: [{ kod: "41.20.Z", nazwa: "Roboty" }],
    })!;
    expect(c.maritalCommunity).toBe("tak");
    const f = ceidgFlags(c, "2026-11-04");
    expect(f.some((x) => /zawieszona od 2026-05-01/.test(x.text))).toBe(true);
    expect(f.some((x) => /wspólności majątkowej/.test(x.text))).toBe(true);
  });
});

describe("strona WWW", () => {
  it("robots.txt: Disallow: / dla wszystkich blokuje, pusty Disallow pozwala", () => {
    expect(robotsAllows("User-agent: *\nCrawl-delay: 7200\nDisallow: /", "/")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow:", "/")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /raport-o-firmie", "/kontakt")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /raport-o-firmie", "/raport-o-firmie/1")).toBe(
      false,
    );
    expect(robotsAllows("User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /", "/")).toBe(
      false,
    );
    expect(robotsAllows("User-agent: *\nDisallow: /\nAllow: /kontakt", "/kontakt")).toBe(true);
  });
  it("NIP i KRS z tekstu strony", () => {
    expect(identifiersInText("Testowa sp. z o.o., NIP: 123-456-32-18, KRS 0000123456")).toEqual({
      nips: ["1234563218"],
      krs: ["0000123456"],
    });
  });
  it("linki do sprawozdań i podstron finansowych", () => {
    const html = `<a href="/relacje-inwestorskie">Relacje inwestorskie</a><a href="/docs/sf-2024.pdf">Sprawozdanie finansowe 2024</a>
      <a href="/kontakt">Kontakt</a><a href="/blog/x">Blog</a><a href="https://inna.pl/raport.pdf">Raport roczny</a>`;
    const l = extractLinks(html, "https://www.testowa.pl/");
    expect(l.documents.map((d) => d.url)).toEqual([
      "https://www.testowa.pl/docs/sf-2024.pdf",
      "https://inna.pl/raport.pdf",
    ]);
    expect(rankPages(l.pages)[0]).toBe("https://www.testowa.pl/relacje-inwestorskie");
    expect(l.pages).not.toContain("https://www.testowa.pl/blog/x");
  });
  it("normalizacja adresu z rejestru", () => {
    expect(normalizeWebsite("WWW.TESTOWA.PL")).toBe("https://www.testowa.pl/");
    expect(normalizeWebsite("biuro@testowa.pl")).toBeNull();
  });
});
