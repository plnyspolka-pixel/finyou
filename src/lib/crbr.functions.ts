// Server functions dla CRBR — wołane z UI (widget GUS/KRS, panel wniosku).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NipInput = z.object({ nip: z.string().min(10).max(20) });

export const getCrbrForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => NipInput.parse(data))
  .handler(async ({ data }) => {
    const { fetchCrbrByNip } = await import("@/lib/crbr.server");
    return fetchCrbrByNip(data.nip, { force: false });
  });

export const refreshCrbrForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => NipInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrator",
    });
    const { data: isOp } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "operator",
    });
    if (!isStaff && !isOp) throw new Error("Brak uprawnień");
    const { fetchCrbrByNip } = await import("@/lib/crbr.server");
    return fetchCrbrByNip(data.nip, { force: true });
  });
