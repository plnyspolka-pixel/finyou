// Cron tick: Ania pinguje leady, które ucichły.
// Kadencja od ostatniego outboundu (bez nowego inboundu od klienta):
//   +2h, +6h, +24h, +3d, +7d, +14d, +21d, +30d → potem stop.
// Wywoływane przez pg_cron co 15 min na /api/public/hooks/follow-up-tick.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
import { sendMetaMessage } from "@/lib/meta-send.server";
import { logLeadCommunication } from "@/lib/lead-comms.server";
import { requireCronSecret } from "@/lib/cron-auth.server";

// Hours from last outbound to next follow-up, indexed by (#outbound since last inbound) - 1
const FOLLOWUP_OFFSETS_HOURS = [2, 6, 24, 72, 168, 336, 504, 720];
const MAX_OUTBOUND = FOLLOWUP_OFFSETS_HOURS.length + 1; // initial + 8 follow-ups = 9
// E-mail celowo POMINIĘTY — kanał mailowy prowadzi wyłącznie brandowany drip
// (loan-reminder-emails, 120 szablonów). Tu tylko czaty (Messenger/Instagram).
const SUPPORTED_CHANNELS = ["messenger", "instagram"] as const;
type Channel = (typeof SUPPORTED_CHANNELS)[number];
const TERMINAL_STATUSES = new Set([
  "zamkniety",
  "closed",
  "won",
  "lost",
  "odrzucony",
  "rezygnacja",
  "wyplacony",
  "spłacony",
  "do_not_contact",
  "blacklist",
]);

export const Route = createFileRoute("/api/public/hooks/follow-up-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;

        // Kolejka wiadomości wychodzących (messenger_outbox) — best-effort.
        try {
          const { processMessengerOutbox } = await import("@/lib/messenger-outbox.server");
          const ob = await processMessengerOutbox();
          if (ob.sent || ob.errors) console.log("[follow-up-tick] outbox", JSON.stringify(ob));
        } catch (e) {
          console.error("[follow-up-tick] outbox error", e);
        }

        // Publikacja zaplanowanych postów Instagram (social_posts) — best-effort.
        try {
          const { processDueSocialPosts } = await import("@/lib/instagram-publish.server");
          const sp = await processDueSocialPosts();
          if (sp.processed) console.log("[follow-up-tick] social publish", JSON.stringify(sp));
        } catch (e) {
          console.error("[follow-up-tick] social publish error", e);
        }

        // Uzupełnianie historii Messenger/IG (imiona z Meta/OCR/KW/treści
        // wiadomości, jednorazowa migracja załączników) — best-effort,
        // nie może wywrócić ticka.
        try {
          const { runScheduledMessengerSync } = await import("@/lib/messenger-sync.server");
          const ms = await runScheduledMessengerSync();
          if (ms.ran) console.log("[follow-up-tick] messenger sync", JSON.stringify(ms));
        } catch (e) {
          console.error("[follow-up-tick] messenger sync error", e);
        }

        try {
          const { runScheduledMessengerBackfill } = await import("@/lib/messenger-backfill.server");
          const bf = await runScheduledMessengerBackfill();
          if (
            bf.namesFromMeta ||
            bf.namesFromText ||
            bf.namesFromOcr ||
            bf.namesFromKw ||
            bf.attachmentsRun
          ) {
            console.log("[follow-up-tick] messenger backfill", JSON.stringify(bf));
          }
        } catch (e) {
          console.error("[follow-up-tick] messenger backfill error", e);
        }

        // Wysyłka zaplanowanych follow-upów (mail/SMS/telefon) z lead_follow_up_schedule.
        // processDueFollowUps sam pilnuje okien godzinowych i statusów terminalnych.
        try {
          const { processDueFollowUps } = await import("@/lib/follow-up-plan.server");
          const plan = await processDueFollowUps();
          if (plan.processed || plan.sent || plan.skipped) {
            console.log("[follow-up-tick] plan", JSON.stringify(plan));
          }
        } catch (e) {
          console.error("[follow-up-tick] plan error", e);
        }

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
        if (error)
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

        // 2) Pogrupuj po (lead_id, channel) i policz step + last outbound + last inbound.
        type Key = string;
        const groups = new Map<
          Key,
          {
            leadId: string;
            channel: Channel;
            outboundCount: number;
            lastOutboundAt: number;
            lastInboundAt: number;
          }
        >();
        for (const c of comms ?? []) {
          if (!c.lead_id) continue;
          if (!SUPPORTED_CHANNELS.includes(c.channel as Channel)) continue;
          const key = `${c.lead_id}::${c.channel}`;
          const g = groups.get(key) ?? {
            leadId: c.lead_id,
            channel: c.channel as Channel,
            outboundCount: 0,
            lastOutboundAt: 0,
            lastInboundAt: 0,
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
          .from("leads")
          .select(
            "id, status, email, messenger_psid, instagram_igsid, application_data, loan_application_id",
          )
          .in("id", leadIds);
        const leadMap = new Map<string, any>();
        for (const l of leadsRows ?? []) leadMap.set(l.id, l);

        let sent = 0;
        let processed = 0;
        for (const g of candidates) {
          processed += 1;
          const lead = leadMap.get(g.leadId);
          if (!lead) continue;
          if (lead.status && TERMINAL_STATUSES.has(String(lead.status))) continue;
          if (lead.application_data?.followup_paused) continue;
          // Lead z utworzonym wnioskiem (komplet danych zebrany, np. na czacie)
          // nie dostaje już „dokończ wniosek" — sprawą zajmuje się analityk.
          if (lead.loan_application_id) continue;

          // Dokładny step: licz outboundy PO ostatnim inboundzie (lub wszystkie, jeśli inboundu nie było).
          const sinceIso =
            g.lastInboundAt > 0 ? new Date(g.lastInboundAt).toISOString() : "1970-01-01T00:00:00Z";
          const { count: outSince } = await supabaseAdmin
            .from("lead_communications")
            .select("id", { count: "exact", head: true })
            .eq("lead_id", g.leadId)
            .eq("channel", g.channel)
            .eq("direction", "outbound")
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
            `(2-3 zdania, bez nachalności). Kieruj się blokiem [STAN DANYCH]: ` +
            `jeżeli czegoś brakuje — przypomnij się i zapytaj o PIERWSZĄ brakującą rzecz, do przesłania tutaj, na czacie. ` +
            `Jeżeli KOMPLET — napisz krótko, że mamy wszystko i analityk się odezwie; NIE wysyłaj żadnego linku. ` +
            `Link do formularza (narzędzie send_application_link) możesz dodać WYŁĄCZNIE, gdy klient nie przesłał dotąd ` +
            `żadnych danych ani dokumentów w rozmowie i nie prosił o załatwienie sprawy na czacie — ` +
            `kto wybrał czat, tego NIE odsyłaj na financeyou.pl. ` +
            `Dostosuj ton: pierwsze follow-upy lekkie i pomocne, kolejne spokojniejsze, bez presji. ` +
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

          // 6) Wyślij właściwym kanałem (tylko Messenger/Instagram — e-mail obsługuje
          //    wyłącznie brandowany drip loan-reminder-emails, żeby nie było dwóch
          //    różnych „scenariuszy" mailowych do tego samego klienta).
          let sendOk = false;
          let sendId: string | null = null;
          let sendErr: string | null = null;
          if (g.channel === "messenger") {
            const psid = lead.messenger_psid;
            if (!psid) continue;
            const r = await sendMetaMessage({
              recipientId: psid,
              text: replyText,
              platform: "messenger",
            });
            sendOk = r.ok;
            sendId = r.messageId ?? null;
            sendErr = r.error ?? null;
          } else if (g.channel === "instagram") {
            const igsid = lead.instagram_igsid;
            if (!igsid) continue;
            const r = await sendMetaMessage({
              recipientId: igsid,
              text: replyText,
              platform: "instagram",
            });
            sendOk = r.ok;
            sendId = r.messageId ?? null;
            sendErr = r.error ?? null;
          }

          await logLeadCommunication({
            leadId: g.leadId,
            channel: g.channel as "messenger",
            direction: "outbound",
            content: replyText,
            externalId: sendId,
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
