// Parser prawny księgi wieczystej — orkiestracja oceny stanu prawnego.
// Czyste funkcje parsujące działy zostały wydzielone do kw-parse-core.ts
// (współdzielone z mostkiem KwExtraction i testowalne bez Supabase).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseKwAddress } from "@/lib/kw-address-core";
import type { KwLegalAnalysis, KwPropertyParams } from "./types";
import {
  stripHtml,
  parseOwners,
  parseEncumbrances,
  parseFloorInfo,
  parseSoilClass,
  parseKwPropertyParams,
  parseMortgages,
} from "./kw-parse-core";

// Re-eksport publicznego API parsera (kompatybilność z dotychczasowymi importami).
export {
  extractKwOwnerPersons,
  extractKwOwnerPesels,
  parseKwPropertyParams,
  parseMortgages,
} from "./kw-parse-core";
export type { KwOwnerPerson, KwOwnerPesel } from "./kw-parse-core";

function computeLegalRiskScore(a: {
  hasMortgages: boolean;
  totalMortgage: number | null;
  hasEnforcement: boolean;
  hasUsufruct: boolean;
  encumbranceCount: number;
  hasCoOwners: boolean;
}): number {
  let score = 100;
  if (a.hasMortgages) score -= 25;
  if (a.hasEnforcement) score -= 35;
  if (a.hasUsufruct) score -= 20;
  if (a.hasCoOwners) score -= 10;
  score -= Math.min(15, a.encumbranceCount * 3);
  return Math.max(0, Math.min(100, score));
}

export async function analyzeKwLegal(args: {
  kwNumber: string | null;
  hasCoOwners?: boolean | null;
  hasMortgageFlag?: boolean | null;
}): Promise<KwLegalAnalysis> {
  const emptyParams: KwPropertyParams = {
    kind: null,
    usableAreaM2: null,
    landAreaM2: null,
    landAreaHa: null,
    roomCount: null,
    landUse: null,
  };
  const empty: KwLegalAnalysis = {
    available: false,
    kwNumber: args.kwNumber ?? null,
    address: null,
    propertyParams: emptyParams,
    owners: [],
    encumbrances: [],
    mortgages: [],
    totalMortgageAmountPln: null,
    hasEnforcement: false,
    hasUsufruct: false,
    kondygnacja: null,
    floorsInBuilding: null,
    soilClass: null,
    legalRiskScore: 60,
    warnings: [],
    summary: "Brak pobranej treści KW — stan prawny wymaga weryfikacji.",
  };
  if (args.hasMortgageFlag) {
    // Deklaracja z wniosku musi być widoczna nawet bez treści KW.
    empty.warnings.push(
      "We wniosku zadeklarowano hipotekę — treść działu IV KW niedostępna, obciążenie wymaga weryfikacji.",
    );
    empty.legalRiskScore = 45;
  }

  const kw = (args.kwNumber ?? "").replace(/\s|\//g, "").toUpperCase();
  if (!kw) return empty;

  const { data: row } = await supabaseAdmin
    .from("kw_documents")
    .select("kw_number, status, dzial_1o, dzial_2, dzial_3, dzial_4")
    .eq("kw_number", kw)
    .maybeSingle();

  if (!row || row.status !== "ready") return empty;

  const owners = parseOwners(row.dzial_2);
  const address = parseKwAddress(row.dzial_1o);
  const propertyParams = parseKwPropertyParams(row.dzial_1o);
  const { encumbrances, hasEnforcement, hasUsufruct } = parseEncumbrances(row.dzial_3);
  const mortgages = parseMortgages(row.dzial_4);
  const { kondygnacja, floorsInBuilding } = parseFloorInfo(row.dzial_1o);
  const soilClass = parseSoilClass(row.dzial_1o);
  const totalMortgage = mortgages.reduce<number | null>((acc, m) => {
    if (m.amount == null) return acc;
    return (acc ?? 0) + m.amount;
  }, null);

  // Zadeklarowano hipotekę, a dział IV pusty/nieodczytany → ostrożnościowo
  // traktujemy nieruchomość jako obciążoną (dane wniosku vs. parser).
  const dzial4Text = stripHtml(row.dzial_4);
  const declaredMortgageUnconfirmed = !!args.hasMortgageFlag && mortgages.length === 0;

  const hasCoOwners = args.hasCoOwners ?? owners.length > 1;
  const legalRiskScore = computeLegalRiskScore({
    hasMortgages: mortgages.length > 0 || declaredMortgageUnconfirmed,
    totalMortgage,
    hasEnforcement,
    hasUsufruct,
    encumbranceCount: encumbrances.length,
    hasCoOwners: !!hasCoOwners,
  });

  const warnings: string[] = [];
  if (mortgages.length > 0)
    warnings.push(
      `Nieruchomość obciążona hipoteką${totalMortgage ? ` na ok. ${totalMortgage.toLocaleString("pl-PL")} PLN` : ""} (dział IV KW).`,
    );
  if (declaredMortgageUnconfirmed)
    warnings.push(
      dzial4Text
        ? "We wniosku zadeklarowano hipotekę, ale nie rozpoznano wpisów w dziale IV KW — zweryfikuj treść działu IV ręcznie."
        : "We wniosku zadeklarowano hipotekę, a dział IV KW jest pusty/nieodczytany — obciążenie przyjęto ostrożnościowo.",
    );
  if (hasEnforcement)
    warnings.push(
      "W dziale III KW występują wpisy o egzekucji/zajęciu — bardzo wysokie ryzyko prawne.",
    );
  if (hasUsufruct)
    warnings.push(
      "W dziale III KW występuje służebność/dożywocie — ograniczenie zbywalności/wartości.",
    );
  if (owners.length > 1)
    warnings.push(
      `Wielu właścicieli w dziale II KW (${owners.length}) — wymagana zgoda współwłaścicieli.`,
    );

  const summary =
    `Dział II: ${owners.length ? owners.length + " podmiotów (" + owners.slice(0, 3).join(", ") + (owners.length > 3 ? "…" : "") + ")" : "brak rozpoznanych właścicieli"}. ` +
    `Dział III: ${encumbrances.length ? encumbrances.length + " wpisów" : "brak istotnych wpisów"}${hasEnforcement ? " (w tym egzekucja)" : ""}. ` +
    `Dział IV: ${mortgages.length ? mortgages.length + " hipotek" + (totalMortgage ? ", łącznie ~" + totalMortgage.toLocaleString("pl-PL") + " PLN" : "") : "brak hipotek"}.` +
    (address.fullAddress ? ` Adres (dz. I-O): ${address.fullAddress}.` : "");

  return {
    available: true,
    kwNumber: kw,
    address,
    propertyParams,
    owners,
    encumbrances,
    mortgages,
    totalMortgageAmountPln: totalMortgage,
    hasEnforcement,
    hasUsufruct,
    kondygnacja,
    floorsInBuilding,
    soilClass,
    legalRiskScore,
    warnings,
    summary:
      kondygnacja != null
        ? `${summary} Kondygnacja lokalu: ${kondygnacja} (${kondygnacja <= 1 ? "parter" : kondygnacja - 1 + ". piętro"}).`
        : summary,
  };
}
