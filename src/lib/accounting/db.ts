// Wspólny dostęp do bazy dla modułu księgowości (faktury sprzedaży, podmioty, KSeF).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Luźno typowany klient service_role (tabele accounting_* nie są jeszcze w types.ts). */
export const accountingDb = supabaseAdmin as unknown as SupabaseClient;

export {
  assertAccounting,
  assertAdmin,
  assertStaff,
  getUserRoles,
  logAffiliateAudit as logAccountingAudit,
} from "@/lib/affiliate/db";
