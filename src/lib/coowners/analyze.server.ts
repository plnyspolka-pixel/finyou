// Analiza WSPÓŁWŁAŚCICIELI z działu II księgi wieczystej — silnik modułu
// (osobna karta wniosku, niezależna od oceny ryzyka).
// Dla każdej osoby fizycznej wpisanej w dziale II (identyfikowanej po PESEL
// z KW) sprawdzamy dwa rejestry:
//   1) CEIDG — czy osoba prowadzi działalność gospodarczą (JDG); gdy CEIDG
//      nie potwierdzi (także przy odmowie API) — wykaz podatników VAT MF,
//      po NIP klienta albo po NIP znalezionym w sieci i zweryfikowanym,
//   2) KRS — czy osobę da się znaleźć w KRS (zarząd/wspólnik/prokurent…),
//      z twardą weryfikacją odpisem po numerze PESEL.
// RODO: w zapisywanym wyniku PESEL występuje wyłącznie zamaskowany.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { compactKwNumber } from "@/lib/kw";
import { parsePesel } from "@/lib/risk-assessment/pesel";
import { parseOwners } from "@/lib/risk-assessment/kw-parse-core";
import { lookupCeidgActivity, emptyCeidg } from "@/lib/risk-assessment/ceidg-lookup.server";
import { findBusinessInVatWhiteList } from "@/lib/risk-assessment/vat-whitelist.server";
import type { CeidgActivity } from "@/lib/risk-assessment/types";
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

/**
 * Działalność gospodarcza osoby: CEIDG, a gdy nie potwierdzi (brak wpisu,
 * odmowa API) — wykaz podatników VAT MF. Notatka CEIDG zostaje w wyniku.
 */
async function lookupBusiness(args: {
  firstName: string | null;
  lastName: string | null;
  nip: string | null;
  city: string | null;
  voivodeship: string | null;
}): Promise<CeidgActivity> {
  const ceidg = await lookupCeidgActivity(args).catch((e: any) =>
    emptyCeidg(`Błąd sprawdzenia CEIDG: ${e?.message ?? "nieznany"}.`),
  );
  if (ceidg.isEntrepreneur) return ceidg;
  const vat = await findBusinessInVatWhiteList(args).catch(() => null);
  if (vat) {
    return ceidg.available ? vat : { ...vat, note: `${vat.note} (CEIDG niedostępne.)` };
  }
  if (!ceidg.available) {
    return {
      ...ceidg,
      note: `${ceidg.note} Wykaz podatników VAT: nie znaleziono działalności${args.nip ? ` dla NIP ${args.nip}` : " (brak NIP klienta)"}.`,
    };
  }
  return ceidg;
}

export async function analyzeCoOwners(args: {
  kwNumber: string | null;
  /** Imię i nazwisko klienta wniosku — do oznaczenia jego wiersza. */
  primaryClientName?: string | null;
  /** NIP klienta wniosku (kartoteka / wniosek) — sprawdzany przy jego wierszu. */
  primaryClientNip?: string | null;
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
  // Zapisany dział II analizujemy nawet przy statusie błędu odświeżenia —
  // raz pobrana treść pozostaje dostępna.
  if (!row || (row.status !== "ready" && !row.dzial_2)) {
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

      const isPrimary = personNamesOverlap(args.primaryClientName, o.fullName);
      const nip = isPrimary ? (args.primaryClientNip ?? null) : null;
      const [ceidg, krs] = await Promise.all([
        lookupBusiness({
          firstName: o.firstName,
          lastName: o.lastName,
          nip,
          city: args.city ?? null,
          voivodeship: args.voivodeship ?? null,
        }),
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
        isPrimaryClient: isPrimary,
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
  // Brak potwierdzonej działalności — pożyczka dla przedsiębiorcy wymaga
  // ustalenia NIP. Dotyczy klienta wniosku (albo wszystkich, gdy go nie
  // rozpoznano w dziale II).
  const anyPrimary = checked.some((c) => c.isPrimaryClient);
  for (const c of checked) {
    if (c.ceidg.isEntrepreneur || (anyPrimary && !c.isPrimaryClient)) continue;
    warnings.push(
      `${c.fullName ?? "Właściciel"}: nie potwierdzono działalności gospodarczej (CEIDG, wykaz podatników VAT). ` +
        "Inwestor musi zażądać NIP i sprawdzić go w CEIDG — bez potwierdzonego NIP nie zawierać umowy.",
    );
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
