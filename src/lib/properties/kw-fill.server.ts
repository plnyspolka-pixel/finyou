// Uzupełnienie `properties` wniosku z działu I-O pobranej KW (pkt 4).
// Wywoływane w przebiegu analizy przed krokiem ryzyka — krok ryzyka
// geokoduje adres i przelicza ocenę na uzupełnionych danych.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { compactKwNumber } from "@/lib/kw";
import { propertyFillFromKw, type KwFillResult } from "./kw-fill";

export async function uzupelnijNieruchomoscZKw(
  s: SupabaseClient,
  loanApplicationId: string,
  kwNumber: string,
): Promise<KwFillResult & { propertyId: string | null }> {
  const pusty = { patch: {}, filled: [], conflicts: [], addressChanged: false, propertyId: null };
  const compact = compactKwNumber(kwNumber) ?? kwNumber.replace(/\s|\//g, "").toUpperCase();
  const [{ data: prop }, { data: doc }] = await Promise.all([
    (s as any)
      .from("properties")
      .select(
        "id, street, building_number, unit_number, address, city, voivodeship, area_sqm, usage, field_sources, kw_sync",
      )
      .eq("loan_application_id", loanApplicationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    (s as any).from("kw_documents").select("dzial_1o").eq("kw_number", compact).maybeSingle(),
  ]);
  if (!prop || !doc?.dzial_1o) return pusty;
  const { decodeMaybeBase64 } = await import("@/lib/kw-fetch.server");
  const wynik = propertyFillFromKw(prop, decodeMaybeBase64(doc.dzial_1o), kwNumber);
  const kwSync = {
    at: new Date().toISOString(),
    kw_number: kwNumber,
    filled: wynik.filled,
    // Rozbieżności z polami wpisanymi ręcznie — ostrzeżenie dla operatora.
    conflicts: wynik.conflicts,
  };
  const { error } = await (s as any)
    .from("properties")
    .update({ ...wynik.patch, kw_sync: kwSync })
    .eq("id", prop.id);
  if (error) throw new Error(`properties: ${error.message}`);
  return { ...wynik, propertyId: prop.id };
}
