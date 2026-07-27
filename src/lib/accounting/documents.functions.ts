// Odczyty dla widoku "Dokumenty księgowe" (jeden rejestr FV — sprzedaż i koszty, KSeF).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zipSync, strToU8 } from "fflate";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountingDb, assertAccounting } from "./db";

export const listAccountingDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        entityId: z.string().uuid().optional(),
        direction: z.enum(["sales", "purchase"]).optional(),
        source: z.enum(["ksef", "manual"]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(2000).default(500),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    let q = accountingDb
      .from("accounting_documents")
      .select("*")
      .order("issue_date", { ascending: false })
      .limit(data.limit);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.direction) q = q.eq("direction", data.direction);
    if (data.source) q = q.eq("source", data.source);
    if (data.from) q = q.gte("issue_date", data.from);
    if (data.to) q = q.lte("issue_date", data.to);
    if (data.search)
      q = q.or(
        `invoice_number.ilike.%${data.search}%,counterparty_name.ilike.%${data.search}%,counterparty_nip.ilike.%${data.search}%`,
      );
    const { data: docs } = await q;

    const { data: ents } = await accountingDb.from("accounting_entities").select("id,name");
    const nameMap: Record<string, string> = {};
    for (const e of (ents ?? []) as any[]) nameMap[e.id] = e.name;

    return (docs ?? []).map((d: any) => ({
      ...d,
      xml_content: undefined,
      has_xml: !!d.xml_content,
      entity_name: nameMap[d.entity_id] ?? "—",
    }));
  });

export const getAccountingSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccounting(accountingDb, context.userId);
    const { data } = await accountingDb
      .from("accounting_sync_status")
      .select("*")
      .order("updated_at", { ascending: false });
    const { data: ents } = await accountingDb.from("accounting_entities").select("id,name");
    const nameMap: Record<string, string> = {};
    for (const e of (ents ?? []) as any[]) nameMap[e.id] = e.name;
    return (data ?? []).map((r: any) => ({ ...r, entity_name: nameMap[r.entity_id] ?? "—" }));
  });

/** Zbiorcze statystyki księgowości: przychód/koszty/VAT po miesiącach oraz sumy YTD. */
export const getBookkeepingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccounting(accountingDb, context.userId);
    const { data } = await accountingDb
      .from("accounting_documents")
      .select("direction,issue_date,net_amount,vat_amount,gross_amount,entity_id")
      .limit(20000);
    const rows = (data ?? []) as any[];
    const byMonth: Record<
      string,
      { sales_net: number; sales_vat: number; purchase_net: number; purchase_vat: number }
    > = {};
    let ytd = {
      sales_net: 0,
      sales_vat: 0,
      sales_gross: 0,
      purchase_net: 0,
      purchase_vat: 0,
      purchase_gross: 0,
    };
    const year = new Date().getFullYear();
    for (const r of rows) {
      const d = r.issue_date ? String(r.issue_date).slice(0, 7) : null;
      if (!d) continue;
      byMonth[d] ??= { sales_net: 0, sales_vat: 0, purchase_net: 0, purchase_vat: 0 };
      const net = Number(r.net_amount || 0);
      const vat = Number(r.vat_amount || 0);
      const gross = Number(r.gross_amount || 0);
      if (r.direction === "sales") {
        byMonth[d].sales_net += net;
        byMonth[d].sales_vat += vat;
        if (String(r.issue_date).startsWith(String(year))) {
          ytd.sales_net += net;
          ytd.sales_vat += vat;
          ytd.sales_gross += gross;
        }
      } else {
        byMonth[d].purchase_net += net;
        byMonth[d].purchase_vat += vat;
        if (String(r.issue_date).startsWith(String(year))) {
          ytd.purchase_net += net;
          ytd.purchase_vat += vat;
          ytd.purchase_gross += gross;
        }
      }
    }
    const months = Object.entries(byMonth)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-12)
      .map(([month, v]) => ({
        month,
        ...v,
        vat_due: Math.round((v.sales_vat - v.purchase_vat) * 100) / 100,
      }));
    ytd = Object.fromEntries(
      Object.entries(ytd).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ) as typeof ytd;
    return {
      months,
      ytd,
      vatDueYtd: Math.round((ytd.sales_vat - ytd.purchase_vat) * 100) / 100,
      count: rows.length,
    };
  });

export const exportAccountingDocumentsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ direction: z.enum(["sales", "purchase"]).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    let q = accountingDb
      .from("accounting_documents")
      .select("*")
      .order("issue_date", { ascending: false });
    if (data.direction) q = q.eq("direction", data.direction);
    const { data: docs } = await q;
    const { data: ents } = await accountingDb.from("accounting_entities").select("id,name");
    const nameMap: Record<string, string> = {};
    for (const e of (ents ?? []) as any[]) nameMap[e.id] = e.name;
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const money = (n: unknown) =>
      Number(n ?? 0)
        .toFixed(2)
        .replace(".", ",");
    const headers = [
      "Kierunek",
      "Źródło",
      "Numer",
      "Data",
      "Podmiot",
      "Kontrahent",
      "NIP",
      "Netto",
      "VAT",
      "Brutto",
      "Waluta",
      "Nr KSeF",
    ];
    const lines = [headers.join(";")];
    for (const d of (docs ?? []) as any[]) {
      lines.push(
        [
          d.direction === "sales" ? "Sprzedaż" : "Koszt",
          d.source,
          d.invoice_number ?? "",
          d.issue_date ?? "",
          nameMap[d.entity_id] ?? "",
          d.counterparty_name ?? "",
          d.counterparty_nip ?? "",
          money(d.net_amount),
          money(d.vat_amount),
          money(d.gross_amount),
          d.currency,
          d.ksef_reference_number ?? "",
        ]
          .map(cell)
          .join(";"),
      );
    }
    return {
      filename: `ksiegowosc-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: "\uFEFF" + lines.join("\r\n"),
    };
  });

// ---- KSeF XML: pojedyncze pobranie oraz eksport ZIP dla wybranego zakresu ----

const MAX_XML_ZIP_DOCS = 500;
const MAX_XML_ZIP_BYTES = 60 * 1024 * 1024; // 60 MB
const safeName = (s: string) => (s || "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);

export const getAccountingDocumentXml = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    const { data: doc } = await accountingDb
      .from("accounting_documents")
      .select("id, invoice_number, ksef_reference_number, xml_content")
      .eq("id", data.id)
      .maybeSingle();
    const d = doc as any;
    if (!d || !d.xml_content) throw new Error("Brak zapisanego XML dla tej faktury.");
    const base = safeName(d.ksef_reference_number || d.invoice_number || d.id);
    return { filename: `${base}.xml`, xml: d.xml_content as string };
  });

export const exportAccountingXmlZip = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        entityId: z.string().uuid().optional(),
        direction: z.enum(["sales", "purchase"]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    let q = accountingDb
      .from("accounting_documents")
      .select(
        "id, entity_id, direction, invoice_number, issue_date, counterparty_name, counterparty_nip, net_amount, vat_amount, gross_amount, currency, ksef_reference_number, xml_content",
      )
      .eq("source", "ksef")
      .not("xml_content", "is", null)
      .order("issue_date", { ascending: false })
      .limit(MAX_XML_ZIP_DOCS);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.direction) q = q.eq("direction", data.direction);
    if (data.from) q = q.gte("issue_date", data.from);
    if (data.to) q = q.lte("issue_date", data.to);
    const { data: docs } = await q;
    const rows = (docs ?? []) as any[];
    if (!rows.length) throw new Error("Brak faktur z zapisanym XML w wybranym zakresie.");

    const { data: ents } = await accountingDb.from("accounting_entities").select("id,name");
    const nameMap: Record<string, string> = {};
    for (const e of (ents ?? []) as any[]) nameMap[e.id] = e.name;

    const files: Record<string, Uint8Array> = {};
    const csvCell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const manifest = [
      "Plik;Podmiot;Kierunek;Numer;Data;Kontrahent;NIP;Netto;VAT;Brutto;Waluta;NrKSeF",
    ];
    let total = 0;
    let skipped = 0;
    for (const r of rows) {
      const xml: string = r.xml_content;
      const bytes = strToU8(xml);
      if (total + bytes.byteLength > MAX_XML_ZIP_BYTES) {
        skipped += 1;
        continue;
      }
      total += bytes.byteLength;
      const base = safeName(r.ksef_reference_number || r.invoice_number || r.id);
      const dir = r.direction === "sales" ? "sprzedaz" : "koszty";
      const path = `${dir}/${base}.xml`;
      files[path] = bytes;
      manifest.push(
        [
          path,
          nameMap[r.entity_id] ?? "",
          r.direction === "sales" ? "Sprzedaż" : "Koszt",
          r.invoice_number ?? "",
          r.issue_date ?? "",
          r.counterparty_name ?? "",
          r.counterparty_nip ?? "",
          String(r.net_amount ?? "").replace(".", ","),
          String(r.vat_amount ?? "").replace(".", ","),
          String(r.gross_amount ?? "").replace(".", ","),
          r.currency ?? "",
          r.ksef_reference_number ?? "",
        ]
          .map(csvCell)
          .join(";"),
      );
    }
    files["manifest.csv"] = strToU8("\uFEFF" + manifest.join("\r\n"));

    const zipped = zipSync(files, { level: 6 });
    // Base64 (Worker-safe, bez alokacji dużego stringa naraz).
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < zipped.length; i += chunk) {
      bin += String.fromCharCode(...zipped.subarray(i, Math.min(i + chunk, zipped.length)));
    }
    const base64 =
      typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      filename: `ksef-xml-${stamp}.zip`,
      base64,
      count: Object.keys(files).length - 1,
      skipped,
      byteSize: zipped.length,
    };
  });
