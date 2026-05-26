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
  .inputValidator((input: unknown) =>
    z.object({ applicationId: z.string().uuid() }).parse(input),
  )
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
    if (c.first_name) { borrowerData.firstName = c.first_name; setSrc("borrowerData.firstName"); }
    if (c.last_name) { borrowerData.lastName = c.last_name; setSrc("borrowerData.lastName"); }
    if (c.email) { borrowerData.email = c.email; setSrc("borrowerData.email"); }
    if (c.phone) { borrowerData.phone = c.phone; setSrc("borrowerData.phone"); }
    if ((app as any).nip) { borrowerData.nip = (app as any).nip; setSrc("borrowerData.nip"); }
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
    if ((app as any).max_monthly_payment) fieldSources["offerData.maxMonthlyPaymentByClient"] = "Wniosek";
    if ((app as any).preferred_period_months) fieldSources["offerData.loanTermMonths"] = "Wniosek";

    // upsert
    const { data: row, error: upErr } = await supabase
      .from("client_profiles")
      .insert({
        source_application_id: app.id,
        borrower_type: profile.borrowerType,
        nip: profile.borrowerData.nip ?? null,
        completion_percent: 0,
        data: profile as any,
      })
      .select("id")
      .single();
    if (upErr) throw new Error(upErr.message);
    return { id: row.id };
  });

// ─── CEIDG / GUS / KRS ────────────────────────────────────────────────

type FetchCompanyResult =
  | { ok: true; source: "CEIDG" | "GUS" | "KRS"; data: Partial<BorrowerData>; rawHint?: string }
  | { ok: false; error: string; status?: number };

export const fetchCompanyByNip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ nip: z.string().min(10).max(20) }).parse(input),
  )
  .handler(async ({ data }): Promise<FetchCompanyResult> => {
    const nip = cleanNip(data.nip);
    if (!isValidNip(nip)) {
      return { ok: false, error: "Nieprawidłowy NIP. Sprawdź sumę kontrolną." };
    }

    const ceidgToken = process.env.CEIDG_JWT_TOKEN;
    const ceidgBase = process.env.CEIDG_API_BASE_URL || "https://dane.biznes.gov.pl/api/ceidg/v3";

    if (!ceidgToken) {
      return {
        ok: false,
        error:
          "Integracja z rejestrem publicznym nie jest jeszcze skonfigurowana. Uzupełnij dane ręcznie albo skonfiguruj API CEIDG/GUS/KRS.",
      };
    }

    try {
      const url = `${ceidgBase}/firmy?nip=${encodeURIComponent(nip)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ceidgToken}`,
          Accept: "application/json",
        },
      });

      if (res.status === 204) return { ok: false, error: "Nie znaleziono podmiotu dla podanego NIP.", status: 204 };
      if (res.status === 401 || res.status === 403)
        return {
          ok: false,
          error: "Integracja z CEIDG nie jest poprawnie skonfigurowana albo token utracił ważność.",
          status: res.status,
        };
      if (res.status === 429)
        return { ok: false, error: "Przekroczono limit zapytań do rejestru. Spróbuj ponownie później.", status: 429 };
      if (res.status === 503 || res.status === 500)
        return {
          ok: false,
          error: "Rejestr publiczny jest chwilowo niedostępny. Spróbuj ponownie później albo uzupełnij dane ręcznie.",
          status: res.status,
        };
      if (!res.ok) return { ok: false, error: `Błąd CEIDG: HTTP ${res.status}`, status: res.status };

      const json: any = await res.json();
      const list: any[] = json?.firmy ?? json?.firma ?? (Array.isArray(json) ? json : []);
      const item = list[0];
      if (!item) return { ok: false, error: "Nie znaleziono podmiotu dla podanego NIP.", status: 204 };

      // szczegóły
      let detail: any = item;
      if (item.id && !item.adresDzialalnosci) {
        const dRes = await fetch(`${ceidgBase}/firma?id=${encodeURIComponent(item.id)}`, {
          headers: { Authorization: `Bearer ${ceidgToken}`, Accept: "application/json" },
        });
        if (dRes.ok) {
          const dJson: any = await dRes.json();
          detail = dJson?.firma?.[0] ?? dJson?.firma ?? dJson;
        }
      }

      const formatAddress = (a: any) => {
        if (!a) return undefined;
        if (typeof a === "string") return a;
        const parts = [a.ulica, a.budynek, a.lokal ? `m. ${a.lokal}` : null, a.kod, a.miasto].filter(Boolean);
        return parts.join(" ").trim() || undefined;
      };

      const mapped: Partial<BorrowerData> = {
        companyName: detail.nazwa,
        registryRecordId: detail.id,
        firstName: detail.wlasciciel?.imie,
        lastName: detail.wlasciciel?.nazwisko,
        nip: detail.wlasciciel?.nip || detail.nip || nip,
        regon: detail.wlasciciel?.regon || detail.regon,
        pesel: detail.wlasciciel?.pesel,
        businessAddress: formatAddress(detail.adresDzialalnosci),
        correspondenceAddress: formatAddress(detail.adresKorespondencyjny),
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

      return { ok: true, source: "CEIDG", data: mapped };
    } catch (e: any) {
      return { ok: false, error: `Błąd komunikacji z CEIDG: ${String(e?.message ?? e)}` };
    }
  });
