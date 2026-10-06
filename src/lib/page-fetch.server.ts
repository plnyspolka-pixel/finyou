// Pobranie cudzej strony HTML do sprawdzenia linków (monitoring backlinków,
// wykrywanie „Zrobione" na forach, autodiscovery feedów RSS). Zawsze
// z limitem czasu i rozmiaru; nigdy nie rzuca — błąd wraca jako wynik.

import type { PageFetchOutcome } from "./backlinks-monitor";

export const PAGE_FETCH_USER_AGENT =
  "Mozilla/5.0 (compatible; FinanceYou-LinkCheck/1.0; +https://financeyou.pl)";
const DEFAULT_TIMEOUT_MS = 8_000;
/** Więcej nie czytamy — linki są w treści, a strony forów bywają ciężkie. */
const MAX_BYTES = 3_000_000;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const buf = new Uint8Array(Math.min(total, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, buf.length - off));
    buf.set(part, off);
    off += part.length;
    if (off >= buf.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

export async function fetchPage(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<PageFetchOutcome> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": PAGE_FETCH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.5",
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { kind: "http_error", status: res.status };
    }
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !/html|xml|text\/plain/.test(contentType)) {
      await res.body?.cancel().catch(() => {});
      return { kind: "not_html", status: res.status, contentType };
    }
    const html = await readCapped(res, opts.maxBytes ?? MAX_BYTES);
    return { kind: "ok", status: res.status, url: res.url || url, html };
  } catch (e) {
    const msg = errMsg(e);
    return {
      kind: "network_error",
      message: /abort|timeout/i.test(msg) ? `Przekroczony czas (${msg})` : msg,
    };
  }
}

/** Zadania z ograniczoną równoległością (kolejność wyników = kolejność wejścia). */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
