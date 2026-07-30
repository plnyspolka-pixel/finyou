// Wycena wymuszonej sprzedaży w trybie egzekucji komorniczej (licytacja
// nieruchomości wg Kodeksu postępowania cywilnego). Czysta, testowalna logika.
//
// Podstawy prawne (ceny wywołania liczone od sumy oszacowania):
//   • I licytacja  — 3/4 sumy oszacowania (art. 965 KPC),
//   • II licytacja — 2/3 sumy oszacowania (art. 983 KPC); poniżej nie można nabyć,
//     a po bezskutecznej II licytacji wierzyciel może przejąć za 2/3 (art. 984 KPC).

import type { ForcedSaleEstimate, AuctionOutcome, ResidentialAuctionBlock } from "./types";

const FIRST_AUCTION_FRACTION = 0.75; // 3/4
const SECOND_AUCTION_FRACTION = 2 / 3; // ~0.6667
// Art. 952¹ § 2 KPC — próg 1/20 sumy oszacowania.
const RESIDENTIAL_MIN_CLAIM_FRACTION = 0.05; // 1/20 = 5%
const RESIDENTIAL_TYPES = new Set(["mieszkanie", "dom"]);

const ART_952_1_BASIS =
  "Art. 952¹ § 2 KPC — licytację lokalu mieszkalnego / domu służącego zaspokojeniu potrzeb mieszkaniowych dłużnika można wyznaczyć na wniosek wierzyciela tylko, gdy egzekwowana należność główna wynosi co najmniej 1/20 (5%) sumy oszacowania. Wyjątki: należność Skarbu Państwa, z wyroku karnego, albo zgoda dłużnika/sądu.";

/**
 * Ryzyko blokady licytacji nieruchomości mieszkalnej (mieszkanie/dom), gdy kwota
 * pożyczki (należność główna) jest niższa niż 5% wartości (art. 952¹ § 2 KPC).
 * Czysta, testowalna funkcja — używana i w kalkulatorze inwestora (na żywo), i w ocenie.
 */
export function residentialAuctionBlockRisk(a: {
  propertyType: string;
  loanAmountPln?: number | null;
  propertyValuePln?: number | null;
}): ResidentialAuctionBlock {
  const applicable =
    RESIDENTIAL_TYPES.has(a.propertyType) &&
    !!a.loanAmountPln &&
    a.loanAmountPln > 0 &&
    !!a.propertyValuePln &&
    a.propertyValuePln > 0;

  if (!applicable) {
    return {
      applicable: false,
      blocked: false,
      loanToValuePercent: null,
      thresholdPln: null,
      message: "",
      legalBasis: ART_952_1_BASIS,
    };
  }
  const value = a.propertyValuePln as number;
  const loan = a.loanAmountPln as number;
  const thresholdPln = Math.round(value * RESIDENTIAL_MIN_CLAIM_FRACTION);
  const loanToValuePercent = Math.round((loan / value) * 1000) / 10; // 1 miejsce po przecinku
  const blocked = loan < thresholdPln;
  const message = blocked
    ? `Kwota pożyczki (${loan.toLocaleString("pl-PL")} PLN) to ${loanToValuePercent}% wartości nieruchomości mieszkalnej — poniżej progu 5%. Wierzyciel może NIE być w stanie skutecznie wyznaczyć licytacji (art. 952¹ § 2 KPC): egzekucja z nieruchomości może być zablokowana. Minimalna należność główna umożliwiająca licytację: ${thresholdPln.toLocaleString("pl-PL")} PLN.`
    : "";
  return {
    applicable: true,
    blocked,
    loanToValuePercent,
    thresholdPln,
    message,
    legalBasis: ART_952_1_BASIS,
  };
}

export interface ForcedSaleInput {
  /** Suma oszacowania (nasza najlepsza wartość rynkowa) w PLN. */
  basisValuePln: number | null;
  basisSource: string;
  propertyType?: string | null;
  requestedLoanPln?: number | null;
  /** 0–100 z prognozy łatwości sprzedaży — wpływa na spodziewany wynik licytacji. */
  saleabilityScore?: number | null;
  marketLowPln?: number | null;
  marketMidPln?: number | null;
  marketHighPln?: number | null;
}

function round(n: number): number {
  return Math.round(n);
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function estimateForcedSale(i: ForcedSaleInput): ForcedSaleEstimate {
  const legalBasis =
    "Ceny wywołania od sumy oszacowania: I licytacja 3/4 (art. 965 KPC), II licytacja 2/3 (art. 983 KPC); przejęcie przez wierzyciela za 2/3 (art. 984 KPC).";

  const residentialAuctionBlock = residentialAuctionBlockRisk({
    propertyType: i.propertyType ?? "",
    loanAmountPln: i.requestedLoanPln,
    propertyValuePln: i.basisValuePln,
  });

  const v = i.basisValuePln && i.basisValuePln > 0 ? i.basisValuePln : null;
  if (!v) {
    return {
      basisValuePln: null,
      basisSource: i.basisSource,
      marketSalePriceLowPln: i.marketLowPln ?? null,
      marketSalePriceMidPln: i.marketMidPln ?? null,
      marketSalePriceHighPln: i.marketHighPln ?? null,
      firstAuctionOpeningPln: null,
      secondAuctionOpeningPln: null,
      expectedForcedSaleLowPln: null,
      expectedForcedSaleHighPln: null,
      likelyAuctionOutcome: "nieznany",
      loanToForcedSalePercent: null,
      residentialAuctionBlock,
      recoveryComment:
        "Brak wiarygodnej wartości nieruchomości — nie można oszacować ceny wymuszonej sprzedaży.",
      legalBasis,
    };
  }

  const firstOpening = round(v * FIRST_AUCTION_FRACTION);
  const secondOpening = round(v * SECOND_AUCTION_FRACTION);

  // Spodziewany wynik licytacji zależny od łatwości sprzedaży.
  const s = clamp(i.saleabilityScore ?? 45, 0, 100) / 100;
  let likelyAuctionOutcome: AuctionOutcome;
  if (s >= 0.6) likelyAuctionOutcome = "pierwsza_licytacja";
  else if (s >= 0.35) likelyAuctionOutcome = "druga_licytacja";
  else likelyAuctionOutcome = "przejecie_wierzyciela";

  // Dolna granica realnego odzysku = cena wywołania II licytacji (2/3).
  // Górna granica interpoluje od 2/3 (rynek płynny → nawet powyżej ceny wywołania I licytacji).
  const highFraction = SECOND_AUCTION_FRACTION + (0.9 - SECOND_AUCTION_FRACTION) * s;
  const expectedForcedSaleLowPln = secondOpening;
  const expectedForcedSaleHighPln = round(v * highFraction);

  // Do pokrycia pożyczki przyjmujemy ostrożnie cenę wywołania spodziewanej licytacji.
  const recoveryBasis =
    likelyAuctionOutcome === "pierwsza_licytacja" ? firstOpening : secondOpening;
  const loanToForcedSalePercent =
    i.requestedLoanPln && i.requestedLoanPln > 0
      ? round((i.requestedLoanPln / recoveryBasis) * 100)
      : null;

  const outcomeLabel =
    likelyAuctionOutcome === "pierwsza_licytacja"
      ? "sprzedaż prawdopodobna już na I licytacji"
      : likelyAuctionOutcome === "druga_licytacja"
        ? "sprzedaż prawdopodobna dopiero na II licytacji"
        : "wysokie ryzyko braku nabywcy — przejęcie przez wierzyciela za 2/3";

  const coverageComment =
    loanToForcedSalePercent == null
      ? ""
      : loanToForcedSalePercent <= 80
        ? ` Kwota pożyczki (${(i.requestedLoanPln ?? 0).toLocaleString("pl-PL")} PLN) stanowi ${loanToForcedSalePercent}% ceny wywołania — bufor bezpieczny.`
        : loanToForcedSalePercent <= 100
          ? ` Kwota pożyczki stanowi ${loanToForcedSalePercent}% ceny wywołania — bufor ograniczony.`
          : ` UWAGA: kwota pożyczki (${loanToForcedSalePercent}% ceny wywołania) przekracza spodziewany odzysk z licytacji.`;

  const recoveryComment =
    `Przy wartości ${v.toLocaleString("pl-PL")} PLN: I licytacja od ${firstOpening.toLocaleString("pl-PL")} PLN (3/4), ` +
    `II licytacja od ${secondOpening.toLocaleString("pl-PL")} PLN (2/3). ${outcomeLabel}.` +
    coverageComment;

  return {
    basisValuePln: v,
    basisSource: i.basisSource,
    marketSalePriceLowPln: i.marketLowPln ?? null,
    marketSalePriceMidPln: i.marketMidPln ?? v,
    marketSalePriceHighPln: i.marketHighPln ?? null,
    firstAuctionOpeningPln: firstOpening,
    secondAuctionOpeningPln: secondOpening,
    expectedForcedSaleLowPln,
    expectedForcedSaleHighPln,
    likelyAuctionOutcome,
    loanToForcedSalePercent,
    residentialAuctionBlock,
    recoveryComment: residentialAuctionBlock.blocked
      ? `${recoveryComment} ${residentialAuctionBlock.message}`
      : recoveryComment,
    legalBasis,
  };
}

export function auctionOutcomeLabel(o: AuctionOutcome): string {
  switch (o) {
    case "pierwsza_licytacja":
      return "I licytacja";
    case "druga_licytacja":
      return "II licytacja";
    case "przejecie_wierzyciela":
      return "przejęcie przez wierzyciela (2/3)";
    case "nieznany":
      return "nieznany";
  }
}

export function saleabilityBandLabel(band: string): string {
  switch (band) {
    case "bardzo_latwa":
      return "bardzo łatwa sprzedaż";
    case "latwa":
      return "łatwa sprzedaż";
    case "umiarkowana":
      return "umiarkowana łatwość sprzedaży";
    case "trudna":
      return "trudna sprzedaż";
    case "bardzo_trudna":
      return "bardzo trudna sprzedaż";
    default:
      return "nieznana łatwość sprzedaży";
  }
}
