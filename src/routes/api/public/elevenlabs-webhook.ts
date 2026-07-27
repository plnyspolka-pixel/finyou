import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

// Webhook ElevenLabs — odbiera wynik rozmowy i zapisuje do kolejki.
// Weryfikuje podpis HMAC z nagłówka `ElevenLabs-Signature` (format: t=...,v0=...).
function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts["t"];
  const v0 = parts["v0"];
  if (!t || !v0) return false;
  // Tolerancja czasu: 30 minut
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 1800) return false;
  const cleanSecret = secret.startsWith("wsec_") ? secret.slice(5) : secret;
  const expected = createHmac("sha256", cleanSecret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(v0);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/elevenlabs-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
        const supabase = createClient(url, key);

        const rawBody = await request.text();
        const sigHeader =
          request.headers.get("elevenlabs-signature") ||
          request.headers.get("ElevenLabs-Signature");

        if (!webhookSecret) {
          return new Response(JSON.stringify({ ok: false, error: "server_misconfigured" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
          return new Response(JSON.stringify({ ok: false, error: "invalid_signature" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const envelope = (() => {
          try {
            return JSON.parse(rawBody);
          } catch {
            return {} as any;
          }
        })();
        // ElevenLabs zwykle wysyła { type, event_timestamp, data: {...} } — wspieramy też płaski payload
        const body: any =
          envelope?.data && typeof envelope.data === "object" ? envelope.data : envelope;

        const callId: string | undefined =
          body.conversation_id || body.call_id || body.id || envelope.conversation_id;
        const phone: string | undefined =
          body.phone_number ||
          body.to_number ||
          body?.metadata?.phone_call?.external_number ||
          body?.conversation_initiation_client_data?.dynamic_variables?.phone;
        const transcript: string | undefined =
          body.transcript_text ||
          body.summary_transcript ||
          (Array.isArray(body.transcript)
            ? body.transcript
                .map((t: any) =>
                  `${t.role ?? t.speaker ?? ""}: ${t.message ?? t.text ?? ""}`.trim(),
                )
                .filter(Boolean)
                .join("\n")
            : undefined);
        const summary: string | undefined =
          body?.analysis?.transcript_summary || body?.analysis?.summary || body.summary;

        // ── Mapowanie wyniku rozmowy ─────────────────────────────────────────
        const callSuccessful: string | undefined =
          body?.analysis?.call_successful || body.call_successful;
        const callStatus: string | undefined = body.status || body.call_status;
        const disconnectionReason: string | undefined =
          body?.metadata?.termination_reason ||
          body.disconnection_reason ||
          body.termination_reason;
        const durationSec =
          Number(
            body?.metadata?.call_duration_secs ??
              body?.duration_seconds ??
              body?.call_duration_secs,
          ) || null;

        function classifyOutcome(): { outcome: string; label: string } {
          const d = (disconnectionReason || "").toLowerCase();
          const s = (callStatus || "").toLowerCase();
          const succ = (callSuccessful || "").toLowerCase();
          if (d.includes("no_answer") || d.includes("noanswer") || s === "no-answer")
            return { outcome: "no_answer", label: "Nieodebrana" };
          if (d.includes("busy")) return { outcome: "busy", label: "Zajęte" };
          if (d.includes("voicemail") || d.includes("machine"))
            return { outcome: "voicemail", label: "Poczta głosowa" };
          if (d.includes("failed") || s === "failed" || succ === "failure")
            return { outcome: "failed", label: "Błąd połączenia" };
          if ((durationSec ?? 0) < 5 && (d || s))
            return { outcome: "no_answer", label: "Nieodebrana" };
          if (succ === "success" || (durationSec ?? 0) >= 5)
            return { outcome: "answered", label: "Odebrana" };
          return { outcome: "completed", label: "Zakończona" };
        }
        const { outcome, label: outcomeLabel } = classifyOutcome();

        // ── Wyciąganie wyników data collection z ElevenLabs ──────────────────
        // ElevenLabs zwraca: analysis.data_collection_results = { field: { value, rationale, ... } }
        function extractDataCollection(): Record<string, any> {
          const raw =
            body?.analysis?.data_collection_results ??
            body?.data_collection_results ??
            body?.analysis?.data_collection ??
            null;
          if (!raw || typeof raw !== "object") return {};
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(raw)) {
            if (v && typeof v === "object" && "value" in (v as any)) {
              out[k] = (v as any).value;
            } else {
              out[k] = v;
            }
          }
          return out;
        }
        const collected = extractDataCollection();
        // Normalizacja kluczowych pól
        const parseAmount = (v: any): number | null => {
          if (v === null || v === undefined || v === "") return null;
          if (typeof v === "number") return Number.isFinite(v) ? v : null;
          const s = String(v)
            .replace(/[^\d.,-]/g, "")
            .replace(/\s/g, "")
            .replace(",", ".");
          const n = parseFloat(s);
          return Number.isFinite(n) ? n : null;
        };
        const parseBool = (v: any): boolean | null => {
          if (v === null || v === undefined || v === "") return null;
          if (typeof v === "boolean") return v;
          const s = String(v).toLowerCase().trim();
          if (["true", "tak", "yes", "1", "y", "t"].includes(s)) return true;
          if (["false", "nie", "no", "0", "n", "f"].includes(s)) return false;
          return null;
        };
        const loanAmountRequested = parseAmount(
          collected.loan_amount_requested ?? collected.loan_amount ?? collected.kwota,
        );
        const collateralType = collected.collateral_type ?? collected.zabezpieczenie ?? null;
        const willingOnline = parseBool(collected.customer_willing_to_apply_online);
        const directedToWebsite = parseBool(collected.application_directed_to_website);

        let queueRow: any = null;
        if (callId) {
          const r = await supabase
            .from("call_queue")
            .select("*")
            .eq("agent_id", callId)
            .maybeSingle();
          queueRow = r.data;
        }
        if (!queueRow && phone) {
          const r = await supabase
            .from("call_queue")
            .select("*")
            .eq("phone_normalized", phone)
            .eq("status", "w_trakcie")
            .maybeSingle();
          queueRow = r.data;
        }
        if (queueRow) {
          const queueStatus =
            outcome === "answered"
              ? "zakonczona"
              : outcome === "no_answer"
                ? "nieodebrana"
                : outcome === "busy"
                  ? "nieodebrana"
                  : outcome === "voicemail"
                    ? "poczta_glosowa"
                    : outcome === "failed"
                      ? "blad"
                      : "zakonczona";
          await supabase
            .from("call_queue")
            .update({
              status: queueStatus,
              finished_at: new Date().toISOString(),
              transcript: transcript || null,
              result_summary: summary || null,
              raw_result: body,
            })
            .eq("id", queueRow.id);

          // === Zagęszczenie prób — szybki retry dla nieodebranych / błędów / poczty głosowej ===
          // Cap: max 6 prób retry per wniosek/telefon (oprócz oryginalnej sekwencji follow-up).
          const isRetryable =
            outcome === "no_answer" ||
            outcome === "busy" ||
            outcome === "voicemail" ||
            outcome === "failed";
          if (isRetryable) {
            try {
              let cntQ = supabase
                .from("call_queue")
                .select("id", { count: "exact", head: true })
                .eq("source", "auto_retry");
              if (queueRow.loan_application_id) {
                cntQ = cntQ.eq("loan_application_id", queueRow.loan_application_id);
              } else if (queueRow.phone_normalized) {
                cntQ = cntQ.eq("phone_normalized", queueRow.phone_normalized);
              } else {
                throw new Error("no key to count retries");
              }
              const retryCountQ = await cntQ;
              const alreadyRetried = retryCountQ.count ?? 0;
              const MAX_RETRIES = 6;
              if (alreadyRetried < MAX_RETRIES) {
                // Odstęp: no_answer 20 min, busy 25 min, voicemail 45 min, failed 60 min
                const offsetMin =
                  outcome === "no_answer"
                    ? 20
                    : outcome === "busy"
                      ? 25
                      : outcome === "voicemail"
                        ? 45
                        : 60;
                const candidate = new Date(Date.now() + offsetMin * 60_000);
                const { getCallingWindow } = await import("@/lib/voicebot.functions");
                const win = getCallingWindow(candidate);
                const scheduledAt = win.allowed ? candidate : win.nextAllowedAt;
                await supabase.from("call_queue").insert({
                  client_id: queueRow.client_id ?? null,
                  loan_application_id: queueRow.loan_application_id ?? null,
                  meta_lead_id: queueRow.meta_lead_id ?? null,
                  phone_normalized: queueRow.phone_normalized,
                  status: "oczekuje",
                  source: "auto_retry",
                  scheduled_at: scheduledAt.toISOString(),
                  attempts: 0,
                });
              }
            } catch (e) {
              console.error("[elevenlabs-webhook] schedule auto_retry failed", e);
            }
          }
        }

        // ── Zapis danych zebranych przez Anię (data collection) ─────────────
        const hasCollected =
          loanAmountRequested !== null ||
          (collateralType !== null && collateralType !== "") ||
          willingOnline !== null ||
          directedToWebsite !== null ||
          Object.keys(collected).length > 0;
        if (hasCollected) {
          try {
            // 1) loan_applications — uzupełnij loan_amount jeśli puste
            if (queueRow?.loan_application_id && loanAmountRequested !== null) {
              const { data: la } = await supabase
                .from("loan_applications")
                .select("loan_amount")
                .eq("id", queueRow.loan_application_id)
                .maybeSingle();
              if (la && (la.loan_amount === null || Number(la.loan_amount) === 0)) {
                await supabase
                  .from("loan_applications")
                  .update({ loan_amount: loanAmountRequested })
                  .eq("id", queueRow.loan_application_id);
              }
            }
            // 2) leads.application_data — merge zebranych danych z voicebota
            const leadId = queueRow?.lead_id ?? null;
            const phoneForLead = queueRow?.phone_normalized ?? phone ?? null;
            let leadRow: any = null;
            if (leadId) {
              const r = await supabase
                .from("leads")
                .select("id, application_data")
                .eq("id", leadId)
                .maybeSingle();
              leadRow = r.data;
            } else if (phoneForLead) {
              const r = await supabase
                .from("leads")
                .select("id, application_data")
                .eq("phone_normalized", phoneForLead)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              leadRow = r.data;
            }
            if (leadRow) {
              const prev =
                leadRow.application_data && typeof leadRow.application_data === "object"
                  ? leadRow.application_data
                  : {};
              const voicebotData = {
                ...(prev as any).voicebot,
                last_call_id: callId ?? null,
                last_call_at: new Date().toISOString(),
                loan_amount_requested: loanAmountRequested,
                collateral_type: collateralType,
                customer_willing_to_apply_online: willingOnline,
                application_directed_to_website: directedToWebsite,
                raw: collected,
              };
              await supabase
                .from("leads")
                .update({ application_data: { ...prev, voicebot: voicebotData } })
                .eq("id", leadRow.id);
            }
          } catch (e) {
            console.error("[elevenlabs-webhook] persist data_collection failed", e);
          }
        }

        // Wykryj kierunek — INBOUND: klient dzwoni do nas.
        const dynVars = body?.conversation_initiation_client_data?.dynamic_variables ?? {};
        const phoneCallMeta = body?.metadata?.phone_call ?? {};
        const isInbound =
          String(dynVars?.inbound ?? "").toLowerCase() === "true" ||
          String(phoneCallMeta?.direction ?? "").toLowerCase() === "inbound" ||
          String(body?.direction ?? "").toLowerCase() === "inbound" ||
          (!queueRow && !!phone); // brak wpisu w kolejce + jest numer = inbound

        const callerPhone: string | null =
          (isInbound
            ? (phoneCallMeta?.external_number ?? dynVars?.caller_phone ?? phone)
            : phone) ?? null;

        // Zapis do zunifikowanego logu komunikacji widocznego w panelu admina
        try {
          const { logLeadCommunication } = await import("@/lib/lead-comms.server");
          const recordingUrl =
            body?.recording_url || body?.audio_url || body?.metadata?.recording_url || null;
          await logLeadCommunication({
            loanApplicationId:
              queueRow?.loan_application_id ?? (dynVars?.loan_application_id as string) ?? null,
            clientId: queueRow?.client_id ?? (dynVars?.client_id as string) ?? null,
            metaLeadId: queueRow?.meta_lead_id ?? null,
            phoneNormalized: queueRow?.phone_normalized ?? callerPhone ?? null,
            channel: "voicebot_call",
            direction: isInbound ? "inbound" : "outbound",
            status: outcomeLabel,
            subject: isInbound
              ? summary
                ? "Połączenie przychodzące"
                : "Połączenie przychodzące — nieodebrane"
              : summary
                ? "Rozmowa voicebota"
                : `Próba połączenia — ${outcomeLabel}`,
            content: summary || transcript || null,
            transcript:
              body?.transcript ||
              body?.transcript_segments ||
              body?.turns ||
              body?.messages ||
              (transcript ? { text: transcript } : null),
            recordingUrl,
            durationSeconds: durationSec,
            externalId: callId ?? null,
            agentId: body?.agent_id ?? queueRow?.agent_id ?? null,
            metadata: {
              source: "elevenlabs_webhook",
              inbound: isInbound,
              call_outcome: outcome,
              call_outcome_label: outcomeLabel,
              call_successful: callSuccessful ?? null,
              call_status: callStatus ?? null,
              disconnection_reason: disconnectionReason ?? null,
              transcript_full: body?.transcript || body?.transcript_segments || body?.turns || null,
              summary: summary ?? null,
              data_collection: {
                loan_amount_requested: loanAmountRequested,
                collateral_type: collateralType,
                customer_willing_to_apply_online: willingOnline,
                application_directed_to_website: directedToWebsite,
                raw: collected,
              },
              raw: body,
            },
          });
        } catch (e) {
          console.error("[elevenlabs-webhook] log lead comm failed", e);
        }

        // INBOUND: upewnij się, że istnieje lead + enrichment z transkrypcji
        if (isInbound && callerPhone) {
          try {
            const { upsertLeadFromSource } = await import("@/lib/lead-comms.server");
            const leadId = await upsertLeadFromSource({
              type: "pozyczkowy",
              source: "inbound_call",
              phoneRaw: callerPhone,
              phoneNormalized: callerPhone,
              firstName: (dynVars?.first_name as string) || null,
              lastName: (dynVars?.last_name as string) || null,
              clientId: (dynVars?.client_id as string) || null,
              loanApplicationId: (dynVars?.loan_application_id as string) || null,
            });
            if (leadId) {
              const { enrichLeadFromInbound } = await import("@/lib/lead-enrichment.server");
              await enrichLeadFromInbound({
                leadId,
                text: [summary, transcript].filter(Boolean).join("\n\n") || null,
                hasAttachments: false,
              });
            }
          } catch (e) {
            console.error("[elevenlabs-webhook] inbound lead upsert/enrich failed", e);
          }
        }

        await supabase.from("automation_events").insert({
          automation_type: "elevenlabs_webhook",
          status: outcome,
          sent_payload: {},
          response_payload: body,
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type, elevenlabs-signature",
          },
        }),
    },
  },
});
