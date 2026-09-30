// Serwerowe bramki płatnego dostępu — jedno źródło prawdy dla server functions.
// Sprawdzenia wykonywane przez service_role na funkcjach SQL SECURITY DEFINER
// (te same, których używa RLS), więc warstwa API i baza są zawsze zgodne.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AccessAudience } from "./core";

const db = supabaseAdmin as any;

export async function isInternalStaff(userId: string): Promise<boolean> {
  const { data } = await db.rpc("is_internal_staff", { _user_id: userId });
  return Boolean(data);
}

export async function isExternalPartner(userId: string): Promise<boolean> {
  const { data } = await db.rpc("is_external_partner", { _user_id: userId });
  return Boolean(data);
}

export async function hasActivePaidAccess(
  userId: string,
  audience: AccessAudience,
): Promise<boolean> {
  const { data } = await db.rpc("has_active_paid_access", {
    _user_id: userId,
    _audience: audience,
  });
  return Boolean(data);
}

export async function investorHasFullAccess(userId: string): Promise<boolean> {
  const { data } = await db.rpc("investor_has_full_access", { _user_id: userId });
  return Boolean(data);
}

export async function brokerHasPaidAccess(userId: string): Promise<boolean> {
  const { data } = await db.rpc("broker_has_paid_access", { _user_id: userId });
  return Boolean(data);
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

export async function assertInvestorFullAccess(userId: string): Promise<void> {
  if (!(await investorHasFullAccess(userId))) {
    throw new Error(
      "PAYWALL_INVESTOR: Ta funkcja wymaga aktywnego abonamentu inwestora (zakładka Dostęp i płatności).",
    );
  }
}

/**
 * Czy inwestor zaakceptował AKTYWNĄ wersję Umowy ramowej (code:version:sha256
 * — tak samo liczy pipeline). Umowa jest podstawą Opłaty Abonamentowej, więc
 * zakup abonamentu wymaga jej wcześniejszej akceptacji.
 */
export async function investorAcceptedActiveFramework(userId: string): Promise<boolean> {
  const { data: doc } = await db
    .from("legal_documents")
    .select("version, sha256")
    .eq("code", "umowa_ramowa")
    .eq("active", true)
    .maybeSingle();
  if (!doc) return false;
  const { data: acc } = await db
    .from("investor_agreement_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("document_code", "umowa_ramowa")
    .eq("version", doc.version)
    .eq("sha256", doc.sha256)
    .limit(1);
  return (acc ?? []).length > 0;
}

export async function assertBrokerPremium(userId: string): Promise<void> {
  if (!(await brokerHasPaidAccess(userId))) {
    throw new Error("PAYWALL_BROKER: Ta funkcja wymaga pełnego (płatnego) dostępu pośrednika.");
  }
}

/** Personel wewnętrzny albo pośrednik (dowolny — także darmowy). */
export async function assertBrokerOrStaff(
  userId: string,
): Promise<{ staff: boolean; partner: boolean }> {
  const [staff, partner, roles] = await Promise.all([
    isInternalStaff(userId),
    isExternalPartner(userId),
    getUserRoles(userId),
  ]);
  const isBrokerRole = roles.includes("posrednik");
  if (!staff && !partner && !isBrokerRole) {
    throw new Error("Brak uprawnień");
  }
  return { staff, partner: partner || isBrokerRole };
}
