import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { describeLoanStatusForAgent, LOAN_STATUS_LABELS } from "@/lib/loan-status";

// Webhook dla ElevenLabs Conversational AI „Personalization / Fetch
// conversation initiation data". Wywoływany na początku INBOUND callu
// (klient dzwoni do nas). Identyfikujemy klienta po numerze (`caller_id`)
// i zwracamy `dynamic_variables` dla agenta — przede wszystkim aktualny
// status wniosku po polsku.
//
// Auth: nagłówek `x-webhook-secret` = ELEVENLABS_WEBHOOK_SECRET
// (preferowane). Fallback: `apikey` = SUPABASE_ANON_KEY.

function normalize(phone: string | null | undefined): string {
  if (!phone) return "";
  const s = String(phone).replace(/[\s-]/g, "");
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 9) return `+48${d}`;
  if (d.length === 11 && d.startsWith("48")) return `+${d}`;
  return d ? `+${d}` : "";
}

export const Route = createFileRoute("/api/public/hooks/voicebot-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-webhook-secret");
        const apiKey = request.headers.get("apikey");
        const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
        const expectedAnon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
        const okSecret = expectedSecret && secret && secret === expectedSecret;
        const okAnon = expectedAnon && apiKey && apiKey === expectedAnon;
        if (!okSecret && !okAnon) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          // ok — może pusty payload
        }

        // ElevenLabs przekazuje caller_id (numer dzwoniącego) w polu
        // `caller_id`. Akceptujemy też `from` / `phone` jako fallback.
        const rawPhone =
          body?.caller_id ?? body?.from ?? body?.phone ?? body?.caller_id_number ?? null;
        const phone = normalize(rawPhone);

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const baseVars: Record<string, string> = {
          inbound: "true",
          caller_phone: phone || "",
          first_name: "",
          last_name: "",
          has_application: "false",
          status: "",
          status_label: "",
          status_message:
            "Nie znaleźliśmy w bazie żadnego aktywnego wniosku powiązanego z tym numerem. Mogę pomóc założyć nowy wniosek.",
          client_action: "Złóż wniosek na naszej stronie internetowej.",
          is_decision_available: "false",
          is_completed: "false",
          is_rejected: "false",
          loan_application_id: "",
          client_id: "",
        };

        if (!phone) {
          return Response.json({ dynamic_variables: baseVars });
        }

        // 1. Znajdź klienta po numerze.
        const { data: clients } = await supabase
          .from("clients")
          .select("id,first_name,last_name,phone,phone_normalized,do_not_call")
          .or(`phone_normalized.eq.${phone},phone.eq.${phone}`)
          .limit(1);
        const client = clients?.[0];

        if (!client) {
          return Response.json({ dynamic_variables: baseVars });
        }

        baseVars.first_name = client.first_name ?? "";
        baseVars.last_name = client.last_name ?? "";
        baseVars.client_id = client.id;

        // 2. Znajdź najnowszy wniosek klienta (najświeższy istotny).
        const { data: loans } = await supabase
          .from("loan_applications")
          .select("id,status,loan_amount,current_form_step,created_at")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const loan = loans?.[0];

        if (!loan) {
          return Response.json({ dynamic_variables: baseVars });
        }

        const described = describeLoanStatusForAgent(loan.status);
        const vars: Record<string, string> = {
          ...baseVars,
          has_application: "true",
          loan_application_id: loan.id,
          status: loan.status,
          status_label: described.status_label,
          status_message: described.status_message,
          client_action: described.client_action,
          is_decision_available: described.is_decision_available ? "true" : "false",
          is_completed: described.is_completed ? "true" : "false",
          is_rejected: described.is_rejected ? "true" : "false",
          loan_amount: loan.loan_amount != null ? String(loan.loan_amount) : "",
        };

        return Response.json({ dynamic_variables: vars });
      },
      GET: async () =>
        Response.json({
          ok: true,
          hint:
            "POST { caller_id } z nagłówkiem x-webhook-secret. Zwraca dynamic_variables dla agenta inbound.",
          known_statuses: Object.keys(LOAN_STATUS_LABELS),
        }),
    },
  },
});
