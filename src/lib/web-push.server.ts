// Minimalna implementacja Web Push (RFC 8291 / RFC 8188 aes128gcm + VAPID,
// RFC 8292) oparta wyłącznie o WebCrypto — działa i w Node (vite dev/SSR),
// i na Cloudflare Workers, gdzie biblioteka `web-push` (node:crypto,
// node:https) bywa zawodna. Bez zależności zewnętrznych.
//
// Klucze VAPID w formacie takim samym jak generuje `web-push generate-vapid-keys`:
//  - publiczny: base64url 65 bajtów (nieskompresowany punkt P-256),
//  - prywatny: base64url 32 bajty (skalar d).
// Generator: scripts/generate-vapid-keys.ts

export type PushSubscriptionKeys = {
  endpoint: string;
  /** base64url — klucz publiczny przeglądarki (65 bajtów, punkt P-256) */
  p256dh: string;
  /** base64url — sekret auth przeglądarki (16 bajtów) */
  auth: string;
};

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  /** mailto:... lub https:... */
  subject: string;
};

const te = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const padded = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  lengthBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

/** Klucz prywatny P-256 (JWK) — do wstrzykiwania deterministycznych kluczy w testach. */
export type EcJwk = { x: string; y: string; d: string };

async function importEcdhPrivate(jwk: EcJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", ext: true, ...jwk },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

/**
 * Szyfrowanie ładunku wg RFC 8291 (aes128gcm). Zwraca gotowe body żądania
 * POST do endpointu push. `testOverrides` pozwala podać stały klucz nadawcy
 * i salt (wektor testowy RFC 8291, załącznik A).
 */
export async function encryptWebPushPayload(
  plaintext: Uint8Array,
  p256dhB64: string,
  authB64: string,
  testOverrides?: { asPrivateJwk?: EcJwk; salt?: Uint8Array },
): Promise<Uint8Array> {
  const uaPublicRaw = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);
  if (uaPublicRaw.length !== 65) throw new Error("p256dh: oczekiwano 65 bajtów");
  if (authSecret.length !== 16) throw new Error("auth: oczekiwano 16 bajtów");

  const uaPublic = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  let asPrivate: CryptoKey;
  let asPublicRaw: Uint8Array;
  if (testOverrides?.asPrivateJwk) {
    asPrivate = await importEcdhPrivate(testOverrides.asPrivateJwk);
    const pub = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        ext: true,
        x: testOverrides.asPrivateJwk.x,
        y: testOverrides.asPrivateJwk.y,
      },
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    );
    asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pub));
  } else {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ]);
    asPrivate = pair.privateKey;
    asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublic }, asPrivate, 256),
  );

  // IKM = HKDF(salt=auth_secret, ikm=ecdh, info="WebPush: info"||0x00||ua_pub||as_pub, 32)
  const keyInfo = concatBytes(
    te.encode("WebPush: info"),
    new Uint8Array([0]),
    uaPublicRaw,
    asPublicRaw,
  );
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = testOverrides?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    concatBytes(te.encode("Content-Encoding: aes128gcm"), new Uint8Array([0])),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    concatBytes(te.encode("Content-Encoding: nonce"), new Uint8Array([0])),
    12,
  );

  // Ostatni (jedyny) rekord: plaintext || 0x02
  const record = concatBytes(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aesKey,
      record as BufferSource,
    ),
  );

  // Nagłówek aes128gcm: salt(16) || rs(4, BE) || idlen(1) || keyid(as_public, 65)
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  return concatBytes(header, ciphertext);
}

/** Nagłówek Authorization wg VAPID (RFC 8292, schemat "vapid t=..., k=..."). */
export async function buildVapidAuthHeader(endpoint: string, vapid: VapidKeys): Promise<string> {
  const publicRaw = b64urlDecode(vapid.publicKey);
  if (publicRaw.length !== 65 || publicRaw[0] !== 4) {
    throw new Error("VAPID_PUBLIC_KEY: oczekiwano base64url 65 bajtów (punkt P-256)");
  }
  const x = b64urlEncode(publicRaw.slice(1, 33));
  const y = b64urlEncode(publicRaw.slice(33, 65));

  const signKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", ext: true, x, y, d: vapid.privateKey },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = b64urlEncode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64urlEncode(
    te.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  // WebCrypto zwraca podpis ECDSA jako surowe r||s (64 bajty) — dokładnie format JWS ES256.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signKey, te.encode(signingInput)),
  );
  return `vapid t=${signingInput}.${b64urlEncode(sig)}, k=${vapid.publicKey}`;
}

export type WebPushResult = {
  ok: boolean;
  status: number;
  /** 404/410 — subskrypcja martwa, do usunięcia z bazy */
  gone: boolean;
  error?: string;
};

/** Wysyłka jednego powiadomienia push do endpointu subskrypcji. */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: string,
  vapid: VapidKeys,
  opts: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high" } = {},
): Promise<WebPushResult> {
  try {
    const body = await encryptWebPushPayload(
      te.encode(payload),
      subscription.p256dh,
      subscription.auth,
    );
    const authHeader = await buildVapidAuthHeader(subscription.endpoint, vapid);
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(opts.ttlSeconds ?? 24 * 60 * 60),
        Urgency: opts.urgency ?? "normal",
      },
      body: body as unknown as BodyInit,
    });
    const gone = res.status === 404 || res.status === 410;
    return { ok: res.ok, status: res.status, gone };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: (e as Error).message };
  }
}
