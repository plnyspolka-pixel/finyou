import { createServerFn } from "@tanstack/react-start";
import { getInflationCached, type InflationIndicator } from "./market-indicators.server";
import { getEurRateForDate, type NbpEurRate } from "./aml/nbp-eur.server";

export interface InvestorMarketIndicators {
  inflation: InflationIndicator;
  /** Średni kurs EUR NBP (tabela A) z dnia bieżącego — do progu AML 15 000 EUR. Null, gdy NBP nieosiągalny. */
  eur: NbpEurRate | null;
}

export const getInvestorMarketIndicators = createServerFn({ method: "GET" }).handler(
  async (): Promise<InvestorMarketIndicators> => {
    const today = new Date().toISOString().slice(0, 10);
    const [inflation, eur] = await Promise.all([
      getInflationCached(),
      getEurRateForDate(today).catch(() => null),
    ]);
    return { inflation, eur };
  },
);
