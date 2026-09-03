// Webhook toole agentów ElevenLabs — jeden endpoint dla wszystkich narzędzi
// procesowych. Agent (konsola ElevenLabs → Tools → Webhook) woła POST z JSON:
//   { "tool": "...", "lead_id"?, "phone"?, "email"?, "application_id"?, "args"? }
// Auth: nagłówek X-Agent-Tools-Secret albo ?token= — sekret AGENT_TOOLS_SECRET.
//
// Narzędzia wołają DOKŁADNIE te same funkcje serwerowe co dotychczasowe boty
// (executeTool z elevenlabs-text-agent.server), więc zapisy w bazie wyglądają
// identycznie; do tego odczyt statusu wniosku, brief braków i issue_invoice.
import { createFileRoute } from "@tanstack/react-router";

const WRITE_TOOLS = new Set([
  "update_lead_data",
  "send_application_link",
  "mark_ready_for_human",
  "request_invoice",
]);

function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

async function resolveLeadId(body: any): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (typeof body.lead_id === "string" && body.lead_id) return body.lead_id;

  if (typeof body.phone === "string" && body.phone) {
    const { normalizePolishPhone } = await import("@/lib/phone");
    const { normalized } = normalizePolishPhone(body.phone);
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
  if (typeof body.email === "string" && body.email) {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("email", String(body.email).trim().toLowerCase())
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
          request.headers.get("x-agent-tools-secret") ?? url.searchParams.get("token");
        if (!secret || provided !== secret) return unauthorized();

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
        }
        const tool = String(body?.tool ?? "");
        const args = body?.args ?? {};

        try {
          // ── Narzędzia zapisu — reuse istniejącego executor-a botów ─────────
          if (WRITE_TOOLS.has(tool)) {
            const leadId = await resolveLeadId(body);
            if (!leadId) {
              return Response.json({
                ok: false,
                error: "Nie znaleziono leada — podaj lead_id, telefon albo e-mail rozmówcy.",
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
            const { clientLoanStatusView, describeLoanStatusForAgent } = await import(
              "@/lib/loan-status"
            );
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
            const { buildBriefBundles } = await import(
              "@/lib/missing-info-follow-up/engine.server"
            );
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
            const { issueInvoiceOnDemand } = await import(
              "@/lib/invoicing/invoice-on-demand.server"
            );
            const result = await issueInvoiceOnDemand({
              nip: String(args?.nip ?? ""),
              email: String(args?.email ?? ""),
              description: String(args?.opis ?? args?.description ?? ""),
              grossAmount: typeof args?.kwota === "number" ? args.kwota : (args?.gross_amount ?? null),
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
