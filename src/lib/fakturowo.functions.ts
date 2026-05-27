import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FAKTUROWO_ENDPOINT = "https://www.fakturowo.pl/api";

// --- helpers ---

function buildFormBody(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.append(k, String(v));
  }
  return usp.toString();
}

// Fakturowo zwraca tekst liniami. Pierwsza linia: "1" = sukces, "0" lub komunikat = błąd.
function parseFakturowoResponse(raw: string): {
  success: boolean;
  fakturowoApiNumber?: string;
  pdfUrl?: string;
  htmlUrl?: string;
  pdfFilename?: string;
  error?: string;
} {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { success: false, error: "Pusta odpowiedź Fakturowo" };
  const first = lines[0];
  if (first !== "1") {
    return { success: false, error: lines.join(" | ") || "Nieznany błąd Fakturowo" };
  }
  return {
    success: true,
    fakturowoApiNumber: lines[1],
    pdfUrl: lines.find((l) => /^https?:\/\/.*pobierz/i.test(l)) ?? lines[2],
    htmlUrl: lines.find((l) => /^https?:\/\/.*pokaz/i.test(l)) ?? lines[3],
    pdfFilename: lines.find((l) => /\.pdf$/i.test(l)),
  };
}

function safeLog(stage: string, info: Record<string, unknown>) {
  // Nie logujemy api_id ani pełnego payloadu.
  // eslint-disable-next-line no-console
  console.log(`[fakturowo] ${stage}`, JSON.stringify(info));
}

// --- schemas ---

const CreateInput = z.object({
  documentKind: z.enum(["faktura_vat", "proforma"]).default("faktura_vat"),
  isTest: z.boolean().default(false),
  // sprzedawca
  sellerName: z.string().min(1).max(255),
  sellerNip: z.string().min(1).max(20),
  sellerCity: z.string().min(1).max(120),
  sellerPostalCode: z.string().min(1).max(20),
  sellerStreet: z.string().min(1).max(255),
  sellerBuilding: z.string().max(40).optional().default(""),
  sellerEmail: z.string().email().optional().or(z.literal("")),
  sellerPhone: z.string().max(40).optional().default(""),
  // nabywca
  buyerName: z.string().min(1).max(255),
  buyerNip: z.string().max(20).optional().default(""),
  buyerCity: z.string().min(1).max(120),
  buyerPostalCode: z.string().min(1).max(20),
  buyerStreet: z.string().min(1).max(255),
  buyerBuilding: z.string().max(40).optional().default(""),
  buyerEmail: z.string().email().optional().or(z.literal("")),
  // pozycja
  productName: z.string().min(1).max(500),
  productQuantity: z.number().positive().default(1),
  productUnit: z.string().min(1).max(20).default("szt."),
  productVatRate: z.string().min(1).max(10).default("23"), // np. "23" lub "zw"
  productGross: z.number().positive(),
  productNet: z.number().positive().optional(),
  // dodatkowe
  place: z.string().min(1).max(120),
  issueDate: z.string().optional().default(""),
  paymentDueDate: z.string().optional().default(""),
  paymentMethod: z.string().max(60).optional().default(""),
  bankAccount: z.string().max(60).optional().default(""),
  notes: z.string().max(1000).optional().default(""),
  currency: z.string().min(3).max(3).default("PLN"),
  // powiązania
  relatedType: z.enum(["client", "investor", "payment", "subscription", "manual"]).default("manual"),
  relatedId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  investorId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional(),
});

// --- server functions ---

export const createFakturowoDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Tylko admin / operator
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roleNames = (roles ?? []).map((r: any) => r.role);
    if (!roleNames.includes("administrator") && !roleNames.includes("operator")) {
      throw new Error("Brak uprawnień do wystawiania dokumentów.");
    }

    const apiId = process.env.FAKTUROWO_API_ID;
    if (!apiId) throw new Error("Brakuje konfiguracji integracji Fakturowo.");

    // Antyduplikacja po payment_id
    if (data.paymentId) {
      const { data: existing } = await supabaseAdmin
        .from("fakturowo_documents")
        .select("id, status, pdf_url, fakturowo_api_number")
        .eq("payment_id", data.paymentId)
        .eq("status", "created")
        .maybeSingle();
      if (existing) {
        return {
          success: false,
          duplicate: true,
          error: "Dokument dla tej płatności został już wystawiony.",
          existing,
        };
      }
    }

    const dokumentRodzaj = data.documentKind === "proforma" ? 2 : 0;

    const payload: Record<string, string | number> = {
      api_id: apiId,
      api_zadanie: 1,
      dokument_dostep: 1,
      dokument_rodzaj: dokumentRodzaj,
      dokument_miejsce: data.place,
      dokument_data_wystawienia: data.issueDate || "",
      dokument_termin_platnosci: data.paymentDueDate || "",
      dokument_sposob_platnosci: data.paymentMethod || "",
      dokument_konto_bankowe: data.bankAccount || "",
      dokument_uwagi: data.notes || "",
      dokument_waluta: data.currency,
      sprzedawca_nazwa: data.sellerName,
      sprzedawca_nip: data.sellerNip,
      sprzedawca_miasto: data.sellerCity,
      sprzedawca_kod: data.sellerPostalCode,
      sprzedawca_ulica: data.sellerStreet,
      sprzedawca_budynek: data.sellerBuilding || "",
      sprzedawca_email: data.sellerEmail || "",
      sprzedawca_telefon: data.sellerPhone || "",
      nabywca_nazwa: data.buyerName,
      nabywca_nip: data.buyerNip || "",
      nabywca_miasto: data.buyerCity,
      nabywca_kod: data.buyerPostalCode,
      nabywca_ulica: data.buyerStreet,
      nabywca_budynek: data.buyerBuilding || "",
      nabywca_email: data.buyerEmail || "",
      produkt_nazwa: data.productName,
      produkt_ilosc: data.productQuantity,
      produkt_jm: data.productUnit,
      produkt_stawka_vat: data.productVatRate,
      produkt_wartosc_brutto: data.productGross,
    };
    if (data.productNet !== undefined) {
      payload.produkt_wartosc_netto = data.productNet;
    }

    safeLog("request", {
      userId,
      documentKind: data.documentKind,
      gross: data.productGross,
      currency: data.currency,
      isTest: data.isTest,
      relatedType: data.relatedType,
    });

    let rawResponse = "";
    try {
      const res = await fetch(FAKTUROWO_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildFormBody(payload),
      });
      rawResponse = await res.text();
    } catch (e: any) {
      safeLog("network_error", { userId, message: e?.message?.slice(0, 200) });
      // zapisz failed
      await supabaseAdmin.from("fakturowo_documents").insert({
        related_type: data.relatedType,
        related_id: data.relatedId,
        client_id: data.clientId,
        investor_id: data.investorId,
        payment_id: data.paymentId,
        document_type: data.documentKind,
        document_kind_code: String(dokumentRodzaj),
        buyer_name: data.buyerName,
        buyer_nip: data.buyerNip,
        buyer_email: data.buyerEmail,
        buyer_city: data.buyerCity,
        buyer_postal_code: data.buyerPostalCode,
        buyer_street: data.buyerStreet,
        buyer_building: data.buyerBuilding,
        seller_name: data.sellerName,
        seller_nip: data.sellerNip,
        gross_amount: data.productGross,
        net_amount: data.productNet,
        vat_rate: data.productVatRate,
        currency: data.currency,
        product_name: data.productName,
        product_quantity: data.productQuantity,
        product_unit: data.productUnit,
        status: "failed",
        error_message: "Błąd połączenia z Fakturowo.",
        is_test: data.isTest,
        created_by: userId,
      });
      return { success: false, error: "Błąd połączenia z Fakturowo." };
    }

    const parsed = parseFakturowoResponse(rawResponse);
    safeLog("response", {
      userId,
      success: parsed.success,
      number: parsed.fakturowoApiNumber,
    });

    const baseRow = {
      related_type: data.relatedType,
      related_id: data.relatedId,
      client_id: data.clientId,
      investor_id: data.investorId,
      payment_id: data.paymentId,
      document_type: data.documentKind,
      document_kind_code: String(dokumentRodzaj),
      buyer_name: data.buyerName,
      buyer_nip: data.buyerNip,
      buyer_email: data.buyerEmail,
      buyer_city: data.buyerCity,
      buyer_postal_code: data.buyerPostalCode,
      buyer_street: data.buyerStreet,
      buyer_building: data.buyerBuilding,
      seller_name: data.sellerName,
      seller_nip: data.sellerNip,
      gross_amount: data.productGross,
      net_amount: data.productNet,
      vat_rate: data.productVatRate,
      currency: data.currency,
      product_name: data.productName,
      product_quantity: data.productQuantity,
      product_unit: data.productUnit,
      is_test: data.isTest,
      created_by: userId,
      raw_response: rawResponse.slice(0, 5000),
    };

    if (!parsed.success) {
      await supabaseAdmin.from("fakturowo_documents").insert({
        ...baseRow,
        status: "failed",
        error_message: parsed.error?.slice(0, 500) ?? "Błąd Fakturowo.",
      });
      return { success: false, error: parsed.error ?? "Fakturowo zwróciło błąd." };
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("fakturowo_documents")
      .insert({
        ...baseRow,
        status: data.isTest ? "test" : "created",
        fakturowo_api_number: parsed.fakturowoApiNumber,
        pdf_url: parsed.pdfUrl,
        html_url: parsed.htmlUrl,
        pdf_filename: parsed.pdfFilename,
      })
      .select("id, fakturowo_api_number, pdf_url, html_url, pdf_filename, status")
      .single();

    if (insertErr) {
      return { success: false, error: "Dokument wystawiony, ale zapis do bazy nie powiódł się." };
    }

    return {
      success: true,
      document: inserted,
    };
  });

// Status integracji (czy klucz skonfigurowany)
export const getFakturowoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { configured: Boolean(process.env.FAKTUROWO_API_ID) };
  });
