// Wspólny rdzeń synchronizacji KSeF (2.0), wywoływany zarówno z
// createServerFn (UI "Synchronizuj teraz"), jak i z hooka cron /api/public/hooks/sync-accounting.
import { createHash } from "node:crypto";
import { accountingDb } from "./db";
import type { KsefEntity } from "@/lib/ksef/client";
import { openKsefSession, closeKsefSession, type KsefSession } from "@/lib/ksef/session";

type SyncResult = {
  entity: string;
  direction: "sales" | "purchase";
  ok: boolean;
  count: number;
  message: string | null;
  xml_fetched?: number;
};

// Limity pobierania źródłowego XML na jeden przebieg (per kierunek).
const XML_FETCH_LIMIT_PER_RUN = 40;
const XML_FETCH_DELAY_MS = 250;

async function upsertSyncStatus(
  entityId: string,
  source: "ksef",
  direction: "sales" | "purchase",
  ok: boolean,
  message: string | null,
  count: number,
) {
  const now = new Date().toISOString();
  await accountingDb.from("accounting_sync_status").upsert(
    {
      entity_id: entityId,
      source,
      direction,
      last_run_at: now,
      last_success_at: ok ? now : null,
      last_error: message,
      documents_synced: count,
      updated_at: now,
    },
    { onConflict: "entity_id,source,direction" },
  );
}

// ---------------- KSeF 2.0 ----------------

type InvoiceMeta = Record<string, unknown>;

function pickStr(o: InvoiceMeta, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
    if (v && typeof v === "object") {
      const inner =
        (v as Record<string, unknown>).value ??
        (v as Record<string, unknown>).identifier ??
        (v as Record<string, unknown>).name;
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
  return s ? (/^(\d{4})-(\d{2})-(\d{2})/.exec(s)?.[0] ?? null) : null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Fetch z obsługą limitu zapytań KSeF (429/503): ponawia z backoffem, szanuje Retry-After.
async function ksefFetch(url: string, init: RequestInit, attempts = 6): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (res.status !== 429 && res.status !== 503) return res;
      const retryAfter = Number(res.headers.get("Retry-After"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2000 * 2 ** attempt, 20000);
      await res.text().catch(() => "");
      await sleep(wait + Math.floor(Math.random() * 400));
    } catch (e) {
      lastErr = e;
      await sleep(Math.min(2000 * 2 ** attempt, 20000));
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("KSeF: przekroczono limit prób (429 Too Many Requests).");
}

async function queryKsefMetadata(
  s: KsefSession,
  subjectType: "subject1" | "subject2",
  monthsBack: number,
): Promise<InvoiceMeta[]> {
  // KSeF 2.0 wymaga zakresu dat max 3 miesiące — pobieramy w oknach 3-miesięcznych,
  // z odstępami między zapytaniami, aby nie wpaść w limit (429 Too Many Requests).
  const out: InvoiceMeta[] = [];
  const pageSize = 100;
  let firstReq = true;
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - monthsBack);
  let windowFrom = new Date(start);
  while (windowFrom < end) {
    const windowTo = new Date(windowFrom);
    windowTo.setMonth(windowTo.getMonth() + 3);
    if (windowTo > end) windowTo.setTime(end.getTime());
    const dateFrom = windowFrom.toISOString();
    const dateTo = windowTo.toISOString();
    for (let pageOffset = 0, page = 0; page < 20; page += 1, pageOffset += pageSize) {
      if (!firstReq) await sleep(300); // throttling między zapytaniami metadanych
      firstReq = false;
      const res = await ksefFetch(
        `${s.baseUrl}/api/v2/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`,
        {
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
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`POST /invoices/query/metadata ${res.status}: ${txt.slice(0, 200)}`);
      }
      const j = (await res.json()) as {
        invoices?: InvoiceMeta[];
        items?: InvoiceMeta[];
        hasMore?: boolean;
      };
      const list = j.invoices ?? j.items ?? [];
      for (const it of list) out.push(it);
      if (list.length < pageSize || j.hasMore === false) break;
    }
    windowFrom = windowTo;
  }
  return out;
}

// Sync jednego kierunku przy WSPÓŁDZIELONEJ sesji (jedna sesja na podmiot → mniej 429).
async function syncKsefWithSession(
  entity: any,
  direction: "sales" | "purchase",
  s: KsefSession,
): Promise<{ ok: boolean; count: number; message: string | null; xml_fetched?: number }> {
  try {
    const asObj = (v: unknown): InvoiceMeta =>
      v && typeof v === "object" && !Array.isArray(v) ? (v as InvoiceMeta) : {};
    const list = await queryKsefMetadata(s, direction === "sales" ? "subject1" : "subject2", 24);
    const isSales = direction === "sales";
    const rows: Record<string, unknown>[] = [];
    for (const it of list) {
      // KSeF 2.0: numer identyfikujący fakturę to „ksefNumber".
      const ref = pickStr(it, "ksefNumber", "ksefReferenceNumber", "referenceNumber");
      const num = pickStr(it, "invoiceNumber", "number");
      const externalId = ref ?? num;
      if (!externalId) continue;
      // Kontrahent to obiekt seller/buyer (dla sprzedaży = buyer, dla kosztów = seller).
      const cp = isSales ? asObj(it.buyer ?? it.subjectTo) : asObj(it.seller ?? it.subjectBy);
      const counterparty_name =
        pickStr(cp, "name", "fullName", "nazwa", "issuedToName", "issuedByName") ??
        pickStr(it, isSales ? "buyerName" : "sellerName");
      const counterparty_nip =
        pickStr(cp, "nip", "identifier", "value", "taxId", "identifierValue") ??
        pickStr(it, isSales ? "buyerNip" : "sellerNip");
      rows.push({
        entity_id: entity.id,
        direction,
        source: "ksef",
        external_id: externalId,
        invoice_number: num,
        issue_date: pickDate(it, "issueDate", "invoicingDate", "acquisitionDate"),
        sale_date: pickDate(it, "invoicingDate", "issueDate"),
        counterparty_name,
        counterparty_nip,
        currency: pickStr(it, "currency", "currencyCode") ?? "PLN",
        net_amount: pickNum(it, "netAmount", "net"),
        vat_amount: pickNum(it, "vatAmount", "vat"),
        gross_amount: pickNum(it, "grossAmount", "gross"),
        ksef_reference_number: ref,
        ksef_status: "accepted",
        raw_payload: it as Record<string, unknown>,
      });
    }
    let saved = 0;
    if (rows.length) {
      // Zapis wsadowy — jeden upsert zamiast N (unika przekroczenia limitu czasu funkcji).
      const { error } = await accountingDb
        .from("accounting_documents")
        .upsert(rows, { onConflict: "entity_id,source,direction,external_id" });
      if (error) return { ok: false, count: 0, message: `Zapis do bazy: ${error.message}` };
      saved = rows.length;
    }
    // Drugi przebieg: pobierz źródłowy XML dla faktur, które go jeszcze nie mają.
    const xmlRes = await fetchMissingInvoiceXml(entity.id, direction, s);
    const diagMsg =
      xmlRes.tried > 0
        ? `XML: tried=${xmlRes.tried}, fetched=${xmlRes.fetched}${xmlRes.diagnostics.length ? `. ${xmlRes.diagnostics.slice(0, 3).join(" | ")}` : ""}`
        : null;
    return { ok: true, count: saved, message: diagMsg, xml_fetched: xmlRes.fetched };
  } catch (e) {
    return { ok: false, count: 0, message: (e as Error).message };
  }
}

// Pobiera źródłowy XML z KSeF (GET /api/v2/invoices/ksef/{ksefNumber}) dla faktur,
// które jeszcze nie mają zapisanego xml_content. Zwraca liczniki + diagnostykę błędów.
async function fetchMissingInvoiceXml(
  entityId: string,
  direction: "sales" | "purchase",
  s: KsefSession,
): Promise<{ fetched: number; tried: number; diagnostics: string[] }> {
  const { data: pending } = await accountingDb
    .from("accounting_documents")
    .select("id, ksef_reference_number")
    .eq("entity_id", entityId)
    .eq("direction", direction)
    .eq("source", "ksef")
    .not("ksef_reference_number", "is", null)
    .is("xml_content", null)
    .order("issue_date", { ascending: false })
    .limit(XML_FETCH_LIMIT_PER_RUN);
  const list = (pending ?? []) as Array<{ id: string; ksef_reference_number: string }>;
  let fetched = 0;
  const diagnostics: string[] = [];
  const pushDiag = (msg: string) => {
    if (diagnostics.length < 5) diagnostics.push(msg);
  };
  for (const row of list) {
    if (!row.ksef_reference_number) continue;
    try {
      await sleep(XML_FETCH_DELAY_MS);
      const url = `${s.baseUrl}/api/v2/invoices/ksef/${encodeURIComponent(row.ksef_reference_number)}`;
      const res = await ksefFetch(url, {
        method: "GET",
        headers: {
          Accept: "application/xml, application/octet-stream, */*",
          Authorization: `Bearer ${s.accessToken}`,
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        pushDiag(
          `HTTP ${res.status} @ ${row.ksef_reference_number}: ${body.slice(0, 160).replace(/\s+/g, " ")}`,
        );
        continue;
      }
      const xml = await res.text();
      if (!xml || !xml.trim()) {
        pushDiag(
          `empty body @ ${row.ksef_reference_number} (ct=${res.headers.get("content-type") ?? "?"})`,
        );
        continue;
      }
      const metaHash = res.headers.get("x-ms-meta-hash");
      if (metaHash) {
        const actual = createHash("sha256").update(xml, "utf8").digest("base64");
        if (actual !== metaHash.trim()) {
          pushDiag(`hash mismatch @ ${row.ksef_reference_number}`);
          continue;
        }
      }
      const { error: upErr } = await accountingDb
        .from("accounting_documents")
        .update({ xml_content: xml, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) {
        pushDiag(`DB update err @ ${row.ksef_reference_number}: ${upErr.message}`);
      } else {
        fetched += 1;
      }
    } catch (e) {
      pushDiag(`exception @ ${row.ksef_reference_number}: ${(e as Error).message}`);
    }
  }
  return { fetched, tried: list.length, diagnostics };
}

// ---------------- Orkiestrator ----------------

export async function syncAllAccounting(): Promise<{ results: SyncResult[] }> {
  // Cała bieżąca księgowość idzie przez KSeF.
  const { data: entities } = await accountingDb
    .from("accounting_entities")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });
  const results: SyncResult[] = [];
  for (const e of (entities ?? []) as any[]) {
    // Jedna sesja KSeF na podmiot dla obu kierunków (mniej wywołań auth → mniej 429).
    let session: KsefSession | null = null;
    try {
      session = await openKsefSession(e as KsefEntity);
    } catch (err) {
      for (const dir of ["sales", "purchase"] as const) {
        await upsertSyncStatus(e.id, "ksef", dir, false, (err as Error).message, 0);
        results.push({
          entity: e.name,
          direction: dir,
          ok: false,
          count: 0,
          message: (err as Error).message,
        });
      }
      await sleep(1500);
      continue;
    }
    try {
      for (const dir of ["sales", "purchase"] as const) {
        const rKsef = await syncKsefWithSession(e, dir, session);
        await upsertSyncStatus(e.id, "ksef", dir, rKsef.ok, rKsef.message, rKsef.count);
        results.push({ entity: e.name, direction: dir, ...rKsef });
        await sleep(700); // odstęp między kierunkami
      }
    } finally {
      await closeKsefSession(session);
    }
    await sleep(1500); // odstęp między podmiotami
  }
  return { results };
}
