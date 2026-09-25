// KSeF 2.0 — wysyłka faktury w sesji interaktywnej (online) i sprawdzanie jej statusu.
// Przebieg wg dokumentacji MF (CIRFMF/ksef-docs: sesja-interaktywna.md,
// faktury/sesje/sesja-sprawdzenie-stanu-i-pobranie-upo.md, open-api.json):
//   1) uwierzytelnienie tokenem KSeF → accessToken (session.ts)
//   2) klucz AES-256 + IV, klucz zaszyfrowany RSA-OAEP(SHA-256) kluczem MF „SymmetricKeyEncryption”
//   3) POST /sessions/online                          → numer referencyjny sesji
//   4) POST /sessions/online/{ref}/invoices            → numer referencyjny faktury (AES-256-CBC, PKCS#7)
//   5) POST /sessions/online/{ref}/close               → zamknięcie sesji (start generowania UPO)
//   6) GET  /sessions/{ref}/invoices/{invoiceRef}      → status (100/150 w toku, 200 sukces, 4xx błąd)
//   7) GET  /sessions/{ref}/invoices/{invoiceRef}/upo  → UPO (XML)
import { constants, createCipheriv, createHash, publicEncrypt, randomBytes } from "node:crypto";
import { FA3_FORM_CODE } from "./fa3-xml";
import {
  closeKsefSession,
  fetchEncryptionPublicKey,
  openKsefSession,
  type KsefSession,
} from "./session";
import type { KsefEntity, KsefResult } from "./client";
import { forgetKsefApiRoot } from "./api-root";

/** Dopisek do błędów wskazujących, że KSeF przestał przyjmować schemat FA(3). */
export const SCHEMA_HINT =
  "Jeśli Ministerstwo Finansów wprowadziło nowy schemat faktury (następcę FA(3)), generator faktur wymaga aktualizacji — MF ogłasza takie zmiany z wyprzedzeniem w changelogu KSeF.";

const sha256b64 = (b: Buffer) => createHash("sha256").update(b).digest("base64");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Szyfruje fakturę (AES-256-CBC, PKCS#7) i liczy metadane wymagane przez KSeF. */
export function encryptInvoice(xml: string, key: Buffer, iv: Buffer) {
  const plain = Buffer.from(xml, "utf8");
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    invoiceHash: sha256b64(plain),
    invoiceSize: plain.length,
    encryptedInvoiceHash: sha256b64(enc),
    encryptedInvoiceSize: enc.length,
    encryptedInvoiceContent: enc.toString("base64"),
    offlineMode: false,
  };
}

export type InvoiceStatusResponse = {
  referenceNumber?: string;
  ksefNumber?: string | null;
  invoiceNumber?: string | null;
  upoDownloadUrl?: string | null;
  status?: {
    code?: number;
    description?: string;
    details?: string[] | null;
    extensions?: Record<string, string | null> | null;
  };
};

/**
 * Status faktury z KSeF → wynik dla platformy.
 * 100/150 — w toku; 200 — przyjęta (numer KSeF); 405/500/550 — błąd po stronie
 * KSeF, faktury nie ma, można ponowić; 440 — duplikat (numer oryginału w
 * `referenceNumber`); pozostałe 4xx — odrzucona (np. 450 błąd semantyki).
 */
export function interpretInvoiceStatus(st: InvoiceStatusResponse): KsefResult {
  const code = Number(st.status?.code ?? 0);
  const details = (st.status?.details ?? []).filter(Boolean).join("; ");
  const desc = [st.status?.description, details].filter(Boolean).join(": ");
  if (code === 200)
    return { status: "accepted", statusCode: code, referenceNumber: st.ksefNumber ?? null };
  if (code === 100 || code === 150)
    return {
      status: "pending",
      statusCode: code,
      message: desc || "Faktura w przetwarzaniu KSeF.",
    };
  if (code === 440)
    return {
      status: "rejected",
      statusCode: code,
      referenceNumber: st.status?.extensions?.originalKsefNumber ?? null,
      message: `Duplikat faktury w KSeF${desc ? ` (${desc})` : ""}.`,
    };
  if (code === 430)
    return {
      status: "rejected",
      statusCode: code,
      message: `KSeF odrzucił plik faktury (430 — niezgodność ze schematem): ${desc}. ${SCHEMA_HINT}`,
    };
  if (code === 405 || code === 500 || code === 550)
    return { status: "error", statusCode: code, message: `KSeF ${code}: ${desc}` };
  return {
    status: "rejected",
    statusCode: code,
    message: `KSeF odrzucił fakturę (${code}): ${desc}`,
  };
}

/** Czytelny opis błędu HTTP z KSeF (problem details albo ExceptionResponse). */
async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const j = JSON.parse(body);
    const pd = Array.isArray(j.errors)
      ? j.errors
          .map((e: any) => [e.code, e.description, ...(e.details ?? [])].filter(Boolean).join(" "))
          .join("; ")
      : "";
    const ex = (j.exception?.exceptionDetailList ?? [])
      .map((e: any) =>
        [e.exceptionCode, e.exceptionDescription, ...(e.details ?? [])].filter(Boolean).join(" "),
      )
      .join("; ");
    return pd || ex || j.detail || j.title || body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

/** Wywołanie chronionego API KSeF z ponawianiem przy 429/503 (Retry-After). */
async function api<T = any>(
  s: KsefSession,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  accept = "application/json",
): Promise<T> {
  const url = `${s.baseUrl}${path}`;
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${s.accessToken}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const ra = Number(res.headers.get("Retry-After"));
      await res.text().catch(() => "");
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    if (res.status === 404) forgetKsefApiRoot(); // możliwa zmiana adresacji MF
    if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await errorText(res)}`);
    if (res.status === 204) return undefined as T;
    return (accept === "application/json" ? res.json() : res.text()) as Promise<T>;
  }
}

async function fetchUpo(s: KsefSession, sessionRef: string, invoiceRef: string) {
  try {
    return await api<string>(
      s,
      "GET",
      `/sessions/${encodeURIComponent(sessionRef)}/invoices/${encodeURIComponent(invoiceRef)}/upo`,
      undefined,
      "application/xml",
    );
  } catch {
    return null; // UPO bywa dostępne dopiero po przetworzeniu zamkniętej sesji
  }
}

async function statusOnce(s: KsefSession, sessionRef: string, invoiceRef: string) {
  const st = await api<InvoiceStatusResponse>(
    s,
    "GET",
    `/sessions/${encodeURIComponent(sessionRef)}/invoices/${encodeURIComponent(invoiceRef)}`,
  );
  const r = interpretInvoiceStatus(st);
  if (r.status === "accepted") r.upoXml = await fetchUpo(s, sessionRef, invoiceRef);
  return { ...r, sessionReference: sessionRef, invoiceReference: invoiceRef, sent: true };
}

/** Wysyła fakturę FA(3) do KSeF i czeka krótko na wynik przetwarzania. */
export async function sendInvoiceOnline(
  entity: KsefEntity,
  faXml: string,
  opts: { waitMs?: number } = {},
): Promise<KsefResult> {
  let session: KsefSession;
  try {
    session = await openKsefSession(entity);
  } catch (e) {
    return {
      status: "error",
      sent: false,
      message: `Uwierzytelnienie KSeF: ${(e as Error).message}`,
    };
  }
  let sessionRef: string | null = null;
  let invoiceRef: string | null = null;
  // Od chwili wysłania żądania z fakturą nie wiemy na pewno, czy nie dotarła.
  let attempted = false;
  try {
    const pem = await fetchEncryptionPublicKey(session.baseUrl, "SymmetricKeyEncryption");
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const encryptedSymmetricKey = publicEncrypt(
      { key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      key,
    ).toString("base64");
    const opened = await api<{ referenceNumber: string }>(session, "POST", "/sessions/online", {
      formCode: FA3_FORM_CODE,
      encryption: { encryptedSymmetricKey, initializationVector: iv.toString("base64") },
    }).catch((e: Error) => {
      // Odmowa otwarcia sesji dla FA(3) = schemat wycofany po stronie KSeF.
      if (/ 400:/.test(e.message) && /form|schem|FA \(3\)/i.test(e.message))
        throw new Error(`${e.message}. ${SCHEMA_HINT}`);
      throw e;
    });
    sessionRef = opened.referenceNumber;
    try {
      attempted = true;
      const sent = await api<{ referenceNumber: string }>(
        session,
        "POST",
        `/sessions/online/${encodeURIComponent(sessionRef)}/invoices`,
        encryptInvoice(faXml, key, iv),
      );
      invoiceRef = sent.referenceNumber;
    } finally {
      await api(session, "POST", `/sessions/online/${encodeURIComponent(sessionRef)}/close`).catch(
        () => undefined,
      );
    }

    const deadline = Date.now() + (opts.waitMs ?? 15_000);
    let last: KsefResult = {
      status: "pending",
      message: "Faktura przyjęta do przetwarzania w KSeF.",
    };
    while (Date.now() < deadline) {
      await sleep(1500);
      try {
        last = await statusOnce(session, sessionRef, invoiceRef);
      } catch (e) {
        last = {
          status: "pending",
          message: `Status jeszcze niedostępny: ${(e as Error).message}`,
        };
      }
      if (last.status !== "pending") break;
    }
    return { ...last, sessionReference: sessionRef, invoiceReference: invoiceRef, sent: true };
  } catch (e) {
    return {
      status: "error",
      // Faktura mogła dotrzeć, jeśli żądanie z nią zostało wysłane — ponowienie
      // rozpozna ją wtedy po duplikacie (440).
      sent: attempted,
      sessionReference: sessionRef,
      invoiceReference: invoiceRef,
      message: `KSeF: ${(e as Error).message}`,
    };
  } finally {
    await closeKsefSession(session);
  }
}

/** Sprawdza status wcześniej wysłanej faktury (i pobiera UPO, gdy przyjęta). */
export async function checkInvoiceOnline(
  entity: KsefEntity,
  sessionRef: string,
  invoiceRef: string,
): Promise<KsefResult> {
  let session: KsefSession;
  try {
    session = await openKsefSession(entity);
  } catch (e) {
    return { status: "pending", message: `Uwierzytelnienie KSeF: ${(e as Error).message}` };
  }
  try {
    return await statusOnce(session, sessionRef, invoiceRef);
  } catch (e) {
    return { status: "pending", message: `KSeF: ${(e as Error).message}` };
  } finally {
    await closeKsefSession(session);
  }
}
