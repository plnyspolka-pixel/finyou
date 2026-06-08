import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Po wejściu zalogowanego klienta na /wniosek-warunki (kalkulator: oprocentowanie + max rata)
 * planujemy pierwszy follow-up: telefon Ani ~60 sekund później.
 *
 * Idempotentne — jeżeli w ostatnich 30 minutach taki wpis już istnieje dla tego klienta,
 * nic nie robimy (np. user odświeży stronę).
 */
export const scheduleCalculatorEntryFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pobierz telefon klienta
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("phone, first_name")
      .eq("user_id", userId)
      .maybeSingle();

    const phone = (profile?.phone ?? "").trim();
    if (!phone || phone.length < 9) {
      return { ok: false, reason: "no_phone" as const };
    }

    // Znajdź wpis klienta (best effort)
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const source = "calculator-entry";

    // Dedup: zaplanowane / wykonane w ostatnich 30 min
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from("call_queue")
      .select("id")
      .eq("source", source)
      .eq("phone_normalized", phone)
      .gte("created_at", cutoff)
      .limit(1);

    if (existing && existing.length > 0) {
      return { ok: true, deduped: true as const };
    }

    const scheduledAt = new Date(Date.now() + 60 * 1000).toISOString();
    const { error } = await supabaseAdmin.from("call_queue").insert({
      phone_normalized: phone,
      client_id: client?.id ?? null,
      source,
      status: "oczekuje",
      scheduled_at: scheduledAt,
      attempts: 0,
    });
    if (error) {
      return { ok: false, reason: "insert_failed" as const, error: error.message };
    }
    return { ok: true, scheduledAt };
  });
