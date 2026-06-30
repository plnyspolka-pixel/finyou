// Jednorazowa funkcja administracyjna: ustawia token KSeF z env (KSEF_TOKEN_FUNDACJA_IM_PIECZAKA)
// dla wszystkich aktywnych podmiotów księgowych i przełącza środowisko na produkcję.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { encryptSensitive } from "@/lib/affiliate/crypto";

export const applyKsefTokenToAllEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrator" as any,
    });
    if (!isAdmin) throw new Error("Forbidden");

    const token = process.env.KSEF_TOKEN_FUNDACJA_IM_PIECZAKA;
    if (!token) throw new Error("Brak KSEF_TOKEN_FUNDACJA_IM_PIECZAKA w env.");

    const encrypted = encryptSensitive(token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: entities, error: listErr } = await supabaseAdmin
      .from("accounting_entities")
      .select("id, name, nip");
    if (listErr) throw listErr;

    const updated: Array<{ id: string; name: string }> = [];
    for (const e of entities ?? []) {
      const { error: updErr } = await supabaseAdmin
        .from("accounting_entities")
        .update({
          ksef_token_encrypted: encrypted,
          ksef_environment: "prod",
          ksef_nip: (e as any).nip ?? null,
          provider: "ksef",
        })
        .eq("id", (e as any).id);
      if (updErr) throw updErr;
      updated.push({ id: (e as any).id, name: (e as any).name });
    }
    return { count: updated.length, updated };
  });
