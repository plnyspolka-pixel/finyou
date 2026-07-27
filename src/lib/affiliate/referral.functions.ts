// Przechwytywanie polecenia (?ref=) i powiązanie użytkownika z partnerem (first-touch).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { affiliateDb, logAffiliateAudit } from "./db";

/**
 * Rozwiązuje kod ?ref= na id partnera. Obsługuje dwa namespace'y:
 *  - affiliate_partners.referral_code (landing programu / rekrutacja partnera),
 *  - profiles.referral_code (reflinki pośrednika dla klientów/inwestorów) → partner po user_id.
 */
export async function resolveReferralPartnerId(
  db: SupabaseClient,
  code: string,
): Promise<string | null> {
  const norm = String(code ?? "").trim();
  if (!norm) return null;

  const { data: ap } = await db
    .from("affiliate_partners")
    .select("id")
    .eq("referral_code", norm.toUpperCase())
    .maybeSingle();
  if (ap) return (ap as { id: string }).id;

  const { data: prof } = await db
    .from("profiles")
    .select("user_id")
    .eq("referral_code", norm)
    .maybeSingle();
  const refUser = (prof as { user_id: string | null } | null)?.user_id;
  if (refUser) {
    const { data: ap2 } = await db
      .from("affiliate_partners")
      .select("id")
      .eq("user_id", refUser)
      .maybeSingle();
    if (ap2) return (ap2 as { id: string }).id;
  }
  return null;
}

export const captureReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ code: z.string().min(1).max(60) }).parse(i))
  .handler(async ({ data, context }) => {
    const partnerId = await resolveReferralPartnerId(affiliateDb, data.code);
    if (!partnerId) return { captured: false, reason: "unknown_code" as const };

    // Nie przypisuj partnera do samego siebie.
    const { data: self } = await affiliateDb
      .from("affiliate_partners")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (self && (self as { id: string }).id === partnerId)
      return { captured: false, reason: "self" as const };

    // First-touch: ustaw tylko, gdy jeszcze puste.
    const { data: prof } = await affiliateDb
      .from("profiles")
      .select("referred_by_partner_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if ((prof as { referred_by_partner_id: string | null } | null)?.referred_by_partner_id) {
      return { captured: false, reason: "already_set" as const };
    }

    await affiliateDb
      .from("profiles")
      .update({ referred_by_partner_id: partnerId, referral_captured_at: new Date().toISOString() })
      .eq("user_id", context.userId);

    await logAffiliateAudit(affiliateDb, {
      actorUserId: context.userId,
      actorRole: "system",
      entityType: "profile_referral",
      entityId: partnerId,
      action: "referral_captured",
      after: { code: data.code },
    });
    return { captured: true as const, partnerId };
  });
