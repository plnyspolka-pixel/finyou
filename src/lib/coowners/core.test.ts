import { describe, expect, it } from "vitest";
import { maskPesel, mergeKwOwners, personNamesOverlap, scanKrsOdpisForPerson } from "./core";

// Poprawne numery PESEL (przechodzą walidację daty i sumy kontrolnej).
const PESEL_A = "73063017816"; // z realnego układu tabelarycznego EKW
const PESEL_B = "44051401359"; // klasyczny testowy PESEL

describe("maskPesel", () => {
  it("maskuje 11-cyfrowy PESEL do 6 cyfr daty + gwiazdki", () => {
    expect(maskPesel(PESEL_A)).toBe("730630*****");
  });
  it("odrzuca wartości niebędące PESEL-em", () => {
    expect(maskPesel(null)).toBeNull();
    expect(maskPesel("123")).toBeNull();
    expect(maskPesel("abcdefghijk")).toBeNull();
  });
});

describe("personNamesOverlap", () => {
  it("wymaga co najmniej dwóch wspólnych członów", () => {
    expect(personNamesOverlap("Jan Kowalski", "JAN KOWALSKI")).toBe(true);
    expect(personNamesOverlap("Jan Kowalski", "Adam Kowalski")).toBe(false);
    expect(personNamesOverlap(null, "Jan Kowalski")).toBe(false);
  });
  it("ignoruje diakrytykę i kolejność", () => {
    expect(personNamesOverlap("GRAŻYNA NOWAK-KOWALSKA", "Nowak Grazyna")).toBe(true);
  });
});

describe("mergeKwOwners — dział II KW", () => {
  it("scala osobę z jej numerem PESEL (układ tabelaryczny EKW)", () => {
    const dzial2 =
      "Osoba fizyczna (Imię pierwsze nazwisko, imię ojca, imię matki, PESEL) " +
      `ANATOLII SLAVINSKYI, PETRO, JEWDOKIJA, ${PESEL_A}`;
    const owners = mergeKwOwners(dzial2);
    expect(owners).toHaveLength(1);
    expect(owners[0].pesel).toBe(PESEL_A);
    expect(owners[0].fullName).toContain("SLAVINSKYI");
  });

  it("zostawia osobę bez PESEL do sprawdzenia po nazwisku", () => {
    const dzial2 =
      "Osoba fizyczna (Imię pierwsze nazwisko, imię ojca, imię matki, PESEL) " +
      `ANATOLII SLAVINSKYI, PETRO, JEWDOKIJA, ${PESEL_A} ` +
      "Imię pierwsze JANINA Nazwisko / pierwszy człon nazwiska złożonego SZPAK";
    const owners = mergeKwOwners(dzial2);
    expect(owners.length).toBe(2);
    const noPesel = owners.find((o) => o.fullName.includes("SZPAK"));
    expect(noPesel?.pesel).toBeNull();
  });

  it("nie dubluje tej samej osoby z wpisu PESEL i listy osób", () => {
    const dzial2 =
      "Imię: JAN Nazwisko: KOWALSKI " + `Osoba fizyczna (…, PESEL) JAN KOWALSKI, ${PESEL_B}`;
    const owners = mergeKwOwners(dzial2);
    expect(owners).toHaveLength(1);
    expect(owners[0].pesel).toBe(PESEL_B);
  });

  it("pusty dział II daje pustą listę", () => {
    expect(mergeKwOwners(null)).toEqual([]);
    expect(mergeKwOwners("")).toEqual([]);
  });

  it("odczytuje udział i rodzaj wspólności z układu tabelarycznego EKW", () => {
    const dzial2 =
      "Właściciele Lp. 1. --- Nr podstawy wpisu Lista wskazań udziałów w prawie " +
      "(numer udziału w prawie/ wielkość udziału/rodzaj wspólności) Lp. 1. 3 1 /1 " +
      "WSPÓLNOŚĆ USTAWOWA MAJĄTKOWA MAŁŻEŃSKA 26 Osoba fizyczna " +
      `(Imię pierwsze nazwisko, imię ojca, imię matki, PESEL) ANATOLII SLAVINSKYI, PETRO, JEWDOKIJA, ${PESEL_A}`;
    const owners = mergeKwOwners(dzial2);
    expect(owners).toHaveLength(1);
    expect(owners[0].share).toBe("1/1");
    expect(owners[0].coOwnershipType).toMatch(/USTAWOWA MAJĄTKOWA MAŁŻEŃSKA/i);
  });

  it("odczytuje udziały ułamkowe z układu odpisu (Wielkość udziału)", () => {
    const dzial2 =
      "Lp. 1 Wielkość udziału 1/2 Imię pierwsze JAN Nazwisko / pierwszy człon nazwiska złożonego KOWALSKI " +
      "Lp. 2 Wielkość udziału 1/2 Imię pierwsze ANNA Nazwisko / pierwszy człon nazwiska złożonego NOWAK";
    const owners = mergeKwOwners(dzial2);
    expect(owners).toHaveLength(2);
    expect(owners.find((o) => o.fullName.includes("KOWALSKI"))?.share).toBe("1/2");
    expect(owners.find((o) => o.fullName.includes("NOWAK"))?.share).toBe("1/2");
  });
});

describe("scanKrsOdpisForPerson — odpis z api-krs.ms.gov.pl", () => {
  const odpis = {
    odpis: {
      dane: {
        dzial1: {
          danePodmiotu: { nazwa: "TESTOWA SP. Z O.O." },
          wspolnicySpzoo: [
            {
              daneOsoby: {
                imiona: { imie: "JAN" },
                nazwisko: { nazwiskoICzlon: "KOWALSKI" },
                pesel: PESEL_B,
              },
              udzialy: { liczbaUdzialow: 50 },
            },
          ],
        },
        dzial2: {
          reprezentacja: {
            sklad: [
              {
                funkcjaWOrganie: "PREZES ZARZĄDU",
                daneOsoby: {
                  imiona: { imie: "JAN" },
                  nazwisko: { nazwiskoICzlon: "KOWALSKI" },
                  pesel: PESEL_B,
                },
              },
            ],
          },
        },
      },
    },
  };

  it("dopasowuje po PESEL i odczytuje funkcję z organu", () => {
    const scan = scanKrsOdpisForPerson(odpis, {
      pesel: PESEL_B,
      firstName: "Jan",
      lastName: "Kowalski",
    });
    expect(scan.peselMatched).toBe(true);
    expect(scan.nameMatched).toBe(true);
    expect(scan.roles).toContain("PREZES ZARZĄDU");
    expect(scan.roles.join(" ")).toMatch(/wspólnik/);
  });

  it("dopasowuje po nazwisku, gdy PESEL nieznany", () => {
    const scan = scanKrsOdpisForPerson(odpis, {
      pesel: null,
      firstName: "Jan",
      lastName: "Kowalski",
    });
    expect(scan.peselMatched).toBe(false);
    expect(scan.nameMatched).toBe(true);
  });

  it("nie dopasowuje obcej osoby", () => {
    const scan = scanKrsOdpisForPerson(odpis, {
      pesel: PESEL_A,
      firstName: "Adam",
      lastName: "Nowak",
    });
    expect(scan.peselMatched).toBe(false);
    expect(scan.nameMatched).toBe(false);
    expect(scan.roles).toEqual([]);
  });
});
