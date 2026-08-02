// Stan dostępu użytkownika (dla UI) + katalog produktów + wykorzystanie
// limitu ofert pośrednika. Frontend nie ustala cen — dostaje je z katalogu,
// a serwer tworzący płatność i tak czyta je ponownie z bazy.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AccessAudience, AccessProduct } from "./core";

export interface AccessStateResult {
  audience: AccessAudience;
  hasPaidAccess: boolean;
  activeFrom: string | null;
  activeUntil: string | null;
  daysLeft: number;
  isBypass: boolean;
  /** Aktywny dostęp do zamkniętego modułu projektów (approved_investor) — daje pełny dostęp inwestora. */
  hasModuleAccess: boolean;
}

export const getMyAccessState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ audience: z.enum(["investor", "broker"]) }).parse(i))
  .handler(async ({ data, context }): Promise<AccessStateResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: state, error } = await (supabaseAdmin as any).rpc("get_access_state", {
      _user_id: context.userId,
      _audience: data.audience,
    });
    if (error) throw new Error(error.message);
    const s = (state ?? {}) as Record<string, unknown>;
    return {
      audience: data.audience,
      hasPaidAccess: Boolean(s.hasPaidAccess),
      activeFrom: (s.activeFrom as string | null) ?? null,
      activeUntil: (s.activeUntil as string | null) ?? null,
      daysLeft: Number(s.daysLeft ?? 0),
      isBypass: Boolean(s.isBypass),
      hasModuleAccess: Boolean(s.hasModuleAccess),
    };
  });

export const listAccessProducts = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ audience: z.enum(["investor", "broker"]) }).parse(i ?? {}))
  .handler(async ({ data }): Promise<AccessProduct[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: products, error } = await (supabaseAdmin as any)
      .from("access_products")
      .select("id,code,audience,label,duration_days,amount_grosz,currency,active,sort_order")
      .eq("audience", data.audience)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (products ?? []) as AccessProduct[];
  });

export interface BrokerOfferUsage {
  activeCount: number;
  freeLimit: number;
  hasPaidAccess: boolean;
  isBypass: boolean;
}

export const getMyBrokerOfferUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrokerOfferUsage> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usage, error } = await (supabaseAdmin as any).rpc("broker_offer_usage", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const u = (usage ?? {}) as Record<string, unknown>;
    return {
      activeCount: Number(u.activeCount ?? 0),
      freeLimit: Number(u.freeLimit ?? 5),
      hasPaidAccess: Boolean(u.hasPaidAccess),
      isBypass: Boolean(u.isBypass),
    };
  });

// Bezpieczne soft-delete własnej oferty pośrednika (zwalnia miejsce w limicie).
export const softDeleteMyApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ applicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // RPC weryfikuje autora po auth.uid() — wywołujemy przez klienta użytkownika.
    const { data: result, error } = await (context.supabase as any).rpc(
      "broker_soft_delete_application",
      {
        _application_id: data.applicationId,
      },
    );
    if (error) throw new Error(error.message);
    return (result ?? { ok: true }) as { ok: boolean; alreadyDeleted?: boolean };
  });
