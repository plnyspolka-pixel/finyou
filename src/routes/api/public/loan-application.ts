import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePolishPhone } from "@/lib/phone";
import { runPropertyCollateralAnalysisCore } from "@/lib/property-analysis/property-collateral-analysis.functions";

const Schema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().min(6).max(30),
  loan_amount: z.number().min(1000).max(100_000_000),
  annual_investor_rate: z.number().min(1).max(100).optional().nullable(),
  max_monthly_payment: z.number().min(0).max(10_000_000).optional().nullable(),
  preferred_period_months: z.number().int().min(1).max(600),
  business_status: z.enum(["prowadzi", "zamierza", "nie_zamierza"]).optional().nullable(),
  nip: z.string().max(20).optional().nullable(),
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
  street: z.string().max(200).optional().nullable(),
  voivodeship: z.string().max(120).optional().nullable(),
  kw_status: z.enum(["znam", "nie_znam", "brak"]).optional().nullable(),
  land_register_number: z.string().max(60).optional().nullable(),
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

          // Ochrona przed podwójnym wysłaniem / spamem: jeśli ten sam e-mail
          // złożył wniosek w ciągu ostatnich 60 s, zwracamy istniejący wniosek
          // zamiast tworzyć duplikat i ponownie odpalać kosztowną analizę
          // nieruchomości. Okno jest krótkie — nie blokuje realnych, poprawionych
          // ponownych zgłoszeń (formularz i tak przekierowuje po sukcesie).
          const since = new Date(Date.now() - 60_000).toISOString();
          const { data: recentClients } = await supabaseAdmin
            .from("clients")
            .select("id")
            .eq("email", data.email)
            .gte("created_at", since);
          const recentIds = (recentClients ?? []).map((c) => c.id);
          if (recentIds.length > 0) {
            const { data: dup } = await supabaseAdmin
              .from("loan_applications")
              .select("id")
              .in("client_id", recentIds)
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (dup?.id) {
              return new Response(JSON.stringify({ ok: true, id: dup.id, duplicate: true }), {
                status: 200,
                headers: corsHeaders,
              });
            }
          }

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
              annual_investor_rate: data.annual_investor_rate ?? null,
              max_monthly_payment: data.max_monthly_payment ?? null,
              preferred_period_months: data.preferred_period_months,
              business_status: data.business_status ?? null,
              nip: data.nip ?? null,
              kw_status: data.kw_status ?? null,
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
            street: data.street ?? null,
            voivodeship: data.voivodeship ?? null,
            land_register_number: data.land_register_number ?? null,
          });

          // Jednorazowa analiza zabezpieczenia — fire-and-forget, zapisuje wynik na stałe.
          void runPropertyCollateralAnalysisCore(loan.id).catch((err) => {
            console.error("[loan-application] collateral analysis failed", err);
          });

          return new Response(JSON.stringify({ ok: true, id: loan.id }), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (e) {
          // Błędy walidacji (Zod) są bezpieczne i pomocne dla klienta.
          // Pozostałe (np. błędy bazy) logujemy po stronie serwera i zwracamy
          // komunikat ogólny, aby nie ujawniać wewnętrznych szczegółów.
          if (e instanceof z.ZodError) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: "Nieprawidłowe dane formularza.",
                issues: e.issues,
              }),
              { status: 400, headers: corsHeaders },
            );
          }
          console.error("[loan-application] error", e);
          return new Response(
            JSON.stringify({ ok: false, error: "Wystąpił błąd. Spróbuj ponownie później." }),
            { status: 500, headers: corsHeaders },
          );
        }
      },
    },
  },
});
