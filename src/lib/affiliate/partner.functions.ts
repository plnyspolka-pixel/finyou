// Funkcje serwerowe panelu partnera (pośrednika).
// Każda funkcja ścisłe ogranicza dane do zalogowanego partnera.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { affiliateDb, logAffiliateAudit, resolvePartnerId } from "./db";
import { encryptSensitive, decryptSensitive, maskBankAccount } from "./crypto";
import { getActiveLimit, quarterCountedSum } from "./engine";
import { getTaxPeriod, unregisteredLimitState } from "./engine-pure";

const NALICZONE = [
  "calculated",
  "pending_admin_approval",
  "requires_invoice",
  "requires_unregistered_activity_statement",
  "requires_business_registration",
];
const ZATWIERDZONE = ["approved", "payable"];

function randomCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const RegisterInput = z.object({
  settlementType: z.enum(["b2b", "unregistered_activity"]),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional().default(""),
  companyName: z.string().max(255).optional().default(""),
  nip: z.string().max(20).optional().default(""),
  regon: z.string().max(20).optional().default(""),
  pesel: z.string().max(20).optional().default(""),
  addressStreet: z.string().max(255).optional().default(""),
  addressPostalCode: z.string().max(20).optional().default(""),
  addressCity: z.string().max(120).optional().default(""),
  bankAccount: z.string().max(64).optional().default(""),
  billingEmail: z.string().email().optional().or(z.literal("")),
  websiteUrl: z.string().max(255).optional().default(""),
  sourceDescription: z.string().max(1000).optional().default(""),
  vatPayer: z.boolean().optional().default(false),
  sponsorReferralCode: z.string().max(40).optional().default(""),
  termsAccepted: z.literal(true),
  termsVersion: z.string().max(20).optional().default("1.0"),
});

export const registerAffiliatePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RegisterInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const existing = await resolvePartnerId(affiliateDb, userId);
    if (existing) throw new Error("Jesteś już zarejestrowany jako partner.");

    if (data.settlementType === "b2b" && (!data.companyName || !data.nip)) {
      throw new Error("Dla rozliczenia B2B wymagane są nazwa firmy i NIP.");
    }
    if (data.settlementType === "unregistered_activity" && !data.pesel) {
      throw new Error("Dla działalności nierejestrowanej wymagany jest PESEL.");
    }

    // Sponsor z linku polecającego (opcjonalny).
    let sponsorPartnerId: string | null = null;
    if (data.sponsorReferralCode) {
      const { data: sponsor } = await affiliateDb
        .from("affiliate_partners")
        .select("id,status")
        .eq("referral_code", data.sponsorReferralCode.toUpperCase())
        .maybeSingle();
      if (sponsor) sponsorPartnerId = (sponsor as { id: string }).id;
    }

    // Unikalny kod / slug.
    let referralCode = randomCode();
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await affiliateDb
        .from("affiliate_partners")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();
      if (!clash) break;
      referralCode = randomCode();
    }
    const baseSlug = slugify(`${data.firstName}-${data.lastName}`) || "partner";
    const referralSlug = `${baseSlug}-${referralCode.slice(0, 4).toLowerCase()}`;

    const { data: inserted, error } = await affiliateDb
      .from("affiliate_partners")
      .insert({
        user_id: userId,
        settlement_type: data.settlementType,
        status: "pending_approval",
        sponsor_partner_id: sponsorPartnerId,
        referral_code: referralCode,
        referral_slug: referralSlug,
        first_name: data.firstName,
        last_name: data.lastName,
        company_name: data.companyName || null,
        email: data.email,
        phone: data.phone || null,
        pesel_encrypted: encryptSensitive(data.pesel),
        nip: data.nip || null,
        regon: data.regon || null,
        address_street: data.addressStreet || null,
        address_postal_code: data.addressPostalCode || null,
        address_city: data.addressCity || null,
        bank_account_encrypted: encryptSensitive(data.bankAccount),
        billing_email: data.billingEmail || null,
        website_url: data.websiteUrl || null,
        source_description: data.sourceDescription || null,
        vat_payer: data.vatPayer,
        terms_accepted_at: new Date().toISOString(),
        terms_version: data.termsVersion,
      })
      .select("id,referral_code,referral_slug,status")
      .single();

    if (error || !inserted) throw new Error(`Rejestracja nie powiodła się: ${error?.message}`);

    await logAffiliateAudit(affiliateDb, {
      actorUserId: userId,
      actorRole: "partner",
      entityType: "affiliate_partner",
      entityId: (inserted as { id: string }).id,
      action: "partner_registered",
      after: { settlement_type: data.settlementType, sponsor_partner_id: sponsorPartnerId },
    });

    return inserted;
  });

export const getMyAffiliatePartner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await affiliateDb
      .from("affiliate_partners")
      .select(
        "id,settlement_type,status,referral_code,referral_slug,first_name,last_name,company_name,email,phone,nip,regon,address_street,address_postal_code,address_city,billing_email,website_url,bank_account_encrypted,vat_payer,sponsor_partner_id,created_at,approved_at",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return null;
    const p = data as any;
    const { bank_account_encrypted, ...safe } = p;
    return {
      ...safe,
      has_bank_account: Boolean(bank_account_encrypted),
      bank_account_masked: bank_account_encrypted
        ? maskBankAccount(decryptSensitive(bank_account_encrypted))
        : null,
    };
  });

export const getAffiliateDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const partnerId = await resolvePartnerId(affiliateDb, context.userId);
    if (!partnerId) return null;

    const { data: partner } = await affiliateDb
      .from("affiliate_partners")
      .select("id,settlement_type,status,bank_account_encrypted")
      .eq("id", partnerId)
      .maybeSingle();
    const settlementType = (partner as any)?.settlement_type ?? "b2b";

    const { data: commissions } = await affiliateDb
      .from("affiliate_commissions")
      .select(
        "gross_amount,status,network_level,requires_invoice,invoice_id,requires_business_registration",
      )
      .eq("partner_id", partnerId);

    const sumBy = (pred: (c: any) => boolean) =>
      Math.round(
        (commissions ?? [])
          .filter(pred)
          .reduce((s: number, c: any) => s + Number(c.gross_amount || 0), 0) * 100,
      ) / 100;

    const naliczone = sumBy((c) => NALICZONE.includes(c.status));
    const zatwierdzone = sumBy((c) => ZATWIERDZONE.includes(c.status));
    const dostepne = sumBy((c) => c.status === "approved");
    const wyplacone = sumBy((c) => c.status === "paid");
    const level1 = sumBy(
      (c) => c.network_level === 1 && c.status !== "cancelled" && c.status !== "blocked",
    );
    const level2 = sumBy(
      (c) => c.network_level === 2 && c.status !== "cancelled" && c.status !== "blocked",
    );
    const level3 = sumBy(
      (c) => c.network_level === 3 && c.status !== "cancelled" && c.status !== "blocked",
    );

    // Liczby poleconych — z realnych zdarzeń bezpośrednich.
    const { data: events } = await affiliateDb
      .from("affiliate_commission_events")
      .select("event_type")
      .eq("direct_partner_id", partnerId);
    const countType = (t: string) => (events ?? []).filter((e: any) => e.event_type === t).length;

    // Limit działalności nierejestrowanej (bieżący kwartał).
    const { year, quarter } = getTaxPeriod(new Date());
    let limitInfo: any = null;
    if (settlementType === "unregistered_activity") {
      const limitAmount = await getActiveLimit(affiliateDb, year, quarter);
      const quarterSum = await quarterCountedSum(affiliateDb, partnerId, year, quarter);
      const state = unregisteredLimitState({
        quarterApprovedSum: quarterSum,
        newAmount: 0,
        limitAmount,
      });
      limitInfo = { year, quarter, limitAmount, quarterSum, ...state };
    }

    const PROG = 500;
    const alerts: { level: "info" | "warning" | "danger"; message: string }[] = [];
    if (dostepne < PROG) {
      alerts.push({
        level: "info",
        message: "Twoje saldo nie osiągnęło jeszcze minimalnego progu wypłaty 500 zł.",
      });
    }
    const needsInvoice = (commissions ?? []).some(
      (c: any) =>
        settlementType === "b2b" &&
        c.requires_invoice &&
        !c.invoice_id &&
        NALICZONE.includes(c.status),
    );
    if (needsInvoice) {
      alerts.push({
        level: "warning",
        message: "Aby wypłacić prowizję, dodaj fakturę lub dokument rozliczeniowy.",
      });
    }
    if (limitInfo?.nearLimit && limitInfo?.withinLimit) {
      alerts.push({
        level: "warning",
        message:
          "Zbliżasz się do limitu działalności nierejestrowanej w tym kwartale. Kolejne prowizje mogą wymagać przejścia na rozliczenie B2B.",
      });
    }
    const overLimit = (commissions ?? []).some((c: any) => c.requires_business_registration);
    if (overLimit) {
      alerts.push({
        level: "danger",
        message:
          "Ta prowizja wymaga rejestracji działalności gospodarczej lub ręcznej weryfikacji księgowej.",
      });
    }

    return {
      settlementType,
      status: (partner as any)?.status ?? null,
      hasBankAccount: Boolean((partner as any)?.bank_account_encrypted),
      balances: {
        naliczone,
        zatwierdzone,
        dostepne,
        wyplacone,
        prog: PROG,
        brakujaceDoProgu: Math.max(0, Math.round((PROG - dostepne) * 100) / 100),
      },
      levels: { level1, level2, level3 },
      counts: {
        inwestorzy: countType("investor_account_paid"),
        posrednicy: countType("broker_account_paid"),
        klienci: countType("client_funds_disbursed"),
      },
      limitInfo,
      alerts,
    };
  });

export const getAffiliateStructure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const partnerId = await resolvePartnerId(affiliateDb, context.userId);
    if (!partnerId) return { levels: [] };

    const { data: closure } = await affiliateDb
      .from("affiliate_network_closure")
      .select("descendant_partner_id,depth")
      .eq("ancestor_partner_id", partnerId)
      .lte("depth", 3);

    const ids = (closure ?? []).map((r: any) => r.descendant_partner_id);
    const depthById: Record<string, number> = {};
    for (const r of closure ?? []) depthById[(r as any).descendant_partner_id] = (r as any).depth;

    const partnersById: Record<string, any> = {};
    if (ids.length) {
      const { data: partners } = await affiliateDb
        .from("affiliate_partners")
        .select("id,first_name,last_name,status,created_at")
        .in("id", ids);
      for (const p of partners ?? []) partnersById[(p as any).id] = p;
    }

    // Liczba zdarzeń wygenerowanych przez partnerów z dołu (anonimizowane).
    const eventCountByPartner: Record<string, number> = {};
    if (ids.length) {
      const { data: ev } = await affiliateDb
        .from("affiliate_commission_events")
        .select("direct_partner_id")
        .in("direct_partner_id", ids);
      for (const e of ev ?? [])
        eventCountByPartner[(e as any).direct_partner_id] =
          (eventCountByPartner[(e as any).direct_partner_id] ?? 0) + 1;
    }

    // Prowizja sieciowa zalogowanego partnera z każdego poziomu.
    const { data: myCommissions } = await affiliateDb
      .from("affiliate_commissions")
      .select("gross_amount,network_level,status")
      .eq("partner_id", partnerId);
    const commByLevel = (lvl: number) =>
      Math.round(
        (myCommissions ?? [])
          .filter(
            (c: any) =>
              c.network_level === lvl && c.status !== "cancelled" && c.status !== "blocked",
          )
          .reduce((s: number, c: any) => s + Number(c.gross_amount || 0), 0) * 100,
      ) / 100;

    const levels = [1, 2, 3].map((depth) => {
      const members = ids
        .filter((id: string) => depthById[id] === depth)
        .map((id: string) => {
          const p = partnersById[id];
          const last = p?.last_name ? `${String(p.last_name).charAt(0)}.` : "";
          return {
            id,
            displayName: `${p?.first_name ?? "Partner"} ${last}`.trim(),
            active: p?.status === "active",
            joinedAt: p?.created_at ?? null,
            eventsCount: eventCountByPartner[id] ?? 0,
          };
        });
      return {
        depth,
        members,
        activeCount: members.filter((m: { active: boolean }) => m.active).length,
        totalCount: members.length,
        commissionSum: commByLevel(depth),
      };
    });

    return { levels };
  });

export const getAffiliateCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const partnerId = await resolvePartnerId(affiliateDb, context.userId);
    if (!partnerId) return [];
    const { data } = await affiliateDb
      .from("affiliate_commissions")
      .select(
        "id,network_level,settlement_type,status,basis_type,gross_amount,currency,tax_year,tax_quarter,requires_invoice,requires_business_registration,created_at,approved_at,paid_at,commission_event_id",
      )
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const getAffiliatePayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const partnerId = await resolvePartnerId(affiliateDb, context.userId);
    if (!partnerId) return [];
    const { data } = await affiliateDb
      .from("affiliate_payout_items")
      .select("id,amount,transfer_title,status,created_at,paid_at,payout_batch_id")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

const BillingInput = z.object({
  phone: z.string().max(40).optional(),
  companyName: z.string().max(255).optional(),
  nip: z.string().max(20).optional(),
  regon: z.string().max(20).optional(),
  addressStreet: z.string().max(255).optional(),
  addressPostalCode: z.string().max(20).optional(),
  addressCity: z.string().max(120).optional(),
  billingEmail: z.string().email().optional().or(z.literal("")),
  websiteUrl: z.string().max(255).optional(),
  bankAccount: z.string().max(64).optional(),
  vatPayer: z.boolean().optional(),
});

export const updateAffiliateBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => BillingInput.parse(i))
  .handler(async ({ data, context }) => {
    const partnerId = await resolvePartnerId(affiliateDb, context.userId);
    if (!partnerId) throw new Error("Nie jesteś zarejestrowany jako partner.");

    const patch: Record<string, unknown> = {};
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.companyName !== undefined) patch.company_name = data.companyName || null;
    if (data.nip !== undefined) patch.nip = data.nip || null;
    if (data.regon !== undefined) patch.regon = data.regon || null;
    if (data.addressStreet !== undefined) patch.address_street = data.addressStreet || null;
    if (data.addressPostalCode !== undefined)
      patch.address_postal_code = data.addressPostalCode || null;
    if (data.addressCity !== undefined) patch.address_city = data.addressCity || null;
    if (data.billingEmail !== undefined) patch.billing_email = data.billingEmail || null;
    if (data.websiteUrl !== undefined) patch.website_url = data.websiteUrl || null;
    if (data.vatPayer !== undefined) patch.vat_payer = data.vatPayer;
    if (data.bankAccount) patch.bank_account_encrypted = encryptSensitive(data.bankAccount);

    await affiliateDb.from("affiliate_partners").update(patch).eq("id", partnerId);
    await logAffiliateAudit(affiliateDb, {
      actorUserId: context.userId,
      actorRole: "partner",
      entityType: "affiliate_partner",
      entityId: partnerId,
      action: "billing_updated",
      after: { fields: Object.keys(patch) },
    });
    return { ok: true };
  });

const InvoiceInput = z.object({
  invoiceNumber: z.string().min(1).max(60),
  issueDate: z.string().optional(),
  netAmount: z.number().nonnegative(),
  vatAmount: z.number().nonnegative().optional(),
  grossAmount: z.number().nonnegative(),
  fileUrl: z.string().url().optional().or(z.literal("")),
});

export const submitAffiliateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => InvoiceInput.parse(i))
  .handler(async ({ data, context }) => {
    const partnerId = await resolvePartnerId(affiliateDb, context.userId);
    if (!partnerId) throw new Error("Nie jesteś zarejestrowany jako partner.");
    const { data: inserted, error } = await affiliateDb
      .from("affiliate_invoices")
      .insert({
        partner_id: partnerId,
        invoice_number: data.invoiceNumber,
        issue_date: data.issueDate || null,
        net_amount: data.netAmount,
        vat_amount: data.vatAmount ?? null,
        gross_amount: data.grossAmount,
        file_url: data.fileUrl || null,
        status: "submitted",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Nie udało się zapisać faktury: ${error.message}`);
    await logAffiliateAudit(affiliateDb, {
      actorUserId: context.userId,
      actorRole: "partner",
      entityType: "affiliate_invoice",
      entityId: (inserted as any)?.id,
      action: "invoice_submitted",
      after: { invoice_number: data.invoiceNumber, gross: data.grossAmount },
    });
    return { ok: true };
  });
