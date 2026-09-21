// Wysyłka wiadomości przez Meta Graph API (Messenger + Instagram Direct).
//
// Jedyne miejsce, przez które wychodzi każda wiadomość na kanałach Meta — więc
// tutaj siedzi strażnik wypisu (klient powiedział „dość") i dopisek „napisz
// STOP" do wiadomości proaktywnych, czyli odpowiednik stopki maila.
import { ensureMetaTokens } from "@/lib/meta-tokens.server";
import {
  canSendMetaMessage,
  withOptOutHint,
  type MetaPlatform,
} from "@/lib/messenger-opt-out.server";
import type { SendCategory } from "@/lib/opt-out";

const GRAPH = "https://graph.facebook.com/v21.0";

export async function sendMetaMessage(opts: {
  recipientId: string; // PSID (Messenger) lub IGSID (Instagram)
  text: string;
  platform: MetaPlatform;
  /**
   * `transactional` — wiadomość pisana ręcznie przez operatora: idzie mimo
   * zwykłego wyciszenia. Domyślnie `automated`, czyli wypis ją zatrzymuje.
   */
  category?: SendCategory;
  /**
   * Wiadomość proaktywna (follow-up, nudge, outbox) — dostaje dopisek
   * „napisz STOP". Odpowiedzi w trwającej rozmowie go nie dostają.
   */
  proactive?: boolean;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const category: SendCategory = opts.category ?? "automated";
  try {
    const decision = await canSendMetaMessage(opts.platform, opts.recipientId, category);
    if (!decision.allowed) {
      console.warn(
        `[meta-send] blocked recipient ${opts.platform}:${opts.recipientId} (${decision.reason})`,
      );
      return { ok: false, error: `blocked:${decision.reason}` };
    }
  } catch (e) {
    console.error("[meta-send] send guard failed", e);
  }

  const text = opts.proactive ? withOptOutHint(opts.text) : opts.text;
  await ensureMetaTokens();
  // Preferuj token dedykowany dla platformy (IG ma osobny), potem ogólny Page token, potem fallback.
  const token =
    (opts.platform === "instagram" ? process.env.META_IG_PAGE_ACCESS_TOKEN : undefined) ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "META_PAGE_ACCESS_TOKEN / META_ACCESS_TOKEN missing" };
  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_type: "RESPONSE",
      recipient: { id: opts.recipientId },
      message: { text: text.slice(0, 1990) },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
  return { ok: true, messageId: json?.message_id };
}
