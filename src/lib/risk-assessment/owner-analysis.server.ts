// Analiza właściciela nieruchomości / kredytobiorcy.
// Łączy dane z tabeli clients (PESEL, imię, nazwisko) z aktuarialnym
// trwaniem życia oraz wpisem właściciela w dziale II KW.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parsePesel } from "./pesel";
import { estimateLifeExpectancy } from "./life-expectancy";
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

function nameMatchesKwOwners(fullName: string | null, kwOwners: string[]): boolean | null {
  if (!fullName || kwOwners.length === 0) return null;
  const target = normalizeName(fullName);
  const targetTokens = new Set(target.split(" ").filter((t) => t.length > 1));
  if (targetTokens.size === 0) return null;
  for (const owner of kwOwners) {
    const ownerNorm = normalizeName(owner);
    const ownerTokens = ownerNorm.split(" ").filter((t) => t.length > 1);
    const overlap = ownerTokens.filter((t) => targetTokens.has(t)).length;
    // Zgodność, gdy pokrywają się co najmniej dwa człony (imię+nazwisko).
    if (overlap >= 2) return true;
  }
  return false;
}

export async function analyzeOwner(args: {
  clientId: string | null;
  loanTermYears?: number | null;
  kwLegal?: KwLegalAnalysis | null;
}): Promise<OwnerProfile> {
  const emptyLE = estimateLifeExpectancy({ age: null, sex: null, loanTermYears: args.loanTermYears ?? null });
  const base: OwnerProfile = {
    fullName: null,
    birthDate: null,
    sex: null,
    age: null,
    peselValid: false,
    lifeExpectancy: emptyLE,
    matchesKwOwner: null,
    notes: [],
  };

  if (!args.clientId) {
    base.notes.push("Brak powiązanego klienta — nie można przeanalizować właściciela.");
    return base;
  }

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("first_name, last_name, pesel")
    .eq("id", args.clientId)
    .maybeSingle();

  if (!client) {
    base.notes.push("Nie znaleziono rekordu klienta.");
    return base;
  }

  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ").trim() || null;
  const pesel = parsePesel(client.pesel);
  const lifeExpectancy = estimateLifeExpectancy({
    age: pesel.age,
    sex: pesel.sex,
    loanTermYears: args.loanTermYears ?? null,
  });

  const notes: string[] = [];
  if (!client.pesel) notes.push("Brak PESEL właściciela — nie wyznaczono wieku ani trwania życia.");
  else if (!pesel.valid) notes.push(`PESEL nieprawidłowy: ${pesel.error ?? "błąd walidacji"}.`);

  const matchesKwOwner = nameMatchesKwOwners(fullName, args.kwLegal?.owners ?? []);
  if (matchesKwOwner === false) {
    notes.push("Wnioskodawca nie został dopasowany do właściciela w dziale II KW — wymagana weryfikacja tytułu prawnego.");
  }
  if (pesel.valid && pesel.age != null && pesel.age >= 75) {
    notes.push("Zaawansowany wiek właściciela — istotne ryzyko sukcesji/spadkobrania na zabezpieczeniu.");
  }

  return {
    fullName,
    birthDate: pesel.birthDate,
    sex: pesel.sex,
    age: pesel.age,
    peselValid: pesel.valid,
    peselError: pesel.valid ? undefined : pesel.error,
    lifeExpectancy,
    matchesKwOwner,
    notes,
  };
}
