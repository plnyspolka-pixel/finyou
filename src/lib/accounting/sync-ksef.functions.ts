// Sync z KSeF → accounting_documents. Pobiera faktury sprzedaży (Subject1) i kosztowe (Subject2).
// Uwaga: realny pull wymaga sekretu KSEF_MF_PUBLIC_KEY do otwarcia sesji. Jeśli go nie ma,
// zapisujemy błąd w accounting_sync_status i zwracamy ok=false.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountingDb, assertAccounting } from "./db";
import { openKsefSession, closeKsefSession, type KsefSession } from "@/lib/ksef/session";

async function upsertSyncStatus(entityId: string, direction: "sales" | "purchase", ok: boolean, message: string | null, count: number) {
  const now = new Date().toISOString();
  await accountingDb.from("accounting_sync_status").upsert(
    {
      entity_id: entityId,
      source: "ksef",
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

/** Zwraca listę numerów KSeF przez Query API (paginowana). */
async function queryInvoiceRefs(session: KsefSession, subjectType: "subject1" | "subject2", monthsBack: number): Promise<string[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);
  const dateFrom = from.toISOString();
  const dateTo = new Date().toISOString();
  const refs: string[] = [];
  let pageOffset = 0;
  const pageSize = 100;
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`${session.baseUrl}/api/online/Query/Invoice/Sync?PageSize=${pageSize}&PageOffset=${pageOffset}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", SessionToken: session.sessionToken },
      body: JSON.stringify({
        queryCriteria: {
          subjectType,
          type: "range",
          acquisitionTimestampThresholdFrom: dateFrom,
          acquisitionTimestampThresholdTo: dateTo,
        },
      }),
    });
    if (!res.ok) throw new Error(`Query/Invoice/Sync ${res.status}`);
    const json = (await res.json()) as { invoiceHeaderList?: Array<{ ksefReferenceNumber?: string }>; numberOfElements?: number };
    const list = json.invoiceHeaderList ?? [];
    for (const it of list) if (it.ksefReferenceNumber) refs.push(it.ksefReferenceNumber);
    if (list.length < pageSize) break;
    pageOffset += pageSize;
  }
  return refs;
}

/** Pobiera XML faktury z KSeF. */
async function fetchInvoiceXml(session: KsefSession, ksefRef: string): Promise<string | null> {
  const res = await fetch(`${session.baseUrl}/api/online/Invoice/Get/${encodeURIComponent(ksefRef)}`, {
    method: "GET",
    headers: { SessionToken: session.sessionToken, Accept: "application/octet-stream" },
  });
  if (!res.ok) return null;
  return await res.text();
}

/** Prosta ekstrakcja pól z XML FA(2) — bez pełnego parsera; wystarcza do rejestru. */
function extractFromFaXml(xml: string): {
  invoice_number: string | null;
  issue_date: string | null;
  sale_date: string | null;
  net: number; vat: number; gross: number;
  counterparty_name: string | null; counterparty_nip: string | null;
} {
  const pick = (tag: string) => {
    const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i").exec(xml);
    return m ? m[1].trim() : null;
  };
  const num = (s: string | null) => (s ? Number(String(s).replace(",", ".")) || 0 : 0);
  // Nazwa nabywcy/sprzedawcy — bierzemy oba, wypełni kod wyżej.
  return {
    invoice_number: pick("P_2") || pick("KodFormularza"),
    issue_date: pick("P_1") || null,
    sale_date: pick("P_6") || null,
    net: num(pick("P_13_1") ?? pick("P_13")),
    vat: num(pick("P_14_1") ?? pick("P_14")),
    gross: num(pick("P_15")),
    counterparty_name: pick("Nazwa") || pick("PelnaNazwa"),
    counterparty_nip: pick("NIP"),
  };
}

async function syncOneKsef(entity: any, direction: "sales" | "purchase"): Promise<{ ok: boolean; count: number; message: string | null }> {
  let session: KsefSession | null = null;
  try {
    session = await openKsefSession(entity as any);
    const subjectType = direction === "sales" ? "subject1" : "subject2";
    const refs = await queryInvoiceRefs(session, subjectType, 24);
    let saved = 0;
    for (const ref of refs) {
      const xml = await fetchInvoiceXml(session, ref);
      if (!xml) continue;
      const ex = extractFromFaXml(xml);
      const row = {
        entity_id: entity.id,
        direction,
        source: "ksef" as const,
        external_id: ref,
        invoice_number: ex.invoice_number,
        issue_date: ex.issue_date,
        sale_date: ex.sale_date,
        counterparty_name: ex.counterparty_name,
        counterparty_nip: ex.counterparty_nip,
        currency: "PLN",
        net_amount: ex.net,
        vat_amount: ex.vat,
        gross_amount: ex.gross,
        xml_content: xml,
        ksef_reference_number: ref,
        ksef_status: "accepted",
      };
      const { error } = await accountingDb.from("accounting_documents").upsert(row, { onConflict: "entity_id,source,direction,external_id" });
      if (!error) saved += 1;
    }
    return { ok: true, count: saved, message: null };
  } catch (e) {
    return { ok: false, count: 0, message: (e as Error).message };
  } finally {
    if (session) await closeKsefSession(session);
  }
}

export const syncKsef = createServerFn({ method: "POST" })
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
        const r = await syncOneKsef(e, dir);
        await upsertSyncStatus(e.id, dir, r.ok, r.message, r.count);
        results.push({ entity: e.name, direction: dir, ...r });
      }
    }
    return { ok: true, results };
  });
