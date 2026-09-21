/**
 * Trwałe tokeny Meta bez ręcznego odświeżania.
 *
 * Źródło prawdy: `META_SYSTEM_USER_TOKEN` — token użytkownika systemowego z
 * Business Managera (wygaśnięcie „nigdy”, niezależny od hasła żadnej osoby;
 * to zmiana hasła unieważniła poprzedni token Instagrama). Z niego serwer sam
 * wyprowadza token strony (`/me/accounts`), który obsługuje też Instagram
 * i Messenger, i wpisuje go do `process.env` (META_PAGE_ACCESS_TOKEN,
 * META_IG_PAGE_ACCESS_TOKEN, META_ACCESS_TOKEN oraz META_PAGE_ID /
 * META_IG_USER_ID, gdy puste). Dzięki temu wszystkie moduły czytające
 * `process.env` (webhooki, ticki, panel, MCP) dostają ważny token bez zmian
 * w swoim kodzie.
 *
 * `ensureMetaTokens()` jest tanie: wynik trzyma się w pamięci przez godzinę,
 * a ręcznie ustawione tokeny są podmieniane tylko wtedy, gdy Graph zgłosi,
 * że są nieważne. `metaTokenHealth()` (do `meta_status`) pokazuje ważność
 * i zakresy każdego tokena przez `/debug_token`.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const REVALIDATE_MS = 60 * 60_000;
const TIMEOUT_MS = 12_000;

export type MetaTokenSource = "env" | "system_user" | "none";

export type MetaTokensState = {
  checkedAt: number;
  source: MetaTokenSource;
  /** Skąd wyprowadzono tokeny strony: osobny sekret albo META_ACCESS_TOKEN, gdy sam jest tokenem systemowym. */
  derivedFrom: "META_SYSTEM_USER_TOKEN" | "META_ACCESS_TOKEN" | null;
  pageId: string | null;
  pageName: string | null;
  igUserId: string | null;
  replaced: string[];
  error: string | null;
};

let state: MetaTokensState | null = null;
let inflight: Promise<MetaTokensState> | null = null;

async function graphGet(path: string, query: Record<string, string>): Promise<any> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const json: any = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** `true` = ważny, `false` = Graph odrzucił token (kod 190 / 102), `null` = nie wiadomo (sieć). */
async function tokenWorks(token: string): Promise<boolean | null> {
  try {
    const r = await graphGet("me", { fields: "id", access_token: token });
    if (r.ok) return true;
    const code = r.json?.error?.code;
    return code === 190 || code === 102 || code === 104 ? false : null;
  } catch {
    return null;
  }
}

type PageEntry = { id: string; name: string | null; token: string; igUserId: string | null };

async function derivePages(systemUserToken: string): Promise<PageEntry[]> {
  const r = await graphGet("me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id}",
    limit: "100",
    access_token: systemUserToken,
  });
  if (!r.ok) {
    throw new Error(
      `Graph ${r.status}: ${r.json?.error?.message ?? "nie udało się pobrać stron użytkownika systemowego"}`,
    );
  }
  return ((r.json?.data ?? []) as any[])
    .filter((p) => p?.id && p?.access_token)
    .map((p) => ({
      id: String(p.id),
      name: p.name ?? null,
      token: String(p.access_token),
      igUserId: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : null,
    }));
}

async function refresh(force: boolean): Promise<MetaTokensState> {
  const now = Date.now();
  const env = process.env;
  const replaced: string[] = [];
  const base: MetaTokensState = {
    checkedAt: now,
    source: "none",
    derivedFrom: null,
    pageId: env.META_PAGE_ID || null,
    pageName: null,
    igUserId: env.META_IG_USER_ID || null,
    replaced,
    error: null,
  };
  const explicitSys = env.META_SYSTEM_USER_TOKEN?.trim() || "";
  if (!explicitSys && !env.META_ACCESS_TOKEN) {
    return { ...base, source: env.META_PAGE_ACCESS_TOKEN ? "env" : "none" };
  }

  const [pageOk, igOk, userOk] = await Promise.all([
    env.META_PAGE_ACCESS_TOKEN ? tokenWorks(env.META_PAGE_ACCESS_TOKEN) : Promise.resolve(false),
    env.META_IG_PAGE_ACCESS_TOKEN
      ? tokenWorks(env.META_IG_PAGE_ACCESS_TOKEN)
      : Promise.resolve(false),
    env.META_ACCESS_TOKEN ? tokenWorks(env.META_ACCESS_TOKEN) : Promise.resolve(false),
  ]);
  // Źródło tokenów strony: osobny sekret, a gdy go nie ma — META_ACCESS_TOKEN,
  // o ile działa (w Finance You to token użytkownika systemowego, „nigdy nie wygasa”).
  const sys = explicitSys || (userOk ? (env.META_ACCESS_TOKEN as string) : "");
  const derivedFrom: MetaTokensState["derivedFrom"] = explicitSys
    ? "META_SYSTEM_USER_TOKEN"
    : sys
      ? "META_ACCESS_TOKEN"
      : null;
  if (!sys) {
    return {
      ...base,
      source: env.META_PAGE_ACCESS_TOKEN ? "env" : "none",
      error: env.META_ACCESS_TOKEN
        ? "META_ACCESS_TOKEN jest nieważny, a META_SYSTEM_USER_TOKEN nie jest ustawiony — nie ma z czego wyprowadzić tokenów strony."
        : null,
    };
  }
  const needPage = force || pageOk === false;
  const needIg = force || igOk === false;
  const needUser = (force || userOk === false) && Boolean(explicitSys);
  if (!needPage && !needIg && !needUser) return { ...base, source: "env", derivedFrom };

  let pages: PageEntry[];
  try {
    pages = await derivePages(sys);
  } catch (e) {
    return { ...base, source: "env", error: e instanceof Error ? e.message : String(e) };
  }
  const page = pages.find((p) => p.id === env.META_PAGE_ID) ?? pages[0];
  if (!page) {
    return {
      ...base,
      source: "env",
      error:
        "Użytkownik systemowy nie ma przypisanej żadnej strony (Business Manager → Użytkownicy systemowi → Przypisz zasoby).",
    };
  }
  if (needPage) {
    env.META_PAGE_ACCESS_TOKEN = page.token;
    replaced.push("META_PAGE_ACCESS_TOKEN");
  }
  if (needIg) {
    env.META_IG_PAGE_ACCESS_TOKEN = page.token;
    replaced.push("META_IG_PAGE_ACCESS_TOKEN");
  }
  if (needUser) {
    env.META_ACCESS_TOKEN = sys;
    replaced.push("META_ACCESS_TOKEN");
  }
  if (!env.META_PAGE_ID) {
    env.META_PAGE_ID = page.id;
    replaced.push("META_PAGE_ID");
  }
  if (!env.META_IG_USER_ID && page.igUserId) {
    env.META_IG_USER_ID = page.igUserId;
    replaced.push("META_IG_USER_ID");
  }
  return {
    ...base,
    source: "system_user",
    derivedFrom,
    pageId: env.META_PAGE_ID || page.id,
    pageName: page.name,
    igUserId: env.META_IG_USER_ID || page.igUserId,
  };
}

/**
 * Zapewnia ważne tokeny Meta w `process.env`. Wołaj na początku każdej
 * ścieżki, która rozmawia z Graph API. Nigdy nie rzuca — błąd ląduje w
 * `state.error`, a moduły dalej używają tego, co mają.
 */
export async function ensureMetaTokens(opts: { force?: boolean } = {}): Promise<MetaTokensState> {
  if (!opts.force && state && Date.now() - state.checkedAt < REVALIDATE_MS) return state;
  if (inflight && !opts.force) return inflight;
  inflight = refresh(Boolean(opts.force))
    .catch((e) => ({
      checkedAt: Date.now(),
      source: "env" as const,
      derivedFrom: null,
      pageId: process.env.META_PAGE_ID || null,
      pageName: null,
      igUserId: process.env.META_IG_USER_ID || null,
      replaced: [],
      error: e instanceof Error ? e.message : String(e),
    }))
    .then((s) => {
      state = s;
      inflight = null;
      return s;
    });
  return inflight;
}

export function metaTokensState(): MetaTokensState | null {
  return state;
}

// ── Zdrowie tokenów (do meta_status) ────────────────────────────────────────

export type MetaTokenHealth = {
  name: string;
  configured: boolean;
  preview: string | null;
  valid: boolean | null;
  type: string | null;
  expires_at: string | "never" | null;
  days_left: number | null;
  data_access_expires_at: string | null;
  scopes: string[];
  error: string | null;
};

const mask = (t: string) => `${t.slice(0, 6)}…${t.slice(-4)}`;

async function debugToken(
  token: string,
): Promise<Omit<MetaTokenHealth, "name" | "configured" | "preview">> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const inspector = appId && appSecret ? `${appId}|${appSecret}` : token;
  try {
    let r = await graphGet("debug_token", { input_token: token, access_token: inspector });
    if (
      !r.ok &&
      inspector !== token &&
      /Viewing App|did not match/i.test(r.json?.error?.message ?? "")
    ) {
      // Token z innej aplikacji Meta (np. piksel) — sprawdź nim samym.
      r = await graphGet("debug_token", { input_token: token, access_token: token });
    }
    const d = r.json?.data;
    if (!r.ok || !d) {
      return {
        valid: r.ok ? null : false,
        type: null,
        expires_at: null,
        days_left: null,
        data_access_expires_at: null,
        scopes: [],
        error: r.json?.error?.message ?? `HTTP ${r.status}`,
      };
    }
    const exp = typeof d.expires_at === "number" ? d.expires_at : null;
    const expiresAt = exp === 0 ? "never" : exp ? new Date(exp * 1000).toISOString() : null;
    const daysLeft = exp && exp > 0 ? Math.floor((exp * 1000 - Date.now()) / 86_400_000) : null;
    return {
      valid: Boolean(d.is_valid),
      type: d.type ?? null,
      expires_at: expiresAt,
      days_left: daysLeft,
      data_access_expires_at:
        typeof d.data_access_expires_at === "number" && d.data_access_expires_at > 0
          ? new Date(d.data_access_expires_at * 1000).toISOString()
          : null,
      scopes: Array.isArray(d.scopes) ? d.scopes : [],
      error: d.error?.message ?? null,
    };
  } catch (e) {
    return {
      valid: null,
      type: null,
      expires_at: null,
      days_left: null,
      data_access_expires_at: null,
      scopes: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function metaTokenHealth(): Promise<{
  source: MetaTokenSource;
  derived_from: MetaTokensState["derivedFrom"];
  replaced: string[];
  error: string | null;
  tokens: MetaTokenHealth[];
  warnings: string[];
}> {
  const s = await ensureMetaTokens();
  const entries: [string, string | undefined][] = [
    ["META_SYSTEM_USER_TOKEN", process.env.META_SYSTEM_USER_TOKEN],
    ["META_PAGE_ACCESS_TOKEN", process.env.META_PAGE_ACCESS_TOKEN],
    ["META_IG_PAGE_ACCESS_TOKEN", process.env.META_IG_PAGE_ACCESS_TOKEN],
    ["META_ACCESS_TOKEN", process.env.META_ACCESS_TOKEN],
    ["FB_PIXEL_ACCESS_TOKEN", process.env.FB_PIXEL_ACCESS_TOKEN],
  ];
  const cache = new Map<string, ReturnType<typeof debugToken>>();
  const tokens: MetaTokenHealth[] = [];
  for (const [name, value] of entries) {
    if (!value) {
      tokens.push({
        name,
        configured: false,
        preview: null,
        valid: null,
        type: null,
        expires_at: null,
        days_left: null,
        data_access_expires_at: null,
        scopes: [],
        error: null,
      });
      continue;
    }
    if (!cache.has(value)) cache.set(value, debugToken(value));
    const h = await cache.get(value)!;
    tokens.push({ name, configured: true, preview: mask(value), ...h });
  }
  const warnings: string[] = [];
  const userTok = tokens.find((t) => t.name === "META_ACCESS_TOKEN");
  const userIsSystem = userTok?.type === "SYSTEM_USER" && userTok.valid === true;
  if (!process.env.META_SYSTEM_USER_TOKEN && !userIsSystem) {
    warnings.push(
      "Brak META_SYSTEM_USER_TOKEN, a META_ACCESS_TOKEN nie jest ważnym tokenem użytkownika systemowego — tokeny strony / Instagrama są przypięte do hasła osoby i mogą wygasnąć; patrz docs/mcp-konektor.md → „Token Meta na stałe”.",
    );
  }
  for (const t of tokens) {
    if (!t.configured) continue;
    if (t.valid === false)
      warnings.push(`${t.name}: nieważny (${t.error ?? "Graph odrzuca token"}).`);
    else if (t.days_left !== null && t.days_left <= 14)
      warnings.push(`${t.name}: wygasa za ${t.days_left} dni (${t.expires_at}).`);
  }
  if (s.error) warnings.push(`Wyprowadzanie tokenów z użytkownika systemowego: ${s.error}`);
  return {
    source: s.source,
    derived_from: s.derivedFrom,
    replaced: s.replaced,
    error: s.error,
    tokens,
    warnings,
  };
}
