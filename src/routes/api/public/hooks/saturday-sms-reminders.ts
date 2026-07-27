// Cron: w sobotę rano (Warszawa) — SMS-przypominajka dla wniosków z ostatnich 14 dni,
// max 2 SMS-y na wniosek (raz na tydzień przez pierwsze 2 tygodnie).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendSmsInternal } from "@/lib/voicebot.functions";
import { ELIGIBLE_STATUSES_FOR_REMINDERS } from "@/lib/loan-progress.server";
import { smsForStep, renderFollowUp, buildFollowUpVars } from "@/lib/follow-up-templates";
import { requireCronSecret } from "@/lib/cron-auth.server";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function warsawHour(now: Date = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  return parseInt(p.find((x) => x.type === "hour")?.value ?? "0", 10);
}
function warsawWeekday(now: Date = new Date()): string {
  return (
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "short" })
      .formatToParts(now)
      .find((x) => x.type === "weekday")?.value ?? ""
  );
}

async function runBatch() {
  const now = new Date();
  const wd = warsawWeekday(now);
  const h = warsawHour(now);
  if (wd !== "Sat") return { ok: false, skipped: "not_saturday", weekday: wd, hour: h };
  if (h < 8 || h > 11) return { ok: false, skipped: "outside_morning", weekday: wd, hour: h };

  const s = admin();
  // SMS-y startują dopiero 7+ dni po złożeniu wniosku (wcześniej działają tylko maile + telefony).
  // Kadencja: RAZ NA MIESIĄC (nie częściej niż co ~28 dni), rotacyjna klikbaitowa treść.
  // SMS jest kanałem SAMODZIELNYM — NIE wysyłamy go wokół rozmów telefonicznych:
  // ani przed (rozmowa zaplanowana/w toku), ani po (rozmowa w ostatnich 7 dniach).
  // Sekwencję przerywają też: status terminalny, do_not_sms, ukończony wniosek.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const monthAgo = new Date(Date.now() - 28 * 86400_000).toISOString();

  const { data: loans } = await s
    .from("loan_applications")
    .select(
      `
      id, status, return_link_token, reminder_sms_count, reminder_sms_last_sent_at, created_at,
      client:clients!inner(first_name, phone_normalized, phone, do_not_sms)
    `,
    )
    .in("status", ELIGIBLE_STATUSES_FOR_REMINDERS)
    .lte("created_at", sevenDaysAgo)
    .order("reminder_sms_last_sent_at", { ascending: true, nullsFirst: true })
    .limit(500);

  let candidates = (loans ?? []).filter((l: any) => {
    if (l.client?.do_not_sms === true) return false;
    const phone = l.client?.phone_normalized || l.client?.phone;
    if (!phone) return false;
    // Raz na miesiąc — pomiń, jeśli SMS poszedł w ostatnich ~28 dniach.
    if (l.reminder_sms_last_sent_at && l.reminder_sms_last_sent_at > monthAgo) return false;
    return true;
  });

  // Wyklucz numery „wokół rozmowy": z zaplanowaną/trwającą rozmową (przed)
  // albo z rozmową z ostatnich 7 dni (po). Źródłem prawdy jest call_queue.
  const phones = Array.from(
    new Set(
      candidates.map((l: any) => l.client?.phone_normalized || l.client?.phone).filter(Boolean),
    ),
  ) as string[];
  if (phones.length) {
    const callWeekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: calls } = await s
      .from("call_queue")
      .select("phone_normalized, status, created_at, scheduled_at")
      .in("phone_normalized", phones);
    const blocked = new Set<string>();
    for (const c of (calls ?? []) as any[]) {
      const st = String(c.status ?? "");
      const upcoming = st === "oczekuje" || st === "w_trakcie"; // przed rozmową
      const recent =
        (c.created_at && c.created_at >= callWeekAgo) || // po rozmowie
        (c.scheduled_at && c.scheduled_at >= callWeekAgo);
      if (upcoming || recent) blocked.add(c.phone_normalized);
    }
    if (blocked.size) {
      candidates = candidates.filter(
        (l: any) => !blocked.has(l.client?.phone_normalized || l.client?.phone),
      );
    }
  }

  let sent = 0,
    errors = 0;
  const results: any[] = [];
  for (const loan of candidates as any[]) {
    const phone = loan.client.phone_normalized || loan.client.phone;
    const name = (loan.client.first_name ?? "").trim();
    // Rotacyjny, klikbaitowy SMS — numer w rotacji = ile SMS-ów już poszło.
    const step = Number(loan.reminder_sms_count ?? 0) + 1;
    const vars = buildFollowUpVars({ firstName: name, link: "https://financeyou.pl" });
    const body = renderFollowUp(smsForStep(step), vars);
    const r = await sendSmsInternal({ phone, body, source: "saturday_reminder" });
    if (r.ok) {
      sent++;
      await s
        .from("loan_applications")
        .update({
          reminder_sms_count: (loan.reminder_sms_count ?? 0) + 1,
          reminder_sms_last_sent_at: new Date().toISOString(),
        })
        .eq("id", loan.id);
    } else {
      errors++;
    }
    results.push({ id: loan.id, ok: r.ok, error: r.error });
  }
  return { ok: true, weekday: wd, hour: h, candidates: candidates.length, sent, errors, results };
}

export const Route = createFileRoute("/api/public/hooks/saturday-sms-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        try {
          const out = await runBatch();
          return Response.json(out);
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
        }
      },
    },
  },
});
