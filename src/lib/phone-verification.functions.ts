import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendSmsInternal } from "@/lib/voicebot.functions";
import { normalizePolishPhone } from "@/lib/phone";

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

/** Wysyła 6-cyfrowy kod SMS na podany numer telefonu. */
export const sendPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: z.string().min(6).max(32) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { normalized, valid } = normalizePolishPhone(data.phone);
    if (!valid || !normalized) return { ok: false as const, reason: "invalid_phone" as const };

    // throttle: max 1 SMS / 60 s
    const { data: row } = await supabase
      .from("clients")
      .select("id, phone_otp_sent_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (row?.phone_otp_sent_at) {
      const diff = Date.now() - new Date(row.phone_otp_sent_at).getTime();
      if (diff < 60_000)
        return {
          ok: false as const,
          reason: "rate_limited" as const,
          retryInSec: Math.ceil((60_000 - diff) / 1000),
        };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hashed = hashCode(code, userId);
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const payload = {
      phone_otp_hash: hashed,
      phone_otp_target: normalized,
      phone_otp_expires_at: expires,
      phone_otp_sent_at: new Date().toISOString(),
      phone_otp_attempts: 0,
    };

    if (row?.id) {
      await supabase.from("clients").update(payload).eq("id", row.id);
    } else {
      await supabase
        .from("clients")
        .insert({ ...payload, user_id: userId, first_name: "", last_name: "" });
    }

    const sms = await sendSmsInternal({
      phone: normalized,
      body: `Finance You: Twój kod weryfikacyjny to ${code}. Wazny 10 min.`,
      source: "phone_verification",
    });
    if (!sms.ok)
      return { ok: false as const, reason: "sms_failed" as const, error: sms.error ?? "sms_error" };

    return { ok: true as const };
  });

/** Weryfikuje kod SMS i oznacza numer telefonu jako zweryfikowany. */
export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(4).max(8) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("clients")
      .select("id, phone_otp_hash, phone_otp_target, phone_otp_expires_at, phone_otp_attempts")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row?.phone_otp_hash || !row.phone_otp_target || !row.phone_otp_expires_at) {
      return { ok: false as const, reason: "no_code" as const };
    }
    if (new Date(row.phone_otp_expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }
    if ((row.phone_otp_attempts ?? 0) >= 5) {
      return { ok: false as const, reason: "too_many" as const };
    }

    const submitted = data.code.replace(/\D/g, "");
    const expected = hashCode(submitted, userId);
    if (expected !== row.phone_otp_hash) {
      await supabase
        .from("clients")
        .update({ phone_otp_attempts: (row.phone_otp_attempts ?? 0) + 1 })
        .eq("id", row.id);
      return { ok: false as const, reason: "wrong_code" as const };
    }

    await supabase
      .from("clients")
      .update({
        phone_verified_at: new Date().toISOString(),
        phone_verified_value: row.phone_otp_target,
        phone: row.phone_otp_target,
        phone_otp_hash: null,
        phone_otp_target: null,
        phone_otp_expires_at: null,
        phone_otp_attempts: 0,
      })
      .eq("id", row.id);

    return { ok: true as const, phone: row.phone_otp_target };
  });
