import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const impersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data, context }) => {
    // Caller must be administrator
    const { data: rows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    const roles = (rows ?? []).map((r) => r.role);
    if (!roles.includes("administrator")) {
      throw new Error("Brak uprawnień (wymagany administrator)");
    }

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: data.email,
    });
    if (error) throw new Error(error.message);

    const hashed_token = link?.properties?.hashed_token;
    if (!hashed_token) throw new Error("Nie udało się wygenerować linku logowania");

    // Determine target route by roles
    const { data: targetUser } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", link.user!.id);
    const targetRoles = (targetUser ?? []).map((r) => r.role);
    const redirect = targetRoles.includes("inwestor")
      ? "/inwestor"
      : targetRoles.includes("administrator") || targetRoles.includes("operator")
        ? "/admin"
        : "/klient";

    return { token_hash: hashed_token, email: data.email, redirect };
  });
