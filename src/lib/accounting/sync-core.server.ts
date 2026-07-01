// Wspólny rdzeń synchronizacji Fakturowo + KSeF (2.0), wywoływany zarówno z
// createServerFn (UI "Synchronizuj teraz"), jak i z hooka cron /api/public/hooks/sync-accounting.
import { accountingDb } from "./db";
import { decryptSensitive } from "@/lib/affiliate/crypto";
import type { KsefEntity } from "@/lib/ksef/client";
import { openKsefSession, closeKsefSession, type KsefSession } from "@/lib/ksef/session";

type SyncResult = { entity: string; direction: "sales" | "purchase"; ok: boolean; count: number; message: string | null };

async function upsertSyncStatus(entityId: string, source: "fakturowo" | "ksef", direction: "sales" | "purchase", ok: boolean, message: string | null, count: number) {
  const now = new Date().toISOString();
  await accountingDb.from("accounting_sync_status").upsert(
    {
      entity_id: entityId,
      source,
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

// ---------------- FAKTUROWO ----------------

function form(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") usp.append(k, String(v));
  return usp.toString();
}

function parseFakturowoList(raw: string): { ok: boolean; documents: Record<string, string>[]; error?: string } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== "1") return { ok: false, documents: [], error: raw.slice(0, 400) };
  const docs: Record<string, string>[] = [];
  let current: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    if (!line) continue;
    if (line === "---") { if (Object.keys(current).length) docs.push(current); current = {}; continue; }
    const eq = line.indexOf("=");
    if (eq > 0) current[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  if (Object.keys(current).length) docs.push(current);
  return { ok: true, documents: docs };
}

const toNum = (v: string | undefined) => (v ? Number(String(v).replace(/\s/g, "").replace(",", ".")) || 0 : 0);
const toDate = (v: string | undefined) => (v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v)?.[0] ?? null : null);

async function fetchFakturowoList(apiId: string, direction: "sales" | "purchase", monthsBack: number) {
  const from = new Date(); from.setMonth(from.getMonth() - monthsBack);
  const body = form({
    api_id: apiId, api_zadanie: 6,
    dokument_rodzaj: direction === "sales" ? 0 : 1,
    dokument_data_wystawienia_od: from.toISOString().slice(0, 10),
    dokument_data_wystawienia_do: new Date().toISOString().slice(0, 10),
  });
  const res = await fetch("https://www.fakturowo.pl/api", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  return parseFakturowoList(await res.text());
}

async function syncFakturowoOne(entity: any, direction: "sales" | "purchase"): Promise<{ ok: boolean; count: number; message: string | null }> {
  const apiId = decryptSensitive(entity.fakturowo_api_id_encrypted) ?? process.env.FAKTUROWO_API_ID;
  if (!apiId) return { ok: false, count: 0, message: "Brak konfiguracji Fakturowo." };
  const listed = await fetchFakturowoList(apiId, direction, 24);
  if (!listed.ok) return { ok: false, count: 0, message: `Fakturowo: ${listed.error}` };
  let inserted = 0;
  for (const d of listed.documents) {
    const externalId = d["dokument_id"] ?? d["id"] ?? d["dokument_numer"];
    if (!externalId) continue;
    const gross = toNum(d["dokument_wartosc_brutto"] ?? d["produkt_wartosc_brutto"]);
    const net = toNum(d["dokument_wartosc_netto"] ?? d["produkt_wartosc_netto"]);
    const vat = Math.round((gross - net) * 100) / 100;
    const row = {
      entity_id: entity.id, direction, source: "fakturowo" as const,
      external_id: String(externalId), invoice_number: d["dokument_numer"] ?? null,
      issue_date: toDate(d["dokument_data_wystawienia"]),
      sale_date: toDate(d["dokument_data_sprzedazy"]) ?? toDate(d["dokument_data_wystawienia"]),
      due_date: toDate(d["dokument_data_platnosci"]),
      counterparty_name: (direction === "sales" ? d["nabywca_nazwa"] : d["sprzedawca_nazwa"]) ?? null,
      counterparty_nip: (direction === "sales" ? d["nabywca_nip"] : d["sprzedawca_nip"]) ?? null,
      counterparty_address: [
        direction === "sales" ? d["nabywca_ulica"] : d["sprzedawca_ulica"],
        direction === "sales" ? d["nabywca_kod"] : d["sprzedawca_kod"],
        direction === "sales" ? d["nabywca_miasto"] : d["sprzedawca_miasto"],
      ].filter(Boolean).join(", ") || null,
      currency: d["dokument_waluta"] || "PLN",
      net_amount: net, vat_amount: vat >= 0 ? vat : 0, gross_amount: gross,
      vat_rate: d["produkt_stawka_vat"] ?? null, pdf_url: d["dokument_pdf"] ?? null,
      raw_payload: d as Record<string, unknown>,
    };
    const { error } = await accountingDb.from("accounting_documents").upsert(row, { onConflict: "entity_id,source,direction,external_id" });
    if (!error) inserted += 1;
  }
  return { ok: true, count: inserted, message: null };
}

// ---------------- KSeF 2.0 ----------------

type InvoiceMeta = Record<string, unknown>;

function pickStr(o: InvoiceMeta, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
    if (v && typeof v === "object") {
      const inner = (v as Record<string, unknown>).value ?? (v as Record<string, unknown>).identifier ?? (v as Record<string, unknown>).name;
      if (typeof inner === "string" && inner) return inner;
    }
  }
  return null;
}
function pickNum(o: InvoiceMeta, ...keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}
function pickDate(o: InvoiceMeta, ...keys: string[]): string | null {
  const s = pickStr(o, ...keys);
  return s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s)?.[0] ?? null : null;
}

async function queryKsefMetadata(s: KsefSession, subjectType: "subject1" | "subject2", monthsBack: number): Promise<InvoiceMeta[]> {
  // KSeF 2.0 wymaga zakresu dat max 3 miesiące — pobieramy w oknach 3-miesięcznych.
  const out: InvoiceMeta[] = [];
  const pageSize = 100;
  const end = new Date();
  const start = new Date(); start.setMonth(start.getMonth() - monthsBack);
  let windowFrom = new Date(start);
  while (windowFrom < end) {
    const windowTo = new Date(windowFrom);
    windowTo.setMonth(windowTo.getMonth() + 3);
    if (windowTo > end) windowTo.setTime(end.getTime());
    const dateFrom = windowFrom.toISOString();
    const dateTo = windowTo.toISOString();
    for (let pageOffset = 0, page = 0; page < 100; page += 1, pageOffset += pageSize) {
      const res = await fetch(`${s.baseUrl}/api/v2/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${s.accessToken}`,
        },
        body: JSON.stringify({
          subjectType,
          dateRange: { dateType: "issue", from: dateFrom, to: dateTo },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`POST /invoices/query/metadata ${res.status}: ${txt.slice(0, 200)}`);
      }
      const j = (await res.json()) as { invoices?: InvoiceMeta[]; items?: InvoiceMeta[]; hasMore?: boolean };
      const list = j.invoices ?? j.items ?? [];
      for (const it of list) out.push(it);
      if (list.length < pageSize) break;
    }
    windowFrom = windowTo;
  }
  return out;
}

async function syncKsefOne(entity: any, direction: "sales" | "purchase"): Promise<{ ok: boolean; count: number; message: string | null }> {
  let s: KsefSession | null = null;
  try {
    s = await openKsefSession(entity as KsefEntity);
    const list = await queryKsefMetadata(s, direction === "sales" ? "subject1" : "subject2", 24);
    let saved = 0;
    for (const it of list) {
      const ref = pickStr(it, "ksefReferenceNumber", "referenceNumber");
      if (!ref) continue;
      const isSales = direction === "sales";
      const cpNameKey = isSales ? ["buyerName", "buyer"] : ["sellerName", "seller"];
      const cpNipKey = isSales ? ["buyerNip", "buyerIdentifier"] : ["sellerNip", "sellerIdentifier"];
      const row = {
        entity_id: entity.id,
        direction,
        source: "ksef" as const,
        external_id: ref,
        invoice_number: pickStr(it, "invoiceNumber", "number"),
        issue_date: pickDate(it, "issueDate", "issuingDate", "invoicingDate"),
        sale_date: pickDate(it, "invoicingDate", "issueDate", "issuingDate"),
        counterparty_name: pickStr(it, ...cpNameKey),
        counterparty_nip: pickStr(it, ...cpNipKey),
        currency: pickStr(it, "currency", "currencyCode") ?? "PLN",
        net_amount: pickNum(it, "netAmount", "net"),
        vat_amount: pickNum(it, "vatAmount", "vat"),
        gross_amount: pickNum(it, "grossAmount", "gross"),
        ksef_reference_number: ref,
        ksef_status: "accepted",
        raw_payload: it as Record<string, unknown>,
      };
      const { error } = await accountingDb.from("accounting_documents").upsert(row, { onConflict: "entity_id,source,direction,external_id" });
      if (!error) saved += 1;
    }
    return { ok: true, count: saved, message: null };
  } catch (e) {
    return { ok: false, count: 0, message: (e as Error).message };
  } finally {
    if (s) await closeKsefSession(s);
  }
}

// ---------------- Orkiestrator ----------------

export async function syncAllAccounting(): Promise<{ results: SyncResult[] }> {
  // Fakturowo wyłączone z cyklicznego syncu — jest tylko jednorazowy import
  // z UI (przycisk „Import Fakturowo"). Cała bieżąca księgowość idzie przez KSeF.
  void syncFakturowoOne;
  const { data: entities } = await accountingDb.from("accounting_entities").select("*").eq("active", true).order("created_at", { ascending: true });
  const results: SyncResult[] = [];
  for (const e of ((entities ?? []) as any[])) {
    for (const dir of ["sales", "purchase"] as const) {
      const rKsef = await syncKsefOne(e, dir);
      await upsertSyncStatus(e.id, "ksef", dir, rKsef.ok, rKsef.message, rKsef.count);
      results.push({ entity: e.name, direction: dir, ...rKsef });
    }
  }
  return { results };
}
