// Odczyt kartoteki klienta dla draft_contract (profil → wniosek → klient).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSensitive } from "@/lib/affiliate/crypto";
import type { CeidgSnapshot } from "@/lib/risk-assessment/ceidg-lookup.server";
import type { CeidgActivity } from "@/lib/risk-assessment/types";
import type { KartotekaKlienta } from "./kartoteka-umowy";

export async function kartotekaKlientaProfilu(
  s: SupabaseClient,
  sourceApplicationId: string | null | undefined,
): Promise<KartotekaKlienta | null> {
  if (!sourceApplicationId) return null;
  const { data: app } = await (s as any)
    .from("loan_applications")
    .select("client_id")
    .eq("id", sourceApplicationId)
    .maybeSingle();
  if (!app?.client_id) return null;
  const { data: c } = await (s as any)
    .from("clients")
    .select(
      "first_name, last_name, pesel, nip, bank_account, id_document_enc, payout_account_enc, ceidg_snapshot",
    )
    .eq("id", app.client_id)
    .maybeSingle();
  if (!c) return null;
  return {
    first_name: c.first_name ?? null,
    last_name: c.last_name ?? null,
    pesel: c.pesel ?? null,
    nip: c.nip ?? null,
    id_document: decryptSensitive(c.id_document_enc),
    payout_account: decryptSensitive(c.payout_account_enc) ?? c.bank_account ?? null,
    // Zapis CEIDG (po NIP) z przebiegu analizy — do umowy niezależnie od
    // wieku zapisu, byle dotyczył bieżącego NIP klienta.
    ceidg: zapisCeidgDlaNip(c.ceidg_snapshot, c.nip),
  };
}

function zapisCeidgDlaNip(snapshot: unknown, nip: unknown): CeidgActivity | null {
  const sn = snapshot as CeidgSnapshot | null;
  const n = String(nip ?? "").replace(/\D/g, "");
  return sn?.activity && n.length === 10 && String(sn.nip ?? "").replace(/\D/g, "") === n
    ? sn.activity
    : null;
}

/** Dzień przyjęcia wniosku do systemu (loan_applications.created_at, ISO). */
export async function dataPrzyjeciaWniosku(
  s: SupabaseClient,
  applicationId: string | null | undefined,
): Promise<string | null> {
  if (!applicationId) return null;
  const { data } = await (s as any)
    .from("loan_applications")
    .select("created_at")
    .eq("id", applicationId)
    .maybeSingle();
  return data?.created_at ?? null;
}

/** Wniosek, z którego powstał profil klienta (client_profiles.source_application_id). */
export async function wniosekProfilu(
  s: SupabaseClient,
  profileId: string | null | undefined,
): Promise<string | null> {
  if (!profileId) return null;
  const { data } = await (s as any)
    .from("client_profiles")
    .select("source_application_id")
    .eq("id", profileId)
    .maybeSingle();
  return data?.source_application_id ?? null;
}
