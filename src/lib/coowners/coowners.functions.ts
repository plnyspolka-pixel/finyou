// Funkcje serwerowe modułu „Współwłaściciele (dział II KW) — CEIDG i KRS".
// Osobna karta wniosku: uruchomienie sprawdzenia + odczyt zapisanego wyniku.
// Wynik trzymamy w coowner_registry_checks (jedno aktualne sprawdzenie na
// wniosek, upsert po application_id) — przeżywa odświeżenie strony.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAndStoreKw, normalizeKwNumber } from "@/lib/kw-fetch.server";
import { analyzeCoOwners } from "./analyze.server";
import type { CoOwnersAnalysis } from "./types";

type SupabaseLike = { from: (t: string) => any };

async function assertAdminOrOperator(supabase: SupabaseLike, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

export const runCoOwnersCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CoOwnersAnalysis> => {
    const db = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(db, context.userId);

    // Dane wniosku: numer KW z nieruchomości + klient (oznaczenie jego wiersza).
    const [{ data: app }, { data: props }] = await Promise.all([
      db
        .from("loan_applications")
        .select("id, client_id")
        .eq("id", data.applicationId)
        .maybeSingle(),
      db.from("properties").select("*").eq("loan_application_id", data.applicationId),
    ]);
    if (!app) throw new Error("Wniosek nie znaleziony.");
    const property = props?.[0] ?? null;

    const kwNumber = normalizeKwNumber(property?.land_register_number ?? "");
    if (!kwNumber) {
      throw new Error(
        "Wniosek nie ma poprawnego numeru księgi wieczystej (KW). Uzupełnij numer KW i uruchom sprawdzenie ponownie.",
      );
    }

    // Upewnij się, że treść KW (dział II) jest pobrana z KW Engine.
    const kwFetch = await fetchAndStoreKw(kwNumber, { pollMaxMs: 60_000 });
    if (!kwFetch.ok) {
      const reason =
        kwFetch.status === "processing"
          ? "pobieranie treści KW nadal trwa — spróbuj ponownie za chwilę"
          : (kwFetch.error ?? `status: ${kwFetch.status}`);
      throw new Error(`Nie udało się pobrać treści KW ${kwNumber} (${reason}).`);
    }

    let primaryClientName: string | null = null;
    if (app.client_id) {
      const { data: client } = await db
        .from("clients")
        .select("first_name, last_name, city")
        .eq("id", app.client_id)
        .maybeSingle();
      primaryClientName =
        [client?.first_name, client?.last_name].filter(Boolean).join(" ").trim() || null;
    }

    const result = await analyzeCoOwners({
      kwNumber,
      primaryClientName,
      city: property?.city ?? null,
      voivodeship: property?.voivodeship ?? null,
    });

    // Zapis (supabase-js nie rzuca — błąd trzeba odczytać z { error }).
    const { error: saveError } = await db.from("coowner_registry_checks").upsert(
      {
        application_id: data.applicationId,
        kw_number: result.kwNumber,
        result_json: result,
        warnings: result.warnings,
        created_by: context.userId,
      },
      { onConflict: "application_id" },
    );
    if (saveError) {
      console.error("[coowners] save failed:", saveError.message ?? saveError);
      result.warnings = [
        ...result.warnings,
        `Nie udało się zapisać wyniku w bazie (${saveError.message ?? "błąd"}) — wynik zniknie po odświeżeniu strony.`,
      ];
    }

    return result;
  });

export const getCoOwnersCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CoOwnersAnalysis | null> => {
    const db = context.supabase as unknown as SupabaseLike;
    try {
      const { data: row } = await db
        .from("coowner_registry_checks")
        .select("result_json")
        .eq("application_id", data.applicationId)
        .maybeSingle();
      return (row?.result_json as CoOwnersAnalysis) ?? null;
    } catch {
      return null;
    }
  });
