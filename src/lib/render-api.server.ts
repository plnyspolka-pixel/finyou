/**
 * Klient REST Render (https://api.render.com/v1) — bezpośrednio, kluczem
 * `RENDER_API_KEY` (Account Settings → API Keys w panelu Render).
 *
 * Używany przez narzędzia MCP (`src/lib/mcp/tools/render.ts`). `renderRequest`
 * to ogólne wywołanie — każdy zasób Render API jest dostępny bez zmiany kodu.
 */

const BASE = "https://api.render.com/v1/";
const DEFAULT_TIMEOUT_MS = 60_000;

export function hasRenderKey(): boolean {
  return Boolean(process.env.RENDER_API_KEY);
}

export type RenderResponse = {
  ok: boolean;
  status: number;
  contentType: string;
  json?: any;
  text?: string;
};

export type RenderRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  timeoutMs?: number;
};

/** `path` względem /v1/, np. `services`, `services/srv-123/deploys`. */
export async function renderRequest(
  path: string,
  opts: RenderRequestOptions = {},
): Promise<RenderResponse> {
  const key = process.env.RENDER_API_KEY;
  if (!key) throw new Error("Render nie jest podłączony (brak RENDER_API_KEY).");
  const clean = path.replace(/^\/+/, "").replace(/^v1\//, "");
  if (!/^[A-Za-z0-9/._-]+$/.test(clean) || clean.includes("..")) {
    throw new Error("Nieprawidłowa ścieżka zasobu Render.");
  }
  const url = new URL(BASE + clean);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const contentType = res.headers.get("content-type") ?? "";
  const out: RenderResponse = { ok: res.ok, status: res.status, contentType };
  if (contentType.includes("application/json")) out.json = await res.json().catch(() => null);
  else out.text = await res.text().catch(() => "");
  if (!res.ok) {
    const msg = out.json?.message ?? out.text?.slice(0, 300) ?? "";
    throw new Error(`Render HTTP ${res.status}${msg ? `: ${msg}` : ""}`);
  }
  return out;
}

async function renderJson<T = any>(path: string, opts: RenderRequestOptions = {}): Promise<T> {
  const r = await renderRequest(path, opts);
  return (r.json ?? {}) as T;
}

export async function listServices(limit = 20) {
  return renderJson<any[]>("services", { query: { limit } });
}

export async function getService(id: string) {
  return renderJson<any>(`services/${id}`);
}

export async function listDeploys(serviceId: string, limit = 10) {
  return renderJson<any[]>(`services/${serviceId}/deploys`, { query: { limit } });
}

export async function triggerDeploy(serviceId: string, clearCache = false) {
  return renderJson<any>(`services/${serviceId}/deploys`, {
    method: "POST",
    body: { clearCache: clearCache ? "clear" : "do_not_clear" },
  });
}
