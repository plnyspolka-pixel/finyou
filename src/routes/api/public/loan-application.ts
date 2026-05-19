import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePolishPhone } from "@/lib/phone";

const Schema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().min(6).max(30),
  loan_amount: z.number().min(1000).max(100_000_000),
  preferred_period_months: z.number().int().min(1).max(600),
  property_type: z.enum([
    "mieszkanie",
    "dom",
    "lokal_uslugowy",
    "dzialka_budowlana",
    "grunt_rolny",
    "udzial_w_nieruchomosci",
    "inna",
  ]),
  city: z.string().max(120).optional().nullable(),
  situation_description: z.string().max(2000).optional().nullable(),
  consent_rodo: z.literal(true),
  source: z.string().max(120).optional().nullable(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/loan-application")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const json = await request.json();
          const data = Schema.parse(json);
          const { normalized, valid } = normalizePolishPhone(data.phone);

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
              source: data.source ?? "embed",
            })
            .select("id")
            .single();
          if (cErr || !client) throw cErr ?? new Error("client insert failed");

          const { data: loan, error: lErr } = await supabaseAdmin
            .from("loan_applications")
            .insert({
              client_id: client.id,
              status: "nowy_lead",
              loan_amount: data.loan_amount,
              preferred_period_months: data.preferred_period_months,
              situation_description: data.situation_description ?? null,
              source: data.source ?? "embed",
            })
            .select("id")
            .single();
          if (lErr || !loan) throw lErr ?? new Error("loan insert failed");

          await supabaseAdmin.from("properties").insert({
            loan_application_id: loan.id,
            property_type: data.property_type,
            city: data.city ?? null,
          });

          return new Response(JSON.stringify({ ok: true, id: loan.id }), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Bad request";
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 400,
            headers: corsHeaders,
          });
        }
      },
    },
  },
});
