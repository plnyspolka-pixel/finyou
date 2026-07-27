// Wspólny rdzeń synchronizacji księgowości (KSeF 2.0 + Fakturowo.pl), wywoływany zarówno z
// createServerFn (UI "Synchronizuj teraz"), jak i z hooka cron /api/public/hooks/sync-accounting.
import { createHash } from "node:crypto";
import { accountingDb } from "./db";
import { decryptSensitive } from "@/lib/affiliate/crypto";
import type { KsefEntity } from "@/lib/ksef/client";
import { openKsefSession, closeKsefSession, type KsefSession } from "@/lib/ksef/session";

type SyncResult = { entity: string; source: "ksef" | "fakturowo"; direction: "sales" | "purchase"; ok: boolean; count: number; message: string | null; xml_fetched?: number };

// Limity pobierania źródłowego XML na jeden przebieg (per kierunek).
const XML_FETCH_LIMIT_PER_RUN = 40;
const XML_FETCH_DELAY_MS = 250;

async function upsertSyncStatus(entityId: string, source: "ksef" | "fakturowo", direction: "sales" | "purchase", ok: boolean, message: string | null, count: number) {
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Duplikaty w jednej paczce (ten sam external_id) wywalają upsert błędem
// "ON CONFLICT DO UPDATE command cannot affect row a second time" — zostawiamy ostatni wpis.
function dedupeByExternalId(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of rows) byId.set(String(r.external_id), r);
  return Array.from(byId.values());
}

// Fetch z obsługą limitu zapytań KSeF (429/503): ponawia z backoffem, szanuje Retry-After.
async function ksefFetch(url: string, init: RequestInit, attempts = 6): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (res.status !== 429 && res.status !== 503) return res;
      const retryAfter = Number(res.headers.get("Retry-After"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 20000);
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

async function queryKsefMetadata(s: KsefSession, subjectType: "subject1" | "subject2", monthsBack: number): Promise<InvoiceMeta[]> {
  // KSeF 2.0 wymaga zakresu dat max 3 miesiące — pobieramy w oknach 3-miesięcznych,
  // z odstępami między zapytaniami, aby nie wpaść w limit (429 Too Many Requests).
  const out: InvoiceMeta[] = [];
  const pageSize = 100;
  let firstReq = true;
  const end = new Date();
  const start = new Date(); start.setMonth(start.getMonth() - monthsBack);
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
      const res = await ksefFetch(`${s.baseUrl}/api/v2/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`, {
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
      if (list.length < pageSize || j.hasMore === false) break;
    }
    windowFrom = windowTo;
  }
  return out;
}

// Sync jednego kierunku przy WSPÓŁDZIELONEJ sesji (jedna sesja na podmiot → mniej 429).
async function syncKsefWithSession(entity: any, direction: "sales" | "purchase", s: KsefSession): Promise<{ ok: boolean; count: number; message: string | null; xml_fetched?: number }> {
  try {
    const asObj = (v: unknown): InvoiceMeta => (v && typeof v === "object" && !Array.isArray(v) ? (v as InvoiceMeta) : {});
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
      const counterparty_name = pickStr(cp, "name", "fullName", "nazwa", "issuedToName", "issuedByName") ?? pickStr(it, isSales ? "buyerName" : "sellerName");
      const counterparty_nip = pickStr(cp, "nip", "identifier", "value", "taxId", "identifierValue") ?? pickStr(it, isSales ? "buyerNip" : "sellerNip");
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
      const unique = dedupeByExternalId(rows);
      const { error } = await accountingDb.from("accounting_documents").upsert(unique, { onConflict: "entity_id,source,direction,external_id" });
      if (error) return { ok: false, count: 0, message: `Zapis do bazy: ${error.message}` };
      saved = unique.length;
    }
    // Drugi przebieg: pobierz źródłowy XML dla faktur, które go jeszcze nie mają.
    const xmlRes = await fetchMissingInvoiceXml(entity.id, direction, s);
    const diagMsg = xmlRes.tried > 0
      ? `XML: tried=${xmlRes.tried}, fetched=${xmlRes.fetched}${xmlRes.diagnostics.length ? `. ${xmlRes.diagnostics.slice(0, 3).join(" | ")}` : ""}`
      : null;
    return { ok: true, count: saved, message: diagMsg, xml_fetched: xmlRes.fetched };
  } catch (e) {
    return { ok: false, count: 0, message: (e as Error).message };
  }
}

// Pobiera źródłowy XML z KSeF (GET /api/v2/invoices/ksef/{ksefNumber}) dla faktur,
// które jeszcze nie mają zapisanego xml_content. Zwraca liczniki + diagnostykę błędów.
async function fetchMissingInvoiceXml(entityId: string, direction: "sales" | "purchase", s: KsefSession): Promise<{ fetched: number; tried: number; diagnostics: string[] }> {
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
        headers: { Accept: "application/xml, application/octet-stream, */*", Authorization: `Bearer ${s.accessToken}` },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        pushDiag(`HTTP ${res.status} @ ${row.ksef_reference_number}: ${body.slice(0, 160).replace(/\s+/g, " ")}`);
        continue;
      }
      const xml = await res.text();
      if (!xml || !xml.trim()) {
        pushDiag(`empty body @ ${row.ksef_reference_number} (ct=${res.headers.get("content-type") ?? "?"})`);
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

// ---------------- Fakturowo.pl ----------------
// API: https://www.fakturowo.pl/pomoc/api-podstawowe-funkcje — zadanie api_zadanie=3 (lista dokumentów).
// Odpowiedź tekstowa: wiersz 1 = wynik (1/0), wiersz 2 = liczba stron (lub opis błędu przy 0),
// kolejne wiersze (do 100 na stronę, paginacja parametrem p) to pola rozdzielone średnikami:
// api_numer;dokument_rodzaj;dokument_numer;data_wystawienia;data_sprzedazy;waluta;netto;vat;brutto;
// sprzedawca_nazwa;sprzedawca_adres;sprzedawca_nip;nabywca_nazwa;nabywca_adres;nabywca_nip;status;zaplata;termin

const FAKTUROWO_API_URL = "https://www.fakturowo.pl/api";
const FAKTUROWO_MAX_PAGES = 30;

function fakturowoApiId(entity: any): string | null {
  const own = decryptSensitive(entity.fakturowo_api_id_encrypted);
  if (own) return own;
  const name = String(entity.legal_name ?? entity.name ?? "").toLowerCase();
  const shared = process.env.FAKTUROWO_API_ID ?? process.env.FAKTUROWO_API_KEY ?? null;
  if (name.includes("finance you")) return process.env.FAKTUROWO_API_ID_FINANCE_YOU ?? shared;
  if (name.includes("pieczak")) return process.env.FAKTUROWO_API_ID_FUNDACJA_IM_PIECZAKA ?? shared;
  return shared;
}

/** Data Fakturowo (DD-MM-YYYY lub YYYY-MM-DD) → ISO YYYY-MM-DD. */
function fakturowoDate(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return /^(\d{4})-(\d{2})-(\d{2})/.exec(v)?.[0] ?? null;
}

function fakturowoAmount(s: string | undefined): number {
  const n = Number((s ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fakturowoCurrency(s: string | undefined): string {
  const v = (s ?? "").trim();
  if (/^[A-Za-z]{3}$/.test(v)) return v.toUpperCase();
  return "PLN"; // kody liczbowe: 0 = PLN (domyślna waluta konta)
}

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

async function fakturowoFetchPage(apiId: string, page: number, sellerNip: string | null): Promise<string[]> {
  const body = new URLSearchParams({ api_id: apiId, api_zadanie: "3", p: String(page) });
  if (sellerNip) body.set("dokument_sprzedawca", sellerNip);
  const res = await fetch(FAKTUROWO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "text/plain" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Fakturowo HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  if ((lines[0] ?? "").trim() !== "1") {
    throw new Error(`Fakturowo: ${(lines[0] ?? "").trim()}\n${(lines[1] ?? "").trim()}`.trim());
  }
  return lines;
}

// Pobiera pełną listę faktur SPRZEDAŻY z Fakturowo (pracownicy wystawiają tam ręcznie)
// i zapisuje do accounting_documents — dzięki temu publiczna lista i rejestr FV
// aktualizują się automatycznie razem z cronem, bez klikania.
async function syncFakturowoSales(entity: any): Promise<{ ok: boolean; count: number; message: string | null }> {
  try {
    const apiId = fakturowoApiId(entity);
    if (!apiId) {
      return { ok: false, count: 0, message: "Brak klucza API Fakturowo (kolumna fakturowo_api_id_encrypted lub env FAKTUROWO_API_ID)." };
    }
    const sellerNip = onlyDigits(entity.nip) || null;
    const rows: Record<string, unknown>[] = [];
    let pages = 1;
    for (let p = 1; p <= Math.min(pages, FAKTUROWO_MAX_PAGES); p += 1) {
      if (p > 1) await sleep(300);
      const lines = await fakturowoFetchPage(apiId, p, sellerNip);
      const declaredPages = Number((lines[1] ?? "").trim());
      if (Number.isFinite(declaredPages) && declaredPages > 0) pages = declaredPages;
      for (const line of lines.slice(2)) {
        if (!line.trim()) continue;
        const f = line.split(";");
        const externalId = (f[0] ?? "").trim();
        if (!/^\d+$/.test(externalId)) continue;
        // Filtr sprzedawcy po stronie API + weryfikacja lokalna (gdy API zwróci szerzej).
        const rowSellerNip = onlyDigits(f[11]);
        if (sellerNip && rowSellerNip && rowSellerNip !== sellerNip) continue;
        const issueDate = fakturowoDate(f[3]);
        rows.push({
          entity_id: entity.id,
          direction: "sales",
          source: "fakturowo",
          external_id: externalId,
          invoice_number: (f[2] ?? "").trim() || null,
          issue_date: issueDate,
          sale_date: fakturowoDate(f[4]) ?? issueDate,
          counterparty_name: (f[12] ?? "").trim() || null,
          counterparty_nip: onlyDigits(f[14]) || null,
          currency: fakturowoCurrency(f[5]),
          net_amount: fakturowoAmount(f[6]),
          vat_amount: fakturowoAmount(f[7]),
          gross_amount: fakturowoAmount(f[8]) || fakturowoAmount(f[6]),
          raw_payload: {
            dokument_id: externalId,
            dokument_rodzaj: (f[1] ?? "").trim(),
            dokument_numer: (f[2] ?? "").trim(),
            dokument_data_wystawienia: (f[3] ?? "").trim(),
            dokument_data_sprzedazy: (f[4] ?? "").trim(),
            dokument_waluta: (f[5] ?? "").trim(),
            dokument_wartosc_netto: (f[6] ?? "").trim(),
            dokument_wartosc_vat: (f[7] ?? "").trim(),
            dokument_wartosc_brutto: (f[8] ?? "").trim(),
            sprzedawca_nazwa: (f[9] ?? "").trim(),
            sprzedawca_ulica: (f[10] ?? "").trim(),
            sprzedawca_nip: rowSellerNip,
            nabywca_nazwa: (f[12] ?? "").trim(),
            nabywca_ulica: (f[13] ?? "").trim(),
            nabywca_nip: onlyDigits(f[14]),
            dokument_status: (f[15] ?? "").trim(),
            dokument_zaplata: (f[16] ?? "").trim(),
            dokument_termin: (f[17] ?? "").trim(),
          },
        });
      }
    }
    let saved = 0;
    if (rows.length) {
      const unique = dedupeByExternalId(rows);
      const { error } = await accountingDb.from("accounting_documents").upsert(unique, { onConflict: "entity_id,source,direction,external_id" });
      if (error) return { ok: false, count: 0, message: `Zapis do bazy: ${error.message}` };
      saved = unique.length;
    }
    return { ok: true, count: saved, message: null };
  } catch (e) {
    return { ok: false, count: 0, message: (e as Error).message };
  }
}

// ---------------- Orkiestrator ----------------

export async function syncAllAccounting(): Promise<{ results: SyncResult[] }> {
  // Bieżąca księgowość: KSeF (sprzedaż + koszty) oraz Fakturowo.pl (sprzedaż wystawiana ręcznie).
  const { data: entities } = await accountingDb.from("accounting_entities").select("*").eq("active", true).order("created_at", { ascending: true });
  const results: SyncResult[] = [];
  for (const e of ((entities ?? []) as any[])) {
    // Fakturowo — tylko sprzedaż (tam pracownicy wystawiają faktury ręcznie).
    const rFak = await syncFakturowoSales(e);
    await upsertSyncStatus(e.id, "fakturowo", "sales", rFak.ok, rFak.message, rFak.count);
    results.push({ entity: e.name, source: "fakturowo", direction: "sales", ...rFak });
  }
  for (const e of ((entities ?? []) as any[])) {
    // Jedna sesja KSeF na podmiot dla obu kierunków (mniej wywołań auth → mniej 429).
    let session: KsefSession | null = null;
    try {
      session = await openKsefSession(e as KsefEntity);
    } catch (err) {
      for (const dir of ["sales", "purchase"] as const) {
        await upsertSyncStatus(e.id, "ksef", dir, false, (err as Error).message, 0);
        results.push({ entity: e.name, source: "ksef", direction: dir, ok: false, count: 0, message: (err as Error).message });
      }
      await sleep(1500);
      continue;
    }
    try {
      for (const dir of ["sales", "purchase"] as const) {
        const rKsef = await syncKsefWithSession(e, dir, session);
        await upsertSyncStatus(e.id, "ksef", dir, rKsef.ok, rKsef.message, rKsef.count);
        results.push({ entity: e.name, source: "ksef", direction: dir, ...rKsef });
        await sleep(700); // odstęp między kierunkami
      }
    } finally {
      await closeKsefSession(session);
    }
    await sleep(1500); // odstęp między podmiotami
  }
  return { results };
}
