// Analiza właściciela nieruchomości / kredytobiorcy.
// Łączy dane z tabeli clients (PESEL, imię, nazwisko) z aktuarialnym
// trwaniem życia oraz wpisem właściciela w dziale II KW.
// Gdy klient nie ma PESEL (lub jest błędny), sięgamy po PESEL właściciela
// wpisany w dziale II KW — i uzupełniamy nim pusty rekord klienta.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parsePesel, type PeselInfo } from "./pesel";
import { estimateLifeExpectancy } from "./life-expectancy";
import { extractKwOwnerPesels } from "./kw-parser.server";
import { emptyCeidg } from "./ceidg-lookup.server";
import type { OwnerProfile, KwLegalAnalysis } from "./types";

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

/**
 * PESEL właściciela z działu II KW — dla klienta bez PESEL w bazie.
 * Wybiera wpis dopasowany po imieniu i nazwisku; gdy w dziale II jest dokładnie
 * jeden PESEL, przyjmuje go jako PESEL jedynego właściciela.
 */
async function findPeselInKw(
  kwNumber: string,
  fullName: string | null,
): Promise<{ pesel: string; ownerName: string | null; nameMatched: boolean } | null> {
  const { data: row } = await supabaseAdmin
    .from("kw_documents")
    .select("status, dzial_2")
    .eq("kw_number", kwNumber)
    .maybeSingle();
  if (!row || row.status !== "ready") return null;
  const candidates = extractKwOwnerPesels(row.dzial_2);
  if (candidates.length === 0) return null;
  const matched = candidates.find((c) => namesOverlap(fullName, c.ownerName));
  if (matched) return { ...matched, nameMatched: true };
  if (candidates.length === 1) return { ...candidates[0], nameMatched: false };
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

  let pesel: PeselInfo = parsePesel(client.pesel);

  // Fallback: PESEL z działu II KW, gdy w rekordzie klienta brak/niepoprawny.
  if (!pesel.valid && args.kwNumber) {
    try {
      const kwPesel = await findPeselInKw(args.kwNumber, fullName);
      if (kwPesel) {
        const parsed = parsePesel(kwPesel.pesel);
        if (parsed.valid) {
          pesel = parsed;
          notes.push(
            kwPesel.nameMatched
              ? "PESEL właściciela odczytany z działu II KW (dopasowany po imieniu i nazwisku)."
              : "PESEL przyjęty z działu II KW — jedyny właściciel w księdze; zweryfikuj tożsamość klienta.",
          );
          // Uzupełnij pusty rekord klienta (tylko gdy dopasowanie po nazwisku jest pewne).
          if (!client.pesel && kwPesel.nameMatched) {
            const { error } = await supabaseAdmin
              .from("clients")
              .update({ pesel: kwPesel.pesel })
              .eq("id", args.clientId);
            if (!error) notes.push("Rekord klienta uzupełniono numerem PESEL z KW.");
          }
        }
      }
    } catch (e: any) {
      console.error("[owner-analysis] PESEL z KW nieodczytany:", e?.message ?? e);
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

  // CEIDG — sprawdzenie działalności przeniesione do osobnej zakładki wniosku
  // („Działalność gospodarcza", owner-business-check) — tu tylko pusty placeholder.
  const businessActivity = emptyCeidg(
    "Sprawdzenie działalności gospodarczej przeniesione do osobnej zakładki wniosku.",
  );

  return {
    fullName,
    birthDate: pesel.birthDate,
    sex: pesel.sex,
    age: pesel.age,
    peselValid: pesel.valid,
    peselError: pesel.valid ? undefined : pesel.error,
    lifeExpectancy,
    matchesKwOwner,
    businessActivity,
    notes,
  };
}
