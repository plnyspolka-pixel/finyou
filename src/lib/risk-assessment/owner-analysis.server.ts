// Analiza właścicieli nieruchomości / kredytobiorcy.
// Łączy dane z tabeli clients (imię, nazwisko) z aktuarialnym trwaniem życia
// oraz wpisami właścicieli w dziale II KW.
// PESEL zaciągamy ZAWSZE bezpośrednio z treści księgi wieczystej (dział II —
// dane urzędowe) — dla KAŻDEGO właściciela, także współwłaścicieli; rekord
// klienta jest tylko źródłem zapasowym. Dwoje właścicieli z PESEL = dwa majątki
// osobiste, z których można się zaspokoić (czynnik obniżający ryzyko).
// Odczytanym z KW numerem uzupełniamy pusty rekord klienta.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parsePesel, type PeselInfo } from "./pesel";
import { estimateLifeExpectancy } from "./life-expectancy";
import { extractKwOwnerPesels, type KwOwnerPesel } from "./kw-parser.server";
import { lookupCeidgActivity, emptyCeidg } from "./ceidg-lookup.server";
import type { OwnerProfile, KwOwnerProfile, KwLegalAnalysis } from "./types";

function normalizeName(s: string): string {
  const COMBINING = new RegExp("[\\u0300-\\u036f]", "g");
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesOverlap(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const ta = new Set(
    normalizeName(a)
      .split(" ")
      .filter((t) => t.length > 1),
  );
  const tb = normalizeName(b)
    .split(" ")
    .filter((t) => t.length > 1);
  return tb.filter((t) => ta.has(t)).length >= 2;
}

function nameMatchesKwOwners(fullName: string | null, kwOwners: string[]): boolean | null {
  if (!fullName || kwOwners.length === 0) return null;
  for (const owner of kwOwners) {
    // Zgodność, gdy pokrywają się co najmniej dwa człony (imię+nazwisko).
    if (namesOverlap(fullName, owner)) return true;
  }
  return false;
}

// Dopasowanie po samym nazwisku — słabsze niż namesOverlap (imię+nazwisko),
// ale wystarczające do wyboru wpisu klienta spośród współwłaścicieli.
function surnameMatches(fullName: string | null, ownerName: string | null): boolean {
  if (!fullName || !ownerName) return false;
  const ta = new Set(
    normalizeName(fullName)
      .split(" ")
      .filter((t) => t.length > 2),
  );
  return normalizeName(ownerName)
    .split(" ")
    .some((t) => t.length > 2 && ta.has(t));
}

/**
 * WSZYSTKIE numery PESEL właścicieli z działu II KW (wnioskodawca i każdy
 * współwłaściciel) — walidowane sumą kontrolną, z przypisanym imieniem
 * i nazwiskiem wpisu, jeśli udało się je rozpoznać.
 */
async function findAllPeselsInKw(kwNumber: string): Promise<KwOwnerPesel[]> {
  const { data: row } = await supabaseAdmin
    .from("kw_documents")
    .select("status, dzial_2")
    .eq("kw_number", kwNumber)
    .maybeSingle();
  // Zapisany dział II czytamy nawet przy statusie błędu odświeżenia.
  if (!row || (row.status !== "ready" && !row.dzial_2)) return [];
  return extractKwOwnerPesels(row.dzial_2);
}

/**
 * Wybiera z listy wpis wnioskodawcy: najpierw pełne dopasowanie (imię+nazwisko),
 * potem samo nazwisko, na końcu — gdy w księdze jest dokładnie jeden PESEL —
 * przyjmuje go jako wpis jedynego właściciela (z notą o weryfikacji).
 */
function pickApplicantPesel(
  candidates: KwOwnerPesel[],
  fullName: string | null,
): { candidate: KwOwnerPesel; nameMatched: boolean } | null {
  if (candidates.length === 0) return null;
  const full = candidates.find((c) => namesOverlap(fullName, c.ownerName));
  if (full) return { candidate: full, nameMatched: true };
  const bySurname = candidates.find((c) => surnameMatches(fullName, c.ownerName));
  if (bySurname) return { candidate: bySurname, nameMatched: true };
  if (candidates.length === 1) return { candidate: candidates[0], nameMatched: false };
  return null;
}

export async function analyzeOwner(args: {
  clientId: string | null;
  loanTermYears?: number | null;
  kwLegal?: KwLegalAnalysis | null;
  /** Znormalizowany numer KW — źródło zapasowe PESEL (dział II). */
  kwNumber?: string | null;
  /** Lokalizacja nieruchomości/klienta — pomaga dopasować wpis w CEIDG. */
  city?: string | null;
  voivodeship?: string | null;
}): Promise<OwnerProfile> {
  const emptyLE = estimateLifeExpectancy({
    age: null,
    sex: null,
    loanTermYears: args.loanTermYears ?? null,
  });
  const base: OwnerProfile = {
    fullName: null,
    birthDate: null,
    sex: null,
    age: null,
    peselValid: false,
    lifeExpectancy: emptyLE,
    kwOwnerProfiles: [],
    multipleEstates: false,
    matchesKwOwner: null,
    businessActivity: emptyCeidg("Nie sprawdzono działalności w CEIDG (brak danych właściciela)."),
    notes: [],
  };

  if (!args.clientId) {
    base.notes.push("Brak powiązanego klienta — nie można przeanalizować właściciela.");
    return base;
  }

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("first_name, last_name, pesel, nip, city")
    .eq("id", args.clientId)
    .maybeSingle();

  if (!client) {
    base.notes.push("Nie znaleziono rekordu klienta.");
    return base;
  }

  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ").trim() || null;
  const notes: string[] = [];

  // ŹRÓDŁO PODSTAWOWE: PESEL-e WSZYSTKICH właścicieli bezpośrednio z treści
  // księgi wieczystej (dział II) — wnioskodawcy i każdego współwłaściciela.
  let kwCandidates: KwOwnerPesel[] = [];
  if (args.kwNumber) {
    try {
      kwCandidates = await findAllPeselsInKw(args.kwNumber);
    } catch (e: any) {
      console.error("[owner-analysis] PESEL z KW nieodczytany:", e?.message ?? e);
    }
  }

  const applicantPick = pickApplicantPesel(kwCandidates, fullName);

  let pesel: PeselInfo = parsePesel(null);
  if (applicantPick) {
    const parsed = parsePesel(applicantPick.candidate.pesel);
    if (parsed.valid) {
      pesel = parsed;
      notes.push(
        applicantPick.nameMatched
          ? "PESEL właściciela odczytany bezpośrednio z działu II KW (dopasowany po nazwisku)."
          : "PESEL przyjęty z działu II KW — jedyny właściciel w księdze; zweryfikuj tożsamość klienta.",
      );
      if (client.pesel && client.pesel !== applicantPick.candidate.pesel) {
        notes.push(
          "PESEL w rekordzie klienta różni się od PESEL właściciela w dziale II KW — do analizy przyjęto numer z KW; zweryfikuj dane klienta.",
        );
      }
      // Uzupełnij pusty rekord klienta (tylko gdy dopasowanie po nazwisku jest pewne).
      if (!client.pesel && applicantPick.nameMatched) {
        const { error } = await supabaseAdmin
          .from("clients")
          .update({ pesel: applicantPick.candidate.pesel })
          .eq("id", args.clientId);
        if (!error) notes.push("Rekord klienta uzupełniono numerem PESEL z KW.");
      }
    }
  } else if (kwCandidates.length > 1) {
    notes.push(
      `W dziale II KW odczytano ${kwCandidates.length} numery PESEL, ale żadnego nie dopasowano do klienta po nazwisku — zweryfikuj tożsamość wnioskodawcy.`,
    );
  }

  // Profile WSZYSTKICH właścicieli z KW (wiek/płeć/dożycie każdego) — RODO:
  // do JSON-a oceny trafiają wyłącznie cechy wyprowadzone, nie same numery.
  const kwOwnerProfiles: KwOwnerProfile[] = kwCandidates.flatMap((c) => {
    const p = parsePesel(c.pesel);
    if (!p.valid) return [];
    return [
      {
        name: c.ownerName,
        birthDate: p.birthDate,
        sex: p.sex,
        age: p.age,
        lifeExpectancy: estimateLifeExpectancy({
          age: p.age,
          sex: p.sex,
          loanTermYears: args.loanTermYears ?? null,
        }),
        isApplicant: applicantPick?.candidate.pesel === c.pesel,
      },
    ];
  });
  const multipleEstates = kwOwnerProfiles.length >= 2;
  if (multipleEstates) {
    notes.push(
      `Odczytano PESEL ${kwOwnerProfiles.length === 2 ? "obojga współwłaścicieli" : `${kwOwnerProfiles.length} współwłaścicieli`} z działu II KW — odpowiedzialność rozłożona na ${kwOwnerProfiles.length} majątki osobiste, z których można się zaspokoić (czynnik obniżający ryzyko).`,
    );
  }

  // Źródło zapasowe: PESEL z rekordu klienta (gdy KW nie dała poprawnego numeru).
  if (!pesel.valid && client.pesel) {
    const fromClient = parsePesel(client.pesel);
    if (fromClient.valid) {
      pesel = fromClient;
      notes.push(
        "PESEL przyjęty z rekordu klienta — w dziale II KW nie odczytano poprawnego numeru.",
      );
    } else {
      pesel = fromClient; // zachowaj błąd walidacji do raportu
    }
  }

  const lifeExpectancy = estimateLifeExpectancy({
    age: pesel.age,
    sex: pesel.sex,
    loanTermYears: args.loanTermYears ?? null,
  });

  if (!pesel.valid) {
    if (!client.pesel)
      notes.push(
        "Brak PESEL właściciela (również w dziale II KW) — nie wyznaczono wieku ani trwania życia.",
      );
    else notes.push(`PESEL nieprawidłowy: ${pesel.error ?? "błąd walidacji"}.`);
  }

  const matchesKwOwner = nameMatchesKwOwners(fullName, args.kwLegal?.owners ?? []);
  if (matchesKwOwner === false) {
    notes.push(
      "Wnioskodawca nie został dopasowany do właściciela w dziale II KW — wymagana weryfikacja tytułu prawnego.",
    );
  }
  if (pesel.valid && pesel.age != null && pesel.age >= 75) {
    notes.push(
      "Zaawansowany wiek właściciela — istotne ryzyko sukcesji/spadkobrania na zabezpieczeniu.",
    );
  }

  // CEIDG — czy właściciel jest już przedsiębiorcą (JDG). Aktywna działalność obniża ryzyko.
  const businessActivity = await lookupCeidgActivity({
    firstName: client.first_name ?? null,
    lastName: client.last_name ?? null,
    nip: (client as any).nip ?? null,
    city: args.city ?? (client as any).city ?? null,
    voivodeship: args.voivodeship ?? null,
  }).catch((e: any) => emptyCeidg(`Błąd sprawdzenia CEIDG: ${e?.message ?? "nieznany"}.`));
  if (businessActivity.isEntrepreneur) {
    notes.push(
      `Właściciel jest przedsiębiorcą (aktywny wpis w CEIDG${businessActivity.company?.startDate ? `, od ${businessActivity.company.startDate}` : ""}) — czynnik obniżający ryzyko.`,
    );
  }

  return {
    fullName,
    birthDate: pesel.birthDate,
    sex: pesel.sex,
    age: pesel.age,
    peselValid: pesel.valid,
    peselError: pesel.valid ? undefined : pesel.error,
    lifeExpectancy,
    kwOwnerProfiles,
    multipleEstates,
    matchesKwOwner,
    businessActivity,
    notes,
  };
}
