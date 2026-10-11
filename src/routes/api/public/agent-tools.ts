// Webhook toole agentów ElevenLabs — jeden endpoint dla wszystkich narzędzi
// procesowych. Agent (konsola ElevenLabs → Tools → Webhook) woła POST z JSON:
//   { "tool": "...", "lead_id"?, "phone"?, "email"?, "application_id"?, "args"? }
// Auth: nagłówek X-Agent-Tools-Secret albo ?token= — sekret AGENT_TOOLS_SECRET.
//
// Narzędzia wołają DOKŁADNIE te same funkcje serwerowe co dotychczasowe boty
// (executeTool z elevenlabs-text-agent.server), więc zapisy w bazie wyglądają
// identycznie; do tego odczyt statusu wniosku, brief braków i issue_invoice.
//
// Od 2026-10 dodatkowo (src/lib/agent-toolkit):
//   • rozpoznanie agenta po `agent_id` (zmienna systemowa system__agent_id) →
//     powierzchnia (intake / investor_info / investor_panel / phone),
//   • polityka narzędzi per powierzchnia + limit na godzinę + dziennik KAŻDEGO
//     wywołania (ai_growth_action_log, module "agent_tools"),
//   • nowe narzędzia: get_offer_facts, estimate_cost, search_knowledge,
//     get_case_snapshot, get_market_snapshot, flag_urgent, log_insight,
//     request_capability,
//   • sekret porównywany w stałym czasie.
import { createFileRoute } from "@tanstack/react-router";
import { safeEqual } from "@/lib/cron-auth.server";
import type { ToolSurface } from "@/lib/agent-toolkit/policy";

const WRITE_TOOLS = new Set([
  "update_lead_data",
  "send_application_link",
  "mark_ready_for_human",
  "request_invoice",
]);

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
        const secret = process.env.AGENT_TOOLS_SECRET;
        const url = new URL(request.url);
        const provided =
          request.headers.get("x-agent-tools-secret") ?? url.searchParams.get("token") ?? "";
        if (!secret || !provided || !safeEqual(provided, secret)) return unauthorized();

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
        }
        const tool = String(body?.tool ?? "");
        const args = body?.args ?? {};

        try {
          const {
            surfaceForAgentId,
            gateToolCall,
            auditToolCall,
            runNewAgentTool,
            NEW_AGENT_TOOLS,
          } = await import("@/lib/agent-toolkit/tools.server");
          const surface: ToolSurface = await surfaceForAgentId(
            typeof body?.agent_id === "string" ? body.agent_id : null,
          );
          const channel = typeof body?.channel === "string" ? body.channel : null;

          // ── Nowe narzędzia (polityka + limit + audyt w środku) ──────────────
          if (NEW_AGENT_TOOLS.has(tool)) {
            const leadId = await resolveLeadId(body);
            const res = await runNewAgentTool({ tool, surface, leadId, args, channel });
            return Response.json(res);
          }

          // ── Dotychczasowe narzędzia: ta sama polityka i dziennik ────────────
          const started = Date.now();
          const gateLead = await resolveLeadId(body);
          const denied = await gateToolCall({ tool, surface, leadId: gateLead, args, channel });
          if (denied) {
            await auditToolCall(
              { tool, surface, leadId: gateLead, args, channel },
              { ok: false, error: denied },
              0,
            );
            return Response.json({ ok: false, error: denied });
          }
          // Audyt po fakcie — nie blokuje odpowiedzi narzędzia.
          const audit = (ok: boolean, error?: string) =>
            auditToolCall(
              { tool, surface, leadId: gateLead, args, channel },
              { ok, error },
              Date.now() - started,
            ).catch(() => {});

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
              // Agent inwestorski nie może promować leada do wniosku pożyczkowego.
              variant:
                surface === "investor_info"
                  ? "inwestor"
                  : surface === "investor_panel"
                    ? "inwestor_prywatny"
                    : "klient",
            });
            await audit(true);
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
            await audit(true);
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
            await audit(true);
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
            await audit(result.ok);
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
