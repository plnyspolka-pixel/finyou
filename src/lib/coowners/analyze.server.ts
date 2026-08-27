// Analiza WSPÓŁWŁAŚCICIELI z działu II księgi wieczystej — silnik modułu
// (osobna karta wniosku, niezależna od oceny ryzyka).
// Dla każdej osoby fizycznej wpisanej w dziale II (identyfikowanej po PESEL
// z KW) sprawdzamy dwa rejestry:
//   1) CEIDG — czy osoba prowadzi działalność gospodarczą (JDG),
//   2) KRS — czy osobę da się znaleźć w KRS (zarząd/wspólnik/prokurent…),
//      z twardą weryfikacją odpisem po numerze PESEL.
// RODO: w zapisywanym wyniku PESEL występuje wyłącznie zamaskowany.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { compactKwNumber } from "@/lib/kw";
import { parsePesel } from "@/lib/risk-assessment/pesel";
import { parseOwners } from "@/lib/risk-assessment/kw-parse-core";
import { lookupCeidgActivity, emptyCeidg } from "@/lib/risk-assessment/ceidg-lookup.server";
import { mergeKwOwners, maskPesel, personNamesOverlap } from "./core";
import { searchKrsForPerson, emptyKrsCheck } from "./krs-person-search.server";
import type { CoOwnersAnalysis, CoOwnerRegistryCheck } from "./types";

function emptyAnalysis(kwNumber: string | null, summary: string): CoOwnersAnalysis {
  return {
    available: false,
    kwNumber,
    generatedAt: new Date().toISOString(),
    totalOwnersInKw: 0,
    checked: [],
    warnings: [],
    summary,
  };
}

export async function analyzeCoOwners(args: {
  kwNumber: string | null;
  /** Imię i nazwisko klienta wniosku — do oznaczenia jego wiersza. */
  primaryClientName?: string | null;
  city?: string | null;
  voivodeship?: string | null;
}): Promise<CoOwnersAnalysis> {
  // kw_documents.kw_number przechowuje formę kompaktową (13 znaków).
  const kw =
    compactKwNumber(args.kwNumber) ?? (args.kwNumber ?? "").replace(/\s|\//g, "").toUpperCase();
  if (!kw) return emptyAnalysis(null, "Brak numeru KW — nie przeanalizowano współwłaścicieli.");

  const { data: row } = await supabaseAdmin
    .from("kw_documents")
    .select("status, dzial_2")
    .eq("kw_number", kw)
    .maybeSingle();
  if (!row || row.status !== "ready") {
    return emptyAnalysis(
      kw,
      "Treść działu II KW niedostępna — pobierz księgę wieczystą i uruchom sprawdzenie ponownie.",
    );
  }

  const totalOwnersInKw = parseOwners(row.dzial_2).length;
  const owners = mergeKwOwners(row.dzial_2);
  if (owners.length === 0) {
    return {
      available: true,
      kwNumber: kw,
      generatedAt: new Date().toISOString(),
      totalOwnersInKw,
      checked: [],
      warnings: [],
      summary: "W dziale II KW nie rozpoznano osób fizycznych do sprawdzenia w CEIDG/KRS.",
    };
  }

  const checked: CoOwnerRegistryCheck[] = await Promise.all(
    owners.map(async (o): Promise<CoOwnerRegistryCheck> => {
      const pesel = parsePesel(o.pesel);
      const notes: string[] = [];
      if (o.pesel && !pesel.valid) {
        notes.push(`PESEL z działu II KW nie przechodzi walidacji (${pesel.error ?? "błąd"}).`);
      }
      if (!o.pesel) {
        notes.push(
          "Brak numeru PESEL przy tej osobie w dziale II KW — sprawdzenie wyłącznie po imieniu i nazwisku.",
        );
      }

      const [ceidg, krs] = await Promise.all([
        lookupCeidgActivity({
          firstName: o.firstName,
          lastName: o.lastName,
          city: args.city ?? null,
          voivodeship: args.voivodeship ?? null,
        }).catch((e: any) => emptyCeidg(`Błąd sprawdzenia CEIDG: ${e?.message ?? "nieznany"}.`)),
        searchKrsForPerson({
          firstName: o.firstName,
          lastName: o.lastName,
          pesel: pesel.valid ? o.pesel : null,
          birthYear: pesel.birthDate ? Number(pesel.birthDate.slice(0, 4)) : null,
          city: args.city ?? null,
          voivodeship: args.voivodeship ?? null,
        }).catch((e: any) => emptyKrsCheck(`Błąd sprawdzenia KRS: ${e?.message ?? "nieznany"}.`)),
      ]);

      return {
        fullName: o.fullName,
        share: o.share,
        coOwnershipType: o.coOwnershipType,
        peselMasked: maskPesel(o.pesel),
        peselValid: pesel.valid,
        birthDate: pesel.birthDate,
        age: pesel.age,
        sex: pesel.sex,
        isPrimaryClient: personNamesOverlap(args.primaryClientName, o.fullName),
        ceidg,
        krs,
        notes,
      };
    }),
  );

  // Ostrzeżenia zbiorcze — twarde sygnały dla operatora.
  const warnings: string[] = [];
  for (const c of checked) {
    const who = c.fullName ?? "współwłaściciel";
    for (const h of c.krs.hits) {
      if (h.flags.bankruptcy)
        warnings.push(
          `Współwłaściciel ${who}: podmiot ${h.companyName} (KRS ${h.krs}) w upadłości.`,
        );
      else if (h.flags.liquidation)
        warnings.push(
          `Współwłaściciel ${who}: podmiot ${h.companyName} (KRS ${h.krs}) w likwidacji.`,
        );
      else if (h.flags.restructuring)
        warnings.push(
          `Współwłaściciel ${who}: podmiot ${h.companyName} (KRS ${h.krs}) w restrukturyzacji.`,
        );
    }
    if (c.ceidg.status === "zawieszony")
      warnings.push(`Współwłaściciel ${who}: działalność w CEIDG zawieszona.`);
  }

  const withDg = checked.filter((c) => c.ceidg.isEntrepreneur).length;
  const inKrs = checked.filter((c) => c.krs.found).length;
  const summary =
    `Dział II KW: ${totalOwnersInKw} podmiotów, sprawdzono ${checked.length} osób fizycznych. ` +
    `Działalność gospodarcza (CEIDG): ${withDg ? `${withDg} os.` : "nie stwierdzono"}. ` +
    `Obecność w KRS: ${inKrs ? `${inKrs} os.` : "nie stwierdzono"}.`;

  return {
    available: true,
    kwNumber: kw,
    generatedAt: new Date().toISOString(),
    totalOwnersInKw,
    checked,
    warnings,
    summary,
  };
}
