import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIsFinanceYouInvestor } from "@/lib/investor-agreements/finance-you-investor.functions";

/**
 * Czy zalogowany inwestor to sama Finance You (admin+inwestor albo profil
 * inwestora z danymi FY). Wtedy kalkulatory ofert pomijają prowizję Finance You.
 */
export function useIsFinanceYouInvestor(enabled = true): boolean {
  const fn = useServerFn(getIsFinanceYouInvestor);
  const q = useQuery({
    queryKey: ["finance-you-investor"],
    queryFn: () => fn(),
    enabled,
    staleTime: 5 * 60_000,
  });
  return Boolean(q.data?.financeYouInvestor);
}
