// Cron tick: Ania pinguje leady, które ucichły.
// Kadencja od ostatniego outboundu (bez nowego inboundu od klienta):
//   +2h, +6h, +24h, +3d, +7d, +14d, +21d, +30d → potem stop.
// Wywoływane przez pg_cron co 15 min na /api/public/hooks/follow-up-tick.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
import { sendResendEmail } from "@/lib/resend-send.server";
import { sendMetaMessage } from "@/lib/meta-send.server";
import { logLeadCommunication } from "@/lib/lead-comms.server";
import { emailForStep } from "@/lib/follow-up-templates";

// Hours from last outbound to next follow-up, indexed by (#outbound since last inbound) - 1
const FOLLOWUP_OFFSETS_HOURS = [2, 6, 24, 72, 168, 336, 504, 720];
const MAX_OUTBOUND = FOLLOWUP_OFFSETS_HOURS.length + 1; // initial + 8 follow-ups = 9
const SUPPORTED_CHANNELS = ["email", "messenger", "instagram"] as const;
type Channel = (typeof SUPPORTED_CHANNELS)[number];
const TERMINAL_STATUSES = new Set([
  "zamkniety", "closed", "won", "lost", "odrzucony", "rezygnacja",
  "wyplacony", "spłacony", "do_not_contact", "blacklist",
]);

export const Route = createFileRoute("/api/public/hooks/follow-up-tick")({
  server: {
    handlers: {
      POST: async () => {
        const now = Date.now();
        const cutoff = new Date(now - 31 * 24 * 3600_000).toISOString();

        // 1) Wszyscy adresaci z outboundami w ostatnich 31 dniach na obsługiwanych kanałach.
        const { data: comms, error } = await supabaseAdmin
          .from("lead_communications")
          .select("lead_id, channel, direction, created_at")
          .in("channel", SUPPORTED_CHANNELS as unknown as string[])
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(5000);
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

        // 2) Pogrupuj po (lead_id, channel) i policz step + last outbound + last inbound.
        type Key = string;
        const groups = new Map<Key, {
          leadId: string;
          channel: Channel;
          outboundCount: number;
          lastOutboundAt: number;
          lastInboundAt: number;
        }>();
        for (const c of comms ?? []) {
          if (!c.lead_id) continue;
          if (!SUPPORTED_CHANNELS.includes(c.channel as Channel)) continue;
          const key = `${c.lead_id}::${c.channel}`;
          const g = groups.get(key) ?? {
            leadId: c.lead_id, channel: c.channel as Channel,
            outboundCount: 0, lastOutboundAt: 0, lastInboundAt: 0,
          };
          const t = new Date(c.created_at).getTime();
          if (c.direction === "outbound") {
            g.outboundCount += 1;
            if (t > g.lastOutboundAt) g.lastOutboundAt = t;
          } else if (c.direction === "inbound") {
            if (t > g.lastInboundAt) g.lastInboundAt = t;
          }
          groups.set(key, g);
        }

        // 3) Wybierz tylko te, gdzie last_inbound < last_outbound (klient nie odpisał).
        const candidates: typeof groups extends Map<Key, infer V> ? V[] : never = [];
        for (const g of groups.values()) {
          if (g.outboundCount === 0) continue;
          if (g.lastInboundAt >= g.lastOutboundAt) continue;
          // Outboundy *po* ostatnim inboundzie:
          // upraszczamy — outboundCount globalny w oknie 31d. Jeśli był inbound,
          // przeliczymy dokładniej poniżej osobnym zapytaniem.
          candidates.push(g);
        }
        if (candidates.length === 0) {
          return Response.json({ ok: true, processed: 0, sent: 0 });
        }

        // 4) Pobierz statusy leadów hurtowo, żeby pominąć "zamknięte".
        const leadIds = Array.from(new Set(candidates.map((c) => c.leadId)));
        const { data: leadsRows } = await supabaseAdmin
          .from("leads").select("id, status, email, messenger_psid, instagram_igsid, application_data")
          .in("id", leadIds);
        const leadMap = new Map<string, any>();
        for (const l of leadsRows ?? []) leadMap.set(l.id, l);

        let sent = 0; let processed = 0;
        for (const g of candidates) {
          processed += 1;
          const lead = leadMap.get(g.leadId);
          if (!lead) continue;
          if (lead.status && TERMINAL_STATUSES.has(String(lead.status))) continue;
          if (lead.application_data?.followup_paused) continue;

          // Dokładny step: licz outboundy PO ostatnim inboundzie (lub wszystkie, jeśli inboundu nie było).
          const sinceIso = g.lastInboundAt > 0 ? new Date(g.lastInboundAt).toISOString() : "1970-01-01T00:00:00Z";
          const { count: outSince } = await supabaseAdmin
            .from("lead_communications")
            .select("id", { count: "exact", head: true })
            .eq("lead_id", g.leadId).eq("channel", g.channel).eq("direction", "outbound")
            .gt("created_at", sinceIso);
          const step = outSince ?? 1; // liczba dotychczasowych outboundów w bieżącej serii
          if (step >= MAX_OUTBOUND) continue;
          const offsetH = FOLLOWUP_OFFSETS_HOURS[step - 1];
          if (offsetH == null) continue;
          const dueAt = g.lastOutboundAt + offsetH * 3600_000;
          if (now < dueAt) continue;

          // Sprawdź, czy nie pingowaliśmy już w ostatnich 60 minutach (anty-duplikat między tickami).
          if (now - g.lastOutboundAt < 60 * 60_000) continue;

          // 5) Wygeneruj treść przez Anię.
          const nudgePrompt =
            `[SYSTEM FOLLOW-UP nr ${step} z ${MAX_OUTBOUND - 1}] Klient nie odpisał od ostatniej Twojej wiadomości ` +
            `(${Math.round((now - g.lastOutboundAt) / 3600_000)} h temu). Napisz KRÓTKĄ, ciepłą wiadomość follow-up po polsku ` +
            `(2-3 zdania, bez nachalności). CEL: skłonić klienta, żeby KLIKNĄŁ link i DOKOŃCZYŁ wniosek na stronie ` +
            `financeyou.pl — NIE proś o odpowiedź na maila, nie zadawaj pytań. Podkreśl konkretną korzyść (np. długi okres spłaty, ` +
            `niska rata, wybór z wielu inwestorów, indywidualne warunki) i zaproś do wejścia na wniosek. ` +
            `Dostosuj ton: pierwsze follow-upy lekkie i pomocne, kolejne bardziej "ostatnia szansa, ale bez presji". ` +
            `Zawsze wywołaj narzędzie send_application_link, żeby wkleić link do wniosku. ` +
            `Nie powtarzaj dosłownie poprzednich wiadomości. Nie używaj emoji.`;

          let replyText = "";
          try {
            const agent = await runAgentTurn({
              leadId: g.leadId,
              channel: g.channel,
              userMessage: nudgePrompt,
            });
            replyText = (agent.reply ?? "").trim();
            const linkCall = agent.toolCalls.find((c) => c.name === "send_application_link");
            if (linkCall?.result?.link && !replyText.includes(linkCall.result.link)) {
              replyText += `\n\nDokończ wniosek tutaj: ${linkCall.result.link}`;
            }
          } catch (e: any) {
            console.error("[follow-up-tick] agent error", g.leadId, e?.message);
            continue;
          }
          if (!replyText) continue;

          // 6) Wyślij właściwym kanałem.
          let sendOk = false; let sendId: string | null = null; let sendErr: string | null = null;
          // Temat z tej samej, stałej puli 120 szablonów (rotacja) — bez „Przypomnienie N".
          // Usuwamy ewentualne tokeny {{…}} (tu nie mamy kontekstu do ich podstawienia).
          const emailSubject = emailForStep(step).subject
            .replace(/\{\{[^}]+\}\}/g, "").replace(/\s{2,}/g, " ").trim();
          if (g.channel === "email") {
            const to = lead.email;
            if (!to) continue;
            const r = await sendResendEmail({ to, subject: emailSubject, text: replyText });
            sendOk = r.ok; sendId = r.id ?? null; sendErr = r.error ?? null;

          } else if (g.channel === "messenger") {
            const psid = lead.messenger_psid;
            if (!psid) continue;
            const r = await sendMetaMessage({ recipientId: psid, text: replyText, platform: "messenger" });
            sendOk = r.ok; sendId = r.messageId ?? null; sendErr = r.error ?? null;
          } else if (g.channel === "instagram") {
            const igsid = lead.instagram_igsid;
            if (!igsid) continue;
            const r = await sendMetaMessage({ recipientId: igsid, text: replyText, platform: "instagram" });
            sendOk = r.ok; sendId = r.messageId ?? null; sendErr = r.error ?? null;
          }

          await logLeadCommunication({
            leadId: g.leadId,
            channel: g.channel as "email" | "messenger",
            direction: "outbound",
            content: replyText,
            subject: g.channel === "email" ? emailSubject : null,
            externalId: sendId,
            email: g.channel === "email" ? lead.email : null,
            status: sendOk ? "sent" : "error",
            errorMessage: sendOk ? null : sendErr,
            metadata: { follow_up_step: step, auto: true },
            agentId: process.env.ELEVENLABS_TEXT_AGENT_ID ?? null,
          });
          if (sendOk) sent += 1;
        }

        return Response.json({ ok: true, processed, sent });
      },
    },
  },
});
