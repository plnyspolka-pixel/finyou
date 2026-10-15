import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Czy zalogowany inwestor to Finance You (kalkulatory liczą wtedy bez prowizji FY). */
export const getIsFinanceYouInvestor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isFinanceYouInvestorUser } = await import("./finance-you-investor.server");
    return { financeYouInvestor: await isFinanceYouInvestorUser(context.userId as string) };
  });
