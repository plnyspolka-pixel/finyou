import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Webhook wywoływany przez agenta ElevenLabs (jako client tool / post-call action),
// gdy klient w rozmowie poprosi o usunięcie numeru z bazy / zaniechanie przypomnień.
//
// Auth: nagłówek `x-webhook-secret` = ELEVENLABS_WEBHOOK_SECRET (preferowany)
// lub `apikey` = SUPABASE_ANON_KEY (fallback, np. z pg_cron / panelu).
//
// Body (JSON, dowolna kombinacja identyfikatorów):
//   { phone?: string, client_id?: string, loan_application_id?: string, reason?: string, source?: string }
export const Route = createFileRoute("/api/public/hooks/voicebot-opt-out")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-webhook-secret");
        const expectedSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
        if (!expectedSecret) {
          return new Response(JSON.stringify({ ok: false, error: "server_misconfigured" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        if (!secret || secret !== expectedSecret) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
            status: 400,
          });
        }

        const phone = typeof body.phone === "string" ? body.phone.trim() : null;
        const clientId = typeof body.client_id === "string" ? body.client_id : null;
        const loanId =
          typeof body.loan_application_id === "string" ? body.loan_application_id : null;
        const reason =
          typeof body.reason === "string"
            ? body.reason.slice(0, 500)
            : "Klient poprosił agenta o usunięcie numeru / zaniechanie przypomnień.";
        const source =
          typeof body.source === "string" ? body.source.slice(0, 100) : "elevenlabs_agent";

        if (!phone && !clientId && !loanId) {
          return new Response(JSON.stringify({ ok: false, error: "missing_identifier" }), {
            status: 400,
          });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        // 1. Znajdź klientów do oznaczenia.
        const clientIds = new Set<string>();
        if (clientId) clientIds.add(clientId);
        if (loanId) {
          const { data } = await supabase
            .from("loan_applications")
            .select("client_id")
            .eq("id", loanId)
            .maybeSingle();
          if (data?.client_id) clientIds.add(data.client_id);
        }
        if (phone) {
          // Twarda sanityzacja: tylko cyfry i „+". Usuwa `,`/`(`/`)`/`.` itp.,
          // które w PostgREST `.or()` mogłyby wstrzyknąć dodatkowe filtry
          // i dopasować/wyłączyć dowolnych (lub wszystkich) klientów.
          const safe = phone.replace(/[^\d+]/g, "");
          if (safe) {
            const { data } = await supabase
              .from("clients")
              .select("id")
              .or(`phone_normalized.eq.${safe},phone.eq.${safe}`);
            for (const c of data ?? []) clientIds.add(c.id);
          }
        }

        if (clientIds.size === 0) {
          return new Response(
            JSON.stringify({
              ok: true,
              matched: 0,
              hint: "Nie znaleziono klienta po podanych danych.",
            }),
            { headers: { "content-type": "application/json" } },
          );
        }

        const ids = Array.from(clientIds);
        const nowIso = new Date().toISOString();

        // 2. Oznacz klientów: do_not_call=true + powód.
        const { error: e1 } = await supabase
          .from("clients")
          .update({
            do_not_call: true,
            do_not_call_at: nowIso,
            do_not_call_reason: reason,
            do_not_call_source: source,
          })
          .in("id", ids);
        if (e1) {
          return new Response(JSON.stringify({ ok: false, error: e1.message }), { status: 500 });
        }

        // 3. Zatrzymaj przypomnienia dla wszystkich ich wniosków.
        const { error: e2, count } = await supabase
          .from("loan_applications")
          .update({ reminder_paused: true, next_reminder_at: null }, { count: "exact" })
          .in("client_id", ids);
        if (e2) {
          return new Response(JSON.stringify({ ok: false, error: e2.message }), { status: 500 });
        }

        return new Response(
          JSON.stringify({ ok: true, clients_opted_out: ids.length, loans_paused: count ?? 0 }),
          { headers: { "content-type": "application/json" } },
        );
      },
      GET: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            hint: "POST { phone | client_id | loan_application_id, reason? } z nagłówkiem x-webhook-secret.",
          }),
          { headers: { "content-type": "application/json" } },
        ),
    },
  },
});
