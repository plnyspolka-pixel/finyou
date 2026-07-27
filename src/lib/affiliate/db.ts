// Wspólny dostęp do bazy dla modułu programu pośredników.
// Używamy klienta service_role bez generyka Database (tabele affiliate_* nie są
// jeszcze w wygenerowanym types.ts — Lovable Cloud regeneruje go po migracji).
// Scoping do partnera/roli wymuszamy w kodzie funkcji serwerowych ORAZ przez RLS.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Luźno typowany klient service_role do tabel affiliate_*. */
export const affiliateDb = supabaseAdmin as unknown as SupabaseClient;

export type AppRoleName = "administrator" | "operator" | "klient" | "inwestor" | "ksiegowosc";

export async function getUserRoles(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: { role: string }) => r.role);
}

export async function assertRole(
  db: SupabaseClient,
  userId: string,
  allowed: AppRoleName[],
): Promise<string[]> {
  const roles = await getUserRoles(db, userId);
  if (!allowed.some((r) => roles.includes(r))) {
    throw new Error("Brak uprawnień do tej operacji.");
  }
  return roles;
}

/** Personel: administrator lub operator. */
export async function assertStaff(db: SupabaseClient, userId: string): Promise<string[]> {
  return assertRole(db, userId, ["administrator", "operator"]);
}

/** Administrator (pełne uprawnienia / superadmin). */
export async function assertAdmin(db: SupabaseClient, userId: string): Promise<string[]> {
  return assertRole(db, userId, ["administrator"]);
}

/** Dostęp do danych rozliczeniowych: administrator lub księgowość. */
export async function assertAccounting(db: SupabaseClient, userId: string): Promise<string[]> {
  return assertRole(db, userId, ["administrator", "ksiegowosc"]);
}

export async function logAffiliateAudit(
  db: SupabaseClient,
  input: {
    actorUserId?: string | null;
    actorRole?: string | null;
    entityType: string;
    entityId?: string | null;
    action: string;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
): Promise<void> {
  try {
    await db.from("affiliate_audit_logs").insert({
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
    });
  } catch (e) {
    // Audyt nie może wywrócić operacji głównej.

    console.error("[affiliate] audit log failed", (e as Error)?.message);
  }
}

/** Resolves the affiliate_partners.id for an authenticated user, or null. */
export async function resolvePartnerId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db
    .from("affiliate_partners")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
