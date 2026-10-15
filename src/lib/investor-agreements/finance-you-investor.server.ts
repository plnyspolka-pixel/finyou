// Czy inwestorem jest sama Finance You — wtedy nie ma pośrednictwa, więc
// nie ma Prowizji Finance You (Finance You nie pobiera prowizji sama od siebie).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jestFinanceYouInwestor } from "@/lib/contract-engine/finance-you";
import { getUserRoles } from "@/lib/access/guards.server";
import { isSelfFinancingInvestor } from "./order-cycle-core";

/**
 * Inwestor = Finance You, gdy konto ma jednocześnie role inwestora
 * i administratora albo profil inwestora wskazuje Finance You (NIP / KRS / nazwa).
 */
export async function isFinanceYouInvestorUser(userId: string): Promise<boolean> {
  if (isSelfFinancingInvestor(await getUserRoles(userId))) return true;
  const { data } = await (supabaseAdmin as any)
    .from("investors")
    .select("nip, krs, company_name")
    .eq("user_id", userId)
    .maybeSingle();
  return jestFinanceYouInwestor(data);
}
