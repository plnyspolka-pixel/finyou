// KSeF 2.0 — wysyłka faktury w sesji interaktywnej (online).
//  1) cert SymmetricKeyEncryption → RSA-OAEP-SHA256(klucz AES-256)
//  2) POST /api/v2/sessions/online { formCode FA(3), encryption }
//  3) POST /api/v2/sessions/online/{ref}/invoices (AES-256-CBC/PKCS7)
//  4) POST /api/v2/sessions/online/{ref}/close
//  5) GET  /api/v2/sessions/{ref}/invoices/{invRef} → numer KSeF
import { createCipheriv, createHash, randomBytes, publicEncrypt, constants } from "node:crypto";
import { fetchKsefPublicKeyPem, type KsefSession } from "./session";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("base64");

export type KsefSendResult = {
  status: "accepted" | "pending" | "rejected";
  sessionReference: string;
  invoiceReference: string;
  ksefNumber?: string | null;
  message?: string | null;
};

export async function ksefSendInvoice(session: KsefSession, faXml: string): Promise<KsefSendResult> {
  const base = session.baseUrl;
  const auth = { Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" };
  const pem = await fetchKsefPublicKeyPem(base, "SymmetricKeyEncryption");
  const key = randomBytes(32);
  const iv = randomBytes(16);
  const encryptedSymmetricKey = publicEncrypt(
    { key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    key,
  ).toString("base64");

  const open = await fetch(`${base}/api/v2/sessions/online`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      encryption: { encryptedSymmetricKey, initializationVector: iv.toString("base64") },
    }),
  });
  if (!open.ok) throw new Error(`POST /sessions/online ${open.status}: ${(await open.text()).slice(0, 400)}`);
  const sessionReference = ((await open.json()) as { referenceNumber: string }).referenceNumber;

  const plain = Buffer.from(faXml, "utf8");
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);

  let invoiceReference = "";
  try {
    const send = await fetch(`${base}/api/v2/sessions/online/${encodeURIComponent(sessionReference)}/invoices`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceHash: sha(plain),
        invoiceSize: plain.length,
        encryptedInvoiceHash: sha(enc),
        encryptedInvoiceSize: enc.length,
        encryptedInvoiceContent: enc.toString("base64"),
        offlineMode: false,
      }),
    });
    if (!send.ok) throw new Error(`POST /invoices ${send.status}: ${(await send.text()).slice(0, 400)}`);
    invoiceReference = ((await send.json()) as { referenceNumber: string }).referenceNumber;
  } finally {
    await fetch(`${base}/api/v2/sessions/online/${encodeURIComponent(sessionReference)}/close`, {
      method: "POST",
      headers: auth,
    }).catch(() => undefined);
  }

  // Poll statusu faktury (do ~25 s). Kod 200 = przyjęta, >=400 = odrzucona.
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = await fetch(
      `${base}/api/v2/sessions/${encodeURIComponent(sessionReference)}/invoices/${encodeURIComponent(invoiceReference)}`,
      { headers: auth },
    );
    if (!st.ok) continue;
    const j = (await st.json()) as {
      ksefNumber?: string;
      status?: { code?: number; description?: string; details?: string[] };
    };
    const code = j.status?.code ?? 0;
    const desc = [j.status?.description, ...(j.status?.details ?? [])].filter(Boolean).join(" — ");
    if (code === 200) return { status: "accepted", sessionReference, invoiceReference, ksefNumber: j.ksefNumber ?? null, message: desc };
    if (code >= 400) return { status: "rejected", sessionReference, invoiceReference, message: `KSeF odrzucił fakturę (${code}): ${desc}` };
  }
  return { status: "pending", sessionReference, invoiceReference, message: "Faktura wysłana do KSeF, przetwarzanie trwa." };
}
