// Raport analityczny Projektu w „Moich zleceniach" PRZED Ujawnieniem (rezerwacją).
//
// Inwestor dostaje ten sam pakiet, co w module „Analityka" (treść kroków
// pipeline'u: właściciele, analiza KW, ryzyko i wartość, analiza zabezpieczenia),
// ale bez niczego, co pozwala zidentyfikować klienta albo nieruchomość z pominięciem
// platformy: numer KW zostaje zamaskowany, cytaty z treści księgi znikają,
// imiona i nazwiska zastępuje rola, adres — miejscowość z karty Projektu.
// Po rezerwacji (status rezerwacja / transakcja) serwer wysyła komplet.
// Funkcje są czyste i bezpieczne do importu po obu stronach.
import type { KwAnalysisResult, KwFinding, SourceEvidence } from "@/lib/kw-analysis/types";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import type { AnalyticsCoOwners } from "@/lib/investor-analytics/types";

export const TEASER_NAME_PLACEHOLDER = "[właściciel — dane po rezerwacji]";
export const TEASER_ADDRESS_PLACEHOLDER = "[adres po rezerwacji]";
export const TEASER_KRS_PLACEHOLDER = "podmiot w KRS (nazwa po rezerwacji)";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Warianty do zamaskowania: pełne imię i nazwisko (oba szyki) oraz samo nazwisko. */
function nameVariants(name: string): string[] {
  const tokens = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  const out = new Set<string>([tokens.join(" ")]);
  if (tokens.length > 1) {
    out.add([...tokens].reverse().join(" "));
    const last = tokens[tokens.length - 1];
    if (last.length >= 3) out.add(last);
  }
  return [...out];
}

/** Zastępuje w tekście podane imiona i nazwiska (bez względu na wielkość liter). */
export function maskNames(text: string, names: string[]): string {
  if (!text) return text;
  const variants = [...new Set(names.flatMap(nameVariants))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const v of variants) {
    const re = new RegExp(`(?<!\\p{L})${escapeRe(v).replace(/\s+/g, "\\s+")}(?!\\p{L})`, "giu");
    out = out.replace(re, TEASER_NAME_PLACEHOLDER);
  }
  return out;
}

/** Zastępuje adres (pełny oraz sam fragment ulicy z numerem) w tekście. */
export function maskAddress(text: string, address: string | null | undefined): string {
  if (!text) return text;
  const full = String(address ?? "").trim();
  if (full.length < 6) return text;
  const street = full.split(",")[0]?.trim() ?? "";
  const bare = street.replace(/^(ul\.|al\.|pl\.|os\.|ulica|aleja|plac|osiedle)\s+/i, "").trim();
  const needles = [full, street, bare]
    .filter((n) => n.length >= 6 && /\d/.test(n))
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const n of needles) {
    out = out.replace(
      new RegExp(escapeRe(n).replace(/\s+/g, "\\s+"), "giu"),
      TEASER_ADDRESS_PLACEHOLDER,
    );
  }
  return out;
}

const blankEvidence = (e: SourceEvidence): SourceEvidence => ({ ...e, rawValue: "" });

/**
 * Analiza KW bez danych identyfikujących: zamaskowany numer KW, bez cytatów
 * z treści księgi, bez komunikatów operacyjnych (pośrednik / klient), nazwiska
 * zastąpione rolą. Statusy, kategorie, miejsce hipoteki, CLTV i treść
 * merytoryczna znalezisk zostają.
 */
export function sanitizeKwAnalysisForTeaser(
  result: KwAnalysisResult,
  maskedKwNumber: string,
  names: string[],
): KwAnalysisResult {
  const m = (s: string) => maskNames(s, names);
  const findings: KwFinding[] = result.findings.map((f) => ({
    ...f,
    title: m(f.title),
    plainLanguageSummary: m(f.plainLanguageSummary),
    source: [],
    detectedValue: null,
    whyItMatters: m(f.whyItMatters),
    expectedFromClient: m(f.expectedFromClient),
    proposedResolution: m(f.proposedResolution),
    agreementCondition: f.agreementCondition ? m(f.agreementCondition) : f.agreementCondition,
    payoutCondition: f.payoutCondition ? m(f.payoutCondition) : f.payoutCondition,
    intermediaryMessage: "",
    clientMessage: "",
    investorMessage: m(f.investorMessage),
  }));
  return {
    ...result,
    kwNumber: maskedKwNumber,
    findings,
    priority: {
      ...result.priority,
      explanation: m(result.priority.explanation),
      evidence: [],
      requiredConditions: (result.priority.requiredConditions ?? []).map(m),
      effectivePriorEncumbrances: (result.priority.effectivePriorEncumbrances ?? []).map((e) => ({
        ...e,
        label: m(e.label),
        creditor: e.creditor ? m(e.creditor) : e.creditor,
        evidence: blankEvidence(e.evidence),
      })),
      activeCompetingMentions: (result.priority.activeCompetingMentions ?? []).map((x) => ({
        ...x,
        rawText: m(x.rawText),
        evidence: blankEvidence(x.evidence),
      })),
    },
    ltv: { ...result.ltv, note: m(result.ltv.note) },
  };
}

/** Właściciele z działu II bez nazwisk, nazw spółek z KRS i notatek. */
export function sanitizeCoOwnersForTeaser(
  co: AnalyticsCoOwners,
  names: string[],
): AnalyticsCoOwners {
  const m = (s: string) => maskNames(s, names);
  const many = co.owners.length > 1;
  return {
    ...co,
    summary: m(co.summary),
    warnings: co.warnings.map(m),
    owners: co.owners.map((o, i) => ({
      ...o,
      // Etykieta zamiast nazwiska — karta właściciela pokazuje udział, CEIDG i KRS.
      fullName: many ? `Właściciel ${i + 1}` : "Właściciel",
      krs: o.krs.map((k) => ({ ...k, companyName: TEASER_KRS_PLACEHOLDER })),
      notes: [],
    })),
  };
}

/** Analiza zabezpieczenia bez adresu, numeru KW, działki, współrzędnych i surowych danych. */
export function sanitizeCollateralForTeaser(
  result: PropertyAnalysisResult,
  names: string[],
): PropertyAnalysisResult {
  const address = result.property?.address ?? null;
  const scrub = (s: string) => maskNames(maskAddress(s, address), names);
  const scrubAll = (list: string[] | undefined) => (list ?? []).map(scrub);
  const offerText = Object.fromEntries(
    Object.entries(result.investmentOfferText ?? {}).map(([k, v]) => [
      k,
      typeof v === "string" ? scrub(v) : v,
    ]),
  ) as PropertyAnalysisResult["investmentOfferText"];
  return {
    ...result,
    property: {
      ...result.property,
      address: TEASER_ADDRESS_PLACEHOLDER,
      kwNumber: null,
      parcelNumber: null,
      latitude: null,
      longitude: null,
    },
    locationScore: {
      ...result.locationScore,
      summary: scrub(result.locationScore.summary),
      liquidityComment: scrub(result.locationScore.liquidityComment),
    },
    legalRisk: { ...result.legalRisk, warnings: scrubAll(result.legalRisk.warnings) },
    marketLiquidity: { ...result.marketLiquidity, summary: scrub(result.marketLiquidity.summary) },
    collateralScore: {
      ...result.collateralScore,
      summary: scrub(result.collateralScore.summary),
      mainRisks: scrubAll(result.collateralScore.mainRisks),
      mainStrengths: scrubAll(result.collateralScore.mainStrengths),
    },
    investmentOfferText: offerText,
    floodAlerts: result.floodAlerts ? scrubAll(result.floodAlerts) : result.floodAlerts,
    gusDiagnostics: null,
    rcnDiagnostics: null,
    warnings: scrubAll(result.warnings),
    raw: {},
  };
}
