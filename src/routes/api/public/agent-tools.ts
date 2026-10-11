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
//    Lead rozmowy: tylko `lead_id` ze zmiennej dynamicznej albo caller-id
//    (`phone` = system__caller_id). Numer / e-mail podany w rozmowie (args,
//    patch, body.email) nie otwiera cudzego leada ani do odczytu statusu, ani
//    do zapisu — zakłada co najwyżej nowego.
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

/**
 * Kontakt POTWIERDZONY przez kanał: `phone` w body to zmienna systemowa
 * `system__caller_id` (tak skonfigurowane są narzędzia fy_*), `lead_id` —
 * zmienna dynamiczna ustawiana przez nasz router / widget.
 */
function trustedContactFromBody(body: any): { phone: string | null } {
  const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  return { phone };
}

/**
 * Kontakt, który rozmówca tylko PODAŁ (model wpisuje go do args / patch /
 * body.email). Służy wyłącznie do założenia NOWEGO leada — nigdy do
 * odnalezienia i odczytu ani zapisu istniejącego (każdy może podać cudzy
 * numer).
 */
function claimedContactFromBody(body: any): { phone: string | null; email: string | null } {
  const args = body?.args ?? {};
  const patch = args?.patch ?? {};
  const phone =
    [args.phone, patch.phone, patch.telefon].find((v) => typeof v === "string" && v.trim()) ?? null;
  const email =
    [body.email, args.email, patch.email].find((v) => typeof v === "string" && v.trim()) ?? null;
  return { phone, email: email ? String(email).trim().toLowerCase() : null };
}

/** Lead rozmowy wyłącznie z pewnych źródeł: lead_id ze zmiennej, caller-id. */
async function resolveLeadId(body: any): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (typeof body.lead_id === "string" && body.lead_id) return body.lead_id;

  const { phone } = trustedContactFromBody(body);
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
  return null;
}

/**
 * Nowy lead z kontaktu podanego w rozmowie. Gdy ten kontakt ma już leada,
 * NIE dopisujemy się do niego (mógł paść cudzy numer) — zakładamy nowego
 * z adnotacją „możliwy duplikat”, zespół scala ręcznie.
 */
async function createLeadFromClaimedContact(contact: { phone: string | null; email: string | null }): Promise<string | null> {
  const { normalizePolishPhone } = await import("@/lib/phone");
  const { normalized } = normalizePolishPhone(contact.phone ?? "");
  const lc = await import("@/lib/lead-comms.server");
  const existing = await lc.findLeadId({ phoneNormalized: normalized || null, email: contact.email });
  if (!existing) {
    return lc.upsertLeadFromSource({
      type: "pozyczkowy",
      source: "agent_tool",
      phoneRaw: contact.phone,
      phoneNormalized: normalized || null,
      email: contact.email,
      applicationData: {},
    });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert({
      type: "pozyczkowy",
      source: "agent_tool",
      phone_raw: contact.phone,
      phone_normalized: normalized || null,
      email: contact.email,
      application_data: { possible_duplicate_of: existing },
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    console.error("[agent-tools] lead z deklarowanego kontaktu", error?.message);
    return null;
  }
  await lc.ensureLoanApplicationForLead(data.id).catch(() => null);
  return data.id;
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
            // z kontaktu zebranego w rozmowie — zawsze NOWEGO (patrz
            // createLeadFromClaimedContact), nigdy cudzego dopasowanego po numerze.
            if (!leadId && tool === "update_lead_data") {
              const claimed = claimedContactFromBody(body);
              if (claimed.phone || claimed.email) leadId = await createLeadFromClaimedContact(claimed);
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
