// Szyfrowanie danych wrażliwych partnera (PESEL, rachunek bankowy).
// Wyłącznie po stronie serwera (funkcje serwerowe / webhooki).
// Klucz: AFFILIATE_ENCRYPTION_KEY (32 bajty, hex lub base64). Bez klucza —
// awaryjnie base64 z ostrzeżeniem (skonfiguruj klucz w środowisku produkcyjnym).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer | null {
  const raw = process.env.AFFILIATE_ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    const buf = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

export function encryptSensitive(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const key = getKey();
  if (!key) {
    console.warn(
      "[affiliate] AFFILIATE_ENCRYPTION_KEY brak — dane wrażliwe zapisane jako base64 (skonfiguruj klucz!).",
    );
    return `b64:${Buffer.from(String(plain), "utf8").toString("base64")}`;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSensitive(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("b64:")) {
    try {
      return Buffer.from(stored.slice(4), "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  if (stored.startsWith("enc:v1:")) {
    const key = getKey();
    if (!key) return null;
    const [, , ivB64, tagB64, dataB64] = stored.split(":");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      return null;
    }
  }
  return stored;
}

/** Maskowanie rachunku do podglądu (ostatnie 4 cyfry). */
export function maskBankAccount(plain: string | null | undefined): string {
  if (!plain) return "—";
  const digits = String(plain).replace(/\s+/g, "");
  if (digits.length <= 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

/** Maskowanie PESEL do podglądu. */
export function maskPesel(plain: string | null | undefined): string {
  if (!plain) return "—";
  const s = String(plain);
  if (s.length < 4) return "•••";
  return `${s.slice(0, 2)}•••••${s.slice(-2)}`;
}
