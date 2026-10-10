// Synchronizacja tożsamości klienta z CEIDG — jedno źródło wyniku CEIDG dla
// modułu współwłaścicieli i analizy ryzyka (pkt 3 zlecenia „przypadki
// graniczne"). Wynik zapytania po NIP zapisujemy w clients.ceidg_snapshot;
// oba moduły czytają go zamiast pytać CEIDG osobno (dziś jeden szukał po
// nazwisku z KW i znalazł wykreśloną spółkę, drugi aktywną JDG).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyCeidg,
  freshCeidgSnapshot,
  lookupCeidgActivity,
  type CeidgSnapshot,
} from "@/lib/risk-assessment/ceidg-lookup.server";
import type { CeidgActivity } from "@/lib/risk-assessment/types";
import { dopiszPoprzednieNazwisko, porownajZCeidg, type PorownanieCeidg } from "./identity-core";

const CLIENT_SELECT =
  "id, first_name, last_name, nip, pesel, city, previous_names, name_history, ceidg_snapshot";

function nip10(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 10 ? d : null;
}

/**
 * Wynik CEIDG dla klienta: świeży zapis z clients.ceidg_snapshot albo nowe
 * zapytanie po NIP (zapisywane). Bez NIP — `null` (nie szukamy po nazwisku:
 * nazwisko z KW bywa nieaktualne).
 */
export async function ceidgKlienta(
  s: SupabaseClient,
  client: {
    id: string;
    nip?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    ceidg_snapshot?: unknown;
  },
  opts: { force?: boolean } = {},
): Promise<CeidgActivity | null> {
  const nip = nip10(client.nip);
  if (!nip) return null;
  if (!opts.force) {
    const cached = freshCeidgSnapshot(client.ceidg_snapshot, nip);
    if (cached) return cached;
  }
  const activity = await lookupCeidgActivity({
    firstName: client.first_name ?? null,
    lastName: client.last_name ?? null,
    nip,
  }).catch((e: any) => emptyCeidg(`Błąd sprawdzenia CEIDG: ${e?.message ?? "nieznany"}.`, "nip"));
  if (activity.available) {
    const snapshot: CeidgSnapshot = { nip, checkedAt: new Date().toISOString(), activity };
    await (s as any)
      .from("clients")
      .update({ ceidg_snapshot: snapshot, ceidg_checked_at: snapshot.checkedAt })
      .eq("id", client.id);
  }
  return activity;
}

export interface SynchronizacjaTozsamosci {
  ceidg: CeidgActivity | null;
  porownanie: PorownanieCeidg;
  /** Zastosowana zmiana nazwiska (clients.last_name ← CEIDG). */
  zmianaNazwiska: { z: string; na: string } | null;
  notes: string[];
}

/**
 * Pobiera CEIDG po NIP klienta, porównuje imię/nazwisko/miasto i — gdy wpis
 * jest pewny (NIP, aktywna JDG) a imię zgodne — aktualizuje `clients.last_name`
 * na nazwisko z CEIDG, poprzednie zapisując w `clients.previous_names`
 * (+ wpis w `clients.name_history` i `audit_logs`). Pozostałe rozbieżności
 * zwraca jako propozycje dla operatora (nie nadpisuje).
 */
export async function synchronizujTozsamoscZCeidg(
  s: SupabaseClient,
  clientId: string,
  opts: { force?: boolean; actorId?: string | null; zastosuj?: boolean } = {},
): Promise<SynchronizacjaTozsamosci> {
  const notes: string[] = [];
  const { data: c, error } = await (s as any)
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(`clients: ${error.message}`);
  if (!c) throw new Error("Nie znaleziono klienta.");

  const ceidg = await ceidgKlienta(s, c, { force: opts.force });
  if (!ceidg) notes.push("Brak NIP klienta — nie porównano danych z CEIDG.");
  const porownanie = porownajZCeidg(c, ceidg);
  let zmianaNazwiska: SynchronizacjaTozsamosci["zmianaNazwiska"] = null;

  if (porownanie.zmianaNazwiska && opts.zastosuj !== false) {
    const { z, na } = porownanie.zmianaNazwiska;
    const teraz = new Date().toISOString();
    const historia = Array.isArray(c.name_history) ? c.name_history : [];
    const { error: upErr } = await (s as any)
      .from("clients")
      .update({
        last_name: na,
        previous_names: dopiszPoprzednieNazwisko(c.previous_names, z, na),
        name_history: [
          ...historia,
          { at: teraz, field: "last_name", from: z, to: na, source: "CEIDG", nip: nip10(c.nip) },
        ],
      })
      .eq("id", clientId);
    if (upErr) throw new Error(`clients: ${upErr.message}`);
    await (s as any).from("audit_logs").insert({
      action: "client_name_synced_from_ceidg",
      object_type: "client",
      object_id: clientId,
      user_id: opts.actorId ?? null,
      previous_value: { last_name: z },
      new_value: { last_name: na, source: "CEIDG", nip: nip10(c.nip) },
    });
    zmianaNazwiska = { z, na };
    notes.push(
      `Nazwisko klienta zaktualizowane z CEIDG: „${z}” → „${na}” (poprzednie zapisane w previous_names).`,
    );
  }
  for (const p of porownanie.propozycje) {
    if (p.pole === "last_name" && zmianaNazwiska) continue;
    notes.push(
      `CEIDG: ${p.pole} = „${p.z_ceidg}” (w kartotece: „${p.obecnie ?? "—"}”) — do weryfikacji.`,
    );
  }
  return { ceidg, porownanie, zmianaNazwiska, notes };
}
