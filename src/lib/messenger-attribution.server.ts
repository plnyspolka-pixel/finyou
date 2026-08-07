// Atrybucja reklama → PSID. Meta wysyła w webhooku Messengera zdarzenia
// `referral` (klik w reklamę click-to-Messenger, link m.me?ref=, plugin czatu)
// oraz `postback.referral` (pierwsza interakcja przez Get Started).
// Zapisujemy je per (platform, psid); dołączenie do leada odbywa się joinem
// po leads.messenger_psid (bez zmian w tabeli leads).
//
// Wpięcie: w meta-messaging.server.ts, w pętli po entry[].messaging[], wywołaj
//   await captureReferralFromEvent(ev, platform)
// PRZED obsługą wiadomości (referral przychodzi też bez message).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type MetaReferral = {
  ref?: string;
  ad_id?: string;
  source?: string; // ADS | SHORTLINK | CUSTOMER_CHAT_PLUGIN | MESSENGER_CODE
  type?: string;
  ads_context_data?: Record<string, unknown>;
};

/** Wyciąga referral z eventu webhooka (messaging.referral lub postback.referral). */
export function extractReferral(ev: any): MetaReferral | null {
  const r: MetaReferral | undefined = ev?.referral ?? ev?.postback?.referral;
  if (!r) return null;
  if (!r.ad_id && !r.ref && !r.source) return null;
  return r;
}

export async function captureReferralFromEvent(
  ev: any,
  platform: "messenger" | "instagram",
): Promise<void> {
  const referral = extractReferral(ev);
  const psid: string | undefined = ev?.sender?.id;
  if (!referral || !psid) return;

  const supa = admin();
  const now = new Date().toISOString();

  const { data: existing } = await supa
    .from("messenger_ad_attributions")
    .select("id, ad_id, ref, history")
    .eq("platform", platform)
    .eq("psid", psid)
    .maybeSingle();

  if (!existing) {
    await supa.from("messenger_ad_attributions").insert({
      platform,
      psid,
      ad_id: referral.ad_id ?? null,
      ref: referral.ref ?? null,
      source: referral.source ?? null,
      ads_context: referral.ads_context_data ?? null,
      first_seen_at: now,
      last_seen_at: now,
    });
    return;
  }

  // Re-klik (być może z INNEJ reklamy) → poprzedni stan do historii,
  // najnowszy referral wygrywa (last-touch).
  const history = Array.isArray(existing.history) ? existing.history : [];
  if (existing.ad_id && existing.ad_id !== referral.ad_id) {
    history.push({ ad_id: existing.ad_id, ref: existing.ref, replaced_at: now });
  }
  await supa
    .from("messenger_ad_attributions")
    .update({
      ad_id: referral.ad_id ?? existing.ad_id,
      ref: referral.ref ?? existing.ref,
      source: referral.source ?? null,
      ads_context: referral.ads_context_data ?? null,
      last_seen_at: now,
      history,
    })
    .eq("id", existing.id);
}

/** Uzupełnia adset_id/campaign_id dla atrybucji, którym znamy tylko ad_id
 *  (1 zapytanie Graph per brakująca reklama; wołane z ticka insights). */
export async function backfillAdHierarchy(): Promise<{ filled: number; errors: string[] }> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { filled: 0, errors: ["META_ACCESS_TOKEN missing"] };
  const supa = admin();
  const errors: string[] = [];
  let filled = 0;

  const { data: rows } = await supa
    .from("messenger_ad_attributions")
    .select("id, ad_id")
    .not("ad_id", "is", null)
    .is("adset_id", null)
    .limit(50);

  for (const row of rows ?? []) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${row.ad_id}?fields=adset_id,campaign_id&access_token=${encodeURIComponent(token)}`,
      );
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        errors.push(`${row.ad_id}: ${JSON.stringify(json.error ?? json).slice(0, 120)}`);
        continue;
      }
      await supa
        .from("messenger_ad_attributions")
        .update({ adset_id: json.adset_id ?? null, campaign_id: json.campaign_id ?? null })
        .eq("id", row.id);
      filled++;
    } catch (e: any) {
      errors.push(`${row.ad_id}: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  return { filled, errors };
}
