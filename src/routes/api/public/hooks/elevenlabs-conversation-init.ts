import { createFileRoute } from "@tanstack/react-router";

/**
 * Conversation Initiation Webhook dla ElevenLabs.
 *
 * Wkleić URL tego endpointu w panelu agenta ElevenLabs:
 *   Agent → Security / Advanced → Fetch initiation client data from webhook
 *   URL: https://financeyou.pl/api/public/hooks/elevenlabs-conversation-init
 *
 * ElevenLabs woła POST z body zawierającym m.in. caller_id / called_number / agent_id
 * (zarówno dla połączeń inbound jak i outbound przed startem rozmowy).
 * Odpowiadamy ciałem `conversation_initiation_client_data` z dynamicznymi zmiennymi
 * (imię, kwota wniosku, status, brakujące dokumenty, % wypełnienia, link itp.),
 * dzięki czemu Ania mówi po imieniu i operuje realnymi danymi klienta.
 */
export const Route = createFileRoute("/api/public/hooks/elevenlabs-conversation-init")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-()]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 9) return `+48${d}`;
  if (d.length === 11 && d.startsWith("48")) return `+${d}`;
  return `+${d}`;
}

async function handler({ request }: { request: Request }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let payload: any = {};
  try {
    if (request.method === "POST") {
      payload = await request.json().catch(() => ({}));
    } else {
      const u = new URL(request.url);
      payload = Object.fromEntries(u.searchParams.entries());
    }
  } catch {
    payload = {};
  }

  // ElevenLabs przesyła różne pola w zależności od konfiguracji. Próbujemy wszystkich.
  const callerRaw =
    payload?.caller_id ??
    payload?.from_number ??
    payload?.from ??
    payload?.call?.from ??
    payload?.to_number ??
    payload?.called_number ??
    payload?.to ??
    null;
  const phone = normalizePhone(callerRaw);

  console.log("[el-conv-init] incoming", { method: request.method, phone, keys: Object.keys(payload ?? {}) });

  // Domyślne wartości — żeby agent miał czym wypełnić zmienne nawet bez dopasowania.
  const dyn: Record<string, string> = {
    first_name: "",
    last_name: "",
    full_name: "",
    loan_amount: "",
    loan_purpose: "",
    completion_percent: "0",
    missing_documents: "",
    loan_application_id: "",
    return_link: "",
    status: "",
    city: "",
  };

  if (phone) {
    // Klient po telefonie (clients.phone_normalized).
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, first_name, last_name, city")
      .eq("phone_normalized", phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (client) {
      dyn.first_name = client.first_name ?? "";
      dyn.last_name = client.last_name ?? "";
      dyn.full_name = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim();
      dyn.city = client.city ?? "";

      // Najnowszy wniosek tego klienta
      const { data: app } = await supabaseAdmin
        .from("loan_applications")
        .select("id, status, loan_amount, completeness_percent, missing_fields, return_link, return_link_token, situation_description")
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (app) {
        dyn.loan_application_id = app.id;
        dyn.status = String(app.status ?? "");
        dyn.loan_amount = app.loan_amount ? String(Math.round(Number(app.loan_amount))) : "";
        dyn.loan_purpose = app.situation_description ?? "";
        dyn.completion_percent = String(app.completeness_percent ?? 0);
        const missing = Array.isArray(app.missing_fields) ? app.missing_fields : [];
        dyn.missing_documents = missing.length > 0 ? missing.join(", ") : "wszystko skompletowane";
        dyn.return_link =
          app.return_link ??
          (app.return_link_token ? `https://app.financeyou.pl/wniosek/${app.return_link_token}` : "");
      }
    } else {
      // Fallback: lead z Meta po telefonie
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("first_name, last_name, application_data, return_link")
        .eq("phone_normalized", phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lead) {
        dyn.first_name = lead.first_name ?? "";
        dyn.last_name = lead.last_name ?? "";
        dyn.full_name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
        const ad: any = lead.application_data ?? {};
        if (ad.loan_amount) dyn.loan_amount = String(ad.loan_amount);
        if (ad.purpose) dyn.loan_purpose = String(ad.purpose);
        if (lead.return_link) dyn.return_link = lead.return_link;
      }
    }
  }

  return Response.json({
    type: "conversation_initiation_client_data",
    dynamic_variables: dyn,
  });
}
