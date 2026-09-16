// Jedno miejsce, które decyduje o wypisie z korespondencji mailowej:
//   • generuje trwały token wypisu i link do stopki KAŻDEGO maila,
//   • wykonuje wypis (link w stopce, one-click z klienta pocztowego, skarga
//     spam z webhooka Resend, a przede wszystkim mail typu „dość, przestańcie"),
//   • odpowiada na pytanie „czy wolno wysłać maila na ten adres".
//
// Zasada: jak klient mówi „dość" — to dość. Wypis jest wpisywany od razu we
// WSZYSTKIE tory wysyłki (suppression, clients.do_not_email, subskrybenci
// newslettera, przypomnienia o wniosku), żeby żaden silnik nie pisał dalej.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { decideEmailSend, type EmailCategory, type OptOutStrength } from "./email-opt-out";

export type { EmailCategory } from "./email-opt-out";

/** Wynik strażnika wysyłki (reguła: decideEmailSend w email-opt-out.ts). */
export type SendDecision = ReturnType<typeof decideEmailSend>;

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || process.env.SITE_URL || "https://financeyou.pl";
}

const CONTACT_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "kontakt@financeyou.pl";

function normalize(email: string | null | undefined): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Czy wolno wysłać maila na ten adres? Wpięte w każdy tor wysyłki
 * (Resend transakcyjny, kampanie marketingowe, Mailgun).
 */
export async function canSendEmail(
  email: string | null | undefined,
  category: EmailCategory = "automated",
): Promise<SendDecision> {
  const addr = normalize(email);
  if (!addr) return { allowed: false, reason: "missing_recipient" };
  const s = admin();

  const { data: sup } = await s
    .from("suppressed_emails")
    .select("reason, metadata")
    .eq("email", addr)
    .maybeSingle();

  const { data: client } = await s
    .from("clients")
    .select("do_not_email")
    .ilike("email", addr)
    .eq("do_not_email", true)
    .limit(1)
    .maybeSingle();

  return decideEmailSend({
    suppression: sup
      ? {
          reason: String(sup.reason ?? "unsubscribe"),
          hard: (sup.metadata as any)?.hard === true,
          unblocked: !!(sup.metadata as any)?.unblocked_at,
        }
      : null,
    doNotEmail: !!client,
    category,
  });
}

/** Trwały token wypisu dla adresu (jeden na adres, ważny bezterminowo). */
export async function unsubscribeTokenFor(email: string): Promise<string | null> {
  const addr = normalize(email);
  if (!addr) return null;
  const s = admin();
  const { data: existing } = await s
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", addr)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const token = randomBytes(24).toString("base64url");
  const { error } = await s.from("email_unsubscribe_tokens").insert({ email: addr, token });
  if (error) {
    // Wyścig dwóch wysyłek do tego samego adresu — token założył ktoś inny.
    const { data: again } = await s
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", addr)
      .maybeSingle();
    return again?.token ?? null;
  }
  return token;
}

/** Link „Wypisz mnie" do stopki maila (strona z potwierdzeniem). */
export async function unsubscribeUrlFor(email: string): Promise<string | null> {
  const token = await unsubscribeTokenFor(email);
  return token ? `${baseUrl()}/email/unsubscribe?t=${encodeURIComponent(token)}` : null;
}

/**
 * Nagłówki List-Unsubscribe + one-click (RFC 8058). Gmail/Outlook pokazują
 * wtedy własny przycisk „Wypisz się" obok nadawcy — klient nie musi szukać
 * linku w stopce ani zgłaszać nas jako spam.
 */
export async function unsubscribeHeaders(email: string): Promise<Record<string, string>> {
  const token = await unsubscribeTokenFor(email);
  if (!token) return {};
  const oneClick = `${baseUrl()}/api/public/email/unsubscribe?t=${encodeURIComponent(token)}`;
  return {
    "List-Unsubscribe": `<${oneClick}>, <mailto:${CONTACT_ADDRESS}?subject=Wypisz%20mnie>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export interface OptOutInput {
  email: string;
  /** Skąd wypis: 'footer_link' | 'one_click' | 'inbound_reply' | 'spam_complaint' | 'panel' */
  source: string;
  strength?: OptOutStrength;
  /** Fragment wiadomości / sygnał, który uruchomił strażnika. */
  phrase?: string | null;
  signal?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OptOutResult {
  ok: boolean;
  email: string;
  strength: OptOutStrength;
  /** Co faktycznie zostało wyciszone — do logu i do komunikatu dla klienta. */
  applied: string[];
}

/**
 * Wykonuje wypis we wszystkich torach naraz. Idempotentne — można wywołać
 * wielokrotnie dla tego samego adresu.
 */
export async function applyOptOut(input: OptOutInput): Promise<OptOutResult> {
  const addr = normalize(input.email);
  const strength: OptOutStrength = input.strength ?? "soft";
  const applied: string[] = [];
  if (!addr) return { ok: false, email: "", strength, applied };

  const s = admin();
  const now = new Date().toISOString();
  const metadata = {
    ...(input.metadata ?? {}),
    source: input.source,
    signal: input.signal ?? null,
    phrase: input.phrase ?? null,
    hard: strength === "hard",
    opted_out_at: now,
  };

  // 1) Lista blokad — respektowana przez każdy tor wysyłki.
  try {
    await s
      .from("suppressed_emails")
      .upsert(
        { email: addr, reason: strength === "hard" ? "complaint" : "unsubscribe", metadata },
        { onConflict: "email" },
      );
    applied.push("suppressed_emails");
  } catch (e) {
    console.error("[email-unsubscribe] suppression failed", e);
  }

  // 2) Kartoteka klienta — widoczne dla operatora w panelu.
  try {
    const { data: clients } = await s.from("clients").select("id").ilike("email", addr);
    const ids = (clients ?? []).map((c: any) => c.id);
    if (ids.length) {
      await s.from("clients").update({ do_not_email: true }).in("id", ids);
      applied.push("clients.do_not_email");
      // 3) Drip przypomnień o wniosku i follow-up braków.
      const { data: loans } = await s
        .from("loan_applications")
        .select("id")
        .in("client_id", ids)
        .eq("reminder_email_unsubscribed", false);
      const loanIds = (loans ?? []).map((l: any) => l.id);
      if (loanIds.length) {
        await s
          .from("loan_applications")
          .update({ reminder_email_unsubscribed: true, reminder_email_unsubscribed_at: now })
          .in("id", loanIds);
        applied.push("loan_applications.reminder_email_unsubscribed");
      }
    }
  } catch (e) {
    console.error("[email-unsubscribe] client opt-out failed", e);
  }

  // 4) Newsletter / kampanie marketingowe.
  try {
    const { data: subs } = await s
      .from("email_subscribers")
      .update({ status: "unsubscribed", unsubscribed_at: now })
      .eq("email", addr)
      .neq("status", "unsubscribed")
      .select("id");
    if (subs?.length) applied.push("email_subscribers");
  } catch (e) {
    console.error("[email-unsubscribe] subscriber opt-out failed", e);
  }

  // 5) Wspólna tabela wyciszeń (Messenger/Instagram/e-mail) — spójny obraz.
  try {
    await s
      .from("comms_suppressions")
      .upsert(
        { channel: "email", identifier: addr, reason: "opt_out", metadata, expires_at: null },
        { onConflict: "channel,identifier" },
      );
    applied.push("comms_suppressions");
  } catch (e) {
    console.error("[email-unsubscribe] comms suppression failed", e);
  }

  // 6) Token wypisu — oznacz jako użyty (link z maila).
  try {
    await s.from("email_unsubscribe_tokens").update({ used_at: now }).eq("email", addr);
  } catch {
    /* brak tokenu to nie błąd — wypis mógł przyjść z odpowiedzi na maila */
  }

  // 7) Ślad w leadzie + log automatyzacji, żeby operator zobaczył powód.
  try {
    const note =
      strength === "hard"
        ? `[AI] Klient zażądał zaprzestania korespondencji (${input.signal ?? input.source}) — TWARDA blokada maili. Cytat: ${input.phrase ?? "—"}`
        : `[AI] Klient poprosił o wypis z korespondencji (${input.signal ?? input.source}). Cytat: ${input.phrase ?? "—"}`;
    const { data: leads } = await s.from("leads").select("id, notes").ilike("email", addr).limit(5);
    for (const lead of leads ?? []) {
      await s
        .from("leads")
        .update({ notes: [(lead as any).notes, note].filter(Boolean).join("\n") })
        .eq("id", (lead as any).id);
    }
    if (leads?.length) applied.push("leads.notes");
  } catch (e) {
    console.error("[email-unsubscribe] lead note failed", e);
  }

  try {
    await s.from("automation_events").insert({
      automation_type: "email_opt_out",
      status: strength === "hard" ? "hard_block" : "unsubscribed",
      sent_payload: { email: addr, source: input.source },
      response_payload: { signal: input.signal ?? null, phrase: input.phrase ?? null, applied },
    });
  } catch (e) {
    console.error("[email-unsubscribe] automation_events failed", e);
  }

  console.warn(`[email-unsubscribe] opt-out ${addr} (${input.source}/${strength})`, applied);
  return { ok: true, email: addr, strength, applied };
}

/** Wypis na podstawie tokenu z linku/nagłówka. Zwraca adres albo null. */
export async function applyOptOutByToken(
  token: string,
  source: string,
): Promise<OptOutResult | null> {
  const t = String(token ?? "").trim();
  if (!t) return null;
  const s = admin();
  const { data } = await s
    .from("email_unsubscribe_tokens")
    .select("email")
    .eq("token", t)
    .maybeSingle();
  if (!data?.email) return null;
  return applyOptOut({ email: data.email, source, strength: "soft", signal: "token" });
}
