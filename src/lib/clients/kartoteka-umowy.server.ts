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
