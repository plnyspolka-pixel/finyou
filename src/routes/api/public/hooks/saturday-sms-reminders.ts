// Cron: w sobotę rano (Warszawa) — SMS-przypominajka dla wniosków z ostatnich 14 dni,
// max 2 SMS-y na wniosek (raz na tydzień przez pierwsze 2 tygodnie).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendSmsInternal } from "@/lib/voicebot.functions";
import { ELIGIBLE_STATUSES_FOR_REMINDERS } from "@/lib/loan-progress.server";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function warsawHour(now: Date = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw", hour: "2-digit", hour12: false,
  }).formatToParts(now);
  return parseInt(p.find((x) => x.type === "hour")?.value ?? "0", 10);
}
function warsawWeekday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "short" })
    .formatToParts(now).find((x) => x.type === "weekday")?.value ?? "";
}

async function runBatch() {
  const now = new Date();
  const wd = warsawWeekday(now);
  const h = warsawHour(now);
  if (wd !== "Sat") return { ok: false, skipped: "not_saturday", weekday: wd, hour: h };
  if (h < 8 || h > 11) return { ok: false, skipped: "outside_morning", weekday: wd, hour: h };

  const s = admin();
  const since14d = new Date(Date.now() - 14 * 86400_000).toISOString();
  const sixDaysAgo = new Date(Date.now() - 6 * 86400_000).toISOString();

  const { data: loans } = await s
    .from("loan_applications")
    .select(`
      id, status, return_link_token, reminder_sms_count, reminder_sms_last_sent_at, created_at,
      client:clients!inner(first_name, phone_normalized, phone)
    `)
    .in("status", ELIGIBLE_STATUSES_FOR_REMINDERS)
    .gte("created_at", since14d)
    .lt("reminder_sms_count", 2)
    .limit(500);

  const candidates = (loans ?? []).filter((l: any) => {
    const phone = l.client?.phone_normalized || l.client?.phone;
    if (!phone) return false;
    // Nie częściej niż raz na 6 dni
    if (l.reminder_sms_last_sent_at && l.reminder_sms_last_sent_at > sixDaysAgo) return false;
    return true;
  });

  let sent = 0, errors = 0;
  const results: any[] = [];
  for (const loan of candidates as any[]) {
    const phone = loan.client.phone_normalized || loan.client.phone;
    const name = (loan.client.first_name ?? "").trim();
    const greet = name ? ` ${name}` : "";
    const body = `Finance You: Cześć${greet}! Twój wniosek o pożyczkę czeka na dokończenie. Wejdź na https://financeyou.pl i dokończ go w 3 minuty.`;
    const r = await sendSmsInternal({ phone, body, source: "saturday_reminder" });
    if (r.ok) {
      sent++;
      await s.from("loan_applications").update({
        reminder_sms_count: (loan.reminder_sms_count ?? 0) + 1,
        reminder_sms_last_sent_at: new Date().toISOString(),
      }).eq("id", loan.id);
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
      POST: async () => {
        try {
          const out = await runBatch();
          return Response.json(out);
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
        }
      },
      GET: async () => {
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
