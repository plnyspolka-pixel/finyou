// Wybór typu konta po rejestracji. Zapis roli wykonuje serwer (service role) —
// bezpośrednie inserty z przeglądarki do user_roles są blokowane przez RLS.
// Wybór „pośrednik" nadaje dedykowaną rolę 'posrednik' (nigdy 'operator').
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const selectAccountRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ role: z.enum(["klient", "inwestor", "posrednik"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Ustalenie ról nie może eskalować uprawnień: konta z rolami
    // pracowniczymi nie zmieniają roli tym mechanizmem.
    const { data: existingRoles } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = ((existingRoles ?? []) as { role: string }[]).map((r) => r.role);
    if (roles.some((r) => ["administrator", "operator", "ksiegowosc"].includes(r))) {
      return { ok: true, skipped: "staff_account" };
    }

    if (data.role === "inwestor") {
      await db
        .from("user_roles")
        .upsert({ user_id: userId, role: "inwestor" }, { onConflict: "user_id,role" });
      const { data: userRes } = await supabase.auth.getUser();
      const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, string | undefined>;
      const { data: investor } = await db
        .from("investors")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!investor) {
        await db.from("investors").insert({
          user_id: userId,
          investor_type: "indywidualny",
          first_name: meta.first_name ?? meta.full_name ?? null,
          last_name: meta.last_name ?? null,
          email: userRes?.user?.email ?? null,
          subscription_status: "nieaktywny",
        });
      }
      await db.from("user_roles").delete().eq("user_id", userId).eq("role", "klient");
    } else if (data.role === "posrednik") {
      await db
        .from("user_roles")
        .upsert({ user_id: userId, role: "posrednik" } as any, { onConflict: "user_id,role" });
      await db.from("user_roles").delete().eq("user_id", userId).eq("role", "klient");
    } else {
      await db
        .from("user_roles")
        .upsert({ user_id: userId, role: "klient" }, { onConflict: "user_id,role" });
    }

    return { ok: true };
  });
