import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { ELIGIBLE_STATUSES_FOR_REMINDERS } from "@/lib/loan-progress.server";
import { placeReminderCall } from "@/lib/loan-reminders.functions";

// Publiczny webhook dla pg_cron — uruchamia przypomnienia gotowe do wysłania.
// Wymaga nagłówka `apikey` = SUPABASE anon key (sprawdzane miękko — Workers nie blokują).
export const Route = createFileRoute("/api/public/hooks/loan-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
        if (expected && apiKey && apiKey !== expected) {
          return new Response(JSON.stringify({ error: "invalid apikey" }), { status: 401 });
        }
        // Quiet hours: dzwonimy tylko 8:00–22:00 czasu Warszawa, poza niedzielami.
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Warsaw",
          hour: "2-digit",
          minute: "2-digit",
          weekday: "short",
          hour12: false,
        }).formatToParts(new Date());
        const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
        const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
        const isSunday = weekday === "Sun";
        const inWindow = hour >= 8 && hour < 22;
        if (isSunday || !inWindow) {
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: isSunday ? "sunday" : "outside_hours", hour, weekday }),
            { headers: { "content-type": "application/json" } },
          );
        }

        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(url, key);

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabase
          .from("loan_applications")
          .select("id")
          .in("status", ELIGIBLE_STATUSES_FOR_REMINDERS)
          .eq("reminder_paused", false)
          .not("next_reminder_at", "is", null)
          .lte("next_reminder_at", nowIso)
          .limit(20);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        const results: any[] = [];
        for (const row of due ?? []) {
          try {
            const r = await placeReminderCall(row.id, "cron_reminder");
            results.push({ id: row.id, ...r });
          } catch (e: any) {
            results.push({ id: row.id, ok: false, error: e?.message ?? "exception" });
          }
        }
        return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
          headers: { "content-type": "application/json" },
        });
      },
      GET: async () => new Response(JSON.stringify({ ok: true, hint: "POST to trigger" })),
    },
  },
});
