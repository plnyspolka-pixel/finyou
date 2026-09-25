// @vitest-environment node
import {
  constants,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
} from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }) as string;

vi.mock("./session", () => ({
  openKsefSession: vi.fn(async () => ({
    baseUrl: "https://ksef.test",
    environment: "test",
    accessToken: "ACCESS",
    nip: "7010611803",
  })),
  closeKsefSession: vi.fn(async () => undefined),
  fetchEncryptionPublicKey: vi.fn(async (_b: string, usage: string) => {
    if (usage !== "SymmetricKeyEncryption") throw new Error("zły klucz");
    return publicPem;
  }),
}));

import { encryptInvoice, interpretInvoiceStatus, sendInvoiceOnline } from "./online";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("base64");
const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<Faktura>zażółć gęślą jaźń</Faktura>';
const ENTITY = { ksef_environment: "test" as const, ksef_nip: "7010611803" };

describe("encryptInvoice", () => {
  it("AES-256-CBC z PKCS#7 i poprawnymi skrótami", () => {
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const r = encryptInvoice(XML, key, iv);
    const enc = Buffer.from(r.encryptedInvoiceContent, "base64");
    const d = createDecipheriv("aes-256-cbc", key, iv);
    const plain = Buffer.concat([d.update(enc), d.final()]);
    expect(plain.toString("utf8")).toBe(XML);
    expect(r.invoiceSize).toBe(Buffer.byteLength(XML, "utf8"));
    expect(r.invoiceHash).toBe(sha(Buffer.from(XML, "utf8")));
    expect(r.encryptedInvoiceHash).toBe(sha(enc));
    expect(r.encryptedInvoiceSize % 16).toBe(0);
  });
});

describe("interpretInvoiceStatus", () => {
  it("mapuje kody KSeF", () => {
    expect(interpretInvoiceStatus({ ksefNumber: "K1", status: { code: 200 } })).toMatchObject({
      status: "accepted",
      referenceNumber: "K1",
    });
    expect(interpretInvoiceStatus({ status: { code: 150 } }).status).toBe("pending");
    expect(
      interpretInvoiceStatus({
        status: { code: 450, description: "Błąd semantyki", details: ["P_15"] },
      }),
    ).toMatchObject({ status: "rejected", message: expect.stringMatching(/Błąd semantyki: P_15/) });
    expect(
      interpretInvoiceStatus({
        status: { code: 440, extensions: { originalKsefNumber: "ORIG" } },
      }),
    ).toMatchObject({ status: "rejected", statusCode: 440, referenceNumber: "ORIG" });
    expect(interpretInvoiceStatus({ status: { code: 550 } }).status).toBe("error");
  });
});

describe("sendInvoiceOnline", () => {
  type Call = { method: string; url: string; body: any; auth: string | null };
  let calls: Call[];
  let statusCodes: number[];

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    calls = [];
    statusCodes = [150, 200];
    let symKey: Buffer | null = null;
    let iv: Buffer | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const body = init.body ? JSON.parse(String(init.body)) : undefined;
        const headers = init.headers as Record<string, string>;
        calls.push({
          method: init.method ?? "GET",
          url,
          body,
          auth: headers.Authorization ?? null,
        });
        const json = (o: unknown, status = 200) =>
          new Response(JSON.stringify(o), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        if (url.endsWith("/api/v2/sessions/online")) {
          // Serwer KSeF: odszyfrowuje klucz symetryczny kluczem prywatnym MF.
          symKey = privateDecrypt(
            { key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
            Buffer.from(body.encryption.encryptedSymmetricKey, "base64"),
          );
          iv = Buffer.from(body.encryption.initializationVector, "base64");
          expect(body.formCode).toEqual({
            systemCode: "FA (3)",
            schemaVersion: "1-0E",
            value: "FA",
          });
          return json({ referenceNumber: "S".repeat(36), validUntil: "2026-09-26T00:00:00Z" }, 201);
        }
        if (url.endsWith("/invoices") && init.method === "POST") {
          const enc = Buffer.from(body.encryptedInvoiceContent, "base64");
          const d = createDecipheriv("aes-256-cbc", symKey!, iv!);
          const plain = Buffer.concat([d.update(enc), d.final()]);
          expect(plain.toString("utf8")).toBe(XML);
          expect(body.invoiceHash).toBe(sha(plain));
          expect(body.encryptedInvoiceHash).toBe(sha(enc));
          expect(body.invoiceSize).toBe(plain.length);
          expect(body.encryptedInvoiceSize).toBe(enc.length);
          return json({ referenceNumber: "I".repeat(36) }, 202);
        }
        if (url.endsWith("/close")) return new Response(null, { status: 204 });
        if (url.endsWith("/upo")) return new Response("<UPO/>", { status: 200 });
        if (url.includes(`/sessions/${"S".repeat(36)}/invoices/${"I".repeat(36)}`)) {
          const code = statusCodes.shift() ?? 200;
          return json({
            referenceNumber: "I".repeat(36),
            ksefNumber: code === 200 ? "7010611803-20260925-ABCDEF-123456-7A" : null,
            status: { code, description: code === 200 ? "Sukces" : "Trwa przetwarzanie" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("otwiera sesję, wysyła zaszyfrowaną fakturę, zamyka sesję i czeka na numer KSeF", async () => {
    const r = await sendInvoiceOnline(ENTITY, XML, { waitMs: 10_000 });
    expect(r).toMatchObject({
      status: "accepted",
      referenceNumber: "7010611803-20260925-ABCDEF-123456-7A",
      sessionReference: "S".repeat(36),
      invoiceReference: "I".repeat(36),
      sent: true,
      upoXml: "<UPO/>",
    });
    const order = calls.map((c) => `${c.method} ${c.url.replace("https://ksef.test/api/v2", "")}`);
    expect(order.slice(0, 3)).toEqual([
      "POST /sessions/online",
      `POST /sessions/online/${"S".repeat(36)}/invoices`,
      `POST /sessions/online/${"S".repeat(36)}/close`,
    ]);
    expect(calls.every((c) => c.auth === "Bearer ACCESS")).toBe(true);
  });

  it("zwraca pending, gdy KSeF nie skończył w czasie oczekiwania", async () => {
    statusCodes = [150, 150, 150, 150, 150, 150, 150, 150];
    const r = await sendInvoiceOnline(ENTITY, XML, { waitMs: 2000 });
    expect(r).toMatchObject({ status: "pending", invoiceReference: "I".repeat(36), sent: true });
  });

  it("błąd przy otwarciu sesji: faktura nie wysłana (sent=false)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"detail":"x"}', { status: 400 })),
    );
    const r = await sendInvoiceOnline(ENTITY, XML, { waitMs: 1000 });
    expect(r).toMatchObject({ status: "error", sent: false, invoiceReference: null });
  });
});
