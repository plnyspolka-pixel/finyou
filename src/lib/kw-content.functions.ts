import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  decodeMaybeBase64,
  fetchAndStoreKw,
  hasCmdConfig,
  normalizeKwNumber,
} from "@/lib/kw-fetch.server";

async function resolveKwForApplication(
  supabase: SupabaseClient,
  loanApplicationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("properties")
    .select("land_register_number")
    .eq("loan_application_id", loanApplicationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.land_register_number) return null;
  return normalizeKwNumber(data.land_register_number);
}

/** Read cached KW content for a loan application. Returns null when not yet fetched. */
export const getKwForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ loanApplicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const kw = await resolveKwForApplication(context.supabase, data.loanApplicationId);
    if (!kw) return { hasKw: false as const, kwNumber: null };
    const { data: row, error } = await context.supabase
      .from("kw_documents")
      .select(
        "status, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4, fetched_at, last_error, ordered_at",
      )
      .eq("kw_number", kw)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const document = row
      ? {
          ...row,
          okladka: decodeMaybeBase64(row.okladka),
          dzial_1o: decodeMaybeBase64(row.dzial_1o),
          dzial_1s: decodeMaybeBase64(row.dzial_1s),
          dzial_2: decodeMaybeBase64(row.dzial_2),
          dzial_3: decodeMaybeBase64(row.dzial_3),
          dzial_4: decodeMaybeBase64(row.dzial_4),
        }
      : row;
    return { hasKw: true as const, kwNumber: kw, document };
  });

/** Admin/operator only. Orders KW download from CMD, polls, fetches HTML, stores in cache. */
export const fetchKwForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        loanApplicationId: z.string().uuid(),
        force: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Role check via authenticated client (RLS-safe)
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
    if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");

    if (!hasCmdConfig()) {
      throw new Error("Brak konfiguracji CMD KW Engine (CMD_KW_USER / CMD_KW_PASSWORD).");
    }

    const kw = await resolveKwForApplication(supabase, data.loanApplicationId);
    if (!kw) throw new Error("Wniosek nie ma poprawnego numeru KW na nieruchomości.");

    const out = await fetchAndStoreKw(kw, { orderedBy: userId, force: data.force });
    if (out.status === "processing") {
      return { ok: false, kwNumber: kw, status: "processing", cached: false };
    }
    if (!out.ok) {
      throw new Error(out.error ?? "Nie udało się pobrać treści KW.");
    }
    return { ok: true, kwNumber: kw, status: "ready", cached: out.cached };
  });
