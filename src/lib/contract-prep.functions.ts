// Automatyczny przepływ przygotowania umowy po akceptacji oferty przez klienta.
// Dostępny dla obu stron transakcji (klient i inwestor) — bez udziału admina.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ClientProfile, FieldSource } from "./client-profile-types";

// Pola wymagane od klienta do podpisania umowy
const CLIENT_REQUIRED_FIELDS: Array<{ path: string; label: string }> = [
  { path: "borrowerData.firstName", label: "Imię" },
  { path: "borrowerData.lastName", label: "Nazwisko" },
  { path: "borrowerData.pesel", label: "PESEL" },
  { path: "borrowerData.phone", label: "Telefon" },
  { path: "borrowerData.email", label: "Email" },
  { path: "borrowerData.businessAddress", label: "Adres zamieszkania / firmy" },
  { path: "borrowerData.idDocument.type", label: "Typ dokumentu tożsamości" },
  { path: "borrowerData.idDocument.number", label: "Numer dokumentu tożsamości" },
  { path: "propertyData.landRegisterNumber", label: "Numer KW nieruchomości" },
  { path: "propertyData.address", label: "Adres nieruchomości" },
];

const INVESTOR_REQUIRED_FIELDS: Array<{ path: string; label: string }> = [
  { path: "investorData.fullName", label: "Imię i nazwisko / nazwa" },
  { path: "investorData.address", label: "Adres" },
  { path: "investorData.phone", label: "Telefon" },
  { path: "investorData.email", label: "Email" },
  { path: "investorData.bankAccount", label: "Numer rachunku bankowego" },
];

function getByPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setByPath(obj: any, path: string, value: any): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function computeMissing(profile: ClientProfile, fields: Array<{ path: string; label: string }>) {
  const missing: Array<{ path: string; label: string }> = [];
  for (const f of fields) {
    const v = getByPath(profile, f.path);
    if (v === undefined || v === null || v === "") missing.push(f);
  }
  return missing;
}

async function verifyCallerForOffer(userId: string, offerId: string) {
  const { data: offer, error } = await supabaseAdmin
    .from("investor_offers")
    .select(
      "id, offer_status, loan_application_id, investor_id, investors!inner(user_id), loan_applications!inner(client_id, clients!inner(user_id))",
    )
    .eq("id", offerId)
    .single();
  if (error || !offer) throw new Error("Oferta nie została znaleziona");

  const investorUserId = (offer as any).investors?.user_id;
  const clientUserId = (offer as any).loan_applications?.clients?.user_id;

  let side: "client" | "investor" | null = null;
  if (clientUserId === userId) side = "client";
  else if (investorUserId === userId) side = "investor";

  if (!side) {
    // sprawdź czy admin/operator
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isStaff = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
    if (!isStaff) throw new Error("Brak uprawnień do tej oferty");
    side = "client"; // staff może edytować obie sekcje przez osobne wywołania
  }

  // Strona inwestorska przygotowania umowy wymaga aktywnego pełnego
  // (płatnego) dostępu inwestora.
  if (side === "investor") {
    const { assertInvestorFullAccess } = await import("@/lib/access/guards.server");
    await assertInvestorFullAccess(userId);
  }
  return { offer, side };
}

async function buildOrGetProfile(
  offerId: string,
): Promise<{ profileId: string; profile: ClientProfile }> {
  // Pobierz pełne dane oferty z relacjami
  const { data: offer, error: offerErr } = await supabaseAdmin
    .from("investor_offers")
    .select("*, investor:investors(*), loan:loan_applications(*, client:clients(*), properties(*))")
    .eq("id", offerId)
    .single();
  if (offerErr || !offer) throw new Error("Oferta nie została znaleziona");

  const app: any = (offer as any).loan ?? {};
  const c: any = app.client ?? {};
  const prop: any = (app.properties ?? [])[0] ?? {};
  const inv: any = (offer as any).investor ?? {};

  // Spróbuj znaleźć istniejący profil
  let existingId: string | undefined;
  let existingProfile: ClientProfile | undefined;
  if (app.id) {
    const { data: existing } = await supabaseAdmin
      .from("client_profiles")
      .select("id, data")
      .eq("source_application_id", app.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      existingId = existing.id as string;
      existingProfile = existing.data as unknown as ClientProfile;
    }
  }

  const sources: Record<string, FieldSource> = { ...(existingProfile?.fieldSources ?? {}) };
  const isManual = (path: string) => sources[path] === "Ręcznie";
  const setIfAuto = <T>(
    path: string,
    current: T | undefined,
    value: T | undefined,
    src: FieldSource,
  ): T | undefined => {
    if (value === undefined || value === null || value === "") return current;
    if (isManual(path)) return current;
    sources[path] = src;
    return value;
  };

  const borrower = { ...(existingProfile?.borrowerData ?? {}) };
  borrower.firstName = setIfAuto(
    "borrowerData.firstName",
    borrower.firstName,
    c.first_name,
    "Wniosek",
  );
  borrower.lastName = setIfAuto("borrowerData.lastName", borrower.lastName, c.last_name, "Wniosek");
  borrower.email = setIfAuto("borrowerData.email", borrower.email, c.email, "Wniosek");
  borrower.phone = setIfAuto("borrowerData.phone", borrower.phone, c.phone, "Wniosek");
  borrower.nip = setIfAuto("borrowerData.nip", borrower.nip, app.nip, "Wniosek");
  borrower.loanPurpose = setIfAuto(
    "borrowerData.loanPurpose",
    borrower.loanPurpose,
    app.situation_description,
    "Wniosek",
  );

  const property = { ...(existingProfile?.propertyData ?? {}) };
  property.type = setIfAuto(
    "propertyData.type",
    property.type,
    prop.property_type,
    "Wniosek",
  ) as any;
  property.landRegisterNumber = setIfAuto(
    "propertyData.landRegisterNumber",
    property.landRegisterNumber,
    prop.land_register_number,
    "Wniosek",
  );
  const propAddr =
    [prop.street, prop.city, prop.voivodeship].filter(Boolean).join(", ") || undefined;
  property.address = setIfAuto("propertyData.address", property.address, propAddr, "Wniosek");
  property.city = setIfAuto("propertyData.city", property.city, prop.city, "Wniosek");
  property.voivodeship = setIfAuto(
    "propertyData.voivodeship",
    property.voivodeship,
    prop.voivodeship,
    "Wniosek",
  );
  property.estimatedValue = setIfAuto(
    "propertyData.estimatedValue",
    property.estimatedValue,
    prop.estimated_value,
    "Wniosek",
  );
  property.hasExistingMortgage = property.hasExistingMortgage ?? !!prop.has_mortgage;
  property.description = setIfAuto(
    "propertyData.description",
    property.description,
    prop.description,
    "Wniosek",
  );
  property.owner = property.owner ?? { isBorrower: true };

  const investorData = { ...(existingProfile?.investorData ?? {}) };
  const invFullName = `${inv.first_name ?? ""} ${inv.last_name ?? ""}`.trim() || undefined;
  investorData.fullName = setIfAuto(
    "investorData.fullName",
    investorData.fullName,
    invFullName,
    "Wniosek",
  );
  investorData.companyName = setIfAuto(
    "investorData.companyName",
    investorData.companyName,
    inv.company_name,
    "Wniosek",
  );
  investorData.email = setIfAuto("investorData.email", investorData.email, inv.email, "Wniosek");
  investorData.phone = setIfAuto("investorData.phone", investorData.phone, inv.phone, "Wniosek");

  const offerData = { ...(existingProfile?.offerData ?? {}) };
  offerData.netAmountToClient = setIfAuto(
    "offerData.netAmountToClient",
    offerData.netAmountToClient,
    Number(offer.proposed_amount ?? app.loan_amount) || undefined,
    "Wniosek",
  );
  offerData.loanTermMonths = setIfAuto(
    "offerData.loanTermMonths",
    offerData.loanTermMonths,
    offer.period_months ?? app.preferred_period_months,
    "Wniosek",
  );
  offerData.maxMonthlyPaymentByClient = setIfAuto(
    "offerData.maxMonthlyPaymentByClient",
    offerData.maxMonthlyPaymentByClient,
    (app.max_monthly_payment ?? Number(offer.estimated_monthly_payment)) || undefined,
    "Wniosek",
  );
  offerData.annualInterestPercent = setIfAuto(
    "offerData.annualInterestPercent",
    offerData.annualInterestPercent,
    Number(offer.expected_yearly_yield) || undefined,
    "Wniosek",
  );
  offerData.investorMonthlyReturnAmount = setIfAuto(
    "offerData.investorMonthlyReturnAmount",
    offerData.investorMonthlyReturnAmount,
    Number(offer.estimated_monthly_payment) || undefined,
    "Wniosek",
  );
  offerData.investorMonthlyReturnType = offerData.investorMonthlyReturnType ?? "amount";

  const profile: ClientProfile = {
    ...(existingProfile ?? { uploadedPhotos: [], uploadedDocuments: [], securityData: {} }),
    sourceApplicationId: app.id,
    borrowerType: existingProfile?.borrowerType ?? "JDG",
    borrowerData: borrower,
    propertyData: property,
    investorData,
    offerData,
    securityData: existingProfile?.securityData ?? {},
    uploadedPhotos: existingProfile?.uploadedPhotos ?? [],
    uploadedDocuments: existingProfile?.uploadedDocuments ?? [],
    fieldSources: sources,
  };

  const payload = {
    source_application_id: app.id ?? null,
    borrower_type: profile.borrowerType,
    nip: profile.borrowerData.nip ?? null,
    completion_percent: 0,
    data: profile as any,
  };

  if (existingId) {
    const { error: upErr } = await supabaseAdmin
      .from("client_profiles")
      .update(payload)
      .eq("id", existingId);
    if (upErr) throw new Error(upErr.message);
    return { profileId: existingId, profile };
  }
  const { data: row, error: insErr } = await supabaseAdmin
    .from("client_profiles")
    .insert(payload)
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  return { profileId: row.id as string, profile };
}

// ─── Public server functions ─────────────────────────────────────────

export const prepareContractForParties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await verifyCallerForOffer(context.userId, data.offerId);
    const { profileId } = await buildOrGetProfile(data.offerId);
    return { profileId };
  });

export const getContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { offer, side } = await verifyCallerForOffer(context.userId, data.offerId);
    const { profileId, profile } = await buildOrGetProfile(data.offerId);

    const missingClient = computeMissing(profile, CLIENT_REQUIRED_FIELDS);
    const missingInvestor = computeMissing(profile, INVESTOR_REQUIRED_FIELDS);
    const clientPct = Math.round(
      ((CLIENT_REQUIRED_FIELDS.length - missingClient.length) / CLIENT_REQUIRED_FIELDS.length) *
        100,
    );
    const investorPct = Math.round(
      ((INVESTOR_REQUIRED_FIELDS.length - missingInvestor.length) /
        INVESTOR_REQUIRED_FIELDS.length) *
        100,
    );

    return {
      profileId,
      side,
      offerStatus: (offer as any).offer_status,
      profile,
      clientFields: CLIENT_REQUIRED_FIELDS,
      investorFields: INVESTOR_REQUIRED_FIELDS,
      missingClient,
      missingInvestor,
      clientPct,
      investorPct,
      ready: missingClient.length === 0 && missingInvestor.length === 0,
    };
  });

export const saveContractPartyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        offerId: z.string().uuid(),
        side: z.enum(["client", "investor"]),
        patch: z.record(z.string(), z.any()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { side: callerSide } = await verifyCallerForOffer(context.userId, data.offerId);
    if (callerSide !== data.side) throw new Error("Możesz edytować wyłącznie własną sekcję");

    const { profileId, profile } = await buildOrGetProfile(data.offerId);

    const allowed =
      data.side === "client"
        ? CLIENT_REQUIRED_FIELDS.map((f) => f.path).concat([
            "borrowerData.idDocument.description",
            "borrowerData.correspondenceAddress",
            "propertyData.city",
            "propertyData.voivodeship",
            "propertyData.estimatedValue",
          ])
        : INVESTOR_REQUIRED_FIELDS.map((f) => f.path).concat([
            "investorData.companyName",
            "investorData.nip",
            "investorData.representativeName",
          ]);

    const sources: Record<string, FieldSource> = { ...(profile.fieldSources ?? {}) };
    const next: ClientProfile = JSON.parse(JSON.stringify(profile));
    for (const [path, value] of Object.entries(data.patch)) {
      if (!allowed.includes(path)) continue;
      setByPath(next, path, value);
      sources[path] = "Ręcznie";
    }
    next.fieldSources = sources;

    const { error } = await supabaseAdmin
      .from("client_profiles")
      .update({ data: next as any })
      .eq("id", profileId);
    if (error) throw new Error(error.message);

    const missingClient = computeMissing(next, CLIENT_REQUIRED_FIELDS);
    const missingInvestor = computeMissing(next, INVESTOR_REQUIRED_FIELDS);
    return {
      ok: true,
      clientPct: Math.round(
        ((CLIENT_REQUIRED_FIELDS.length - missingClient.length) / CLIENT_REQUIRED_FIELDS.length) *
          100,
      ),
      investorPct: Math.round(
        ((INVESTOR_REQUIRED_FIELDS.length - missingInvestor.length) /
          INVESTOR_REQUIRED_FIELDS.length) *
          100,
      ),
      ready: missingClient.length === 0 && missingInvestor.length === 0,
    };
  });
