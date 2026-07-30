import { createServerFn } from "@tanstack/react-start";
import { getNbpRatesCached, type NbpRates } from "./nbp-rates.server";

export const getNbpRates = createServerFn({ method: "GET" }).handler(
  async (): Promise<NbpRates> => {
    return getNbpRatesCached();
  },
);
