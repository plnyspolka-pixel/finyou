// ════════════════════════════════════════════════════════════════════
// WIERZYCIEL SPRAWY WINDYKACYJNEJ (tylko serwer).
//
// Wierzycielem jest WŁAŚCICIEL sprawy (wind_collection_cases.investor_user_id),
// nie osoba, która klika — personel (administrator / operator) może działać
// w każdej sprawie. Profil właściciela czytamy rolą serwisową z
// public.investors. user_id nie jest tam unikalne, więc bierzemy najnowszy
// wiersz (najpierw ten z ukończonym krokiem danych pożyczkodawcy).
//
// Właściciel bez profilu: personel wewnętrzny → Finance You (COMPANY_DATA),
// inwestor → błąd z odesłaniem do zakładki Profil.
// ════════════════════════════════════════════════════════════════════

import {
  buildCreditorParty,
  creditorConflictsWithContract,
  creditorMissing,
  creditorNoProfileMessage,
  financeYouCreditor,
  type CreditorParty,
  type InvestorPartyRow,
  type WindCreditorView,
} from "@/lib/investor-party";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- luźny dostęp do klienta (jak w windykacja.functions.ts)
type LooseDb = { from: (t: string) => any; rpc?: (fn: string, args: object) => any };

export const INVESTOR_PARTY_COLS =
  "id, user_id, entity_variant, entity_type, first_name, last_name, company_name, pesel, nip, krs, regon, legal_form, street, address, postal_code, city, email, phone, bank_account, representative_first_name, representative_last_name, representative_role, lender_data_completed_at, updated_at";

async function adminDb(): Promise<LooseDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseDb;
}

/** Najnowszy profil inwestora użytkownika (user_id w investors nie jest unikalne). */
export async function loadInvestorPartyRow(
  db: LooseDb,
  userId: string,
): Promise<InvestorPartyRow | null> {
  const { data, error } = await db
    .from("investors")
    .select(INVESTOR_PARTY_COLS)
    .eq("user_id", userId)
    .order("lender_data_completed_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as InvestorPartyRow[])[0] ?? null;
}

/**
 * Krótka nazwa z profilu inwestora (bez Finance You dla personelu) — domyślny
 * pożyczkodawca nowej sprawy i nazwa, w której imieniu dzwoni agent AI.
 */
export async function investorShortName(
  userId: string | null | undefined,
  db?: LooseDb,
): Promise<string | null> {
  if (!userId) return null;
  const row = await loadInvestorPartyRow(db ?? (await adminDb()), userId);
  return row ? buildCreditorParty(row).shortName || null : null;
}

/** Personel wewnętrzny (administrator / operator) — ta sama funkcja SQL co RLS. */
async function isInternalStaff(db: LooseDb, userId: string): Promise<boolean> {
  if (db.rpc) {
    const { data, error } = await db.rpc("is_internal_staff", { _user_id: userId });
    if (!error) return Boolean(data);
  }
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((roles ?? []) as { role: string }[]).some((r) =>
    ["administrator", "operator"].includes(r.role),
  );
}

export type CreditorResolution =
  | { ok: true; party: CreditorParty; ownerId: string }
  | { ok: false; ownerId: string | null; error: string };

/**
 * Wierzyciel = profil inwestora użytkownika `ownerId`. `viewerId` — kto
 * pyta (treść komunikatu: „Twój profil" vs „profil właściciela sprawy").
 */
export async function resolveCreditorByUserId(
  ownerId: string | null | undefined,
  opts: { viewerId?: string | null; db?: LooseDb } = {},
): Promise<CreditorResolution> {
  const own = !opts.viewerId || opts.viewerId === ownerId;
  if (!ownerId) return { ok: false, ownerId: null, error: creditorNoProfileMessage(own) };
  const db = opts.db ?? (await adminDb());
  const row = await loadInvestorPartyRow(db, ownerId);
  if (row) return { ok: true, party: buildCreditorParty(row), ownerId };
  if (await isInternalStaff(db, ownerId)) return { ok: true, party: financeYouCreditor(), ownerId };
  return { ok: false, ownerId, error: creditorNoProfileMessage(own) };
}

/** Wierzyciel sprawy dla UI: strona, braki dla pism i wniosków, konflikt z umową. */
export async function windCreditorView(
  ownerId: string | null | undefined,
  pozyczkodawca: string | null | undefined,
  viewerId?: string | null,
): Promise<WindCreditorView> {
  try {
    const res = await resolveCreditorByUserId(ownerId, { viewerId });
    if (!res.ok)
      return {
        party: null,
        missing: { pismo: [], wniosek: [] },
        conflictWithContract: false,
        error: res.error,
      };
    return {
      party: res.party,
      missing: {
        pismo: creditorMissing(res.party, "pismo"),
        wniosek: creditorMissing(res.party, "wniosek"),
      },
      conflictWithContract: creditorConflictsWithContract(res.party, pozyczkodawca),
      error: null,
    };
  } catch (e) {
    console.error("[windykacja] wierzyciel sprawy:", (e as Error).message);
    return {
      party: null,
      missing: { pismo: [], wniosek: [] },
      conflictWithContract: false,
      error: "Nie udało się odczytać danych wierzyciela z profilu inwestora — spróbuj ponownie.",
    };
  }
}

/**
 * Krótkie nazwy wierzycieli wg właściciela sprawy (podpis SMS-a w panelu).
 * Właściciel bez profilu i spoza personelu — pominięty.
 */
export async function windCreditorNames(
  ownerIds: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const ids = [...new Set(ownerIds.filter((id): id is string => !!id))];
  const out: Record<string, string> = {};
  if (!ids.length) return out;
  try {
    const db = await adminDb();
    const resolved = await Promise.all(ids.map((id) => resolveCreditorByUserId(id, { db })));
    for (const res of resolved)
      if (res.ok && res.party.shortName) out[res.ownerId] = res.party.shortName;
  } catch (e) {
    console.error("[windykacja] nazwy wierzycieli:", (e as Error).message);
  }
  return out;
}

/** Migawka wierzyciela do metadata zdarzenia (wind_documents nie ma kolumny metadata). */
export function creditorSnapshot(party: CreditorParty) {
  return {
    kind: party.kind,
    legalName: party.legalName,
    nip: party.nip,
    krs: party.krs,
    source: party.source,
  };
}
