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

/** Dokumenty pakietu inwestora, których akceptacja otwiera moduł ofert. */
export const INVESTOR_PACKAGE_CODES = ["umowa_ramowa", "nda", "rodo"] as const;

/**
 * Czy inwestor zaakceptował AKTYWNE wersje wszystkich dokumentów pakietu
 * (code:version:sha256 — tak samo liczy pipeline). Kolejność inwestora:
 * abonament → akceptacja pakietu → moduł ofert.
 */
export async function investorAcceptedActivePackage(userId: string): Promise<boolean> {
  const codes = [...INVESTOR_PACKAGE_CODES];
  const { data: docs } = await db
    .from("legal_documents")
    .select("code, version, sha256")
    .in("code", codes)
    .eq("active", true);
  const active = (docs ?? []) as { code: string; version: string; sha256: string }[];
  if (codes.some((c) => !active.some((d) => d.code === c))) return false;
  const { data: acc } = await db
    .from("investor_agreement_acceptances")
    .select("document_code, version, sha256")
    .eq("user_id", userId)
    .in("document_code", codes);
  const accepted = (acc ?? []) as { document_code: string; version: string; sha256: string }[];
  return active.every((d) =>
    accepted.some(
      (a) => a.document_code === d.code && a.version === d.version && a.sha256 === d.sha256,
    ),
  );
}

/**
 * Moduł ofert inwestora (Zlecenia, Projekty, oferty): aktywny abonament ORAZ
 * zaakceptowany pakiet umów. Personel — bez ograniczeń.
 */
export async function assertInvestorOffersAccess(userId: string): Promise<void> {
  if (await isInternalStaff(userId)) return;
  await assertInvestorFullAccess(userId);
  if (!(await investorAcceptedActivePackage(userId))) {
    throw new Error(
      "UMOWY_INVESTOR: Moduł ofert otwiera się po akceptacji Umowy ramowej, NDA i umowy RODO (zakładka Zlecenia i Projekty).",
    );
  }
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
