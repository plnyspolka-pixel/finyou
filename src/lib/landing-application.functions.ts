import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PropertyTypeEnum = z.enum([
  "mieszkanie",
  "dom",
  "lokal_uslugowy",
  "dzialka_budowlana",
  "grunt_rolny",
  "inna",
]);

const PhotoSchema = z.object({
  dataUrl: z.string().min(20).max(15_000_000), // <=~11MB base64
  mimeType: z.string().max(120),
  fileName: z.string().max(200),
  bucket: z.string().max(60), // bucket label (kind of doc)
});

const SubmitSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(6).max(30),
  loan_amount: z.number().min(20_000).max(2_000_000),
  preferred_period_months: z.number().int().min(3).max(72),
  property_type: PropertyTypeEnum,
  land_register_number: z.string().trim().max(60).optional().nullable(),
  photos: z.array(PhotoSchema).max(40).optional().default([]),
  source: z.string().max(120).optional().nullable(),
});

export const submitLandingLoanApplication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizePolishPhone } = await import("@/lib/phone");
    const { runPropertyCollateralAnalysisCore } = await import(
      "@/lib/property-analysis/property-collateral-analysis.functions"
    );

    const { normalized, valid } = normalizePolishPhone(data.phone);
    const source = data.source ?? "landing_single_page";

    const { data: client, error: cErr } = await supabaseAdmin
      .from("clients")
      .insert({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: normalized ?? data.phone,
        phone_raw: data.phone,
        phone_normalized: normalized,
        phone_valid: valid,
        consent_rodo: true,
        source,
      })
      .select("id")
      .single();
    if (cErr || !client) throw new Error(cErr?.message ?? "client insert failed");

    const { data: loan, error: lErr } = await supabaseAdmin
      .from("loan_applications")
      .insert({
        client_id: client.id,
        status: "nowy_lead",
        loan_amount: data.loan_amount,
        preferred_period_months: data.preferred_period_months,
        kw_status: data.land_register_number ? "znam" : "nie_znam",
        source,
      })
      .select("id")
      .single();
    if (lErr || !loan) throw new Error(lErr?.message ?? "loan insert failed");

    const { data: property } = await supabaseAdmin
      .from("properties")
      .insert({
        loan_application_id: loan.id,
        property_type: data.property_type,
        land_register_number: data.land_register_number ?? null,
      })
      .select("id")
      .single();

    // Upload photos to property-photos bucket and create document records.
    for (const p of data.photos ?? []) {
      try {
        const m = /^data:([^;]+);base64,(.*)$/.exec(p.dataUrl);
        if (!m) continue;
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        const safeName = p.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
        const path = `${loan.id}/${p.bucket}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("property-photos")
          .upload(path, bytes, { contentType: p.mimeType || m[1], upsert: false });
        if (upErr) continue;
        await supabaseAdmin.from("documents").insert({
          loan_application_id: loan.id,
          property_id: property?.id ?? null,
          document_type: p.bucket,
          file_name: p.fileName,
          file_path: path,
          visibility_level: "internal",
          status: "received",
        });
      } catch (e) {
        console.error("[landing-application] photo upload failed", e);
      }
    }

    void runPropertyCollateralAnalysisCore(loan.id).catch((err) => {
      console.error("[landing-application] collateral analysis failed", err);
    });

    return { ok: true as const, id: loan.id };
  });

export type RecentLoanApplicationItem = {
  id: string;
  first_name: string;
  property_type: string | null;
  loan_amount: number;
  preferred_period_months: number;
  created_at: string;
};

export const getRecentLoanApplications = createServerFn({ method: "GET" }).handler(
  async (): Promise<RecentLoanApplicationItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("loan_applications")
      .select(
        "id,loan_amount,preferred_period_months,created_at,clients!inner(first_name),properties(property_type)",
      )
      .gte("loan_amount", 20_000)
      .order("created_at", { ascending: false })
      .limit(40);
    const rows = (data ?? []) as any[];
    const out: RecentLoanApplicationItem[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const fn: string = (r.clients?.first_name ?? "").toString().trim();
      if (!fn) continue;
      const key = `${fn.toLowerCase()}-${r.loan_amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: r.id,
        first_name: fn,
        property_type: r.properties?.[0]?.property_type ?? null,
        loan_amount: Number(r.loan_amount),
        preferred_period_months: r.preferred_period_months,
        created_at: r.created_at,
      });
      if (out.length >= 12) break;
    }
    return out;
  },
);
