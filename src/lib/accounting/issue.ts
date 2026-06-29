// Wystawianie faktury sprzedaży: numeracja + routing wg dostawcy podmiotu
// (manual / fakturowo / ksef). Aktualizuje status faktury i pola KSeF.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFaXml, type InvoiceItem } from "@/lib/ksef/fa-xml";
import { ksefSubmitInvoice } from "@/lib/ksef/client";
import { decryptSensitive } from "@/lib/affiliate/crypto";
import { logAccountingAudit } from "./db";

function pad(n: number, len = 4): string {
  return String(n).padStart(len, "0");
}

/** Nadaje numer faktury wg prefiksu i licznika podmiotu (np. FY/2026/0001). */
async function assignInvoiceNumber(db: SupabaseClient, entity: any): Promise<string> {
  const year = new Date().getFullYear();
  const next = Number(entity.invoice_next_number || 1);
  const number = `${entity.invoice_prefix || "FV"}/${year}/${pad(next)}`;
  await db.from("accounting_entities").update({ invoice_next_number: next + 1 }).eq("id", entity.id);
  return number;
}

// --- Fakturowo (per-podmiot konto) ---
function buildFormBody(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.append(k, String(v));
  }
  return usp.toString();
}

async function issueViaFakturowo(entity: any, invoice: any): Promise<{ ok: boolean; pdfUrl?: string; docId?: string; error?: string }> {
  const apiId = decryptSensitive(entity.fakturowo_api_id_encrypted) || process.env.FAKTUROWO_API_ID;
  if (!apiId) return { ok: false, error: "Brak konfiguracji Fakturowo dla podmiotu." };
  const payload = {
    api_id: apiId,
    api_zadanie: 1,
    dokument_dostep: 1,
    dokument_rodzaj: 0,
    dokument_miejsce: entity.address_city || "—",
    dokument_data_wystawienia: invoice.issue_date || "",
    dokument_waluta: invoice.currency || "PLN",
    sprzedawca_nazwa: entity.legal_name,
    sprzedawca_nip: entity.nip || "",
    sprzedawca_miasto: entity.address_city || "",
    sprzedawca_kod: entity.address_postal_code || "",
    sprzedawca_ulica: entity.address_street || "",
    nabywca_nazwa: invoice.buyer_name || "Nabywca",
    nabywca_nip: invoice.buyer_nip || "",
    nabywca_miasto: invoice.buyer_city || "",
    nabywca_kod: invoice.buyer_postal_code || "",
    nabywca_ulica: invoice.buyer_street || "",
    nabywca_email: invoice.buyer_email || "",
    produkt_nazwa: (invoice.items?.[0]?.name as string) || "Usługa Finance You",
    produkt_ilosc: 1,
    produkt_jm: "szt.",
    produkt_stawka_vat: invoice.vat_rate || "23",
    produkt_wartosc_brutto: invoice.gross_amount,
  };
  try {
    const res = await fetch("https://www.fakturowo.pl/api", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildFormBody(payload),
    });
    const raw = await res.text();
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines[0] !== "1") return { ok: false, error: lines.join(" | ").slice(0, 300) || "Błąd Fakturowo" };
    return { ok: true, docId: lines[1], pdfUrl: lines.find((l) => /^https?:\/\/.*pobierz/i.test(l)) };
  } catch (e) {
    return { ok: false, error: `Połączenie z Fakturowo nie powiodło się: ${(e as Error).message}` };
  }
}

/** Wystawia fakturę (nadaje numer, wysyła do dostawcy / KSeF), aktualizuje rekord. */
export async function issueSalesInvoice(
  db: SupabaseClient,
  invoiceId: string,
  actorUserId?: string,
): Promise<{ ok: boolean; status: string; message?: string }> {
  const { data: invoice } = await db.from("sales_invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invoice) throw new Error("Nie znaleziono faktury.");
  const inv = invoice as any;
  const { data: entity } = await db.from("accounting_entities").select("*").eq("id", inv.entity_id).maybeSingle();
  if (!entity) throw new Error("Faktura nie ma przypisanego podmiotu.");
  const ent = entity as any;

  const patch: Record<string, unknown> = { provider: ent.provider, error_message: null };
  if (!inv.invoice_number) {
    patch.invoice_number = await assignInvoiceNumber(db, ent);
    inv.invoice_number = patch.invoice_number;
  }
  if (!inv.issue_date) {
    patch.issue_date = new Date().toISOString().slice(0, 10);
    inv.issue_date = patch.issue_date;
  }

  let resultStatus = "issued";
  let message: string | undefined;

  if (ent.provider === "fakturowo") {
    const r = await issueViaFakturowo(ent, inv);
    if (r.ok) {
      patch.status = "issued";
      patch.fakturowo_document_id = r.docId ?? null;
      patch.pdf_url = r.pdfUrl ?? null;
    } else {
      patch.status = "draft";
      patch.error_message = r.error ?? "Błąd Fakturowo";
      resultStatus = "error";
      message = r.error;
    }
  } else if (ent.provider === "ksef") {
    const items: InvoiceItem[] = (inv.items ?? []).map((it: any) => ({
      name: it.name, quantity: Number(it.quantity ?? 1), unit: it.unit ?? "szt.", unitNet: Number(it.unitNet ?? inv.net_amount), vatRate: String(it.vatRate ?? inv.vat_rate ?? "23"),
    }));
    const xml = buildFaXml(
      {
        invoice_number: inv.invoice_number, issue_date: inv.issue_date, sale_date: inv.sale_date, currency: inv.currency,
        buyer_name: inv.buyer_name, buyer_nip: inv.buyer_nip, buyer_street: inv.buyer_street, buyer_city: inv.buyer_city, buyer_postal_code: inv.buyer_postal_code, buyer_country: inv.buyer_country,
        items: items.length ? items : [{ name: "Usługa Finance You", quantity: 1, unitNet: Number(inv.net_amount), vatRate: String(inv.vat_rate ?? "23") }],
        net_amount: Number(inv.net_amount), vat_amount: Number(inv.vat_amount), gross_amount: Number(inv.gross_amount),
      },
      { legal_name: ent.legal_name, nip: ent.ksef_nip || ent.nip, address_street: ent.address_street, address_postal_code: ent.address_postal_code, address_city: ent.address_city, address_country: ent.address_country },
    );
    const ksef = await ksefSubmitInvoice(
      { ksef_environment: ent.ksef_environment, ksef_nip: ent.ksef_nip || ent.nip, ksef_token_encrypted: ent.ksef_token_encrypted },
      xml,
    );
    patch.ksef_status = ksef.status;
    patch.ksef_reference_number = ksef.referenceNumber ?? null;
    patch.ksef_element_reference = ksef.elementReference ?? null;
    patch.ksef_upo_xml = ksef.upoXml ?? null;
    patch.status = ksef.status === "accepted" || ksef.status === "pending" ? "issued" : ksef.status === "disabled" ? "issued" : "draft";
    if (ksef.status === "error" || ksef.status === "rejected") {
      patch.error_message = ksef.message ?? "Błąd KSeF";
      resultStatus = ksef.status;
    }
    message = ksef.message ?? undefined;
  } else {
    // manual — tylko rejestrujemy fakturę jako wystawioną
    patch.status = "issued";
  }

  await db.from("sales_invoices").update(patch).eq("id", invoiceId);
  await logAccountingAudit(db, {
    actorUserId: actorUserId ?? null,
    actorRole: "ksiegowosc",
    entityType: "sales_invoice",
    entityId: invoiceId,
    action: "invoice_issued",
    after: { provider: ent.provider, status: patch.status, ksef_status: patch.ksef_status ?? null, number: inv.invoice_number },
  });

  return { ok: resultStatus !== "error", status: resultStatus, message };
}
