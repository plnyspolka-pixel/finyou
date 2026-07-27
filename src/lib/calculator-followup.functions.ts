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

    const rawPhone = (profile?.phone ?? "").trim();
    if (!rawPhone || rawPhone.length < 9) {
      return { ok: false, reason: "no_phone" as const };
    }
    // Normalizacja do +48… żeby dedup i throttle w placeOutboundCallInternal działały.
    const { normalizePhoneForVoicebot } = await import("@/lib/voicebot.functions");
    const phone = normalizePhoneForVoicebot(rawPhone);

    // Znajdź wpis klienta (best effort)
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const source = "calculator-entry";

    // Dedup #1: zaplanowane / w trakcie / wykonane w ostatnich 24 h dla TEGO źródła.
    // (placeOutboundCallInternal i tak ma globalny throttle 24 h dla wszystkich źródeł.)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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

    // Dedup #2: jakikolwiek telefon (każde źródło) do tego numeru w ostatnich 24 h.
    const { data: anyRecent } = await supabaseAdmin
      .from("call_queue")
      .select("id, source")
      .eq("phone_normalized", phone)
      .in("status", ["w_trakcie", "wykonane"])
      .gte("created_at", cutoff)
      .neq("source", "test")
      .limit(1);
    if (anyRecent && anyRecent.length > 0) {
      return { ok: true, deduped: true as const, reason: "daily_throttle" as const };
    }

    // Druga zapora: jeśli „za 60 s" wypada poza 8:00–22:00 Warszawa lub w niedzielę,
    // przesuń na najbliższe 8:00 (pn–sob).
    const { getCallingWindow } = await import("@/lib/voicebot.functions");
    const target = new Date(Date.now() + 60 * 1000);
    const win = getCallingWindow(target);
    const scheduledAt = (win.allowed ? target : win.nextAllowedAt).toISOString();
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
