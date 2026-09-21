// Standalone server fn dla analizy ryzyka powodziowego.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  analyzeFloodRisk,
  floodRiskInvestorText,
  type FloodAnalysisOutput,
} from "./flood-risk.server";

const Input = z.object({
  applicationId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  county: z.string().optional().nullable(),
  voivodeship: z.string().optional().nullable(),
  parcelNumber: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  geometry: z.any().optional().nullable(),
  propertyType: z.string().optional(),
});

export const runFloodRiskAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const { latitude, longitude } = data;
    let { address, city, voivodeship, propertyId } = data;

    // jeśli mamy applicationId — uzupełnij lokalizację z bazy
    if (data.applicationId && (!address || (latitude == null && longitude == null))) {
      const { data: props } = await supabaseAdmin
        .from("properties")
        .select("id, address, city, voivodeship")
        .eq("loan_application_id", data.applicationId)
        .limit(1);
      const p = props?.[0];
      if (p) {
        address = address ?? p.address;
        city = city ?? p.city;
        voivodeship = voivodeship ?? p.voivodeship;
        propertyId = propertyId ?? p.id;
      }
    }

    const out: FloodAnalysisOutput = await analyzeFloodRisk({
      latitude,
      longitude,
      address,
      city,
      voivodeship,
      geometry: data.geometry,
      propertyId: propertyId ?? null,
    });

    const investorText = floodRiskInvestorText(out.floodRisk, out.success);

    return {
      ...out,
      investmentOfferText: investorText,
      warnings: out.success ? [] : [out.message ?? "Niedostępne dane MZP/MRP."],
      dataSourcesUsed: [
        {
          source: "ISOK / Wody Polskie MZP/MRP",
          used: out.success,
          purpose: "weryfikacja zagrożenia powodziowego",
          dataLevel:
            out.property.geometryUsed === "parcel_geometry" ? "geometria działki" : "punkt",
          status: out.success
            ? out.errorCode === "NO_FLOOD_DATA"
              ? "no_data"
              : "success"
            : "error",
        },
      ],
    };
  });
