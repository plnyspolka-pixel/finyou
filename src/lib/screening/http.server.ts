// Pobieranie danych źródłowych z ponawianiem (wycofanie wykładnicze, Retry-After).
// Pobieramy wyłącznie listy referencyjne — żadne dane klientów nie wychodzą na zewnątrz.

export interface FetchRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  userAgent: string;
  init?: RequestInit;
}

export class SourceFetchError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public attempts: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Zwraca odpowiedź 2xx albo rzuca SourceFetchError po wyczerpaniu prób. 4xx (poza 408/429) nie są ponawiane. */
export async function fetchWithRetry(
  url: string,
  opts: FetchRetryOptions,
): Promise<{ res: Response; attempts: number }> {
  const attempts = opts.attempts ?? 4;
  const base = opts.baseDelayMs ?? 2000;
  let lastErr = "";
  let lastStatus: number | null = null;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
    try {
      const res = await fetch(url, {
        ...opts.init,
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": opts.userAgent, ...(opts.init?.headers ?? {}) },
      });
      clearTimeout(timer);
      if (res.ok) return { res, attempts: i };
      lastStatus = res.status;
      lastErr = `HTTP ${res.status}`;
      const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      if (!retryable) break;
      const ra = Number(res.headers.get("retry-after"));
      if (i < attempts)
        await sleep(
          Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : base * 2 ** (i - 1),
        );
    } catch (e) {
      clearTimeout(timer);
      lastErr = (e as Error).message;
      if (i < attempts) await sleep(base * 2 ** (i - 1));
    }
  }
  throw new SourceFetchError(`${url.split("?")[0]}: ${lastErr}`, lastStatus, attempts);
}
