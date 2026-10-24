// Bezpieczne narzędzia Ani dla inwestora (A3) i oddzwonienie A2P.
// Wywołuje je ElevenLabs (webhook z sekretem) — patrz /api/public/ania-investor-tools.
// Zasady:
//  - telefon: konto wskazuje WYŁĄCZNIE numer rozmówcy z metadanych rozmowy
//    ElevenLabs (nie parametr od modelu), tożsamość potwierdza kod SMS,
//  - panel: jednorazowy token sesji (hash w ania_investor_capabilities),
//  - odpowiedź zawiera tylko własny stan konta — bez danych pożyczkobiorców.
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 3;
export const OTP_RESEND_GAP_MS = 60 * 1000;
export const VERIFIED_SESSION_MS = 60 * 60 * 1000;

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function otpHash(conversationId: string, code: string): string {
  return sha256(`${conversationId}:${code}`);
}

export function phoneDigits(p: string | null | undefined): string {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}

/** Numer rozmówcy z metadanych rozmowy telefonicznej ElevenLabs. */
async function callerPhone(conversationId: string): Promise<string | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !conversationId) return null;
  const r = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    { headers: { "xi-api-key": key } },
  );
  if (!r.ok) return null;
  const j: any = await r.json().catch(() => ({}));
  const pc = j?.metadata?.phone_call ?? {};
  return pc.external_number ?? j?.user_id ?? null;
}

async function investorByPhone(phone: string): Promise<{ id: string; user_id: string; phone: string } | null> {
  const d = phoneDigits(phone);
  if (!d) return null;
  const { data } = await supabaseAdmin
    .from("investors")
    .select("id, user_id, phone")
    .ilike("phone", `%${d.slice(-3)}`)
    .limit(50);
  const matches = (data ?? []).filter((i: any) => phoneDigits(i.phone) === d && i.user_id);
  return matches.length === 1 ? (matches[0] as any) : null;
}

type ToolResult = Record<string, unknown> & { ok: boolean };

export async function sendInvestorVerificationCode(conversationId: string): Promise<ToolResult> {
  if (!conversationId) return { ok: false, error: "missing_conversation" };
  const phone = await callerPhone(conversationId);
  if (!phone) return { ok: false, error: "no_caller_number", message: "Kod wysyłam tylko w rozmowie telefonicznej." };
  const inv = await investorByPhone(phone);
  if (!inv) return { ok: false, error: "not_found", message: "Nie znalazłam konta inwestora przypisanego do tego numeru." };

  const { data: prev } = await supabaseAdmin
    .from("ania_investor_verifications")
    .select("sent_at, attempts, verified_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (prev?.verified_at) return { ok: true, already_verified: true };
  if (prev && Date.now() - new Date(prev.sent_at).getTime() < OTP_RESEND_GAP_MS) {
    return { ok: false, error: "too_soon", message: "Kod został wysłany przed chwilą." };
  }
  // Licznik wysyłek per rozmowa — kolumna attempts liczy też wysyłki (x10).
  const sends = Math.floor((prev?.attempts ?? 0) / 10) + (prev ? 1 : 0);
  if (sends >= OTP_MAX_SENDS) return { ok: false, error: "send_limit" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { sendSmsInternal } = await import("@/lib/voicebot.functions");
  const sms = await sendSmsInternal({
    phone,
    body: `Finance You: Twoj kod weryfikacyjny dla Ani to ${code}. Wazny 10 minut. Nie podawaj go nikomu poza ta rozmowa.`,
    source: "ania_investor_otp",
    category: "critical",
  });
  // Wiersz zapisujemy dopiero po udanej wysyłce — błąd nie blokuje ponowienia.
  if (!sms.ok) return { ok: false, error: "sms_failed" };
  await supabaseAdmin.from("ania_investor_verifications").upsert(
    {
      conversation_id: conversationId,
      investor_id: inv.id,
      otp_hash: otpHash(conversationId, code),
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      sent_at: new Date().toISOString(),
      attempts: sends * 10,
      verified_at: null,
    },
    { onConflict: "conversation_id" },
  );
  return { ok: true, sent: true, message: "Wysłałam kod SMS na numer, z którego Pan/Pani dzwoni." };
}

export async function verifyInvestorIdentity(conversationId: string, code: string): Promise<ToolResult> {
  const clean = String(code ?? "").replace(/\D/g, "");
  if (!conversationId || clean.length !== 6) return { ok: false, error: "invalid_code" };
  const { data: row } = await supabaseAdmin
    .from("ania_investor_verifications")
    .select("otp_hash, expires_at, attempts, verified_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!row) return { ok: false, error: "no_code_sent" };
  if (row.verified_at) return { ok: true, verified: true };
  const failed = row.attempts % 10;
  if (failed >= OTP_MAX_ATTEMPTS) return { ok: false, error: "locked" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "expired" };

  // Optymistyczna blokada: zużycie próby tylko, gdy licznik się nie zmienił.
  const { data: claimed } = await supabaseAdmin
    .from("ania_investor_verifications")
    .update({ attempts: row.attempts + 1 })
    .eq("conversation_id", conversationId)
    .eq("attempts", row.attempts)
    .is("verified_at", null)
    .select("conversation_id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "retry" };

  const a = Buffer.from(otpHash(conversationId, clean));
  const b = Buffer.from(row.otp_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "wrong_code", attempts_left: OTP_MAX_ATTEMPTS - failed - 1 };
  }
  await supabaseAdmin
    .from("ania_investor_verifications")
    .update({ verified_at: new Date().toISOString() })
    .eq("conversation_id", conversationId);
  return { ok: true, verified: true };
}

/** Jednorazowy token panelu (30 min) — zwraca surowy token, w bazie tylko hash. */
export async function issuePanelCapability(userId: string, investorId: string): Promise<string> {
  const { randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("hex");
  await supabaseAdmin.from("ania_investor_capabilities").insert({
    token_hash: sha256(token),
    investor_id: investorId,
    user_id: userId,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  return token;
}

async function resolveUser(conversationId: string, accessToken: string | null): Promise<string | null> {
  if (accessToken) {
    const { data } = await supabaseAdmin
      .from("ania_investor_capabilities")
      .select("user_id, expires_at")
      .eq("token_hash", sha256(accessToken))
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) return data.user_id;
    return null;
  }
  if (!conversationId) return null;
  const { data: v } = await supabaseAdmin
    .from("ania_investor_verifications")
    .select("investor_id, verified_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!v?.verified_at) return null;
  if (Date.now() - new Date(v.verified_at).getTime() > VERIFIED_SESSION_MS) return null;
  const { data: inv } = await supabaseAdmin
    .from("investors")
    .select("user_id")
    .eq("id", v.investor_id)
    .maybeSingle();
  return inv?.user_id ?? null;
}

export function zeroOffersReason(o: {
  ordersTotal: number;
  activeAccepted: number;
  visible: number;
}): string | null {
  if (o.visible > 0) return null;
  if (o.ordersTotal === 0) return "Nie złożono jeszcze żadnego Zlecenia — oferty pojawiają się do przyjętego Zlecenia.";
  if (o.activeAccepted === 0)
    return "Brak aktywnego, przyjętego Zlecenia (oczekuje na akceptację, zostało odrzucone albo wygasło).";
  return "Aktywne Zlecenie jest przyjęte, ale obecnie brak Projektów spełniających jego kryteria.";
}

export async function investorAccountState(userId: string): Promise<ToolResult> {
  const db: any = supabaseAdmin;
  const [{ data: inv }, { data: didit }, { data: docs }, { data: acc }, { data: orders }] =
    await Promise.all([
      db
        .from("investors")
        .select("first_name, subscription_status, subscription_active_until, screening_result, sof_status")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("didit_verifications")
        .select("status")
        .eq("vendor_data", `investor:${userId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("legal_documents").select("code, version, sha256, active, title"),
      db.from("investor_agreement_acceptances").select("document_code, version, sha256").eq("user_id", userId),
      db
        .from("investor_orders")
        .select("order_seq, amount_pln, max_period_months, min_annual_yield, status, expires_at")
        .eq("user_id", userId),
    ]);
  if (!inv) return { ok: false, error: "not_investor" };
  const acceptedSet = new Set((acc ?? []).map((a: any) => `${a.document_code}:${a.version}:${a.sha256}`));
  const agreements = (docs ?? [])
    .filter((d: any) => d.active)
    .map((d: any) => ({
      dokument: d.title ?? d.code,
      wersja: d.version,
      zaakceptowany: acceptedSet.has(`${d.code}:${d.version}:${d.sha256}`),
    }));
  const now = Date.now();
  const activeAccepted = (orders ?? []).filter(
    (o: any) => o.status === "przyjete" && (!o.expires_at || new Date(o.expires_at).getTime() >= now),
  );
  let visible = 0;
  try {
    const { loadMyOrderProjects } = await import("@/lib/investor-agreements/order-projects.functions");
    const r = await loadMyOrderProjects(db, userId, true);
    visible = r.orders.reduce((n, o) => n + o.projects.length, 0);
  } catch (e) {
    console.error("[ania-investor-tools] visible offers", e);
  }
  return {
    ok: true,
    kyc: didit?.status ?? "brak weryfikacji",
    aml: inv.screening_result ?? "brak wyniku",
    zrodlo_srodkow: inv.sof_status ?? "brak oświadczenia",
    abonament: {
      status: inv.subscription_status ?? "brak",
      aktywny_do: inv.subscription_active_until ?? null,
    },
    umowy: agreements,
    zlecenia: (orders ?? []).map((o: any) => ({
      numer: o.order_seq,
      status: o.status,
      kwota_pln: o.amount_pln,
      max_okres_mies: o.max_period_months,
      min_rentownosc_roczna: o.min_annual_yield,
      wygasa: o.expires_at,
    })),
    widoczne_oferty: visible,
    powod_braku_ofert: zeroOffersReason({
      ordersTotal: (orders ?? []).length,
      activeAccepted: activeAccepted.length,
      visible,
    }),
  };
}

export async function getInvestorAccountStateTool(
  conversationId: string,
  accessToken: string | null,
): Promise<ToolResult> {
  const userId = await resolveUser(conversationId, accessToken);
  if (!userId) {
    return {
      ok: false,
      error: "not_verified",
      message: "Najpierw potwierdź tożsamość kodem SMS (send_investor_verification_code).",
    };
  }
  return investorAccountState(userId);
}

// ── Oddzwonienie A2P ─────────────────────────────────────────────────────

export const CALLBACK_SOURCE = "ania_investor_callback";
export const CALLBACK_MAX_DAYS = 30;

/**
 * Najbliższy dozwolony termin: nie wcześniej niż za 5 min i 24 h po ostatnim
 * wybraniu numeru (throttle), w oknie dzwonienia (8–22, bez niedziel).
 */
export function resolveCallbackTime(opts: {
  requested: Date;
  now: Date;
  lastCallAt: Date | null;
  windowAt: (d: Date) => { allowed: boolean; nextAllowedAt: Date };
}): Date | null {
  if (isNaN(opts.requested.getTime())) return null;
  if (opts.requested.getTime() > opts.now.getTime() + CALLBACK_MAX_DAYS * 86400000) return null;
  let t = Math.max(opts.requested.getTime(), opts.now.getTime() + 5 * 60 * 1000);
  if (opts.lastCallAt) t = Math.max(t, opts.lastCallAt.getTime() + 24 * 3600 * 1000);
  const d = new Date(t);
  const w = opts.windowAt(d);
  return w.allowed ? d : w.nextAllowedAt;
}

export async function scheduleInvestorCallback(opts: {
  conversationId: string;
  phoneVar: string | null;
  requestedAt: string;
  reason: string;
  agentId: string;
}): Promise<ToolResult> {
  const { A2P_VOICE_AGENT_ID, leadDynamicVariables } = await import("@/lib/ania-lead-context");
  const { getCallingWindow, normalizePhoneForVoicebot } = await import("@/lib/voicebot.functions");
  const fromCall = opts.conversationId ? await callerPhone(opts.conversationId) : null;
  const raw = phoneDigits(fromCall) ? fromCall : opts.phoneVar;
  const phone = raw ? normalizePhoneForVoicebot(raw) : "";
  if (!phoneDigits(phone)) return { ok: false, error: "no_phone", message: "Nie znam numeru telefonu rozmówcy." };

  // Dzwonimy tylko do osób, które są u nas leadem (bez numerów z rozmowy).
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, first_name, source, type, created_at")
    .eq("phone_normalized", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lead) return { ok: false, error: "unknown_lead", message: "Ten numer nie jest zapisany jako kontakt." };

  const { data: last } = await supabaseAdmin
    .from("call_queue")
    .select("started_at")
    .eq("phone_normalized", phone)
    .not("started_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const when = resolveCallbackTime({
    requested: new Date(opts.requestedAt),
    now: new Date(),
    lastCallAt: last?.started_at ? new Date(last.started_at) : null,
    windowAt: (d) => getCallingWindow(d),
  });
  if (!when) {
    return { ok: false, error: "invalid_time", message: `Podaj termin w ciągu ${CALLBACK_MAX_DAYS} dni (ISO 8601).` };
  }
  const vars = {
    ...leadDynamicVariables({
      firstName: lead.first_name,
      source: lead.source,
      role: "inwestor",
      createdAt: lead.created_at,
      callDirection: "outbound",
    }),
    lead_id: lead.id,
    phone,
    callback_reason: String(opts.reason ?? "").slice(0, 300),
  };
  // Jedno oczekujące oddzwonienie na numer — nowy termin zastępuje poprzedni.
  const { data: pending } = await supabaseAdmin
    .from("call_queue")
    .select("id")
    .eq("phone_normalized", phone)
    .eq("source", CALLBACK_SOURCE)
    .eq("status", "oczekuje")
    .limit(1)
    .maybeSingle();
  const row = {
    phone_normalized: phone,
    source: CALLBACK_SOURCE,
    agent_id: A2P_VOICE_AGENT_ID,
    status: "oczekuje",
    scheduled_at: when.toISOString(),
    dynamic_variables: vars as any,
    result_summary: `Oddzwonienie (${opts.agentId}): ${vars.callback_reason}`.slice(0, 500),
  };
  const res = pending
    ? await supabaseAdmin.from("call_queue").update(row).eq("id", pending.id)
    : await supabaseAdmin.from("call_queue").insert(row);
  if (res.error) return { ok: false, error: "db_error" };
  const local = when.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "full", timeStyle: "short" });
  return {
    ok: true,
    scheduled: true,
    scheduled_at: when.toISOString(),
    scheduled_at_local: local,
    message: `Połączenie zaplanowane na ${local}.`,
  };
}
