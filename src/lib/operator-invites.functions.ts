import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "administrator",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Brak uprawnień administratora");
}

export const listOperatorInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("operator_invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createOperatorInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        email: z.string().email().optional().nullable(),
        note: z.string().max(500).optional().nullable(),
        daysValid: z.number().int().min(1).max(90).default(7),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const expiresAt = new Date(Date.now() + data.daysValid * 24 * 60 * 60 * 1000).toISOString();
    const { data: row, error } = await context.supabase
      .from("operator_invites")
      .insert({
        email: data.email || null,
        note: data.note || null,
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const revokeOperatorInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("operator_invites").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
