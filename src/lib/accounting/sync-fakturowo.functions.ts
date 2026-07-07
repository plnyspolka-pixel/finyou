// Sync z Fakturowo → accounting_documents. Pobiera fakturę sprzedaży i kosztowe.
// API Fakturowo używa POST x-www-form-urlencoded z api_zadanie:
//   6 = lista dokumentów, 5 = pobranie szczegółów (opcjonalnie).
// Dokumentacja: https://www.fakturowo.pl/api
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountingDb, assertAccounting } from "./db";
import { decryptSensitive } from "@/lib/affiliate/crypto";

function form(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") usp.append(k, String(v));
  return usp.toString();
}

async function upsertSyncStatus(entityId: string, direction: "sales" | "purchase", ok: boolean, message: string | null, count: number) {
  const now = new Date().toISOString();
  await accountingDb.from("accounting_sync_status").upsert(
    {
      entity_id: entityId,
      source: "fakturowo",
      direction,
      last_run_at: now,
      last_success_at: ok ? now : null,
      last_error: ok ? null : message,
      documents_synced: count,
      updated_at: now,
    },
    { onConflict: "entity_id,source,direction" },
  );
}

/**
 * Parsuje listę dokumentów Fakturowo (api_zadanie=3).
 * Linia 0 = "1" (ok) / "0" (błąd), linia 1 = liczba stron, kolejne linie = dokumenty
 * rozdzielone średnikami: api_numer;rodzaj;numer;data_wyst;data_sprz;waluta;netto;vat;brutto;
 * sprzedawca_nazwa;adres_sprzedawcy;sprzedawca_nip;nabywca_nazwa;adres_nabywcy;nabywca_nip;status;zaplata;termin
 */
function parseFakturowoList(raw: string): { ok: boolean; totalPages: number; documents: Record<string, string>[]; error?: string } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== "1") return { ok: false, totalPages: 0, documents: [], error: raw.slice(0, 400) || "Nieznany błąd Fakturowo" };
  const totalPages = Number(lines[1]) || 1;
  const documents: Record<string, string>[] = [];
  for (const line of lines.slice(2)) {
    if (!line) continue;
    const c = line.split(";");
    documents.push({
      dokument_id: c[0] ?? "",
      dokument_rodzaj: c[1] ?? "",
      dokument_numer: c[2] ?? "",
      dokument_data_wystawienia: c[3] ?? "",
      dokument_data_sprzedazy: c[4] ?? "",
      dokument_waluta: c[5] ?? "",
      dokument_wartosc_netto: c[6] ?? "",
      dokument_wartosc_brutto: c[8] ?? "",
      sprzedawca_nazwa: c[9] ?? "",
      sprzedawca_ulica: c[10] ?? "",
      sprzedawca_nip: c[11] ?? "",
      nabywca_nazwa: c[12] ?? "",
      nabywca_ulica: c[13] ?? "",
      nabywca_nip: c[14] ?? "",
    });
  }
  return { ok: true, totalPages, documents };
}

function toNum(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Pobiera WSZYSTKIE wystawione dokumenty z Fakturowo (api_zadanie=3, stronicowane po 100).
async function fetchFakturowoDocuments(apiId: string): Promise<{ ok: boolean; documents: Record<string, string>[]; error?: string }> {
  const all: Record<string, string>[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetch("https://www.fakturowo.pl/api", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ api_id: apiId, api_zadanie: 3, p: page }),
    });
    const parsed = parseFakturowoList(await res.text());
    if (!parsed.ok) return { ok: false, documents: [], error: parsed.error };
    all.push(...parsed.documents);
    totalPages = parsed.totalPages;
    page += 1;
  } while (page <= totalPages && page <= 50);
  return { ok: true, documents: all };
}

async function syncOne(entity: any, direction: "sales" | "purchase"): Promise<{ ok: boolean; count: number; message: string | null }> {
  const apiId = decryptSensitive(entity.fakturowo_api_id_encrypted) ?? process.env.FAKTUROWO_API_ID;
  if (!apiId) return { ok: false, count: 0, message: "Brak konfiguracji Fakturowo dla podmiotu." };

  // Fakturowo przechowuje tylko dokumenty WYSTAWIONE (sprzedaż). Kosztów nie udostępnia
  // przez API — pobieramy je z KSeF (kierunek „purchase").
  if (direction === "purchase") {
    return { ok: true, count: 0, message: "Fakturowo nie udostępnia kosztów przez API — koszty pobierane z KSeF." };
  }

  const listed = await fetchFakturowoDocuments(apiId);
  if (!listed.ok) return { ok: false, count: 0, message: `Fakturowo: ${listed.error}` };

  let inserted = 0;
  for (const d of listed.documents) {
    const externalId = d["dokument_id"] ?? d["id"] ?? d["dokument_numer"];
    if (!externalId) continue;
    const gross = toNum(d["dokument_wartosc_brutto"] ?? d["produkt_wartosc_brutto"]);
    const net = toNum(d["dokument_wartosc_netto"] ?? d["produkt_wartosc_netto"]);
    const vat = Math.round((gross - net) * 100) / 100;
    const row = {
      entity_id: entity.id,
      direction,
      source: "fakturowo" as const,
      external_id: String(externalId),
      invoice_number: d["dokument_numer"] ?? null,
      issue_date: toDate(d["dokument_data_wystawienia"]),
      sale_date: toDate(d["dokument_data_sprzedazy"]) ?? toDate(d["dokument_data_wystawienia"]),
      due_date: toDate(d["dokument_data_platnosci"]),
      counterparty_name: (direction === "sales" ? d["nabywca_nazwa"] : d["sprzedawca_nazwa"]) ?? null,
      counterparty_nip: (direction === "sales" ? d["nabywca_nip"] : d["sprzedawca_nip"]) ?? null,
      counterparty_address:
        [
          direction === "sales" ? d["nabywca_ulica"] : d["sprzedawca_ulica"],
          direction === "sales" ? d["nabywca_kod"] : d["sprzedawca_kod"],
          direction === "sales" ? d["nabywca_miasto"] : d["sprzedawca_miasto"],
        ]
          .filter(Boolean)
          .join(", ") || null,
      currency: d["dokument_waluta"] || "PLN",
      net_amount: net,
      vat_amount: vat >= 0 ? vat : 0,
      gross_amount: gross,
      vat_rate: d["produkt_stawka_vat"] ?? null,
      pdf_url: d["dokument_pdf"] ?? null,
      raw_payload: d as Record<string, unknown>,
    };
    const { error } = await accountingDb.from("accounting_documents").upsert(row, { onConflict: "entity_id,source,direction,external_id" });
    if (!error) inserted += 1;
  }
  return { ok: true, count: inserted, message: null };
}

export const syncFakturowo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ entityId: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    let q = accountingDb.from("accounting_entities").select("*").eq("active", true);
    if (data.entityId) q = q.eq("id", data.entityId);
    const { data: entities } = await q;
    const results: Array<{ entity: string; direction: string; ok: boolean; count: number; message: string | null }> = [];
    for (const e of (entities ?? []) as any[]) {
      for (const dir of ["sales", "purchase"] as const) {
        const r = await syncOne(e, dir);
        await upsertSyncStatus(e.id, dir, r.ok, r.message, r.count);
        results.push({ entity: e.name, direction: dir, ...r });
      }
    }
    return { ok: true, results };
  });
