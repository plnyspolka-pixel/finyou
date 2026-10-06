// Podpisane linki „✅ Zrobione" / „⏭ Pomiń" z porannego digestu
// zaangażowania. Token = id pozycji + akcja + termin ważności (14 dni)
// + HMAC-SHA256 po stronie serwera (sekret: CRON_SECRET, awaryjnie klucz
// service_role — patrz digest.server.ts). Bez bazy i bez sieci (Web Crypto,
// działa w Workerze), testowalne jednostkowo.
//
// Format: `<uuid>.<d|s>.<exp unix s>.<podpis base64url>`.

export type MarkAction = "done" | "skip";

export const MARK_TOKEN_TTL_DAYS = 14;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_CODE: Record<MarkAction, string> = { done: "d", skip: "s" };

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(new Uint8Array(sig));
}

/** Porównanie w stałym czasie (długość podpisu i tak jest stała). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const signedPart = (id: string, code: string, exp: number) =>
  `engagement-mark:v1:${id.toLowerCase()}:${code}:${exp}`;

export async function signMarkToken(
  id: string,
  action: MarkAction,
  secret: string,
  now: Date = new Date(),
  ttlDays = MARK_TOKEN_TTL_DAYS,
): Promise<string> {
  if (!secret) throw new Error("Brak sekretu do podpisu linku.");
  if (!UUID_RE.test(id)) throw new Error("Nieprawidłowe id pozycji.");
  const code = ACTION_CODE[action];
  const exp = Math.floor(now.getTime() / 1000) + ttlDays * 86_400;
  const sig = await hmac(secret, signedPart(id, code, exp));
  return `${id.toLowerCase()}.${code}.${exp}.${sig}`;
}

export type VerifiedMarkToken =
  | { ok: true; id: string; action: MarkAction; expiresAt: Date }
  | { ok: false; reason: "malformed" | "signature" | "expired" };

export async function verifyMarkToken(
  token: string | null | undefined,
  secret: string,
  now: Date = new Date(),
): Promise<VerifiedMarkToken> {
  const parts = String(token ?? "")
    .trim()
    .split(".");
  if (parts.length !== 4 || !secret) return { ok: false, reason: "malformed" };
  const [id, code, expRaw, sig] = parts;
  if (!UUID_RE.test(id) || (code !== "d" && code !== "s") || !/^\d{9,11}$/.test(expRaw)) {
    return { ok: false, reason: "malformed" };
  }
  const exp = Number(expRaw);
  const expected = await hmac(secret, signedPart(id, code, exp));
  if (!safeEqual(sig, expected)) return { ok: false, reason: "signature" };
  if (exp * 1000 < now.getTime()) return { ok: false, reason: "expired" };
  return {
    ok: true,
    id: id.toLowerCase(),
    action: code === "d" ? "done" : "skip",
    expiresAt: new Date(exp * 1000),
  };
}
