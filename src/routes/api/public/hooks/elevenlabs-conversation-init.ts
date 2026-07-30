import { createFileRoute } from "@tanstack/react-router";
import { loanStatusLabel } from "@/lib/loan-status";
import { requireWebhookSecret } from "@/lib/cron-auth.server";

/**
 * Conversation Initiation Webhook dla ElevenLabs.
 *
 * Wkleić URL tego endpointu w panelu agenta ElevenLabs:
 *   Agent → Security / Advanced → Fetch initiation client data from webhook
 *   URL: https://financeyou.pl/api/public/hooks/elevenlabs-conversation-init
 *
 * ElevenLabs woła POST z body zawierającym m.in. caller_id / called_number / agent_id
 * (zarówno dla połączeń inbound jak i outbound przed startem rozmowy).
 * Odpowiadamy ciałem `conversation_initiation_client_data` z dynamicznymi zmiennymi.
 *
 * UWAGA: ElevenLabs akceptuje w `dynamic_variables` wyłącznie wartości
 * prymitywne (string / number / boolean). Tablice/obiekty muszą być
 * sklejone do stringa, inaczej agent ich nie podstawi.
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
  let s = String(raw)
    .trim()
    .replace(/[\s\-()]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 9) return `+48${d}`;
  if (d.length === 11 && d.startsWith("48")) return `+${d}`;
  return `+${d}`;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  mieszkanie: "Mieszkanie",
  dom: "Dom",
  dzialka: "Działka",
  lokal_uzytkowy: "Lokal użytkowy",
  inne: "Inne",
};

const STEP_LABELS: Record<number, string> = {
  1: "Start wniosku",
  2: "Warunki spłaty",
  3: "Formularz danych",
  4: "Zabezpieczenie",
  5: "Weryfikacja dokumentów",
  6: "Analiza wniosku",
  7: "Oferta i umowa",
};

async function handler({ request }: { request: Request }) {
  // Endpoint zwraca PII klienta po numerze telefonu (caller_id) — wymaga
  // sekretu webhooka ElevenLabs, tak jak sąsiedni voicebot-inbound. Bez tego
  // każdy mógłby enumerować bazę klientów po numerze.
  const denied = requireWebhookSecret(request, "ELEVENLABS_WEBHOOK_SECRET");
  if (denied) return denied;

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

  console.log("[el-conv-init] incoming", {
    method: request.method,
    phone,
    keys: Object.keys(payload ?? {}),
  });

  // Domyślne wartości — wszystkie jako prymitywne typy (string/number/boolean).
  const dyn: Record<string, string | number | boolean> = {
    first_name: "",
    last_name: "",
    full_name: "",
    phone: phone ?? "",
    email: "",
    loan_amount: 0,
    current_step: 0,
    step_label: "",
    missing_step: "",
    property_type: "",
    property_type_label: "",
    property_city: "",
    uploaded_documents: "",
    uploaded_documents_count: 0,
    missing_documents: "",
    missing_documents_count: 0,
    completion_percent: 0,
    is_complete: false,
    client_id: "",
    loan_application_id: "",
    application_link: "",
    do_not_call: false,
    max_monthly_payment: 0,
    max_monthly_loan_cost: 0,
    preferred_repayment_period: 0,
    client_repayment_comment: "",
    has_application: false,
    status: "",
    status_label: "Brak danych",
    status_message: "",
    client_action: "",
    is_decision_available: false,
    is_completed: false,
    is_rejected: false,
    city: "",
  };

  if (phone) {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, first_name, last_name, email, city, consent_phone")
      .eq("phone_normalized", phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (client) {
      dyn.client_id = client.id;
      dyn.first_name = client.first_name ?? "";
      dyn.last_name = client.last_name ?? "";
      dyn.full_name = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim();
      dyn.email = client.email ?? "";
      dyn.city = client.city ?? "";
      dyn.do_not_call = client.consent_phone === false;

      const { data: app } = await supabaseAdmin
        .from("loan_applications")
        .select(
          "id, status, loan_amount, completeness_percent, missing_fields, missing_documents_snapshot, return_link, return_link_token, situation_description, current_form_step, max_monthly_payment, preferred_period_months, admin_decision, decision_reason",
        )
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (app) {
        dyn.has_application = true;
        dyn.loan_application_id = app.id;
        dyn.status = String(app.status ?? "");
        dyn.status_label = loanStatusLabel(app.status);
        dyn.loan_amount = app.loan_amount ? Math.round(Number(app.loan_amount)) : 0;
        dyn.completion_percent = Number(app.completeness_percent ?? 0);
        dyn.is_complete = Number(app.completeness_percent ?? 0) >= 100;
        dyn.current_step = Number(app.current_form_step ?? 0);
        dyn.step_label = STEP_LABELS[Number(app.current_form_step ?? 0)] ?? "";
        dyn.client_repayment_comment = app.situation_description ?? "";
        dyn.max_monthly_payment = app.max_monthly_payment
          ? Math.round(Number(app.max_monthly_payment))
          : 0;
        dyn.max_monthly_loan_cost = dyn.max_monthly_payment; // alias — koszt = rata
        dyn.preferred_repayment_period = Number(app.preferred_period_months ?? 0);

        const missing = Array.isArray(app.missing_fields) ? (app.missing_fields as string[]) : [];
        const missingDocs = Array.isArray(app.missing_documents_snapshot)
          ? (app.missing_documents_snapshot as string[])
          : [];

        // Nieruchomość (potrzebne do wyliczenia kontekstowych braków)
        const { data: prop } = await supabaseAdmin
          .from("properties")
          .select("property_type, city, land_register_number")
          .eq("loan_application_id", app.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prop) {
          dyn.property_type = String(prop.property_type ?? "");
          dyn.property_type_label =
            PROPERTY_TYPE_LABELS[String(prop.property_type ?? "")] ??
            String(prop.property_type ?? "");
          dyn.property_city = prop.city ?? "";
        }

        // Wgrane dokumenty
        const { data: docs } = await supabaseAdmin
          .from("documents")
          .select("doc_type, file_name")
          .eq("loan_application_id", app.id);
        const docList = docs ?? [];
        if (docList.length > 0) {
          const names = docList.map((d: any) => d.doc_type ?? d.file_name).filter(Boolean);
          dyn.uploaded_documents = names.join(", ");
          dyn.uploaded_documents_count = names.length;
        }

        // ===== Kontekstowe missing_documents zależne od typu nieruchomości i kroku =====
        const hasPhotos = docList.some((d: any) => {
          const t = String(d.doc_type ?? d.file_name ?? "").toLowerCase();
          return /zdjec|foto|photo|image|img/.test(t);
        });
        const hasFinancialDocs = docList.some((d: any) => {
          const t = String(d.doc_type ?? "").toLowerCase();
          return /zaswiadcz|wyciag|pit|umowa|dochod|dochód|bank/.test(t);
        });
        const hasKw = !!(prop?.land_register_number && String(prop.land_register_number).trim());
        const ptype = String(prop?.property_type ?? "");

        // Etykiety potrzebne dla agenta — czytelne, po polsku
        const propPhotoLabel =
          ptype === "dzialka"
            ? "zdjęcia działki"
            : ptype === "lokal_uzytkowy"
              ? "zdjęcia lokalu"
              : ptype === "dom"
                ? "zdjęcia domu"
                : ptype === "mieszkanie"
                  ? "zdjęcia mieszkania"
                  : "zdjęcia nieruchomości";

        const contextual: string[] = [];
        if (ptype) {
          if (!hasPhotos) contextual.push(propPhotoLabel);
          if (!hasKw) contextual.push("numer księgi wieczystej");
        }
        // Dokumenty finansowe wymagane od kroku weryfikacji (>=5) jeżeli klient
        // nie wgrał jeszcze nic potwierdzającego dochód
        const step = Number(app.current_form_step ?? 0);
        if (step >= 5 && !hasFinancialDocs) {
          contextual.push("dokument potwierdzający dochód (zaświadczenie, wyciąg lub PIT)");
        }

        // Złącz z brakami zapisanymi w bazie (priorytet: kontekstowe + DB)
        const allMissing = [...new Set([...contextual, ...missing, ...missingDocs])];
        dyn.missing_documents =
          allMissing.length > 0 ? allMissing.join(", ") : "wszystko skompletowane";
        dyn.missing_documents_count = allMissing.length;
        dyn.missing_step = allMissing[0] ?? "";

        dyn.application_link = "https://financeyou.pl";

        // Status decyzji
        const decision = (app.admin_decision ?? "").toLowerCase();
        dyn.is_decision_available = decision === "approved" || decision === "rejected";
        dyn.is_rejected = decision === "rejected" || app.status === "wniosek_odrzucony";
        dyn.is_completed = app.status === "wyplacony" || app.status === "zamkniety";

        // Wiadomość statusowa + akcja klienta
        if (dyn.is_rejected) {
          dyn.status_message = app.decision_reason ?? "Wniosek odrzucony.";
          dyn.client_action = "Brak dalszych akcji";
        } else if (dyn.is_completed) {
          dyn.status_message = "Środki zostały wypłacone.";
          dyn.client_action = "Brak dalszych akcji";
        } else if (allMissing.length > 0) {
          dyn.status_message = `Czekamy na: ${allMissing.join(", ")}.`;
          dyn.client_action = `Uzupełnij: ${allMissing[0]}`;
        } else if (Number(app.completeness_percent ?? 0) < 100) {
          dyn.status_message = "Wniosek wymaga dokończenia.";
          dyn.client_action = "Dokończ wniosek online";
        } else {
          dyn.status_message = "Wniosek jest analizowany.";
          dyn.client_action = "Czekaj na kontakt opiekuna";
        }
      }
    } else {
      // Fallback: lead z Meta po telefonie
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("first_name, last_name, email, application_data, return_link")
        .eq("phone_normalized", phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lead) {
        dyn.first_name = lead.first_name ?? "";
        dyn.last_name = lead.last_name ?? "";
        dyn.full_name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
        dyn.email = lead.email ?? "";
        const ad: any = lead.application_data ?? {};
        if (ad.loan_amount) dyn.loan_amount = Number(ad.loan_amount) || 0;
        if (ad.purpose) dyn.client_repayment_comment = String(ad.purpose);
        if (lead.return_link) dyn.application_link = lead.return_link;
      }
    }
  }

  return Response.json({
    type: "conversation_initiation_client_data",
    dynamic_variables: dyn,
  });
}
