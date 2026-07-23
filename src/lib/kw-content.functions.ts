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
import { parseKwAddress } from "@/lib/kw-address-core";
import { parseKwPropertyParams, parseMortgages, parseOwners } from "@/lib/risk-assessment/kw-parse-core";
import { fetchPopulation } from "@/lib/property-analysis/gus-bdl.server";

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
    if (!kw) return { hasKw: false as const };
    const { data: row, error } = await context.supabase
      .from("kw_documents")
      .select("status, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4, fetched_at, last_error, ordered_at")
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
    return { hasKw: true as const, document };
  });

/** Admin/operator only. Orders KW download from CMD, polls, fetches HTML, stores in cache. */
export const fetchKwForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      loanApplicationId: z.string().uuid(),
      force: z.boolean().optional(),
    }).parse(i),
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

const isEmpty = (v: unknown): boolean => v == null || v === "";

/**
 * Admin/operator only. Uzupełnia dane nieruchomości na podstawie pobranej treści
 * KW (dział I-O: adres/miejscowość/województwo/powierzchnia; dział II:
 * współwłaściciele; dział IV: hipoteka) oraz liczbę ludności z GUS BDL.
 * Pola tekstowe/liczbowe wypełnia tylko, gdy są puste (nie nadpisuje ręcznych
 * korekt); fakty prawne (hipoteka, współwłaściciele) ustawia wg KW.
 */
export const applyKwToProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ loanApplicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
    if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");

    // Pierwsza nieruchomość wniosku (ta sama kolejność co przy pobieraniu KW).
    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select("id, address, city, voivodeship, area_sqm, has_mortgage, has_co_owners, population, land_register_number")
      .eq("loan_application_id", data.loanApplicationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (propErr) throw new Error(propErr.message);
    if (!property) return { applied: [] as string[], population: null as number | null };

    const kw = property.land_register_number ? normalizeKwNumber(property.land_register_number) : null;
    if (!kw) return { applied: [] as string[], population: null as number | null };

    const { data: row, error: kwErr } = await supabase
      .from("kw_documents")
      .select("status, dzial_1o, dzial_2, dzial_4")
      .eq("kw_number", kw)
      .maybeSingle();
    if (kwErr) throw new Error(kwErr.message);
    if (!row || row.status !== "ready") return { applied: [] as string[], population: null as number | null };

    const dzial1o = decodeMaybeBase64(row.dzial_1o);
    const dzial2 = decodeMaybeBase64(row.dzial_2);
    const dzial4 = decodeMaybeBase64(row.dzial_4);

    const addr = parseKwAddress(dzial1o);
    const pp = parseKwPropertyParams(dzial1o);
    const areaSqm = pp.usableAreaM2 ?? pp.landAreaM2 ?? null;

    const patch: Record<string, unknown> = {};
    if (isEmpty(property.address) && addr.fullAddress) patch.address = addr.fullAddress;
    if (isEmpty(property.city) && addr.city) patch.city = addr.city;
    if (isEmpty(property.voivodeship) && addr.voivodeship) patch.voivodeship = addr.voivodeship;
    if (isEmpty(property.area_sqm) && areaSqm != null) patch.area_sqm = areaSqm;

    // Fakty prawne z KW — ustawiamy wg zawartości działów (źródło prawdy).
    if (dzial4 != null) patch.has_mortgage = parseMortgages(dzial4).length > 0;
    if (dzial2 != null) patch.has_co_owners = parseOwners(dzial2).length > 1;

    // Liczba ludności z GUS BDL — miejscowość z KW ma pierwszeństwo, fallback do zapisanej.
    let population: number | null = null;
    if (isEmpty(property.population)) {
      const cityForPop = addr.city ?? property.city;
      const voivForPop = addr.voivodeship ?? property.voivodeship;
      if (cityForPop || voivForPop) {
        const pop = await fetchPopulation({ city: cityForPop, county: addr.powiat, voivodeship: voivForPop });
        if (pop.population != null) {
          population = pop.population;
          patch.population = pop.population;
        }
      }
    }

    if (Object.keys(patch).length === 0) return { applied: [] as string[], population };

    const { error: upErr } = await supabase
      .from("properties")
      .update(patch as never)
      .eq("id", property.id);
    if (upErr) throw new Error(upErr.message);

    return { applied: Object.keys(patch), population };
  });
