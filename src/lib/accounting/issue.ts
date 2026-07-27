// Wystawianie faktury sprzedaży: numeracja + routing wg dostawcy podmiotu
// (manual / ksef). Aktualizuje status faktury i pola KSeF.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFaXml, type InvoiceItem } from "@/lib/ksef/fa-xml";
import { ksefSubmitInvoice } from "@/lib/ksef/client";
import { logAccountingAudit } from "./db";

function pad(n: number, len = 4): string {
  return String(n).padStart(len, "0");
}

/** Nadaje numer faktury wg prefiksu i licznika podmiotu (np. FY/2026/0001). */
async function assignInvoiceNumber(db: SupabaseClient, entity: any): Promise<string> {
  const year = new Date().getFullYear();
  const next = Number(entity.invoice_next_number || 1);
  const number = `${entity.invoice_prefix || "FV"}/${year}/${pad(next)}`;
  await db
    .from("accounting_entities")
    .update({ invoice_next_number: next + 1 })
    .eq("id", entity.id);
  return number;
}

/** Wystawia fakturę (nadaje numer, wysyła do dostawcy / KSeF), aktualizuje rekord. */
export async function issueSalesInvoice(
  db: SupabaseClient,
  invoiceId: string,
  actorUserId?: string,
): Promise<{ ok: boolean; status: string; message?: string }> {
  const { data: invoice } = await db
    .from("sales_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) throw new Error("Nie znaleziono faktury.");
  const inv = invoice as any;
  const { data: entity } = await db
    .from("accounting_entities")
    .select("*")
    .eq("id", inv.entity_id)
    .maybeSingle();
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

  if (ent.provider === "ksef") {
    const items: InvoiceItem[] = (inv.items ?? []).map((it: any) => ({
      name: it.name,
      quantity: Number(it.quantity ?? 1),
      unit: it.unit ?? "szt.",
      unitNet: Number(it.unitNet ?? inv.net_amount),
      vatRate: String(it.vatRate ?? inv.vat_rate ?? "23"),
    }));
    const xml = buildFaXml(
      {
        invoice_number: inv.invoice_number,
        issue_date: inv.issue_date,
        sale_date: inv.sale_date,
        currency: inv.currency,
        buyer_name: inv.buyer_name,
        buyer_nip: inv.buyer_nip,
        buyer_street: inv.buyer_street,
        buyer_city: inv.buyer_city,
        buyer_postal_code: inv.buyer_postal_code,
        buyer_country: inv.buyer_country,
        items: items.length
          ? items
          : [
              {
                name: "Usługa Finance You",
                quantity: 1,
                unitNet: Number(inv.net_amount),
                vatRate: String(inv.vat_rate ?? "23"),
              },
            ],
        net_amount: Number(inv.net_amount),
        vat_amount: Number(inv.vat_amount),
        gross_amount: Number(inv.gross_amount),
      },
      {
        legal_name: ent.legal_name,
        nip: ent.ksef_nip || ent.nip,
        address_street: ent.address_street,
        address_postal_code: ent.address_postal_code,
        address_city: ent.address_city,
        address_country: ent.address_country,
      },
    );
    const ksef = await ksefSubmitInvoice(
      {
        ksef_environment: ent.ksef_environment,
        ksef_nip: ent.ksef_nip || ent.nip,
        ksef_token_encrypted: ent.ksef_token_encrypted,
        legal_name: ent.legal_name,
      },
      xml,
    );
    patch.ksef_status = ksef.status;
    patch.ksef_reference_number = ksef.referenceNumber ?? null;
    patch.ksef_element_reference = ksef.elementReference ?? null;
    patch.ksef_upo_xml = ksef.upoXml ?? null;
    patch.status =
      ksef.status === "accepted" || ksef.status === "pending"
        ? "issued"
        : ksef.status === "disabled"
          ? "issued"
          : "draft";
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
    after: {
      provider: ent.provider,
      status: patch.status,
      ksef_status: patch.ksef_status ?? null,
      number: inv.invoice_number,
    },
  });

  return { ok: resultStatus !== "error", status: resultStatus, message };
}
