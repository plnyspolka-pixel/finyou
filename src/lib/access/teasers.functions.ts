// Bezpieczne zajawki ofert dla inwestora bez aktywnego płatnego dostępu.
// Dane pochodzą z funkcji SQL `investor_offer_teasers()` (tylko dozwolone
// pola) — pełne rekordy loan_applications/clients/properties/documents nie
// trafiają do przeglądarki. Zdjęcie główne jest podpisywane po stronie
// serwera (service role) wyłącznie dla pierwszego bezpiecznego zdjęcia.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isShowablePropertyPhoto } from "@/lib/property-photos";

export interface InvestorOfferTeaser {
  id: string;
  createdAt: string;
  loanAmount: number | null;
  periodMonths: number | null;
  annualRate: number | null;
  ltv: number | null;
  propertyType: string | null;
  city: string | null;
  voivodeship: string | null;
  estimatedValue: number | null;
  areaSqm: number | null;
  description: string | null;
  photoUrl: string | null;
}

const PHOTO_BUCKETS = ["pliki-klienta", "documents", "property-photos"] as const;

export const listInvestorTeasers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestorOfferTeaser[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Zajawki są dla kont inwestorskich i personelu.
    const { data: rolesRows } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((rolesRows ?? []) as { role: string }[]).map((r) => r.role);
    if (!roles.some((r) => ["inwestor", "administrator", "operator"].includes(r))) {
      throw new Error("Brak uprawnień");
    }

    // Inwestor (bez roli personelu) widzi zajawki DOPIERO po pozytywnej
    // weryfikacji tożsamości (KYC) w module projektów — wcześniej żadne dane
    // ofert nie opuszczają serwera, niezależnie od UI.
    const isStaff = roles.some((r) => ["administrator", "operator"].includes(r));
    if (!isStaff) {
      const { data: access } = await db
        .from("project_module_access")
        .select("kyc_status")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (access?.kyc_status !== "approved") {
        throw new Error("Zajawki ofert są dostępne po pozytywnej weryfikacji tożsamości (KYC).");
      }
    }

    const { data: teasers, error } = await db.rpc("investor_offer_teasers");
    if (error) throw new Error(error.message);
    const rows = (teasers ?? []) as any[];

    const signPhoto = async (path: string | null | undefined): Promise<string | null> => {
      if (!path) return null;
      if (/^https?:\/\//i.test(path)) return path;
      for (const bucket of PHOTO_BUCKETS) {
        const { data: signed } = await db.storage.from(bucket).createSignedUrl(path, 3600);
        if (signed?.signedUrl) return signed.signedUrl;
      }
      return null;
    };

    return Promise.all(
      rows.map(async (r) => {
        const photos: string[] = Array.isArray(r.photos) ? r.photos.filter(Boolean) : [];
        const safePhoto = photos.find(isShowablePropertyPhoto) ?? null;
        return {
          id: r.id,
          createdAt: r.created_at,
          loanAmount: r.loan_amount != null ? Number(r.loan_amount) : null,
          periodMonths:
            r.preferred_period_months != null ? Number(r.preferred_period_months) : null,
          annualRate: r.annual_investor_rate != null ? Number(r.annual_investor_rate) : null,
          ltv: r.estimated_ltv != null ? Number(r.estimated_ltv) : null,
          propertyType: r.property_type ?? null,
          city: r.city ?? null,
          voivodeship: r.voivodeship ?? null,
          estimatedValue: r.estimated_value != null ? Number(r.estimated_value) : null,
          areaSqm: r.area_sqm != null ? Number(r.area_sqm) : null,
          description: r.description ?? null,
          photoUrl: await signPhoto(safePhoto),
        };
      }),
    );
  });
