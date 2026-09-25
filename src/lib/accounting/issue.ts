// Wystawianie faktury sprzedaży: kontrola danych → numeracja → wysyłka FA(3) do
// KSeF (gdy podmiot działa przez KSeF) → status i UPO. Wspólne dla panelu,
// operatora, automatów po płatnościach i narzędzi MCP.
//
// Zasady bezpieczeństwa:
//  - braki (adres sprzedawcy, podstawa zwolnienia, limit art. 113, token KSeF)
//    wykrywamy PRZED nadaniem numeru — faktura zostaje szkicem z opisem błędu;
//  - faktury w toku (`pending` z numerem referencyjnym) nigdy nie są wysyłane
//    ponownie — tylko sprawdzamy ich status;
//  - duplikat w KSeF (kod 440) dla faktury, którą już wysyłaliśmy, oznacza, że
//    poprzednia wysyłka doszła — przyjmujemy numer KSeF oryginału.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFa3Xml,
  validateFa3,
  type Fa3Invoice,
  type Fa3Line,
  type Fa3Seller,
} from "@/lib/ksef/fa3-xml";
import {
  effectiveKsef,
  ksefCheckInvoice,
  ksefSubmitInvoice,
  type KsefResult,
} from "@/lib/ksef/client";
import { logAccountingAudit } from "./db";

export type IssueResult = { ok: boolean; status: string; message?: string };

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

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

/** Pozycje zapisane w `sales_invoices.items` → wiersze FA(3). */
export function invoiceLines(inv: any): Fa3Line[] {
  const items: any[] = Array.isArray(inv.items) ? inv.items : [];
  if (!items.length) {
    return [
      {
        name: "Usługa Finance You",
        quantity: 1,
        unitNet: Number(inv.net_amount),
        vatRate: String(inv.vat_rate ?? "23"),
        net: Number(inv.net_amount),
        vat: Number(inv.vat_amount),
      },
    ];
  }
  const lines: Fa3Line[] = items.map((it) => ({
    name: String(it.name ?? ""),
    quantity: Number(it.quantity ?? 1),
    unit: it.unit ?? "szt.",
    unitNet: Number(it.unitNet ?? inv.net_amount),
    vatRate: String(it.vatRate ?? inv.vat_rate ?? "23"),
    net: typeof it.net === "number" ? it.net : undefined,
    vat: typeof it.vat === "number" ? it.vat : undefined,
  }));
  // Jedna pozycja bez zapisanych wartości — kwoty z nagłówka (unika różnic groszowych
  // między „brutto − netto” a „netto × stawka”).
  if (lines.length === 1 && lines[0].net === undefined) {
    lines[0].net = Number(inv.net_amount);
    lines[0].vat = Number(inv.vat_amount);
  }
  return lines;
}

/** Dane faktury i sprzedawcy w formacie generatora FA(3). */
export function toFa3(inv: any, ent: any, number?: string, issueDate?: string) {
  const paidBySource = inv.source_type === "tpay_payment" || inv.source_type === "stripe_payment";
  const bank = inv.items?.[0]?.meta?.bankAccount || ent.bank_account || null;
  const invoice: Fa3Invoice = {
    invoice_number: number ?? inv.invoice_number ?? "",
    issue_date: issueDate ?? inv.issue_date ?? today(),
    sale_date: inv.sale_date ?? null,
    due_date: inv.due_date ?? null,
    currency: inv.currency ?? "PLN",
    buyer_name: inv.buyer_name,
    buyer_nip: inv.buyer_nip,
    buyer_street: inv.buyer_street,
    buyer_postal_code: inv.buyer_postal_code,
    buyer_city: inv.buyer_city,
    buyer_country: inv.buyer_country,
    buyer_email: inv.buyer_email,
    items: invoiceLines(inv),
    vat_exemption_basis: inv.vat_exemption_basis || ent.vat_exemption_basis || null,
    paid_date: paidBySource ? (inv.sale_date ?? issueDate ?? inv.issue_date ?? today()) : null,
  };
  const seller: Fa3Seller = {
    legal_name: ent.legal_name,
    nip: ent.ksef_nip || ent.nip,
    address_street: ent.address_street,
    address_postal_code: ent.address_postal_code,
    address_city: ent.address_city,
    address_country: ent.address_country,
    email: ent.email,
    bank_account: bank,
    regon: ent.regon,
  };
  return { invoice, seller };
}

/** Sprzedaż podmiotu w roku kalendarzowym (do limitu zwolnienia podmiotowego). */
export async function yearTurnover(
  db: SupabaseClient,
  entityId: string,
  year: number,
  excludeInvoiceId?: string,
): Promise<number> {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  let q = db
    .from("sales_invoices")
    .select("id, gross_amount")
    .eq("entity_id", entityId)
    .in("status", ["issued", "sent", "paid"])
    .gte("issue_date", from)
    .lt("issue_date", to);
  if (excludeInvoiceId) q = q.neq("id", excludeInvoiceId);
  const { data: inv } = await q;
  // Sprzedaż wystawiona poza platformą (Fakturowo, ręcznie) — z rejestru dokumentów.
  const { data: docs } = await db
    .from("accounting_documents")
    .select("gross_amount")
    .eq("entity_id", entityId)
    .eq("direction", "sales")
    .in("source", ["fakturowo", "manual"])
    .gte("issue_date", from)
    .lt("issue_date", to);
  const sum = (rows: any[] | null) =>
    (rows ?? []).reduce((a, r) => a + Number(r.gross_amount || 0), 0);
  return round2(sum(inv) + sum(docs));
}

/**
 * Kontrola przed nadaniem numeru: dane FA(3) (dla podmiotów KSeF), zasady
 * podmiotu zwolnionego podmiotowo i limit sprzedaży. Zwraca listę problemów.
 */
export async function preflightInvoice(db: SupabaseClient, inv: any, ent: any): Promise<string[]> {
  const problems: string[] = [];
  const lines = invoiceLines(inv);
  if (ent.vat_payer === false && lines.some((l) => l.vatRate !== "zw"))
    problems.push(
      `${ent.name}: podmiot zwolniony podmiotowo z VAT — wszystkie pozycje muszą mieć stawkę „zw”.`,
    );
  if (ent.provider === "ksef") {
    const { invoice, seller } = toFa3(
      inv,
      ent,
      inv.invoice_number || "X",
      inv.issue_date || today(),
    );
    problems.push(...validateFa3(invoice, seller));
    if (!effectiveKsef(ent))
      problems.push(
        `${ent.name}: brak tokenu KSeF albo KSeF wyłączony — uzupełnij w ustawieniach podmiotu.`,
      );
  }
  const limit = Number(ent.vat_exempt_limit ?? 0);
  if (ent.vat_payer === false && limit > 0) {
    const year = Number(String(inv.issue_date || today()).slice(0, 4));
    const before = await yearTurnover(db, ent.id, year, inv.id);
    const after = round2(before + Number(inv.gross_amount || 0));
    if (after > limit)
      problems.push(
        `${ent.name}: ta faktura przekroczyłaby limit zwolnienia podmiotowego (${limit.toFixed(2)} zł; sprzedaż w ${year}: ${before.toFixed(2)} zł + ${Number(inv.gross_amount).toFixed(2)} zł). Po przekroczeniu sprzedaż podlega VAT — zmień ustawienia podmiotu (płatnik VAT) po konsultacji z księgową.`,
      );
  }
  return problems;
}

/** Zapisuje wynik KSeF na fakturze i zwraca wynik dla wywołującego. */
async function applyKsefResult(
  db: SupabaseClient,
  inv: any,
  res: KsefResult,
  base: Record<string, unknown>,
  actorUserId: string | null,
  action: string,
): Promise<IssueResult> {
  const patch: Record<string, unknown> = { ...base, ksef_status_code: res.statusCode ?? null };
  if (res.sessionReference) patch.ksef_session_reference = res.sessionReference;
  if (res.invoiceReference) patch.ksef_invoice_reference = res.invoiceReference;
  if (res.upoXml) patch.ksef_upo_xml = res.upoXml;

  let status: KsefResult["status"] = res.status;
  let message = res.message ?? undefined;
  // Błąd po dotarciu faktury do KSeF (znamy jej numer referencyjny) — dokończy odświeżenie.
  if (status === "error" && res.invoiceReference) status = "pending";
  // Duplikat faktury, którą już wysyłaliśmy = poprzednia wysyłka doszła.
  if (status === "rejected" && res.statusCode === 440) {
    if (res.referenceNumber && (inv.ksef_sent_at || base.ksef_sent_at)) {
      status = "accepted";
      message = `Faktura była już w KSeF (numer ${res.referenceNumber}) — przyjęto numer z pierwszej wysyłki.`;
    } else {
      status = "error";
      message = `Numer ${inv.invoice_number} jest już w KSeF${res.referenceNumber ? ` (${res.referenceNumber})` : ""} dla innej faktury — sprawdź numerację podmiotu.`;
    }
  }

  switch (status) {
    case "accepted":
      patch.ksef_status = "accepted";
      if (res.referenceNumber) patch.ksef_reference_number = res.referenceNumber;
      patch.error_message = null;
      if (inv.status === "draft") patch.status = "issued";
      break;
    case "pending":
      patch.ksef_status = "pending";
      patch.error_message = null;
      if (inv.status === "draft") patch.status = "issued";
      break;
    case "rejected":
      // Faktura odrzucona przez KSeF nie została wystawiona — wraca do szkicu
      // (ten sam numer), do poprawy i ponownej wysyłki.
      patch.ksef_status = "rejected";
      patch.status = "draft";
      patch.ksef_invoice_reference = null;
      patch.error_message = message ?? "KSeF odrzucił fakturę.";
      break;
    case "disabled":
      patch.ksef_status = "disabled";
      patch.error_message = message ?? "KSeF wyłączony.";
      break;
    default:
      patch.ksef_status = "error";
      patch.error_message = message ?? "Błąd KSeF.";
  }

  await db.from("sales_invoices").update(patch).eq("id", inv.id);
  await logAccountingAudit(db, {
    actorUserId,
    actorRole: "ksiegowosc",
    entityType: "sales_invoice",
    entityId: inv.id,
    action,
    after: {
      number: base.invoice_number ?? inv.invoice_number,
      ksef_status: patch.ksef_status,
      ksef_status_code: res.statusCode ?? null,
      ksef_number: patch.ksef_reference_number ?? null,
      message: message ?? null,
    },
  });
  return {
    ok: status === "accepted" || status === "pending",
    status: String(patch.ksef_status),
    message,
  };
}

async function load(db: SupabaseClient, invoiceId: string) {
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
  return { inv, ent: entity as any };
}

/**
 * Wystawia fakturę: kontrola → numer → (KSeF) wysyłka FA(3). Dla faktury w toku
 * tylko sprawdza status; przyjętej nie rusza. Bezpieczne do ponawiania.
 */
export async function issueSalesInvoice(
  db: SupabaseClient,
  invoiceId: string,
  actorUserId?: string,
): Promise<IssueResult> {
  const { inv, ent } = await load(db, invoiceId);
  if (inv.status === "cancelled") throw new Error("Faktura jest anulowana.");
  if (inv.ksef_status === "accepted")
    return {
      ok: true,
      status: "accepted",
      message: `Faktura jest już w KSeF (${inv.ksef_reference_number}).`,
    };
  if (inv.ksef_status === "pending" && inv.ksef_invoice_reference)
    return refreshKsefStatus(db, invoiceId, actorUserId);

  const wasDraft = inv.status === "draft";
  // Szkic dostaje datę wystawienia z dnia wystawienia (KSeF: P_1 ≤ data przyjęcia).
  const issueDate = wasDraft ? today() : (inv.issue_date ?? today());
  const problems = await preflightInvoice(db, { ...inv, issue_date: issueDate }, ent);
  if (problems.length) {
    const message = problems.join(" ");
    await db.from("sales_invoices").update({ error_message: message }).eq("id", invoiceId);
    return { ok: false, status: "error", message };
  }

  const base: Record<string, unknown> = { provider: ent.provider, error_message: null };
  if (!inv.invoice_number) base.invoice_number = await assignInvoiceNumber(db, ent);
  if (wasDraft || !inv.issue_date) base.issue_date = issueDate;
  const number = String(base.invoice_number ?? inv.invoice_number);

  if (ent.provider !== "ksef") {
    // Bez KSeF — tylko rejestrujemy fakturę jako wystawioną.
    await db
      .from("sales_invoices")
      .update({ ...base, status: wasDraft ? "issued" : inv.status })
      .eq("id", invoiceId);
    await logAccountingAudit(db, {
      actorUserId: actorUserId ?? null,
      actorRole: "ksiegowosc",
      entityType: "sales_invoice",
      entityId: invoiceId,
      action: "invoice_issued",
      after: { provider: ent.provider, number },
    });
    return { ok: true, status: "issued" };
  }

  const { invoice, seller } = toFa3(inv, ent, number, issueDate);
  const xml = buildFa3Xml(invoice, seller);
  const res = await ksefSubmitInvoice(
    {
      ksef_environment: ent.ksef_environment,
      ksef_nip: ent.ksef_nip || ent.nip,
      ksef_token_encrypted: ent.ksef_token_encrypted,
      legal_name: ent.legal_name,
    },
    xml,
  );
  if (res.sent === true) {
    base.ksef_xml = xml;
    base.ksef_sent_at = new Date().toISOString();
  }
  // Numer i data zapisane także przy błędzie — ponowienie użyje tego samego numeru.
  return applyKsefResult(db, inv, res, base, actorUserId ?? null, "invoice_issued_ksef");
}

/** Sprawdza w KSeF status wysłanej faktury; pobiera UPO, gdy jeszcze go nie ma. */
export async function refreshKsefStatus(
  db: SupabaseClient,
  invoiceId: string,
  actorUserId?: string,
): Promise<IssueResult> {
  const { inv, ent } = await load(db, invoiceId);
  const needsUpo = inv.ksef_status === "accepted" && !inv.ksef_upo_xml;
  if (
    !inv.ksef_session_reference ||
    !inv.ksef_invoice_reference ||
    (inv.ksef_status !== "pending" && !needsUpo)
  ) {
    return {
      ok: inv.ksef_status === "accepted",
      status: inv.ksef_status,
      message: "Brak wysyłki w toku do sprawdzenia.",
    };
  }
  const res = await ksefCheckInvoice(
    {
      ksef_environment: ent.ksef_environment,
      ksef_nip: ent.ksef_nip || ent.nip,
      ksef_token_encrypted: ent.ksef_token_encrypted,
      legal_name: ent.legal_name,
    },
    inv.ksef_session_reference,
    inv.ksef_invoice_reference,
  );
  if (needsUpo) {
    if (res.upoXml)
      await db.from("sales_invoices").update({ ksef_upo_xml: res.upoXml }).eq("id", invoiceId);
    return {
      ok: true,
      status: "accepted",
      message: res.upoXml ? "Pobrano UPO." : "UPO jeszcze niedostępne.",
    };
  }
  // Błąd po stronie KSeF bez faktury w systemie (405/500/550) → można wysłać ponownie.
  if (res.status === "error" && res.statusCode) {
    return applyKsefResult(
      db,
      inv,
      { ...res, invoiceReference: null },
      { ksef_invoice_reference: null },
      actorUserId ?? null,
      "invoice_ksef_status",
    );
  }
  if (res.status === "pending" && !res.statusCode) {
    // Nie udało się odpytać (sieć, uwierzytelnienie) — zostawiamy w toku.
    await db
      .from("sales_invoices")
      .update({ error_message: res.message ?? null })
      .eq("id", invoiceId);
    return { ok: true, status: "pending", message: res.message ?? undefined };
  }
  return applyKsefResult(db, inv, res, {}, actorUserId ?? null, "invoice_ksef_status");
}

/** Odświeża faktury w toku / bez UPO (wywoływane z crona synchronizacji). */
export async function refreshPendingKsefInvoices(
  db: SupabaseClient,
  limit = 20,
): Promise<{ checked: number; accepted: number; rejected: number }> {
  const { data } = await db
    .from("sales_invoices")
    .select("id, ksef_status")
    .not("ksef_invoice_reference", "is", null)
    .or("ksef_status.eq.pending,and(ksef_status.eq.accepted,ksef_upo_xml.is.null)")
    .order("ksef_sent_at", { ascending: true })
    .limit(limit);
  let accepted = 0;
  let rejected = 0;
  for (const row of (data ?? []) as Array<{ id: string }>) {
    try {
      const r = await refreshKsefStatus(db, row.id);
      if (r.status === "accepted") accepted += 1;
      if (r.status === "rejected") rejected += 1;
    } catch {
      // pojedyncza faktura nie blokuje reszty
    }
  }
  return { checked: (data ?? []).length, accepted, rejected };
}
