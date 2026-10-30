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

/** Narzędzia tylko do odczytu — w rozmowie testowej działają naprawdę. */
const E2E_REAL_TOOLS = new Set([
  "identify_caller",
  "get_pricing",
  "get_process_overview",
  "search_knowledge",
  "get_offer_teasers",
  "get_application_status",
  "get_missing_info_brief",
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
  // Narzędzia fy2_* nie dostają `lead_id` — tura tekstowa podaje go
  // w `thread_key` (`messenger:<lead_id>`, `e2e:<lead_id>`).
  const { leadIdFromThreadKey } = await import("@/lib/thread-key");
  const fromThread = leadIdFromThreadKey(body.thread_key);
  if (fromThread) return fromThread;

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

        // Rozmowa testowa (run_ania_e2e): odczyty działają naprawdę, a wszystko
        // z prawdziwym skutkiem (SMS, zapis, prośba o kontakt) tylko się notuje.
        const { isE2eThread } = await import("@/lib/e2e-sandbox");
        if (isE2eThread(body?.thread_key) && !E2E_REAL_TOOLS.has(tool)) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("automation_events").insert({
            automation_type: "e2e_tool_call",
            status: "skipped",
            sent_payload: { thread_key: body.thread_key, tool, args },
          });
          return Response.json({
            ok: true,
            result: { saved: true, note: "Zapisane. Nie podawaj konkretnej godziny kontaktu." },
          });
        }

        // Połączenie telefoniczne: numer KLIENTA bierzemy z metadanych rozmowy
        // (external_number), bo przy połączeniach wychodzących system__caller_id
        // to nasz numer — SMS z linkiem trafiałby do nas zamiast do klienta.
        const convId = typeof body?.conversation_id === "string" ? body.conversation_id : null;
        // Numer potwierdzony przez operatora (tylko połączenie telefoniczne) — jedyny,
        // na który wolno wysłać SMS z narzędzia; numeru podanego przez model nie ufamy.
        let verifiedPhone: string | null = null;
        if (convId) {
          try {
            const { getConversation } = await import("@/lib/elevenlabs-api.server");
            const { verifiedCallerPhone } = await import("@/lib/ania-loan-purpose.server");
            const fromCall = verifiedCallerPhone(await getConversation(convId));
            if (fromCall) {
              body.phone = fromCall;
              verifiedPhone = fromCall;
            }
          } catch (e) {
            console.error("[agent-tools] conversation phone lookup failed", e);
          }
        }

        try {
          if (tool === "save_loan_purpose" || tool === "save_needs") {
            const { saveLoanPurpose } = await import("@/lib/ania-loan-purpose.server");
            const needs = args?.needs ?? {};
            const result = await saveLoanPurpose(String(body?.conversation_id ?? ""), tool === "save_needs"
              ? { purpose: args.purpose ?? needs.purpose, needs } : args);
            return Response.json(result, { headers: { "cache-control": "no-store" } });
          }
          // ── Narzędzia inwestorskie Ani (A0 recepcja, A2P presale) ──────────
          // Wcześniej nieobsłużone: kończyły się „unknown tool”, a model i tak
          // mówił, że zapisał / wysłał SMS. Każda odpowiedź mówi wprost, co się stało.
          if (tool === "identify_caller") {
            const leadId = await resolveLeadId(body);
            if (!leadId) {
              return Response.json({
                ok: true,
                result: { known: false, channel: body?.channel ?? null },
              });
            }
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: lead } = await supabaseAdmin
              .from("leads")
              .select("first_name, type, application_data")
              .eq("id", leadId)
              .maybeSingle();
            return Response.json({
              ok: true,
              result: {
                known: true,
                first_name: lead?.first_name ?? null,
                role: lead?.type === "inwestorski" ? "inwestor" : lead?.type ? "klient" : null,
                lead_amount: (lead?.application_data as any)?.lead_amount ?? null,
                channel: body?.channel ?? null,
              },
            });
          }

          if (tool === "save_investor_needs") {
            const allowed = [
              "ticket_pln", "min_yield_pct", "horizon_months", "experience", "summary",
              "timeline", "decision_role", "wants_callback", "callback_phone", "callback_email",
              "regions", "property_types", "objections",
            ];
            const needs: Record<string, unknown> = {};
            for (const k of allowed) {
              const v = (args as any)?.[k];
              if (typeof v === "number" && Number.isFinite(v)) needs[k] = v;
              else if (typeof v === "boolean") needs[k] = v;
              else if (typeof v === "string" && v.trim()) needs[k] = v.trim().slice(0, 2000);
              else if (Array.isArray(v)) needs[k] = v.filter((x) => typeof x === "string").slice(0, 20).map((x: string) => x.slice(0, 200));
            }
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const db: any = supabaseAdmin;
            const leadId = await resolveLeadId(body);
            if (leadId) {
              const { data: lead } = await db
                .from("leads")
                .select("application_data")
                .eq("id", leadId)
                .maybeSingle();
              const appData = lead?.application_data ?? {};
              const merged = {
                ...appData,
                investor_needs: { ...(appData.investor_needs ?? {}), ...needs, updated_at: new Date().toISOString() },
              };
              const { error } = await db.from("leads").update({ application_data: merged }).eq("id", leadId);
              if (error) throw error;
            }
            // Zawsze ślad z rozmowy (także anonimowej na stronie), żeby nic nie przepadło.
            await db.from("automation_events").insert({
              automation_type: "ania_investor_needs_saved",
              status: "sent",
              sent_payload: { conversation_id: convId, lead_id: leadId, channel: body?.channel ?? null, needs },
            });
            return Response.json({
              ok: true,
              result: { saved: true, note: "Zapisane. Nie powtarzaj pytania — przejdź do następnego kroku." },
            });
          }

          if (tool === "send_investor_registration_link") {
            const link = "https://financeyou.pl/rejestracja?role=inwestor";
            if (!verifiedPhone) {
              return Response.json({
                ok: false,
                sent: false,
                error:
                  "SMS NIE został wysłany — to nie jest rozmowa telefoniczna (rozmówca jest na stronie financeyou.pl). Nie mów, że wysłałaś SMS. Powiedz, że rejestracja jest na stronie: financeyou.pl, przycisk „Zostań partnerem” albo cennik.",
              });
            }
            const { sendSmsInternal } = await import("@/lib/voicebot.functions");
            const r = await sendSmsInternal({
              phone: verifiedPhone,
              body: `Finance You: tu Ania. Rejestracja inwestora: ${link}`,
              source: "elevenlabs_agent",
            });
            if (r.ok && !r.skipped) {
              return Response.json({ ok: true, sent: true, result: { sent: true } });
            }
            return Response.json({
              ok: false,
              sent: false,
              error: `SMS NIE został wysłany (${r.reason ?? r.error ?? "błąd"}). Nie mów, że wysłałaś — podaj adres słownie: financeyou pe el, rejestracja.`,
            });
          }

          // ── Pozostałe narzędzia Ani-presale (inwestor) i wiedza ───────────
          if (tool === "get_pricing") {
            const { SUBSCRIPTION_PRICE_SENTENCE, SUBSCRIPTION_PAYMENT_SENTENCE } =
              await import("@/lib/investor-plan/plans");
            return Response.json({
              ok: true,
              result: {
                price: SUBSCRIPTION_PRICE_SENTENCE,
                payment: SUBSCRIPTION_PAYMENT_SENTENCE,
                pricing_url: "https://financeyou.pl/#cennik",
                note: "Podawaj wyłącznie te kwoty. Rabaty tylko z kodów z mailingu.",
              },
            });
          }

          if (tool === "get_process_overview") {
            return Response.json({
              ok: true,
              result: {
                steps: [
                  "Inwestor składa w aplikacji zlecenie z kwotą.",
                  "Do tej kwoty przedstawiamy sprawy pożyczkowe.",
                  "Przy każdej sprawie pełny raport i pełne dane kontaktowe klienta — bez barier.",
                  "Umowa pożyczki generowana w aplikacji w dwa kliknięcia; można ją podpisać w formie dokumentowej.",
                  "Klient podpisuje u notariusza i wysyła dokumenty na adres wskazany przez inwestora.",
                  "Gdy wszystko się zgadza, inwestor wypłaca środki klientowi; Finance You pobiera prowizję z części kwoty pożyczki.",
                  "Pieniądze inwestora nigdy nie przechodzą przez Finance You — spłaty idą bezpośrednio na konto inwestora.",
                  "Gdyby coś się sypało: Filip do dyspozycji i moduł windykacyjny (w ok. 90% przypadków zastępuje kancelarię).",
                ],
                note: "Mów krótko, własnymi słowami, w kawałkach — nie czytaj całej listy naraz.",
              },
            });
          }

          if (tool === "search_knowledge") {
            const query = String((args as any)?.query ?? "").trim().slice(0, 500);
            if (!query) return Response.json({ ok: false, error: "Brak pytania (query)." });
            const agentKey = String(body?.agent_key ?? "");
            const audience =
              (args as any)?.audience === "inwestor" || agentKey.includes("inwestor") ? "inwestor" : "klient";
            const { retrieveKnowledge } = await import("@/lib/text-agent-knowledge.server");
            const hits = await retrieveKnowledge(query, 4, audience);
            return Response.json({
              ok: true,
              result: hits.length
                ? { found: true, items: hits.map((h) => ({ title: h.title, content: h.content.slice(0, 1500) })) }
                : { found: false, note: "Brak informacji w bazie wiedzy — powiedz, że tego nie wiesz; niczego nie wymyślaj." },
            });
          }

          if (tool === "get_offer_teasers") {
            return Response.json({
              ok: false,
              error:
                "Przykładowych spraw nie pokazujemy w rozmowie — rozmówca zobaczy je w aplikacji po rejestracji i złożeniu zlecenia. Nie wymyślaj spraw ani kwot.",
            });
          }

          if (tool === "send_verification_code" && String(body?.agent_key ?? "").includes("inwestor")) {
            const t = await import("@/lib/ania-investor-tools.server");
            return Response.json(await t.sendInvestorVerificationCode(convId ?? ""));
          }
          if (tool === "verify_identity" && String(body?.agent_key ?? "").includes("inwestor")) {
            const t = await import("@/lib/ania-investor-tools.server");
            const code = String((args as any)?.kod ?? (args as any)?.code ?? "").slice(0, 16);
            return Response.json(await t.verifyInvestorIdentity(convId ?? "", code));
          }
          if (tool === "get_investor_state") {
            const t = await import("@/lib/ania-investor-tools.server");
            return Response.json(await t.getInvestorAccountStateTool(convId ?? "", null));
          }

          if (tool === "request_investor_callback") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const db: any = supabaseAdmin;
            const payload = {
              conversation_id: convId,
              channel: body?.channel ?? null,
              phone: verifiedPhone ?? (typeof (args as any)?.phone === "string" ? (args as any).phone.slice(0, 32) : null),
              email: typeof (args as any)?.email === "string" ? (args as any).email.slice(0, 200) : null,
              reason: typeof (args as any)?.reason === "string" ? (args as any).reason.slice(0, 500) : null,
            };
            if (!payload.phone && !payload.email) {
              return Response.json({ ok: false, error: "Brak kontaktu — poproś o numer telefonu albo e-mail." });
            }
            await db.from("automation_events").insert({
              automation_type: "ania_investor_callback_request",
              status: "pending",
              sent_payload: payload,
            });
            return Response.json({
              ok: true,
              result: { saved: true, note: "Prośba zapisana dla zespołu. Nie podawaj konkretnej godziny kontaktu." },
            });
          }

          // Windykacja (A4/A4T): narzędzia jeszcze bez obsługi — jawna odmowa, żeby
          // bot nigdy nie podał danych sprawy ani nie „zapisał” obietnicy spłaty.
          if (String(body?.agent_key ?? "").startsWith("windykacja")) {
            return Response.json({
              ok: false,
              error:
                "To narzędzie windykacyjne jest chwilowo niedostępne. Nie podawaj żadnych danych sprawy i niczego nie obiecuj — powiedz, że opiekun sprawy oddzwoni, i zakończ uprzejmie.",
            });
          }

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
