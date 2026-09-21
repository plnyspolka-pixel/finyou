/**
 * Uwierzytelnienie do API Google (Search Console, Analytics Data, Indexing)
 * dla serwera Finance You. Dwie drogi, w tej kolejności:
 *
 *  1. konto usługi — sekret `GOOGLE_SERVICE_ACCOUNT_JSON` (pełny JSON klucza
 *     albo ten JSON w base64). Serwer podpisuje JWT (RS256) i wymienia go na
 *     access token; adres e-mail konta trzeba dodać jako użytkownika w Search
 *     Console (Pełny) i w usłudze GA4 (Wyświetlający);
 *  2. token OAuth kanału YouTube (`youtube_integration`) — działa, gdy konto
 *     Google połączone w panelu ma dostęp do Search Console / GA4, a zgoda
 *     obejmuje zakresy z `youtube-shorts.server.ts` (po ich dodaniu kanał
 *     trzeba raz ponownie połączyć).
 */
import { createSign } from "node:crypto";

export type GoogleAuthMethod = "service_account" | "youtube_oauth";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_TIMEOUT_MS = 60_000;
const tokenCache = new Map<string, { token: string; exp: number }>();

export type ServiceAccount = { client_email: string; private_key: string; project_id?: string };

export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  const candidates = [raw];
  if (!raw.startsWith("{")) {
    try {
      candidates.push(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      // nie base64 — zostaje surowy tekst
    }
  }
  for (const c of candidates) {
    try {
      const j = JSON.parse(c) as Partial<ServiceAccount>;
      if (j.client_email && j.private_key) {
        return {
          client_email: j.client_email,
          private_key: String(j.private_key).replace(/\\n/g, "\n"),
          project_id: j.project_id,
        };
      }
    } catch {
      // spróbuj kolejnego wariantu
    }
  }
  return null;
}

export function googleAuthMethod(): GoogleAuthMethod | null {
  if (serviceAccount()) return "service_account";
  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) return "youtube_oauth";
  return null;
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function serviceAccountToken(sa: ServiceAccount, scopes: string[]): Promise<string> {
  const scope = [...scopes].sort().join(" ");
  const hit = tokenCache.get(scope);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const assertion = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Token konta usługi Google nieudany: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim(),
    );
  }
  tokenCache.set(scope, {
    token: json.access_token,
    exp: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

/** Access token dla podanych zakresów — konto usługi albo OAuth kanału YouTube. */
export async function googleAccessToken(
  scopes: string[],
): Promise<{ token: string; method: GoogleAuthMethod }> {
  const sa = serviceAccount();
  if (sa) return { token: await serviceAccountToken(sa, scopes), method: "service_account" };
  const { youtubeAccessToken } = await import("./youtube-api.server");
  try {
    return { token: await youtubeAccessToken(), method: "youtube_oauth" };
  } catch (e) {
    throw new Error(
      `Brak dostępu do API Google: ustaw GOOGLE_SERVICE_ACCOUNT_JSON (konto usługi) albo połącz kanał YouTube w panelu kontem z dostępem do Search Console / GA4 (${e instanceof Error ? e.message : String(e)}).`,
    );
  }
}

export type GoogleRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  scopes: string[];
  timeoutMs?: number;
};

function errorHint(status: number, method: GoogleAuthMethod, sa: ServiceAccount | null): string {
  if (status !== 403 && status !== 401) return "";
  if (method === "service_account") {
    return ` — dodaj ${sa?.client_email ?? "e-mail konta usługi"} jako użytkownika (Search Console: Pełny; GA4: Wyświetlający) i włącz odpowiednie API w Google Cloud.`;
  }
  return " — konto Google połączone w panelu nie ma dostępu albo zgoda nie obejmuje zakresu; połącz kanał YouTube ponownie (YouTube Shorts → Połącz) kontem z dostępem do Search Console / GA4.";
}

/** Uwierzytelnione wywołanie API Google (tylko hosty *.googleapis.com). */
export async function googleRequest(url: string, opts: GoogleRequestOptions): Promise<any> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !/(^|\.)googleapis\.com$/.test(u.hostname)) {
    throw new Error("Dozwolone są tylko adresy https://*.googleapis.com/…");
  }
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  const { token, method } = await googleAccessToken(opts.scopes);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(u, {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return {};
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg =
      json?.error?.message ?? json?.error_description ?? json?.raw ?? `HTTP ${res.status}`;
    const status = json?.error?.status ? ` (${json.error.status})` : "";
    throw new Error(
      `Google API ${res.status}${status}: ${msg}${errorHint(res.status, method, serviceAccount())}`,
    );
  }
  return json;
}
