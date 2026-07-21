// supabase/functions/didit-webhook/index.ts
//
// Webhook Didit — odbiera wynik weryfikacji tożsamości (KYC/KYB) i aktualizuje
// tabelę public.didit_verifications. Didt podpisuje surowe ciało HMAC-SHA256
// kluczem współdzielonym webhooka (nagłówek `x-signature`, wariant
// `x-signature-v2`) i dokłada `x-timestamp` (epoch sekundy) do ochrony przed
// replayem. Weryfikujemy podpis, sprawdzamy okno czasowe (5 min), a dopiero
// potem zapisujemy — zapis idzie service-rolem (omija RLS).
//
// Sekrety edge function:
//   DIDIT_WEBHOOK_SECRET  — klucz współdzielony webhooka z konsoli Didit
//   SUPABASE_URL          — (wstrzykiwane automatycznie)
//   SUPABASE_SERVICE_ROLE_KEY — (wstrzykiwane automatycznie)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_SKEW_SEC = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature, x-signature-v2, x-signature-simple, x-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length === 0 || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("DIDIT_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook not configured" }, 500);

  // Surowe ciało — HMAC liczymy z bajtów tak jak przyszły.
  const rawBody = await req.text();

  const sig = req.headers.get("x-signature");
  const sigV2 = req.headers.get("x-signature-v2");
  const sigSimple = req.headers.get("x-signature-simple");
  const timestamp = req.headers.get("x-timestamp");

  // Okno czasowe (anty-replay).
  if (timestamp) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_SEC) {
      return json({ error: "Stale or invalid timestamp" }, 401);
    }
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const sessionId = (payload.session_id as string) ?? "";
  const status = (payload.status as string) ?? "";
  const webhookType = (payload.webhook_type as string) ?? "";

  // Weryfikacja podpisu: preferujemy podpis z surowego ciała (v2 / v1),
  // z fallbackiem na uproszczony wariant.
  const bodyHmac = await hmacHex(secret, rawBody);
  let verified = false;
  for (const candidate of [sigV2, sig]) {
    if (candidate && timingSafeEqualHex(candidate, bodyHmac)) {
      verified = true;
      break;
    }
  }
  if (!verified && sigSimple && timestamp) {
    const simpleBase = `${timestamp}:${sessionId}:${status}:${webhookType}`;
    if (timingSafeEqualHex(sigSimple, await hmacHex(secret, simpleBase))) verified = true;
  }
  if (!verified) return json({ error: "Invalid signature" }, 401);

  if (!sessionId) return json({ error: "Missing session_id" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured" }, 500);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const decided = status === "Approved" || status === "Declined" || status === "In Review";
  const update: Record<string, unknown> = {
    status: status || "Unknown",
    decision: payload.decision ?? payload,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
  };
  if (decided) update.decided_at = new Date().toISOString();

  const { data, error } = await admin
    .from("didit_verifications")
    .update(update)
    .eq("session_id", sessionId)
    .select("id");

  if (error) return json({ error: error.message }, 500);
  // Brak wiersza (sesja utworzona poza aplikacją) — potwierdzamy odbiór, żeby
  // Didit nie ponawiał w nieskończoność.
  return json({ ok: true, updated: data?.length ?? 0 });
});
