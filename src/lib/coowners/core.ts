// Czysta logika modułu współwłaścicieli (dział II KW → CEIDG/KRS):
// scalanie osób z działu II z ich numerami PESEL, maskowanie PESEL (RODO)
// oraz przeszukiwanie surowego odpisu KRS pod kątem konkretnej osoby.
// Bez zależności serwerowych — testowalne w vitest.

import { extractKwOwnerPersons, extractKwOwnerPesels } from "@/lib/risk-assessment/kw-parse-core";

export interface KwCoOwnerCandidate {
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  /** Pełny PESEL z działu II — wyłącznie do użycia w pamięci (nie zapisywać). */
  pesel: string | null;
}

/** Maskuje PESEL do zapisu w wyniku: 6 cyfr daty urodzenia + gwiazdki. */
export function maskPesel(pesel: string | null | undefined): string | null {
  if (!pesel || !/^\d{11}$/.test(pesel)) return null;
  return `${pesel.slice(0, 6)}*****`;
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Zgodność dwóch nazw osób: co najmniej dwa wspólne człony (imię+nazwisko). */
export function personNamesOverlap(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const ta = new Set(
    norm(a)
      .split(/[\s-]+/)
      .filter((t) => t.length > 1),
  );
  const tb = norm(b)
    .split(/[\s-]+/)
    .filter((t) => t.length > 1);
  return tb.filter((t) => ta.has(t)).length >= 2;
}

/**
 * Scala osoby fizyczne z działu II KW (imię+nazwisko) z numerami PESEL
 * odczytanymi z tego samego działu. Osoby bez PESEL zostają na liście
 * (sprawdzenie wyłącznie po imieniu i nazwisku).
 */
export function mergeKwOwners(dzial2: string | null | undefined): KwCoOwnerCandidate[] {
  const persons = extractKwOwnerPersons(dzial2);
  const pesels = extractKwOwnerPesels(dzial2);

  const out: KwCoOwnerCandidate[] = [];
  const seen = new Set<string>();
  const usedPesels = new Set<string>();

  const push = (c: KwCoOwnerCandidate) => {
    const key = c.fullName ? norm(c.fullName) : `pesel:${c.pesel}`;
    if (seen.has(key)) {
      // Uzupełnij PESEL, jeśli duplikat go wnosi.
      if (c.pesel) {
        const prev = out.find((o) => (o.fullName ? norm(o.fullName) : "") === key);
        if (prev && !prev.pesel) prev.pesel = c.pesel;
      }
      return;
    }
    seen.add(key);
    out.push(c);
  };

  // 1) Wpisy z PESEL — najmocniejsza identyfikacja.
  for (const p of pesels) {
    if (usedPesels.has(p.pesel)) continue;
    usedPesels.add(p.pesel);
    if (p.ownerName) {
      const person = persons.find((per) =>
        personNamesOverlap(`${per.firstName} ${per.lastName}`, p.ownerName),
      );
      push({
        fullName: p.ownerName,
        firstName: person?.firstName ?? (p.ownerName.split(/\s+/)[0] || null),
        lastName: person?.lastName ?? (p.ownerName.split(/\s+/).slice(1).join(" ") || null),
        pesel: p.pesel,
      });
    } else if (pesels.length === 1 && persons.length === 1) {
      // Jedyny PESEL i jedyna osoba w dziale II — przypisz mimo braku dopasowania tekstowego.
      push({
        fullName: `${persons[0].firstName} ${persons[0].lastName}`,
        firstName: persons[0].firstName,
        lastName: persons[0].lastName,
        pesel: p.pesel,
      });
    }
  }

  // 2) Osoby bez przypisanego PESEL.
  for (const per of persons) {
    push({
      fullName: `${per.firstName} ${per.lastName}`,
      firstName: per.firstName,
      lastName: per.lastName,
      pesel: null,
    });
  }

  return out.slice(0, 6);
}

// ---- Skan surowego odpisu KRS pod kątem osoby ----

export interface KrsOdpisPersonScan {
  peselMatched: boolean;
  nameMatched: boolean;
  /** Funkcje/konteksty, w których osoba występuje w odpisie. */
  roles: string[];
}

const PATH_ROLE_LABELS: Array<[RegExp, string]> = [
  [/prokur/i, "prokurent"],
  [/organnadzoru|radanadzorcza/i, "organ nadzoru"],
  [/reprezentacja|zarzad|organreprezentacji/i, "reprezentacja / zarząd"],
  [/wspolnicy|akcjonariusz|wspolnik/i, "wspólnik / akcjonariusz"],
  [/komplementariusz/i, "komplementariusz"],
  [/komandytariusz/i, "komandytariusz"],
  [/zalozyciel/i, "założyciel"],
  [/likwidator/i, "likwidator"],
];

function roleFromPath(path: string[]): string | null {
  const joined = path
    .join(".")
    .toLowerCase()
    .replace(/[^a-z.]/g, "");
  for (const [re, label] of PATH_ROLE_LABELS) {
    if (re.test(joined)) return label;
  }
  return null;
}

function readLastNameAny(n: any): string {
  if (!n) return "";
  if (typeof n === "string") return n;
  return [
    n.nazwiskoICzlon ?? n.nazwisko ?? n.pierwszyCzlonNazwiska ?? "",
    n.drugiCzlonNazwiska ?? "",
  ]
    .filter(Boolean)
    .join("-");
}

function readPersonFromNode(
  node: any,
): { firstName: string; lastName: string; pesel: string | null } | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const firstName =
    [node.imiona?.imie, node.imiona?.imieDrugie].filter(Boolean).join(" ").trim() ||
    node.imiePierwsze ||
    node.imie ||
    "";
  const lastName =
    readLastNameAny(node.nazwisko) || node.nazwiskoIPierwszyCzlonNazwiskaZlozonego || "";
  const peselRaw = node.pesel ?? node.identyfikator?.pesel ?? node.identyfikatory?.pesel ?? null;
  const pesel = typeof peselRaw === "string" && /^\d{11}$/.test(peselRaw) ? peselRaw : null;
  if (!pesel && !(firstName && lastName)) return null;
  return { firstName: String(firstName), lastName: String(lastName), pesel };
}

/**
 * Rekurencyjnie przeszukuje surowy JSON odpisu KRS (api-krs.ms.gov.pl) w
 * poszukiwaniu osoby. Dopasowanie po PESEL (pewne) lub po imieniu i nazwisku.
 * Funkcję osoby wyprowadza z pola `funkcjaWOrganie`/`funkcja` obiektu
 * opakowującego albo ze ścieżki w strukturze odpisu (zarząd/wspólnicy/prokura…).
 */
export function scanKrsOdpisForPerson(
  raw: any,
  target: { pesel: string | null; firstName: string | null; lastName: string | null },
): KrsOdpisPersonScan {
  const result: KrsOdpisPersonScan = { peselMatched: false, nameMatched: false, roles: [] };
  const targetFull = [target.firstName, target.lastName].filter(Boolean).join(" ");
  const roles = new Set<string>();

  const visit = (node: any, path: string[], inheritedRole: string | null) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, path, inheritedRole);
      return;
    }
    if (typeof node !== "object") return;

    const ownRole =
      (typeof node.funkcjaWOrganie === "string" && node.funkcjaWOrganie) ||
      (typeof node.funkcja === "string" && node.funkcja) ||
      (typeof node.rodzajProkury === "string" && node.rodzajProkury) ||
      null;
    const roleHere = ownRole ?? inheritedRole;

    const person = readPersonFromNode(node.daneOsoby ?? node);
    if (person) {
      let matched = false;
      if (target.pesel && person.pesel && person.pesel === target.pesel) {
        result.peselMatched = true;
        matched = true;
      }
      const personFull = `${person.firstName} ${person.lastName}`;
      if (targetFull && personNamesOverlap(targetFull, personFull)) {
        result.nameMatched = true;
        matched = true;
      }
      if (matched) {
        const label = roleHere ?? roleFromPath(path);
        if (label) roles.add(String(label).trim());
      }
    }

    for (const [k, v] of Object.entries(node)) {
      visit(v, [...path, k], roleHere);
    }
  };

  visit(raw, [], null);
  result.roles = [...roles].slice(0, 4);
  return result;
}
