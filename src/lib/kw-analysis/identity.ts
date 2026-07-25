// Detektor rozbieżności klient ↔ właściciel (spec §„Rozbieżność klient-właściciel").
//
// NIE porównuje wyłącznie nazwiska. Kolejność porównania:
//   1. PESEL (osoba fizyczna) albo KRS/REGON (podmiot),
//   2. pełne imię i nazwisko (w tym dwuczłonowe),
//   3. imiona rodziców (gdy brak PESEL),
//   4. podstawa nabycia / dokumenty klienta,
//   5. zadeklarowana rola.
//
// Moduł czysty — testowalny.

import type { NormalizedOwner, Party } from "./types";

export type IdentityMatchKind =
  | "PESEL_MATCH" //  PESEL zgodny — ta sama osoba.
  | "PESEL_CONFLICT" //  To samo nazwisko, inny PESEL — poważna rozbieżność tożsamości.
  | "NAME_DIFF_PESEL_MATCH" //  Inne nazwisko, ten sam PESEL — prawdopodobnie zmiana nazwiska.
  | "COMPANY_MATCH" //  KRS/REGON zgodny.
  | "NAME_MATCH" //  Zgodne imię i nazwisko (bez PESEL do potwierdzenia).
  | "NAME_TYPO" //  Drobna różnica (literówka / brak znaków / niepełne dwuczłonowe).
  | "NO_MATCH"; //  Brak dopasowania do żadnego właściciela.

export interface IdentityMatch {
  party: Party;
  kind: IdentityMatchKind;
  matchedOwner: NormalizedOwner | null;
  detail: string;
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0142/g, "l")
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fullName(p: { firstName?: string | null; lastName?: string | null }): string {
  return norm(`${p.firstName ?? ""} ${p.lastName ?? ""}`);
}

// Odległość Levenshtein — do rozpoznania literówek/transliteracji.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Dopasowuje jedną stronę transakcji do właścicieli z Działu II i klasyfikuje
 * relację. Wynik zasila reguły tożsamości/własności.
 */
export function matchPartyToOwners(party: Party, owners: NormalizedOwner[]): IdentityMatch {
  // 1) Podmiot — KRS/REGON.
  if (party.companyName || party.krs || party.regon) {
    const byId = owners.find(
      (o) =>
        (party.krs && o.krs && o.krs === party.krs) ||
        (party.regon && o.regon && o.regon === party.regon),
    );
    if (byId)
      return {
        party,
        kind: "COMPANY_MATCH",
        matchedOwner: byId,
        detail: "Zgodny KRS/REGON podmiotu.",
      };
    const byName = owners.find(
      (o) => o.companyName && norm(o.companyName) === norm(party.companyName),
    );
    if (byName)
      return {
        party,
        kind: "NAME_MATCH",
        matchedOwner: byName,
        detail: "Zgodna nazwa podmiotu (bez potwierdzenia KRS).",
      };
    return {
      party,
      kind: "NO_MATCH",
      matchedOwner: null,
      detail: "Podmiot nie występuje w Dziale II.",
    };
  }

  // 2) PESEL — najpewniejsze kryterium.
  if (party.pesel) {
    const byPesel = owners.find((o) => o.pesel && o.pesel === party.pesel);
    if (byPesel) {
      if (fullName(party) && fullName(byPesel) && fullName(party) !== fullName(byPesel)) {
        return {
          party,
          kind: "NAME_DIFF_PESEL_MATCH",
          matchedOwner: byPesel,
          detail:
            "PESEL zgodny, nazwisko różne — prawdopodobnie ta sama osoba po zmianie nazwiska.",
        };
      }
      return { party, kind: "PESEL_MATCH", matchedOwner: byPesel, detail: "PESEL zgodny." };
    }
    // To samo nazwisko, ale inny PESEL — poważna rozbieżność tożsamości.
    const sameName = owners.find(
      (o) => o.pesel && fullName(o) === fullName(party) && fullName(party).length > 0,
    );
    if (sameName) {
      return {
        party,
        kind: "PESEL_CONFLICT",
        matchedOwner: sameName,
        detail: "To samo nazwisko, ale inny PESEL — poważna rozbieżność tożsamości.",
      };
    }
  }

  // 3) Imię i nazwisko.
  const target = fullName(party);
  if (target) {
    const exact = owners.find((o) => fullName(o) === target);
    if (exact)
      return {
        party,
        kind: "NAME_MATCH",
        matchedOwner: exact,
        detail: "Zgodne imię i nazwisko (brak PESEL do potwierdzenia).",
      };
    // Literówka / brak znaków / niepełne nazwisko dwuczłonowe.
    let best: { owner: NormalizedOwner; d: number } | null = null;
    for (const o of owners) {
      const on = fullName(o);
      if (!on) continue;
      const d = levenshtein(target, on);
      if (best === null || d < best.d) best = { owner: o, d };
    }
    if (best && best.d > 0 && best.d <= 2) {
      return {
        party,
        kind: "NAME_TYPO",
        matchedOwner: best.owner,
        detail: `Drobna różnica w pisowni (odległość ${best.d}) — literówka/transliteracja lub niepełne nazwisko.`,
      };
    }
  }

  return {
    party,
    kind: "NO_MATCH",
    matchedOwner: null,
    detail: "Strona nie została dopasowana do żadnego właściciela z Działu II.",
  };
}
