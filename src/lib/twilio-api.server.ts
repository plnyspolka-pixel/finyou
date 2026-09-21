/**
 * Klient REST Twilio przez bramkę konektora Lovable (tak samo jak wysyłka SMS
 * w `voicebot.functions.ts`): `LOVABLE_API_KEY` + `TWILIO_API_KEY`, ścieżki
 * względem konta (`Messages.json`, `Calls.json`, `Recordings/{sid}.mp3`…).
 *
 * Używany przez narzędzia MCP (`src/lib/mcp/tools/twilio.ts`) i dostępny dla
 * panelu. `twilioRequest` to ogólne wywołanie — każdy zasób REST Twilio jest
 * dostępny bez zmiany kodu.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/twilio/";
const DEFAULT_TIMEOUT_MS = 60_000;

export function hasTwilioKeys(): boolean {
  return Boolean(process.env.LOVABLE_API_KEY && process.env.TWILIO_API_KEY);
}

function keys(): { lovable: string; twilio: string } {
  const lovable = process.env.LOVABLE_API_KEY;
  const twilio = process.env.TWILIO_API_KEY;
  if (!lovable) throw new Error("Brak LOVABLE_API_KEY w środowisku serwera.");
  if (!twilio) throw new Error("Twilio nie jest podłączone (brak TWILIO_API_KEY).");
  return { lovable, twilio };
}

export type TwilioResponse = {
  ok: boolean;
  status: number;
  contentType: string;
  json?: any;
  bytes?: ArrayBuffer;
  text?: string;
};

export type TwilioRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Pola formularza (Twilio przyjmuje application/x-www-form-urlencoded). */
  form?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
};

/**
 * Ogólne wywołanie zasobu Twilio, `path` względem konta, np. `Messages.json`,
 * `Calls/CA123.json`, `Recordings/RE123.mp3`, `Usage/Records/LastMonth.json`.
 */
export async function twilioRequest(
  path: string,
  opts: TwilioRequestOptions = {},
): Promise<TwilioResponse> {
  const clean = path.replace(/^\/+/, "");
  if (!/^[A-Za-z0-9/._-]+$/.test(clean) || clean.includes("..")) {
    throw new Error("Nieprawidłowa ścieżka zasobu Twilio.");
  }
  const { lovable, twilio } = keys();
  const url = new URL(GATEWAY + clean);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": twilio,
  };
  let body: BodyInit | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.form)) {
      if (v === undefined || v === null) continue;
      params.set(k, String(v));
    }
    body = params;
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
  const out: TwilioResponse = { ok: res.ok, status: res.status, contentType };
  if (contentType.includes("application/json")) out.json = await res.json().catch(() => null);
  else if (contentType.startsWith("text/") || contentType.includes("xml"))
    out.text = await res.text().catch(() => "");
  else out.bytes = await res.arrayBuffer();
  if (!res.ok) {
    const msg = out.json?.message ?? out.text?.slice(0, 300) ?? "";
    throw new Error(`Twilio HTTP ${res.status}${msg ? `: ${msg}` : ""}`);
  }
  return out;
}

async function twilioJson<T = any>(path: string, opts: TwilioRequestOptions = {}): Promise<T> {
  const r = await twilioRequest(path, opts);
  return (r.json ?? {}) as T;
}

/** `YYYY-MM-DD` z daty ISO (Twilio filtruje po dniach). */
function day(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Nieprawidłowa data: ${iso}`);
  return d.toISOString().slice(0, 10);
}

// ── Konto / numery ──────────────────────────────────────────────────────────

export async function getBalance() {
  return twilioJson<{ balance?: string; currency?: string; account_sid?: string }>("Balance.json");
}

export async function listIncomingPhoneNumbers() {
  const json = await twilioJson<{ incoming_phone_numbers?: any[] }>("IncomingPhoneNumbers.json", {
    query: { PageSize: 50 },
  });
  return json.incoming_phone_numbers ?? [];
}

export async function getUsage(
  opts: { category?: string; startDate?: string; endDate?: string } = {},
) {
  const json = await twilioJson<{ usage_records?: any[] }>("Usage/Records.json", {
    query: {
      Category: opts.category,
      StartDate: day(opts.startDate),
      EndDate: day(opts.endDate),
      PageSize: 100,
    },
  });
  return json.usage_records ?? [];
}

// ── SMS ─────────────────────────────────────────────────────────────────────

export async function listMessages(
  opts: {
    to?: string;
    from?: string;
    sentAfter?: string;
    sentBefore?: string;
    pageSize?: number;
  } = {},
) {
  const query: Record<string, string | number | undefined> = {
    To: opts.to,
    From: opts.from,
    PageSize: Math.min(100, opts.pageSize ?? 30),
  };
  const after = day(opts.sentAfter);
  const before = day(opts.sentBefore);
  if (after) query["DateSent>"] = after;
  if (before) query["DateSent<"] = before;
  const json = await twilioJson<{ messages?: any[] }>("Messages.json", { query });
  return json.messages ?? [];
}

export async function getMessage(sid: string) {
  return twilioJson(`Messages/${encodeURIComponent(sid)}.json`);
}

// ── Połączenia ──────────────────────────────────────────────────────────────

export async function listCalls(
  opts: {
    to?: string;
    from?: string;
    status?: string;
    startedAfter?: string;
    startedBefore?: string;
    pageSize?: number;
  } = {},
) {
  const query: Record<string, string | number | undefined> = {
    To: opts.to,
    From: opts.from,
    Status: opts.status,
    PageSize: Math.min(100, opts.pageSize ?? 30),
  };
  const after = day(opts.startedAfter);
  const before = day(opts.startedBefore);
  if (after) query["StartTime>"] = after;
  if (before) query["StartTime<"] = before;
  const json = await twilioJson<{ calls?: any[] }>("Calls.json", { query });
  return json.calls ?? [];
}

export async function getCall(sid: string) {
  return twilioJson(`Calls/${encodeURIComponent(sid)}.json`);
}

/**
 * Wychodzące połączenie Twilio z komunikatem TwiML (np. `<Say>`), albo z
 * adresem TwiML (`url`). To realny telefon do prawdziwej osoby.
 */
export async function placeCall(opts: {
  to: string;
  from: string;
  twiml?: string;
  url?: string;
  record?: boolean;
  statusCallback?: string;
}) {
  if (!opts.twiml && !opts.url) throw new Error("Podaj twiml albo url.");
  return twilioJson("Calls.json", {
    method: "POST",
    form: {
      To: opts.to,
      From: opts.from,
      Twiml: opts.twiml,
      Url: opts.url,
      Record: opts.record ? "true" : undefined,
      StatusCallback: opts.statusCallback,
    },
  });
}

/** Buduje TwiML z czytanym komunikatem po polsku. */
export function sayTwiml(message: string, opts: { voice?: string; language?: string } = {}) {
  const esc = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const voice = opts.voice ?? "Polly.Ewa";
  const lang = opts.language ?? "pl-PL";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${voice}" language="${lang}">${esc}</Say></Response>`;
}

// ── Nagrania ────────────────────────────────────────────────────────────────

export async function listRecordings(
  opts: { callSid?: string; createdAfter?: string; pageSize?: number } = {},
) {
  const query: Record<string, string | number | undefined> = {
    CallSid: opts.callSid,
    PageSize: Math.min(100, opts.pageSize ?? 30),
  };
  const after = day(opts.createdAfter);
  if (after) query["DateCreated>"] = after;
  const json = await twilioJson<{ recordings?: any[] }>("Recordings.json", { query });
  return json.recordings ?? [];
}

export async function getRecordingAudio(sid: string) {
  const r = await twilioRequest(`Recordings/${encodeURIComponent(sid)}.mp3`, {
    timeoutMs: 120_000,
  });
  if (!r.bytes) throw new Error("Twilio nie zwrócił pliku audio.");
  return { bytes: r.bytes, contentType: r.contentType || "audio/mpeg" };
}
