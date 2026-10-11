// Webhook toole agentów ElevenLabs — jeden endpoint, dwie ścieżki. Agent
// (konsola ElevenLabs → Tools → Webhook) woła POST z JSON.
//
// 1. Ścieżka rejestru — flota agentów (recepcja, intake, presale inwestora,
//    panel inwestora, windykacja głosowa i tekstowa):
//      { "tool": "...", "agent_key": "...", "conversation_id"?, "thread_key"?,
//        "channel"?, "phone"?, "email"?, "args"? }
//    Wybierana, gdy body niesie `agent_key` ALBO `tool` nie jest narzędziem
//    legacy. Całość robi dispatchTool (@/lib/agent-tools/registry.server):
//    sekret porównywany w czasie stałym (zapisy i dane podmiotu — WYŁĄCZNIE
//    nagłówek X-Agent-Tools-Secret, nigdy ?token=), lista dozwolonych agentów,
//    bramka tożsamości, limit na rozmowę, redakcja wyniku i audyt każdej
//    decyzji w agent_tool_calls. Żądanie bez poprawnego sekretu dostaje 401
//    i nie dociera do żadnego handlera. Handlery ufają tylko sesji rozmowy,
//    nigdy identyfikatorom z body.
//    Obecność `agent_key` przesądza o tej ścieżce nawet przy nazwie legacy —
//    agent floty nie może zejść do słabszej autoryzacji (?token=) ani do
//    odczytu po lead_id podanym w body.
//
// 2. Ścieżka legacy — żywe narzędzia fy_* skonfigurowane ręcznie w konsoli
//    ElevenLabs (update_lead_data, send_application_link, mark_ready_for_human,
//    request_invoice, get_application_status, get_missing_info_brief,
//    issue_invoice). Zachowanie bez zmian:
//      { "tool": "...", "lead_id"?, "phone"?, "email"?, "application_id"?, "args"? }
//    Auth: nagłówek X-Agent-Tools-Secret albo ?token= — sekret AGENT_TOOLS_SECRET.
//    Narzędzia wołają DOKŁADNIE te same funkcje serwerowe co dotychczasowe boty
//    (executeTool z elevenlabs-text-agent.server), więc zapisy w bazie wyglądają
//    identycznie; do tego odczyt statusu wniosku, brief braków i issue_invoice.
//
// Body czytamy raz, PRZED sprawdzeniem sekretu, bo dopiero z niego wiadomo,
// która ścieżka autoryzuje. Nieparsowalny JSON idzie ścieżką legacy, więc
// odpowiedź jest taka jak dotąd: bez sekretu 401, z sekretem 400 invalid_json.
import { createFileRoute } from "@tanstack/react-router";

const WRITE_TOOLS = new Set([
  "update_lead_data",
  "send_application_link",
  "mark_ready_for_human",
  "request_invoice",
]);

/** Nazwy obsługiwane przez ścieżkę legacy — porównanie dosłowne, jak dotąd. */
const LEGACY_TOOLS = new Set([
  ...WRITE_TOOLS,
  "get_application_status",
  "get_missing_info_brief",
  "issue_invoice",
]);

/** Body jako obiekt — tablica / liczba / null z JSON-a nie niesie pól narzędzia. */
function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * Czy wywołanie należy do rejestru narzędzi agentów. Pusty `agent_key`
 * (np. niewypełniona zmienna dynamiczna) nie przejmuje narzędzia legacy;
 * każda niepusta wartość — tak, także nieznany klucz, który rejestr odrzuci.
 */
function routesToRegistry(body: Record<string, unknown>): boolean {
  const agentKey = body.agent_key;
  const hasAgentKey =
    typeof agentKey === "string" ? agentKey.trim() !== "" : agentKey != null;
  if (hasAgentKey) return true;
  return !LEGACY_TOOLS.has(String(body.tool ?? ""));
}

function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/** Kontakt z żądania: zmienne dynamiczne (lead_id/phone/email) LUB dane
 *  zebrane przez model w args (anonimowy chat — telefon/e-mail z rozmowy). */
function contactFromBody(body: any): { phone: string | null; email: string | null } {
  const args = body?.args ?? {};
  const patch = args?.patch ?? {};
  const phone =
    [body.phone, args.phone, patch.phone, patch.telefon].find(
      (v) => typeof v === "string" && v.trim(),
    ) ?? null;
  const email =
    [body.email, args.email, patch.email].find((v) => typeof v === "string" && v.trim()) ?? null;
  return { phone, email: email ? String(email).trim().toLowerCase() : null };
}

async function resolveLeadId(body: any): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (typeof body.lead_id === "string" && body.lead_id) return body.lead_id;

  const { phone, email } = contactFromBody(body);
  if (phone) {
    const { normalizePolishPhone } = await import("@/lib/phone");
    const { normalized } = normalizePolishPhone(phone);
    if (normalized) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("phone_normalized", normalized)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
  }
  if (email) {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function resolveApplicationId(body: any, leadId: string | null): Promise<string | null> {
  if (typeof body.application_id === "string" && body.application_id) return body.application_id;
  if (!leadId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("loan_application_id, client_id")
    .eq("id", leadId)
    .maybeSingle();
  if (lead?.loan_application_id) return lead.loan_application_id;
  if (lead?.client_id) {
    const { data: app } = await supabaseAdmin
      .from("loan_applications")
      .select("id")
      .eq("client_id", lead.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return app?.id ?? null;
  }
  return null;
}

export const Route = createFileRoute("/api/public/agent-tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any;
        let parsed = true;
        try {
          body = await request.json();
        } catch {
          parsed = false;
        }

        // ── Ścieżka rejestru — autoryzuje sam dispatchTool ─────────────────
        if (parsed && routesToRegistry(asObject(body))) {
          try {
            const { dispatchTool } = await import("@/lib/agent-tools/registry.server");
            const outcome = await dispatchTool(request, asObject(body));
            return Response.json(outcome.body, { status: outcome.status });
          } catch (e: any) {
            // dispatchTool sam nie rzuca; tu trafia tylko awaria ładowania
            // modułów. Bez szczegółów w odpowiedzi — agent czyta ją rozmówcy.
            console.error("[agent-tools] dispatch error", e?.message);
            return Response.json(
              { ok: false, error: "Narzędzie jest chwilowo niedostępne — spróbuj ponownie za chwilę." },
              { status: 500 },
            );
          }
        }

        // ── Ścieżka legacy — sekret z nagłówka albo ?token=, jak dotąd ──────
        const secret = process.env.AGENT_TOOLS_SECRET;
        const url = new URL(request.url);
        const provided =
          request.headers.get("x-agent-tools-secret") ?? url.searchParams.get("token");
        if (!secret || provided !== secret) return unauthorized();

        if (!parsed) {
          return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
        }
        const tool = String(body?.tool ?? "");
        const args = body?.args ?? {};

        try {
          // ── Narzędzia zapisu — reuse istniejącego executor-a botów ─────────
          if (WRITE_TOOLS.has(tool)) {
            let leadId = await resolveLeadId(body);
            // Anonimowy rozmówca z chatu: pierwszy zapis danych zakłada leada
            // z kontaktu zebranego w rozmowie (jak stary chat-widget).
            if (!leadId && tool === "update_lead_data") {
              const { phone, email } = contactFromBody(body);
              if (phone || email) {
                const { normalizePolishPhone } = await import("@/lib/phone");
                const { normalized } = normalizePolishPhone(phone ?? "");
                const { upsertLeadFromSource } = await import("@/lib/lead-comms.server");
                leadId = await upsertLeadFromSource({
                  type: "pozyczkowy",
                  source: "agent_tool",
                  phoneRaw: phone,
                  phoneNormalized: normalized,
                  email,
                  applicationData: {},
                });
              }
            }
            if (!leadId) {
              return Response.json({
                ok: false,
                error:
                  "Nie znaleziono rozmówcy w systemie — poproś o numer telefonu lub e-mail i przekaż go w args.",
              });
            }
            const { executeTool } = await import("@/lib/elevenlabs-text-agent.server");
            const result = await executeTool(leadId, "agent_tool", tool, args, {
              applicationLink: "https://financeyou.pl/klient",
            });
            return Response.json({ ok: true, result });
          }

          // ── Status wniosku (słownik kliencki — to samo, co widzi panel) ────
          if (tool === "get_application_status") {
            const leadId = await resolveLeadId(body);
            const applicationId = await resolveApplicationId(body, leadId);
            if (!applicationId) {
              return Response.json({ ok: true, result: { has_application: false } });
            }
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: app } = await supabaseAdmin
              .from("loan_applications")
              .select("status")
              .eq("id", applicationId)
              .maybeSingle();
            const { clientLoanStatusView, describeLoanStatusForAgent } =
              await import("@/lib/loan-status");
            const view = clientLoanStatusView(app?.status);
            return Response.json({
              ok: true,
              result: {
                has_application: true,
                status: view.status,
                label: view.label,
                description: view.description,
                stage: view.stage,
                voice: describeLoanStatusForAgent(String(app?.status ?? "")),
              },
            });
          }

          // ── Brief braków (te same pytania co follow-upy) ───────────────────
          if (tool === "get_missing_info_brief") {
            const leadId = await resolveLeadId(body);
            const applicationId = await resolveApplicationId(body, leadId);
            if (!applicationId) {
              return Response.json({ ok: true, result: { has_application: false, items: [] } });
            }
            const { buildBriefBundles } =
              await import("@/lib/missing-info-follow-up/engine.server");
            const bundles = await buildBriefBundles([applicationId]);
            const brief = bundles.get(applicationId)?.brief;
            return Response.json({
              ok: true,
              result: {
                has_application: true,
                is_complete: (brief?.items.length ?? 0) === 0,
                items: (brief?.items ?? []).map((i) => ({
                  label: i.label,
                  question: i.question,
                  documents: i.documents,
                })),
              },
            });
          }

          // ── Faktura na żądanie ─────────────────────────────────────────────
          if (tool === "issue_invoice") {
            const { issueInvoiceOnDemand } =
              await import("@/lib/invoicing/invoice-on-demand.server");
            const result = await issueInvoiceOnDemand({
              nip: String(args?.nip ?? ""),
              email: String(args?.email ?? ""),
              description: String(args?.opis ?? args?.description ?? ""),
              grossAmount:
                typeof args?.kwota === "number" ? args.kwota : (args?.gross_amount ?? null),
              productCode: args?.product_code ?? null,
              buyerName: args?.nazwa_firmy ?? args?.buyer_name ?? null,
              buyerStreet: args?.adres ?? null,
              buyerPostalCode: args?.kod_pocztowy ?? null,
              buyerCity: args?.miasto ?? null,
            });
            return Response.json({ ok: result.ok, result });
          }

          return Response.json({ ok: false, error: `unknown tool: ${tool}` }, { status: 400 });
        } catch (e: any) {
          console.error("[agent-tools] error", tool, e?.message);
          return Response.json({ ok: false, error: e?.message ?? "błąd" }, { status: 500 });
        }
      },
    },
  },
});
