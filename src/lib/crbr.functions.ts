// Server functions dla CRBR — wołane z UI (widget GUS/KRS, panel wniosku).
// Bezpośrednie połączenie z publicznym API Ministerstwa Finansów (SOAP 1.2).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LookupInput = z
  .object({
    nip: z.string().optional(),
    krs: z.string().optional(),
    nazwa: z.string().optional(),
  })
  .refine((v) => Boolean(v.nip || v.krs || v.nazwa), {
    message: "Podaj NIP, KRS lub nazwę spółki",
  });

export const getCrbrForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => LookupInput.parse(data))
  .handler(async ({ data }) => {
    const { fetchCrbr } = await import("@/lib/crbr.server");
    return fetchCrbr(data, { force: false });
  });

export const refreshCrbrForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => LookupInput.parse(data))
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
    const { fetchCrbr } = await import("@/lib/crbr.server");
    return fetchCrbr(data, { force: true });
  });
