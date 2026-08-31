// Server functions dla profilu klienta + integracja CEIDG v3 (backend).
// Tokeny trzymane wyłącznie po stronie serwera. Brak mocków.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ClientProfile, BorrowerData, FieldSource } from "./client-profile-types";

// ─── Helpers ─────────────────────────────────────────────────────────

function cleanNip(nip: string): string {
  return nip.replace(/[\s-]/g, "");
}

function isValidNip(nip: string): boolean {
  const n = cleanNip(nip);
  if (!/^\d{10}$/.test(n)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(n[i]), 0);
  return sum % 11 === Number(n[9]);
}

// ─── CRUD profilu ─────────────────────────────────────────────────────

const ProfileSchema = z.object({
  id: z.string().uuid().optional(),
  sourceApplicationId: z.string().uuid().nullable().optional(),
  borrowerType: z.string(),
  borrowerData: z.any(),
  representativeData: z.any().optional(),
  propertyData: z.any(),
  uploadedPhotos: z.array(z.any()),
  uploadedDocuments: z.array(z.any()),
  investorData: z.any(),
  offerData: z.any(),
  scheduleData: z.any().optional(),
  securityData: z.any(),
  nbpBenchmark: z.any().optional(),
  fieldSources: z.record(z.string(), z.string()).optional(),
});

export const saveClientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      source_application_id: data.sourceApplicationId ?? null,
      borrower_type: data.borrowerType,
      nip: data.borrowerData?.nip ?? null,
      completion_percent: 0, // klient liczy lokalnie; pole pomocnicze
      data: data as any,
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("client_profiles")
        .update(payload)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
    const { data: row, error } = await supabase
      .from("client_profiles")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const getClientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("client_profiles")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const profile = { ...(row.data as object), id: row.id } as ClientProfile;
    return { profile };
  });

export const listClientProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("client_profiles")
      .select("id, borrower_type, nip, completion_percent, created_at, updated_at, data")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { profiles: data ?? [] };
  });

// ─── Utwórz profil z istniejącego wniosku ─────────────────────────────

export const createProfileFromApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: app, error } = await supabase
      .from("loan_applications")
      .select("*, client:clients(*), properties(*)")
      .eq("id", data.applicationId)
      .single();
    if (error || !app) throw new Error(error?.message ?? "Wniosek nie został znaleziony");

    const c = (app as any).client ?? {};
    const props = ((app as any).properties ?? []) as any[];
    const prop = props[0] ?? {};
    const fieldSources: Record<string, FieldSource> = {};
    const setSrc = (k: string) => (fieldSources[k] = "Wniosek");

    const borrowerData: BorrowerData = {};
    if (c.first_name) {
      borrowerData.firstName = c.first_name;
      setSrc("borrowerData.firstName");
    }
    if (c.last_name) {
      borrowerData.lastName = c.last_name;
      setSrc("borrowerData.lastName");
    }
    if (c.email) {
      borrowerData.email = c.email;
      setSrc("borrowerData.email");
    }
    if (c.phone) {
      borrowerData.phone = c.phone;
      setSrc("borrowerData.phone");
    }
    if ((app as any).nip) {
      borrowerData.nip = (app as any).nip;
      setSrc("borrowerData.nip");
    }
    if ((app as any).situation_description) {
      borrowerData.loanPurpose = (app as any).situation_description;
      setSrc("borrowerData.loanPurpose");
    }

    const profile: ClientProfile = {
      sourceApplicationId: app.id,
      borrowerType: "JDG",
      borrowerData,
      propertyData: {
        type: prop.property_type,
        landRegisterNumber: prop.land_register_number ?? undefined,
        address: [prop.street, prop.city, prop.voivodeship].filter(Boolean).join(", ") || undefined,
        city: prop.city ?? undefined,
        voivodeship: prop.voivodeship ?? undefined,
        estimatedValue: prop.estimated_value ?? undefined,
        owner: { isBorrower: true },
        hasExistingMortgage: prop.has_mortgage ?? false,
        description: prop.description ?? undefined,
      },
      uploadedPhotos: [],
      uploadedDocuments: [],
      investorData: {},
      offerData: {
        netAmountToClient: (app as any).loan_amount ?? undefined,
        maxMonthlyPaymentByClient: (app as any).max_monthly_payment ?? undefined,
        loanTermMonths: (app as any).preferred_period_months ?? undefined,
        annualInterestPercent: (app as any).annual_investor_rate ?? undefined,
        investorMonthlyReturnType: "amount",
      },
      securityData: {},
      fieldSources,
    };
    // mark these from application source
    if (prop.property_type) fieldSources["propertyData.type"] = "Wniosek";
    if (prop.land_register_number) fieldSources["propertyData.landRegisterNumber"] = "Wniosek";
    if (prop.estimated_value) fieldSources["propertyData.estimatedValue"] = "Wniosek";
    if ((app as any).loan_amount) fieldSources["offerData.netAmountToClient"] = "Wniosek";
    if ((app as any).max_monthly_payment)
      fieldSources["offerData.maxMonthlyPaymentByClient"] = "Wniosek";
    if ((app as any).preferred_period_months) fieldSources["offerData.loanTermMonths"] = "Wniosek";

    // upsert
    const { data: row, error: upErr } = await supabase
      .from("client_profiles")
      .insert({
        source_application_id: app.id,
        borrower_type: profile.borrowerType,
        nip: profile.borrowerData.nip ?? null,
        completion_percent: 0,
        data: profile as unknown as Record<string, unknown> as any,
      })
      .select("id")
      .single();
    if (upErr) throw new Error(upErr.message);
    return { id: row.id };
  });

// ─── Utwórz / zaktualizuj profil z zaakceptowanej oferty ──────────────
// Łączy dane z wniosku (klient, nieruchomość), istniejącego profilu
// klienta oraz oferty (inwestor + warunki). Nie nadpisuje pól oznaczonych
// jako "Ręcznie".

export const createProfileFromOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: offer, error: offerErr } = await supabase
      .from("investor_offers")
      .select(
        "*, investor:investors(*), loan:loan_applications(*, client:clients(*), properties(*))",
      )
      .eq("id", data.offerId)
      .single();
    if (offerErr || !offer) {
      throw new Error(offerErr?.message ?? "Oferta nie została znaleziona");
    }
    if (
      offer.offer_status !== "zaakceptowana_przez_klienta" &&
      offer.offer_status !== "wyslana_do_klienta"
    ) {
      throw new Error("Oferta nie została jeszcze zaakceptowana przez klienta");
    }

    const app: any = (offer as any).loan ?? {};
    const c: any = app.client ?? {};
    const prop: any = (app.properties ?? [])[0] ?? {};
    const inv: any = (offer as any).investor ?? {};

    let existingId: string | undefined;
    let existingProfile: ClientProfile | undefined;
    if (app.id) {
      const { data: existing } = await supabase
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

    const sources: Record<string, FieldSource> = {
      ...(existingProfile?.fieldSources ?? {}),
    };
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
    borrower.lastName = setIfAuto(
      "borrowerData.lastName",
      borrower.lastName,
      c.last_name,
      "Wniosek",
    );
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
      const { error: upErr2 } = await supabase
        .from("client_profiles")
        .update(payload)
        .eq("id", existingId);
      if (upErr2) throw new Error(upErr2.message);
      return { id: existingId };
    }
    const { data: row2, error: insErr } = await supabase
      .from("client_profiles")
      .insert(payload)
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { id: row2.id };
  });

// ─── CEIDG / GUS / KRS ────────────────────────────────────────────────

type StageName =
  | "Walidacja NIP"
  | "Sprawdzenie CEIDG"
  | "Sprawdzenie GUS/REGON"
  | "Sprawdzenie KRS/PRS"
  | "Mapowanie danych"
  | "Zakończono";

type StageStatus = "oczekuje" | "trwa" | "sukces" | "brak danych" | "błąd" | "pominięto";

interface Stage {
  name: StageName;
  status: StageStatus;
  message?: string;
}

type SourceTag = "CEIDG" | "GUS_REGON" | "KRS_PRS";

export type FetchCompanyResult =
  | {
      success: true;
      // Backward-compatible aliases:
      ok: true;
      source: SourceTag;
      entityType: "JDG" | "KRS_COMPANY" | "UNKNOWN";
      sourcesChecked: SourceTag[];
      data: Partial<BorrowerData>;
      fieldSources: Record<string, SourceTag>;
      warnings: string[];
      stages: Stage[];
    }
  | {
      success: false;
      ok: false;
      error: string;
      errorCode: string;
      message: string;
      sourcesChecked: SourceTag[];
      stages: Stage[];
      status?: number;
    };

function formatCeidgAddress(a: any): string | undefined {
  if (!a) return undefined;
  if (typeof a === "string") return a;
  const parts = [a.ulica, a.budynek, a.lokal ? `m. ${a.lokal}` : null, a.kod, a.miasto].filter(
    Boolean,
  );
  return parts.join(" ").trim() || undefined;
}

function formatKrsAddress(a: any): string | undefined {
  if (!a) return undefined;
  const street = [a.ulica, a.nr_domu, a.nr_lokalu ? `/${a.nr_lokalu}` : ""]
    .filter(Boolean)
    .join(" ");
  const city = [a.kod_pocztowy, a.miejscowosc].filter(Boolean).join(" ");
  return [street, city, a.kraj].filter(Boolean).join(", ") || undefined;
}

function makeStages(): Record<StageName, Stage> {
  const names: StageName[] = [
    "Walidacja NIP",
    "Sprawdzenie CEIDG",
    "Sprawdzenie GUS/REGON",
    "Sprawdzenie KRS/PRS",
    "Mapowanie danych",
    "Zakończono",
  ];
  return Object.fromEntries(
    names.map((n) => [n, { name: n, status: "oczekuje" as StageStatus }]),
  ) as Record<StageName, Stage>;
}

async function ceidgLookup(
  nip: string,
): Promise<
  | { kind: "jdg"; data: Partial<BorrowerData> }
  | { kind: "none" }
  | { kind: "error"; message: string; status?: number }
> {
  const token = process.env.CEIDG_JWT_TOKEN;
  const base = process.env.CEIDG_API_BASE_URL || "https://dane.biznes.gov.pl/api/ceidg/v3";
  if (!token)
    return { kind: "error", message: "Integracja CEIDG nie jest skonfigurowana (brak tokenu)." };

  const res = await fetch(`${base}/firmy?nip=${encodeURIComponent(nip)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 204) return { kind: "none" };
  if (res.status === 401 || res.status === 403)
    return {
      kind: "error",
      message: "Token CEIDG jest nieprawidłowy lub wygasł.",
      status: res.status,
    };
  if (res.status === 429)
    return { kind: "error", message: "Przekroczono limit zapytań do CEIDG.", status: 429 };
  if (!res.ok)
    return { kind: "error", message: `Błąd CEIDG: HTTP ${res.status}`, status: res.status };

  const json: any = await res.json().catch(() => null);
  const list: any[] = json?.firmy ?? json?.firma ?? (Array.isArray(json) ? json : []);
  const item = list?.[0];
  if (!item) return { kind: "none" };

  let detail: any = item;
  if (item.id && !item.adresDzialalnosci) {
    const dRes = await fetch(`${base}/firma?id=${encodeURIComponent(item.id)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (dRes.ok) {
      const dJson: any = await dRes.json().catch(() => null);
      detail = dJson?.firma?.[0] ?? dJson?.firma ?? dJson ?? item;
    }
  }

  const mapped: Partial<BorrowerData> = {
    companyName: detail.nazwa,
    registryRecordId: detail.id,
    firstName: detail.wlasciciel?.imie,
    lastName: detail.wlasciciel?.nazwisko,
    nip: detail.wlasciciel?.nip || detail.nip || nip,
    regon: detail.wlasciciel?.regon || detail.regon,
    pesel: detail.wlasciciel?.pesel,
    businessAddress: formatCeidgAddress(detail.adresDzialalnosci),
    correspondenceAddress: formatCeidgAddress(detail.adresKorespondencyjny),
    businessStartDate: detail.dataRozpoczecia,
    businessStatus: detail.status,
    phone: detail.telefon,
    email: detail.email,
    website: detail.www,
    eDeliveryAddress: detail.adresDoreczenElektronicznych,
    mainPkdCode: detail.pkdGlowny?.kod,
    mainPkdName: detail.pkdGlowny?.nazwa,
    pkdList: detail.pkd,
    maritalPropertyCommunity: detail.wspolnoscMajatkowa,
  };
  return { kind: "jdg", data: mapped };
}

/**
 * Free public KRS/PRS API by Ministerstwo Sprawiedliwości.
 * Search by KRS number; rejestr P (Przedsiębiorcy) or S (Stowarzyszenia).
 * Bez NIP→KRS search — to wymaga GUS BIR.
 */
async function krsLookupByKrs(krs: string): Promise<Partial<BorrowerData> | null> {
  const base = "https://api-krs.ms.gov.pl/api/krs/OdpisAktualny";
  for (const rejestr of ["P", "S"] as const) {
    const url = `${base}/${encodeURIComponent(krs)}?rejestr=${rejestr}&format=json`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const json: any = await res.json().catch(() => null);
      const odpis = json?.odpis;
      const dane = odpis?.dane;
      if (!dane) continue;
      const pod = dane?.dzial1?.danePodmiotu ?? {};
      const siedziba = dane?.dzial1?.siedzibaIAdres ?? {};
      const repr = dane?.dzial2?.reprezentacja ?? {};
      const organ = dane?.dzial2?.organReprezentacji ?? {};
      const kapitalNode = dane?.dzial1?.kapital?.wysokoscKapitaluZakladowego;
      const kapital = kapitalNode
        ? `${kapitalNode.wartosc ?? ""} ${kapitalNode.waluta ?? ""}`.trim()
        : undefined;

      const reprPersons: Array<{ imie?: string; nazwisko?: string; funkcja?: string }> = (
        organ?.sklad ?? []
      ).map((s: any) => ({
        imie: s?.imiona?.imie ?? s?.imie,
        nazwisko: s?.nazwisko,
        funkcja: s?.funkcjaWOrganie,
      }));

      const reprText = reprPersons
        .map((p) =>
          [p.imie, p.nazwisko, p.funkcja ? `(${p.funkcja})` : ""].filter(Boolean).join(" "),
        )
        .filter(Boolean)
        .join("; ");

      return {
        companyName: pod?.nazwa,
        krs: pod?.numerKRS ?? krs,
        nip: pod?.identyfikatory?.nip,
        regon: pod?.identyfikatory?.regon,
        legalForm: pod?.formaPrawna,
        registeredAddress: formatKrsAddress(siedziba?.adres),
        businessStatus: dane?.dzial6?.likwidacja ? "w likwidacji" : "aktywny",
        shareCapital: kapital,
        representationDescription: [repr?.sposobReprezentacji, reprText]
          .filter(Boolean)
          .join(" | "),
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Biała Lista MF — darmowe publiczne API. Po NIP zwraca nazwę, REGON, KRS, adres.
 * Działa bez klucza API.
 */
async function bialaListaLookupByNip(
  nip: string,
): Promise<
  | { kind: "found"; nazwa?: string; regon?: string; krs?: string; adres?: string }
  | { kind: "none" }
  | { kind: "error"; message: string }
> {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const url = `https://wl-api.mf.gov.pl/api/search/nip/${encodeURIComponent(nip)}?date=${date}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return { kind: "none" };
    if (!res.ok) return { kind: "error", message: `Biała Lista MF: HTTP ${res.status}` };
    const json: any = await res.json().catch(() => null);
    const s = json?.result?.subject;
    if (!s) return { kind: "none" };
    return {
      kind: "found",
      nazwa: s.name,
      regon: s.regon,
      krs: s.krs,
      adres: s.workingAddress || s.residenceAddress,
    };
  } catch (e: any) {
    return { kind: "error", message: `Biała Lista MF: ${String(e?.message ?? e)}` };
  }
}

/**
 * GUS BIR (NIP → REGON/KRS) — requires GUS_BIR_API_KEY.
 * Implementacja SOAP jest złożona; bez klucza zwracamy null żeby UI pokazało
 * jasny komunikat. Jeśli klucz jest, używamy najprostszego endpointu DaneSzukajPodmioty.
 */
export async function gusLookupByNip(
  nip: string,
): Promise<
  | { kind: "found"; regon?: string; krs?: string; nazwa?: string; typ?: string }
  | { kind: "not_configured" }
  | { kind: "none" }
  | { kind: "error"; message: string }
> {
  const key = process.env.GUS_BIR_API_KEY;
  if (!key) return { kind: "not_configured" };

  // GUS BIR1.1 SOAP — minimalny request DaneSzukajPodmioty
  const base =
    process.env.GUS_BIR_API_URL ||
    "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
  try {
    // 1. Zaloguj
    const login = await fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
      },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header><wsa:To xmlns:wsa="http://www.w3.org/2005/08/addressing">${base}</wsa:To>
  <wsa:Action xmlns:wsa="http://www.w3.org/2005/08/addressing">http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj</wsa:Action></soap:Header>
  <soap:Body><ns:Zaloguj><ns:pKluczUzytkownika>${key}</ns:pKluczUzytkownika></ns:Zaloguj></soap:Body>
</soap:Envelope>`,
    });
    const loginText = await login.text();
    const sid = loginText.match(/<ZalogujResult>([^<]+)<\/ZalogujResult>/)?.[1];
    if (!sid) return { kind: "error", message: "GUS BIR: nie udało się zalogować." };

    const search = await fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        sid,
      },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
  <soap:Header><wsa:To xmlns:wsa="http://www.w3.org/2005/08/addressing">${base}</wsa:To>
  <wsa:Action xmlns:wsa="http://www.w3.org/2005/08/addressing">http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty</wsa:Action></soap:Header>
  <soap:Body><ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><dat:Nip>${nip}</dat:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty></soap:Body>
</soap:Envelope>`,
    });
    const xml = await search.text();
    const inner = xml.match(
      /<DaneSzukajPodmiotyResult>([\s\S]*?)<\/DaneSzukajPodmiotyResult>/,
    )?.[1];
    if (!inner) return { kind: "none" };
    const decoded = inner.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const grab = (tag: string) => decoded.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
    const regon = grab("Regon") || grab("Regon14");
    const nazwa = grab("Nazwa");
    const typ = grab("Typ"); // P = osoba prawna, F = fizyczna
    // Dla osoby prawnej należałoby wywołać DanePobierzPelnyRaport, aby uzyskać KRS.
    // Pominięte dla zwięzłości — UI dostanie REGON + nazwę i pozwoli wpisać KRS ręcznie.
    if (!regon) return { kind: "none" };
    return { kind: "found", regon, nazwa, typ };
  } catch (e: any) {
    return { kind: "error", message: `GUS BIR: ${String(e?.message ?? e)}` };
  }
}

export const fetchCompanyByNip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ nip: z.string().min(10).max(20), knownKrs: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<FetchCompanyResult> => {
    const stages = makeStages();
    const stageList = (): Stage[] => Object.values(stages);
    const sourcesChecked: SourceTag[] = [];
    const warnings: string[] = [];

    // 1. Walidacja
    stages["Walidacja NIP"].status = "trwa";
    const nip = cleanNip(data.nip);
    if (!isValidNip(nip)) {
      stages["Walidacja NIP"].status = "błąd";
      stages["Walidacja NIP"].message = "Niepoprawny numer NIP.";
      return {
        success: false,
        ok: false,
        errorCode: "INVALID_NIP",
        error: "Niepoprawny numer NIP.",
        message: "Niepoprawny numer NIP.",
        sourcesChecked,
        stages: stageList(),
      };
    }
    stages["Walidacja NIP"].status = "sukces";

    // 2. CEIDG
    stages["Sprawdzenie CEIDG"].status = "trwa";
    sourcesChecked.push("CEIDG");
    const ceidg = await ceidgLookup(nip);

    if (ceidg.kind === "jdg") {
      stages["Sprawdzenie CEIDG"].status = "sukces";
      stages["Sprawdzenie GUS/REGON"].status = "pominięto";
      stages["Sprawdzenie KRS/PRS"].status = "pominięto";
      stages["Mapowanie danych"].status = "sukces";
      stages["Zakończono"].status = "sukces";
      const fieldSources = Object.fromEntries(
        Object.entries(ceidg.data)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k]) => [k, "CEIDG" as SourceTag]),
      );
      return {
        success: true,
        ok: true,
        source: "CEIDG",
        entityType: "JDG",
        sourcesChecked,
        data: ceidg.data,
        fieldSources,
        warnings,
        stages: stageList(),
      };
    }

    if (ceidg.kind === "error" && ceidg.status && ceidg.status >= 500) {
      stages["Sprawdzenie CEIDG"].status = "błąd";
      stages["Sprawdzenie CEIDG"].message = ceidg.message;
      warnings.push(ceidg.message);
    } else if (ceidg.kind === "error") {
      stages["Sprawdzenie CEIDG"].status = "błąd";
      stages["Sprawdzenie CEIDG"].message = ceidg.message;
      warnings.push(ceidg.message);
    } else {
      stages["Sprawdzenie CEIDG"].status = "brak danych";
      stages["Sprawdzenie CEIDG"].message = "Brak wpisu JDG w CEIDG.";
    }

    // 3. GUS/REGON
    stages["Sprawdzenie GUS/REGON"].status = "trwa";
    sourcesChecked.push("GUS_REGON");
    const gus = await gusLookupByNip(nip);
    let resolvedKrs: string | undefined = data.knownKrs;
    let gusData: Partial<BorrowerData> = {};

    if (gus.kind === "found") {
      stages["Sprawdzenie GUS/REGON"].status = "sukces";
      stages["Sprawdzenie GUS/REGON"].message =
        `REGON: ${gus.regon ?? "—"}${gus.nazwa ? ` · ${gus.nazwa}` : ""}`;
      gusData = { regon: gus.regon, companyName: gus.nazwa, nip };
      if (gus.krs) resolvedKrs = gus.krs;
    } else if (gus.kind === "not_configured") {
      stages["Sprawdzenie GUS/REGON"].status = "pominięto";
      stages["Sprawdzenie GUS/REGON"].message = "Integracja GUS/REGON nie jest skonfigurowana.";
      warnings.push("Integracja GUS/REGON nie jest skonfigurowana.");
    } else if (gus.kind === "error") {
      stages["Sprawdzenie GUS/REGON"].status = "błąd";
      stages["Sprawdzenie GUS/REGON"].message = gus.message;
      warnings.push(gus.message);
    } else {
      stages["Sprawdzenie GUS/REGON"].status = "brak danych";
    }

    // 3b. Biała Lista MF (darmowe, NIP→nazwa/REGON/KRS/adres) — uzupełnia braki z GUS
    sourcesChecked.push("GUS_REGON");
    const bl = await bialaListaLookupByNip(nip);
    if (bl.kind === "found") {
      if (!gusData.companyName && bl.nazwa) gusData.companyName = bl.nazwa;
      if (!gusData.regon && bl.regon) gusData.regon = bl.regon;
      if (!gusData.nip) gusData.nip = nip;
      if (!gusData.registeredAddress && bl.adres) gusData.registeredAddress = bl.adres;
      if (!resolvedKrs && bl.krs) resolvedKrs = bl.krs;
      if (stages["Sprawdzenie GUS/REGON"].status !== "sukces") {
        stages["Sprawdzenie GUS/REGON"].status = "sukces";
        stages["Sprawdzenie GUS/REGON"].message =
          `Biała Lista MF: ${bl.nazwa ?? ""}${bl.krs ? ` · KRS ${bl.krs}` : ""}`;
      }
    } else if (bl.kind === "error") {
      warnings.push(bl.message);
    }

    // 4. KRS/PRS
    stages["Sprawdzenie KRS/PRS"].status = "trwa";
    sourcesChecked.push("KRS_PRS");
    let krsData: Partial<BorrowerData> | null = null;
    if (resolvedKrs) {
      krsData = await krsLookupByKrs(resolvedKrs);
      if (krsData) {
        stages["Sprawdzenie KRS/PRS"].status = "sukces";
      } else {
        stages["Sprawdzenie KRS/PRS"].status = "brak danych";
        stages["Sprawdzenie KRS/PRS"].message =
          "Nie znaleziono odpisu w KRS/PRS dla podanego numeru.";
      }
    } else {
      stages["Sprawdzenie KRS/PRS"].status = "pominięto";
      stages["Sprawdzenie KRS/PRS"].message =
        "Brak numeru KRS — wpisz ręcznie aby pobrać reprezentację.";
    }

    // 5. Mapowanie
    stages["Mapowanie danych"].status = "trwa";
    const merged: Partial<BorrowerData> = { ...gusData, ...(krsData ?? {}) };
    const fieldSources: Record<string, SourceTag> = {};
    Object.entries(gusData).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") fieldSources[k] = "GUS_REGON";
    });
    if (krsData) {
      Object.entries(krsData).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") fieldSources[k] = "KRS_PRS";
      });
    }

    if (Object.keys(merged).length === 0) {
      stages["Mapowanie danych"].status = "brak danych";
      stages["Zakończono"].status = "brak danych";
      return {
        success: false,
        ok: false,
        errorCode: "NOT_FOUND",
        error: "Nie znaleziono podmiotu dla podanego NIP w dostępnych rejestrach.",
        message: "Nie znaleziono podmiotu dla podanego NIP w dostępnych rejestrach.",
        sourcesChecked,
        stages: stageList(),
      };
    }

    stages["Mapowanie danych"].status = "sukces";
    stages["Zakończono"].status = "sukces";

    const entityType: "KRS_COMPANY" | "UNKNOWN" = krsData ? "KRS_COMPANY" : "UNKNOWN";
    const primarySource: SourceTag = krsData ? "KRS_PRS" : "GUS_REGON";

    return {
      success: true,
      ok: true,
      source: primarySource,
      entityType,
      sourcesChecked,
      data: merged,
      fieldSources,
      warnings,
      stages: stageList(),
    };
  });
