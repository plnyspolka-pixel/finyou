// Indywidualne konsultacje inwestora — zgłoszenie preferowanego terminu z panelu.
// Wymaga aktywnego abonamentu; limit 4 h w okresie (Regulamin 1.1, § 3 ust. 3).
// Po zapisie właściciel dostaje SMS (źródło owner_alert — poza hamulcem SMS).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONSULTATION_DURATIONS,
  consultationOwnerSms,
  consultationPeriodStart,
  consultationTimes,
  remainingConsultationMinutes,
  warsawToDate,
} from "./consultations";

async function periodRequests(db: any, userId: string, now: Date) {
  const { data: ent } = await db
    .from("access_entitlements")
    .select("active_until")
    .eq("user_id", userId)
    .eq("audience", "investor")
    .maybeSingle();
  const since = consultationPeriodStart(ent?.active_until ?? null, now);
  const { data } = await db
    .from("investor_consultation_requests")
    .select("id, preferred_start, duration_minutes, topic, status, created_at")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("preferred_start", { ascending: true });
  return (data ?? []) as {
    id: string;
    preferred_start: string;
    duration_minutes: number;
    topic: string | null;
    status: string;
    created_at: string;
  }[];
}

export const getMyConsultations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const requests = await periodRequests(supabaseAdmin, context.userId, new Date());
    return { requests, remainingMinutes: remainingConsultationMinutes(requests) };
  });

export const requestConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^\d{2}:\d{2}$/),
        minutes: z.number().int(),
        topic: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertInvestorFullAccess } = await import("@/lib/access/guards.server");
    await assertInvestorFullAccess(userId);

    const now = new Date();
    if (!(CONSULTATION_DURATIONS as readonly number[]).includes(data.minutes))
      throw new Error("Nieprawidłowa długość konsultacji.");
    if (!consultationTimes(data.date, data.minutes, now).includes(data.time))
      throw new Error("Ten termin jest niedostępny — wybierz inny dzień lub godzinę.");

    const db = supabaseAdmin as any;
    const existing = await periodRequests(db, userId, now);
    const remaining = remainingConsultationMinutes(existing);
    if (data.minutes > remaining)
      throw new Error(
        remaining > 0
          ? `W tym okresie zostało Ci ${remaining} min konsultacji.`
          : "Wykorzystałeś już 4 godziny konsultacji w tym okresie abonamentu.",
      );

    const at = warsawToDate(data.date, data.time);
    const topic = data.topic?.trim() || null;
    const { data: row, error } = await db
      .from("investor_consultation_requests")
      .insert({
        user_id: userId,
        preferred_start: at.toISOString(),
        duration_minutes: data.minutes,
        topic,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Nie udało się zapisać zgłoszenia: ${error.message}`);

    // SMS do właściciela — błąd wysyłki nie cofa zgłoszenia (zostaje w bazie).
    const { data: inv } = await db
      .from("investors")
      .select("first_name, last_name, company_name, phone")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: prof } = await db
      .from("profiles")
      .select("first_name, last_name, phone, email")
      .eq("user_id", userId)
      .maybeSingle();
    const name =
      [inv?.first_name ?? prof?.first_name, inv?.last_name ?? prof?.last_name]
        .filter(Boolean)
        .join(" ") ||
      inv?.company_name ||
      prof?.email ||
      "Inwestor";
    const phone = inv?.phone ?? prof?.phone ?? null;
    let smsError: string | null = null;
    try {
      const { sendSmsInternal } = await import("@/lib/voicebot.functions");
      const { ownerAlertPhone } = await import("@/lib/sms-guard.server");
      const res = await sendSmsInternal({
        phone: ownerAlertPhone(),
        body: consultationOwnerSms({ name, phone, at, minutes: data.minutes, topic }),
        source: "owner_alert",
        category: "critical",
      });
      if (!res.ok) smsError = res.error ?? res.reason ?? "SMS nie został wysłany";
    } catch (e) {
      smsError = e instanceof Error ? e.message : String(e);
    }
    await db
      .from("investor_consultation_requests")
      .update(
        smsError
          ? { owner_sms_error: smsError, updated_at: new Date().toISOString() }
          : { owner_sms_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      )
      .eq("id", row.id);
    if (smsError) console.error("[konsultacje] SMS do właściciela", smsError);

    return { ok: true, remainingMinutes: remaining - data.minutes };
  });
