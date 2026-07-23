// Serwerowe bramki zamkniętego modułu projektów.
//
// Ukrycie UI nie wystarcza — KAŻDA server function zwracająca dane projektu
// woła te strażniki. Sprawdzenia idą przez service_role na tabelach modułu,
// więc warstwa API i RLS są zawsze zgodne.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ModuleAccessStatus } from "./module-types";

// Tabele modułu nie są jeszcze w wygenerowanych typach Database — luźny dostęp
// jak w module AML/Didit (do czasu regeneracji typów).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabaseAdmin as any;

export interface ModuleAccessRow {
  id: string;
  user_id: string;
  status: ModuleAccessStatus;
  application_id: string | null;
  kyc_session_id: string | null;
  kyc_status: string;
  kyc_started_at: string | null;
  kyc_completed_at: string | null;
  kyc_result: unknown;
  kyc_scope: string;
  kyc_updated_at: string | null;
  screening_id: string | null;
  screening_result: string | null;
  screening_updated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_reason: string | null;
  access_starts_at: string | null;
  access_expires_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  accepted_documents: unknown[];
  preferences: Record<string, unknown>;
  profile_completed_at: string | null;
}

export async function getModuleAccessRow(userId: string): Promise<ModuleAccessRow | null> {
  const { data, error } = await db
    .from("project_module_access")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ModuleAccessRow) ?? null;
}

/** Czy użytkownik ma AKTUALNIE aktywny status approved_investor (z uwzględnieniem wygaśnięcia). */
export function isApprovedInvestor(row: ModuleAccessRow | null): boolean {
  if (!row || row.status !== "approved_investor") return false;
  if (row.access_expires_at && new Date(row.access_expires_at).getTime() < Date.now()) {
    return false;
  }
  return true;
}

/**
 * Twarda bramka danych projektowych: rzuca, gdy użytkownik nie jest aktywnym
 * `approved_investor`. Zwraca wiersz dostępu do dalszych sprawdzeń.
 */
export async function assertApprovedInvestor(userId: string): Promise<ModuleAccessRow> {
  const row = await getModuleAccessRow(userId);
  if (!isApprovedInvestor(row)) {
    throw new Error("MODULE_ACCESS: Ta funkcja wymaga aktywnego dostępu do modułu projektów.");
  }
  return row as ModuleAccessRow;
}

/** Personel wewnętrzny (administrator / operator wewnętrzny) — bramka panelu admina. */
export async function assertModuleStaff(userId: string): Promise<void> {
  const { data } = await db.rpc("is_internal_staff", { _user_id: userId });
  if (!data) throw new Error("Brak uprawnień");
}

/**
 * Aktywne przypisanie danego inwestora. Zwraca wiersz przypisania po
 * zweryfikowaniu: właściciela, statusu i braku wygaśnięcia (czas serwera).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOwnedAssignment(userId: string, assignmentId: string): Promise<any> {
  const { data, error } = await db
    .from("project_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("investor_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nie znaleziono przypisania.");
  return data;
}

export interface ModuleSettings {
  max_active_assignments: number;
  max_extended_assignments: number;
  assignment_hours: number;
  extension_hours: number;
  proposal_hours: number;
  rejection_review_threshold: number;
  ltv_bands: { conservative: number; acceptable: number; elevated: number };
  min_period_months: number;
  max_period_months: number;
  max_ltv_percent: number;
}

export async function getModuleSettings(): Promise<ModuleSettings> {
  const { data, error } = await db
    .from("project_module_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      max_active_assignments: 5,
      max_extended_assignments: 2,
      assignment_hours: 24,
      extension_hours: 12,
      proposal_hours: 48,
      rejection_review_threshold: 5,
      ltv_bands: { conservative: 35, acceptable: 50, elevated: 60 },
      min_period_months: 3,
      max_period_months: 120,
      max_ltv_percent: 80,
    };
  }
  return data as ModuleSettings;
}
