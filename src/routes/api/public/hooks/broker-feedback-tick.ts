// Cron tick: automatyczny feedback dla pośredników — e-mail, gdy inwestor
// zainteresuje się ofertą ich klienta albo pożyczka zostanie uruchomiona.
// Każdy sygnał rezerwujemy w broker_feedback_notifications (unikalny klucz),
// więc ten sam sygnał nigdy nie idzie dwa razy; nieudana wysyłka zwalnia
// rezerwację do ponowienia w kolejnym ticku.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronSecret } from "@/lib/cron-auth.server";
import {
  buildBrokerFeedbackEmail,
  collectBrokerSignals,
  INTERESTED_DISTRIBUTION,
  INTERESTED_MATCH,
  PROPOSAL_STATUSES,
  type BrokerSignal,
} from "@/lib/broker-feedback";
import { brokerCommissionForLoan } from "@/lib/affiliate/engine-pure";

// Okno sygnałów: tylko świeże zdarzenia (pierwsze uruchomienie nie wysyła
// historii sprzed dnia).
const WINDOW_MS = 24 * 60 * 60 * 1000;

async function run() {
  const db = supabaseAdmin as any;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { data: apps } = await db
    .from("loan_applications")
    .select(
      "id, status, updated_at, loan_amount, accepted_loan_amount, created_by_partner_user_id, client:clients(first_name,last_name)",
    )
    .not("created_by_partner_user_id", "is", null)
    .is("deleted_at", null)
    .limit(2000);
  const appRows = (apps ?? []) as any[];
  if (!appRows.length) return { ok: true, signals: 0, sent: 0 };
  const ids = appRows.map((a) => a.id);

  const [dist, match, offer] = await Promise.all([
    db
      .from("offer_distributions")
      .select("id, loan_application_id, distribution_status, responded_at, updated_at")
      .in("loan_application_id", ids)
      .in("distribution_status", [...INTERESTED_DISTRIBUTION])
      .gte("updated_at", since),
    db
      .from("investor_order_matches")
      .select("id, application_id, status, updated_at")
      .in("application_id", ids)
      .in("status", [...INTERESTED_MATCH])
      .gte("updated_at", since),
    db
      .from("investor_offers")
      .select("id, loan_application_id, offer_status, updated_at")
      .in("loan_application_id", ids)
      .in("offer_status", [...PROPOSAL_STATUSES])
      .gte("updated_at", since),
  ]);

  const signals = collectBrokerSignals({
    apps: appRows,
    distributions: dist.data ?? [],
    matches: match.data ?? [],
    offers: offer.data ?? [],
    since,
  });
  if (!signals.length) return { ok: true, signals: 0, sent: 0 };

  // Rezerwacja: wstawiamy tylko nowe klucze; zwrócone wiersze = do wysłania.
  const { data: reserved, error } = await db
    .from("broker_feedback_notifications")
    .upsert(
      signals.map((s) => ({
        key: s.key,
        broker_user_id: s.brokerUserId,
        application_id: s.applicationId,
        kind: s.kind,
      })),
      { onConflict: "key", ignoreDuplicates: true },
    )
    .select("key");
  if (error) throw new Error(error.message);
  const fresh = new Set(((reserved ?? []) as { key: string }[]).map((r) => r.key));
  const toSend = signals.filter((s) => fresh.has(s.key));
  if (!toSend.length) return { ok: true, signals: signals.length, sent: 0 };

  const byBroker = new Map<string, BrokerSignal[]>();
  for (const s of toSend)
    byBroker.set(s.brokerUserId, [...(byBroker.get(s.brokerUserId) ?? []), s]);

  const { resolveAppBaseUrl } = await import("@/lib/access/urls.server");
  const { sendResendEmail } = await import("@/lib/resend-send.server");
  const baseUrl = resolveAppBaseUrl();
  const appById = new Map(appRows.map((a) => [a.id, a]));
  let sent = 0;

  for (const [brokerUserId, list] of byBroker) {
    const keys = list.map((s) => s.key);
    try {
      const { data: partner } = await db
        .from("affiliate_partners")
        .select("email, billing_email")
        .eq("user_id", brokerUserId)
        .maybeSingle();
      let to: string | null = partner?.email ?? partner?.billing_email ?? null;
      if (!to) {
        const { data: prof } = await db
          .from("profiles")
          .select("email")
          .eq("user_id", brokerUserId)
          .maybeSingle();
        to = prof?.email ?? null;
      }
      if (!to) throw new Error("brak adresu e-mail pośrednika");

      const items = list.map((signal) => {
        const app = appById.get(signal.applicationId);
        const client = Array.isArray(app?.client) ? app.client[0] : app?.client;
        const amount = Number(app?.accepted_loan_amount ?? app?.loan_amount ?? 0) || null;
        return {
          signal,
          clientName:
            [client?.first_name, client?.last_name].filter(Boolean).join(" ").trim() ||
            "Twój klient",
          loanAmount: amount,
          commission: signal.kind === "wyplata" && amount ? brokerCommissionForLoan(amount) : null,
        };
      });
      const { subject, text } = buildBrokerFeedbackEmail({ baseUrl, items });
      const res = await sendResendEmail({ to, subject, text, category: "transactional" });
      if (!res.ok) throw new Error(res.error ?? "wysyłka nieudana");
      await db
        .from("broker_feedback_notifications")
        .update({ sent_at: new Date().toISOString() })
        .in("key", keys);
      sent += 1;
    } catch (e) {
      console.error("[broker-feedback-tick] send failed", brokerUserId, (e as Error).message);
      // Zwolnij rezerwację — ponowimy w kolejnym ticku (w oknie sygnałów).
      await db.from("broker_feedback_notifications").delete().in("key", keys).is("sent_at", null);
    }
  }
  return { ok: true, signals: signals.length, sent };
}

export const Route = createFileRoute("/api/public/hooks/broker-feedback-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        return Response.json(await run());
      },
    },
  },
});
