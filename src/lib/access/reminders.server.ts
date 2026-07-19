// Przypomnienia o końcu płatnego dostępu: 7, 3 i 1 dzień przed wygaśnięciem
// oraz informacja po wygaśnięciu. Deduplikacja per (użytkownik, grupa, rodzaj,
// data końca) w access_expiry_notifications — wydłużenie dostępu zmienia
// active_until, więc nowy okres dostaje własny cykl przypomnień.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AccessAudience } from "./core";

const db = supabaseAdmin as any;

const DAY_MS = 24 * 60 * 60 * 1000;

type ReminderKind = "d7" | "d3" | "d1" | "expired";

function kindFor(now: Date, activeUntil: Date): ReminderKind | null {
  const diff = activeUntil.getTime() - now.getTime();
  if (diff <= 0) {
    // Po wygaśnięciu — informuj tylko przez pierwsze 14 dni (nie spamuj starych kont).
    return now.getTime() - activeUntil.getTime() <= 14 * DAY_MS ? "expired" : null;
  }
  if (diff <= 1 * DAY_MS) return "d1";
  if (diff <= 3 * DAY_MS) return "d3";
  if (diff <= 7 * DAY_MS) return "d7";
  return null;
}

async function userEmail(userId: string): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function runAccessExpiryReminders(): Promise<{
  scanned: number;
  sent: number;
  errors: number;
}> {
  const now = new Date();
  const horizonFuture = new Date(now.getTime() + 7 * DAY_MS);
  const horizonPast = new Date(now.getTime() - 14 * DAY_MS);

  const { data: entitlements } = await db
    .from("access_entitlements")
    .select("user_id,audience,active_until")
    .not("active_until", "is", null)
    .gte("active_until", horizonPast.toISOString())
    .lte("active_until", horizonFuture.toISOString());

  let sent = 0;
  let errors = 0;
  const rows = (entitlements ?? []) as {
    user_id: string;
    audience: AccessAudience;
    active_until: string;
  }[];

  for (const ent of rows) {
    const activeUntil = new Date(ent.active_until);
    const kind = kindFor(now, activeUntil);
    if (!kind) continue;

    // Rezerwacja przed wysyłką: unikalny indeks gwarantuje jednorazowość.
    const { error: insErr } = await db.from("access_expiry_notifications").insert({
      user_id: ent.user_id,
      audience: ent.audience,
      kind,
      active_until: ent.active_until,
    });
    if (insErr) continue; // już wysłane (albo wyścig z innym tickiem)

    try {
      const email = await userEmail(ent.user_id);
      if (!email) continue;
      const { sendExpiryReminderEmail, sendAccessExpiredEmail } = await import("./emails.server");
      if (kind === "expired") {
        await sendAccessExpiredEmail({ to: email, audience: ent.audience });
      } else {
        const days = kind === "d7" ? 7 : kind === "d3" ? 3 : 1;
        await sendExpiryReminderEmail({
          to: email,
          audience: ent.audience,
          daysLeft: days,
          activeUntil,
        });
      }
      sent += 1;
    } catch (e) {
      errors += 1;
      console.error("[access-reminders] send failed", (e as Error).message);
    }
  }

  return { scanned: rows.length, sent, errors };
}
