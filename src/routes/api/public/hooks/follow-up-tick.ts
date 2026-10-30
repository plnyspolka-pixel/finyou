// Cron tick: Ania pinguje leady, które ucichły (Messenger / Instagram).
// Kadencja mail/SMS/telefon z `lead_follow_up_schedule` ma osobny tick:
// `/api/public/hooks/follow-up-plan-tick`.
// Kadencja od ostatniego outboundu (bez nowego inboundu od klienta):
//   jedno przypomnienie +24h → potem stop (wcześniej 8 przypomnień od +2h
//   do +30d, o każdej porze — klienci odbierali to jako spam).
// Wywoływane przez pg_cron co 15 min na /api/public/hooks/follow-up-tick.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
import { sendMetaMessage } from "@/lib/meta-send.server";
import { logLeadCommunication } from "@/lib/lead-comms.server";
import { requireCronSecret } from "@/lib/cron-auth.server";
import { isCallRequest } from "@/lib/call-request";
import { messengerAgentFor } from "@/lib/ania-lead-context";
import { isInternalRoutingNote } from "@/lib/ania-text-policy";
import { isE2eId } from "@/lib/e2e-sandbox";
import {
  MAX_OUTBOUND,
  isFollowUpQuietHour,
  messengerFollowUpDecision,
} from "@/lib/messenger-follow-up-policy";

// E-mail celowo POMINIĘTY — kanał mailowy prowadzi wyłącznie brandowany drip
// (loan-reminder-emails, 120 szablonów). Tu tylko czaty (Messenger/Instagram).
const SUPPORTED_CHANNELS = ["messenger", "instagram"] as const;
type Channel = (typeof SUPPORTED_CHANNELS)[number];

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

        // UWAGA: wysyłka z `lead_follow_up_schedule` (mail/SMS/telefon) NIE jest już
        // tutaj — ma własny endpoint `/api/public/hooks/follow-up-plan-tick`.
        // Doklejona do tego ticka przegrywała z synchronizacją Messengera:
        // pg_net zrywa połączenie po 5 s i kadencja nie dochodziła do głosu.

        const now = Date.now();
        // Przypomnienia tylko w ciągu dnia (8–20 czasu polskiego) — bot pisał
        // do klienta o 2:45 w nocy.
        if (isFollowUpQuietHour(now)) {
          return Response.json({ ok: true, processed: 0, sent: 0, quiet_hours: true });
        }
        const cutoff = new Date(now - 31 * 24 * 3600_000).toISOString();

        // 1) Wszyscy adresaci z outboundami w ostatnich 31 dniach na obsługiwanych kanałach.
        const { data: comms, error } = await supabaseAdmin
          .from("lead_communications")
          .select("lead_id, channel, direction, created_at, content")
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
            callRequested: boolean;
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
            callRequested: false,
          };
          const t = new Date(c.created_at).getTime();
          if (c.direction === "outbound") {
            g.outboundCount += 1;
            if (t > g.lastOutboundAt) g.lastOutboundAt = t;
          } else if (c.direction === "inbound") {
            if (t > g.lastInboundAt) g.lastInboundAt = t;
            if (isCallRequest(c.content)) g.callRequested = true;
          }
          groups.set(key, g);
        }

        // 3) Wybierz tylko te, gdzie last_inbound < last_outbound (klient nie odpisał).
        const candidates: typeof groups extends Map<Key, infer V> ? V[] : never = [];
        for (const g of groups.values()) {
          if (g.outboundCount === 0) continue;
          if (g.lastInboundAt >= g.lastOutboundAt) continue;
          // Klient poprosił o telefon (kiedykolwiek w oknie, nie tylko ostatnią
          // wiadomością — po „Ok.” nadal czeka na telefon) — czeka na człowieka,
          // nie na przypomnienia na czacie.
          if (g.callRequested) continue;
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
            "id, type, status, email, messenger_psid, instagram_igsid, application_data, loan_application_id, client_id, meta_lead_id",
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
          const decision = messengerFollowUpDecision({
            now,
            lastOutboundAt: g.lastOutboundAt,
            lastInboundAt: g.lastInboundAt,
            outboundSinceInbound: outSince ?? 1,
            callRequested: g.callRequested,
            leadStatus: lead.status ? String(lead.status) : null,
            paused: Boolean(lead.application_data?.followup_paused),
            // Lead z utworzonym wnioskiem (komplet danych zebrany, np. na czacie)
            // nie dostaje już „dokończ wniosek" — sprawą zajmuje się analityk.
            hasApplication: Boolean(lead.loan_application_id),
            isTest: isE2eId(lead.messenger_psid) || isE2eId(lead.instagram_igsid),
          });
          if (!decision.send) continue;
          const step = decision.step;

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
            // Ten sam agent co przy zwykłej odpowiedzi na Messengerze
            // (inwestor → A2P, nierozpoznany → A0), inaczej przypomnienie
            // pisze inna „Ania” niż ta, która prowadzi rozmowę.
            const agent = await runAgentTurn({
              leadId: g.leadId,
              channel: g.channel,
              userMessage: nudgePrompt,
              agentIdOverride: g.channel === "messenger" ? messengerAgentFor(lead) : null,
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
          // Agent recepcji potrafi odpowiedzieć na polecenie systemowe notatką
          // o przekazaniu („Paweł wypełnił formularz — przekazuję go na
          // ścieżkę inwestorów”). To nie jest wiadomość do klienta.
          if (isInternalRoutingNote(replyText)) {
            console.warn("[follow-up-tick] pominięto notatkę wewnętrzną", g.leadId, replyText);
            continue;
          }

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
              proactive: true,
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
              proactive: true,
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
