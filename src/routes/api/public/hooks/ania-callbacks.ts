// Cron: Ania dzwoni 2× dziennie do leadów, którzy nie odebrali / była poczta głosowa / zajęte,
// oraz wysyła SMS po telefonie. Cron uruchamiany co 15 min, gating wewnątrz handlera —
// odpalamy się tylko w dwóch "oknach" Warsaw: ~9:00–9:30 i ~16:00–16:30, pon–sob.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { ELIGIBLE_STATUSES_FOR_REMINDERS } from "@/lib/loan-progress.server";
import { placeOutboundCallInternal, sendSmsInternal } from "@/lib/voicebot.functions";
import { requireCronSecret, hasPrivateCronSecret } from "@/lib/cron-auth.server";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function warsawParts(now: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  return {
    weekday: p.find((x) => x.type === "weekday")?.value ?? "",
    hour: parseInt(p.find((x) => x.type === "hour")?.value ?? "0", 10),
    minute: parseInt(p.find((x) => x.type === "minute")?.value ?? "0", 10),
  };
}

// Statusy "nie odebrał" — call_queue.result_summary lub call_outcome z webhooka.
const NO_PICKUP_OUTCOMES = new Set([
  "nieodebrana",
  "poczta_glosowa",
  "zajety",
  "blad",
  "no_answer",
  "voicemail",
  "busy",
  "failed",
]);

const SMS_BODY = "Cześć, tu Ania z FinanceYou.pl. Proszę o kontakt w sprawie pożyczki.";

async function runBatch(force: boolean) {
  const now = new Date();
  const { weekday, hour, minute } = warsawParts(now);

  // Niedziela — nic.
  if (weekday === "Sun" && !force) return { ok: true, skipped: "sunday", weekday, hour, minute };

  // Dwa okna: 9:00–9:30 i 16:00–16:30 (Warszawa).
  const inMorningSlot = hour === 9 && minute < 30;
  const inAfternoonSlot = hour === 16 && minute < 30;
  if (!force && !inMorningSlot && !inAfternoonSlot) {
    return { ok: true, skipped: "outside_slots", weekday, hour, minute };
  }

  const s = admin();

  // Kandydaci: aktywne wnioski z numerem telefonu, nie pauzowane, nie do_not_call.
  const { data: loans } = await s
    .from("loan_applications")
    .select(
      `
      id, status, reminder_paused, last_reminder_at,
      client:clients!inner(id, first_name, last_name, phone_normalized, phone, do_not_call)
    `,
    )
    .in("status", ELIGIBLE_STATUSES_FOR_REMINDERS)
    .eq("reminder_paused", false)
    .limit(200);

  const candidates = (loans ?? []).filter((l: any) => {
    if (l.client?.do_not_call === true) return false;
    const phone = l.client?.phone_normalized || l.client?.phone;
    return !!phone;
  });

  if (candidates.length === 0) {
    return { ok: true, weekday, hour, minute, candidates: 0, called: 0, skipped: 0 };
  }

  // Pobierz ostatnią rozmowę per numer — w jednym zapytaniu.
  const phones = Array.from(
    new Set(candidates.map((l: any) => l.client.phone_normalized || l.client.phone)),
  );
  const { data: lastCalls } = await s
    .from("call_queue")
    .select("phone_normalized, created_at, started_at, status, result_summary, conversation_id")
    .in("phone_normalized", phones as string[])
    .in("status", ["w_trakcie", "wykonane"])
    .order("created_at", { ascending: false })
    .limit(2000);

  const lastByPhone = new Map<string, any>();
  for (const c of lastCalls ?? []) {
    if (!lastByPhone.has(c.phone_normalized)) lastByPhone.set(c.phone_normalized, c);
  }

  let called = 0,
    skipped = 0,
    smsSent = 0,
    smsErrors = 0;
  const results: any[] = [];

  for (const loan of candidates as any[]) {
    const phone = loan.client.phone_normalized || loan.client.phone;
    const last = lastByPhone.get(phone);

    // Jeżeli był telefon, ale klient ODEBRAŁ (długa rozmowa) → pomijamy.
    if (last) {
      const summary = String(last.result_summary ?? "").toLowerCase();
      const looksLikeAnswered =
        summary.includes("rozmowa") ||
        summary.includes("odebrana") ||
        summary.includes("answered") ||
        summary.includes("completed");
      const looksLikeNoPickup = Array.from(NO_PICKUP_OUTCOMES).some((k) => summary.includes(k));
      // Jeżeli ostatni telefon to "wykonane" + brak markerów no-pickup i są markery odebrane → pomijamy.
      if (last.status === "wykonane" && looksLikeAnswered && !looksLikeNoPickup) {
        skipped++;
        results.push({ id: loan.id, skipped: "already_answered" });
        continue;
      }
    }

    // Telefon — Ania (bypass 24h throttle, ale 5h min gap).
    const callRes = await placeOutboundCallInternal({
      phone,
      source: "ania_callback",
      clientId: loan.client?.id ?? null,
      loanApplicationId: loan.id,
      firstName: loan.client?.first_name ?? null,
    });

    if (callRes.ok) called++;
    else skipped++;

    // SMS — niezależnie od wyniku telefonu (klient zobaczy oba kanały).
    const sms = await sendSmsInternal({
      phone,
      body: SMS_BODY,
      source: "ania_callback_sms",
    });
    if (sms.ok) smsSent++;
    else smsErrors++;

    results.push({
      id: loan.id,
      phone,
      call_ok: callRes.ok,
      call_error: callRes.error,
      sms_ok: sms.ok,
      sms_error: sms.error,
    });
  }

  return {
    ok: true,
    weekday,
    hour,
    minute,
    candidates: candidates.length,
    called,
    skipped,
    smsSent,
    smsErrors,
    results,
  };
}

export const Route = createFileRoute("/api/public/hooks/ania-callbacks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const url = new URL(request.url);
          // `force` omija wszystkie okna czasowe i może wystrzelić masę
          // telefonów/SMS — dopuszczamy je wyłącznie z prywatnym CRON_SECRET,
          // nigdy z publicznym kluczem anon.
          const force = url.searchParams.get("force") === "1" && hasPrivateCronSecret(request);
          const out = await runBatch(force);
          return Response.json(out);
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
        }
      },
      GET: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("force") === "1" && hasPrivateCronSecret(request);
          const out = await runBatch(force);
          return Response.json(out);
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
        }
      },
    },
  },
});
