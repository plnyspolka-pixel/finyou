// JEDEN SMS na wejściu leada — i nic więcej tego dnia.
//
// Wcześniej nowy lead dostawał w kilka minut: zapowiedź telefonu Ani, SMS
// z magic linkiem od agenta i SMS z kadencji dnia 1. Teraz na wejściu wychodzi
// dokładnie jedna wiadomość: krótka oferta + krótki link (financeyou.pl/s/<kod>),
// który dopiero przy kliknięciu rozwija się w świeży magic link. Resztę wysyłek
// tego dnia odcina hamulec w `sendSmsInternal` (limit 1 SMS automatyczny / 24 h).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createShortLink, PUBLIC_SITE_ORIGIN } from "@/lib/short-link.server";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Źródło wysyłki — po nim rozpoznajemy, że powitalny SMS już poszedł. */
export const WELCOME_SMS_SOURCE = "lead_welcome";

/**
 * Treść bez polskich znaków — z diakrytykami Twilio koduje SMS jako UCS-2
 * (70 znaków na segment zamiast 160), więc jedna wiadomość zrobiłaby się dwoma.
 * Reszta szablonów SMS w systemie trzyma tę samą konwencję.
 */
export function buildWelcomeSmsBody(link: string): string {
  return `Finance You: pozyczki pod zastaw nieruchomosci juz od 1,79% - kliknij: ${link}`;
}

/** Czy na ten numer poszedł już powitalny SMS (kiedykolwiek). */
export async function welcomeSmsAlreadySent(phoneNormalized: string): Promise<boolean> {
  const s = admin();
  const { data } = await s
    .from("lead_communications")
    .select("id")
    .eq("phone_normalized", phoneNormalized)
    .eq("channel", "sms")
    .eq("direction", "outbound")
    .eq("metadata->>source", WELCOME_SMS_SOURCE)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export interface WelcomeSmsOpts {
  phone: string;
  email?: string | null;
  leadId?: string | null;
  clientId?: string | null;
  loanApplicationId?: string | null;
  /** Stabilny token powrotu do wniosku — fallback, gdy nie mamy maila. */
  returnLinkToken?: string | null;
  role?: "klient" | "operator" | "inwestor";
}

/**
 * Wysyła powitalny SMS. Idempotentne per numer — webhook i pull-sync Mety mogą
 * wejść na tego samego leada, a wiadomość i tak pójdzie raz.
 */
export async function sendLeadWelcomeSms(
  opts: WelcomeSmsOpts,
): Promise<{ ok: boolean; skipped?: boolean; reason?: string; link?: string; error?: string }> {
  const { normalizePhoneForVoicebot, sendSmsInternal } = await import("@/lib/voicebot.functions");
  const phone = normalizePhoneForVoicebot(opts.phone ?? "");
  if (!phone || phone.replace(/\D/g, "").length < 9) {
    return { ok: false, skipped: true, reason: "no_phone" };
  }

  if (await welcomeSmsAlreadySent(phone)) {
    return { ok: false, skipped: true, reason: "already_sent" };
  }

  const fallbackUrl = opts.returnLinkToken
    ? `${PUBLIC_SITE_ORIGIN}/wniosek/${opts.returnLinkToken}`
    : PUBLIC_SITE_ORIGIN;

  const short = await createShortLink({
    targetUrl: fallbackUrl,
    magicLinkEmail: opts.email ?? null,
    magicLinkRole: opts.role ?? "klient",
    leadId: opts.leadId ?? null,
    clientId: opts.clientId ?? null,
    loanApplicationId: opts.loanApplicationId ?? null,
    phoneNormalized: phone,
    source: WELCOME_SMS_SOURCE,
  });

  const link = short?.url ?? fallbackUrl;
  const res = await sendSmsInternal({
    phone,
    body: buildWelcomeSmsBody(link),
    source: WELCOME_SMS_SOURCE,
    category: "automated",
    metadata: { source: WELCOME_SMS_SOURCE, short_code: short?.code ?? null },
  });

  // Lead wpadł w nocy albo w niedzielę — jedynego SMS-a wejściowego nie gubimy,
  // tylko planujemy na najbliższe okno wysyłki (obsługuje go follow-up-tick).
  if (!res.ok && (res.reason === "quiet_hours" || res.reason === "sunday")) {
    await scheduleWelcomeSmsForNextWindow(opts.leadId ?? null);
  }

  return {
    ok: res.ok,
    skipped: res.skipped,
    reason: res.reason,
    link,
    error: res.error,
  };
}

/** Wstawia (idempotentnie) wiersz harmonogramu, który wyśle SMS powitalny w oknie. */
async function scheduleWelcomeSmsForNextWindow(leadId: string | null): Promise<void> {
  if (!leadId) return;
  try {
    const { WELCOME_SMS_KIND, WELCOME_SMS_STEP_INDEX, nextWindowOpenAt } =
      await import("@/lib/follow-up-plan.server");
    const s = admin();
    await s.from("lead_follow_up_schedule").upsert(
      {
        lead_id: leadId,
        channel: "sms",
        step_index: WELCOME_SMS_STEP_INDEX,
        status: "pending",
        scheduled_at: nextWindowOpenAt(new Date()).toISOString(),
        metadata: { kind: WELCOME_SMS_KIND },
      },
      { onConflict: "lead_id,channel,step_index" },
    );
  } catch (e) {
    console.error("[lead-welcome-sms] schedule failed", e);
  }
}
