/**
 * Direct, read-only Resend Receiving API client for Finance You.
 * Uses https://api.resend.com (NOT the Lovable connector).
 * Secrets remain on the server; no methods here can send emails.
 *
 * Configure RESEND_READ_API_KEY (preferred, Full access / read permission).
 * RESEND_API_KEY is a legacy fallback; send-only keys yield a clear error.
 */
export type ResendReceivedSummary = {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  received_for?: string[];
  subject: string;
  created_at: string;
  message_id?: string | null;
  attachments?: Array<Record<string, unknown>>;
};

export type ResendReceivedMessage = ResendReceivedSummary & {
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
  html_format?: "cid" | "data_uri" | string;
};

export type ResendReceivedList = {
  object: "list";
  data: ResendReceivedSummary[];
  has_more: boolean;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails/receiving";

export class ResendReceivingError extends Error {
  constructor(message: string, public readonly httpStatus: number) {
    super(message);
    this.name = "ResendReceivingError";
  }
}

function readKey(): string {
  const key = process.env.RESEND_READ_API_KEY || process.env.RESEND_API_KEY;
  if (!key) {
    throw new ResendReceivingError(
      "Brak RESEND_READ_API_KEY. Ustaw serwerowy klucz Resend z prawem odczytu wiadomości.",
      503,
    );
  }
  return key;
}

// Resend API has a per-team request rate limit. Space out Receiving reads
// (including pages and individual messages) to avoid accidental 429s.
let nextReadAt = 0;
async function paceRequest(): Promise<void> {
  const now = Date.now();
  const start = Math.max(now, nextReadAt);
  nextReadAt = start + 600;
  if (start > now) await new Promise<void>((resolve) => setTimeout(resolve, start - now));
}

async function requestReceiving(
  path = "",
  query: Record<string, string | number | undefined> = {},
): Promise<any> {
  const url = new URL(RESEND_ENDPOINT + path);
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
  }

  await paceRequest();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + readKey(),
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // Do not reflect provider response, original email content or API key.
    if (res.status === 401 || res.status === 403) {
      throw new ResendReceivingError(
        "Resend odmówił dostępu do odebranych e-maili (" + res.status +
          "). Wymagany jest klucz z prawem odczytu; klucz tylko do wysyłki nie wystarczy.",
        502,
      );
    }
    throw new ResendReceivingError("Resend API: HTTP " + res.status, 502);
  }
  const json: unknown = await res.json();
  if (!json || typeof json !== "object") {
    throw new ResendReceivingError("Nieprawidłowa odpowiedź Resend API.", 502);
  }
  return json;
}

const EMAIL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isResendEmailId(value: string): boolean {
  return EMAIL_ID.test(value);
}

export async function listReceivedEmails(args: {
  limit?: number;
  after?: string;
} = {}): Promise<ResendReceivedList> {
  const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 30)));
  if (args.after && !isResendEmailId(args.after)) {
    throw new ResendReceivingError("Nieprawidłowy kursor Resend.", 400);
  }
  const response = await requestReceiving("", { limit, after: args.after });
  if (!Array.isArray(response.data) || typeof response.has_more !== "boolean") {
    throw new ResendReceivingError("Resend nie zwrócił listy wiadomości.", 502);
  }
  return {
    object: "list",
    data: response.data as ResendReceivedSummary[],
    has_more: response.has_more,
  };
}

export async function getReceivedEmail(id: string): Promise<ResendReceivedMessage> {
  if (!isResendEmailId(id)) throw new ResendReceivingError("Nieprawidłowe ID e-maila.", 400);
  // CID avoids embedding untrusted multi-megabyte base64 images inside HTML.
  const data = await requestReceiving("/" + id, { html_format: "cid" });
  if (typeof data.id !== "string") {
    throw new ResendReceivingError("Resend nie zwrócił treści wiadomości.", 502);
  }
  return data as ResendReceivedMessage;
}

/** Safe email-address extraction from "Company <user@example.pl>". */
export function senderAddress(from: string): string {
  const wrapped = /<([^<>@\s]+@[^<>\s]+)>/.exec(from);
  const value = (wrapped?.[1] || from || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(value) ? value : "";
}

/** Only synchronize Finance You mailbox, never other domains in a shared key. */
export function isFinanceYouMessage(
  mail: Pick<ResendReceivedSummary, "to" | "cc" | "received_for">,
): boolean {
  const all = [...(mail.to ?? []), ...(mail.cc ?? []), ...(mail.received_for ?? [])];
  return all.some((v) => {
    const addr = senderAddress(v);
    return /@(?:[a-z0-9-]+\.)?financeyou\.pl$/i.test(addr);
  });
}

export function headerValue(
  headers: Record<string, string> | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] ?? "") || null : null;
}

export function textFromHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
