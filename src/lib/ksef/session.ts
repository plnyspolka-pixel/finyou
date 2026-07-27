// KSeF 2.0 session helper — token-based (KSeF Authorization Token).
// Flow (per api-test.ksef.mf.gov.pl/docs/v2):
//   1) GET  /api/v2/security/public-key-certificates → wybierz cert z usage=KsefTokenEncryption
//   2) POST /api/v2/auth/challenge → { challenge, timestamp, timestampMs }
//   3) RSA-OAEP-SHA256 na `${token}|${timestampMs}` kluczem publicznym z cert (X.509)
//   4) POST /api/v2/auth/ksef-token → { referenceNumber, authenticationToken:{token} }
//   5) GET  /api/v2/auth/{referenceNumber} → poll do status = 'Success'
//   6) POST /api/v2/auth/token/redeem (Authorization: Bearer <authenticationToken>) → { accessToken, refreshToken }
//   7) Wszystkie kolejne wywołania: Authorization: Bearer <accessToken.token>
import { publicEncrypt, constants, X509Certificate } from "node:crypto";
import { decryptSensitive } from "@/lib/affiliate/crypto";
import { ksefBaseUrl, type KsefEntity, type KsefEnvironment } from "./client";

export function pickEnvTokenFor(entity: Pick<KsefEntity, "legal_name">): string | null {
  const name = (entity.legal_name ?? "").toLowerCase();
  if (name.includes("finance you")) return process.env.KSEF_TOKEN_FINANCE_YOU ?? null;
  if (name.includes("pieczak")) return process.env.KSEF_TOKEN_FUNDACJA_IM_PIECZAKA ?? null;
  return process.env.KSEF_TOKEN_FINANCE_YOU ?? process.env.KSEF_TOKEN_FUNDACJA_IM_PIECZAKA ?? null;
}

export type KsefSession = {
  baseUrl: string;
  environment: KsefEnvironment;
  /** Bearer access token (JWT) do wszystkich chronionych endpointów KSeF 2.0. */
  accessToken: string;
  /** Refresh token — opcjonalnie użyty, jeśli sesja żyje długo. */
  refreshToken?: string | null;
  nip: string;
};

type CertEntry = { certificate: string; usage: string[] | string };

// Zwraca klucz publiczny MF jako PEM (string). PEM jest wymagany, bo część runtime'ów
// (workerd/Cloudflare) nie przyjmuje obiektu KeyObject w publicEncrypt({ key }).
async function fetchEncryptionPublicKey(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v2/security/public-key-certificates`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Nie udało się pobrać certyfikatów KSeF (${res.status}).`);
  const items = (await res.json()) as CertEntry[];
  const pick =
    items.find((c) => {
      const u = Array.isArray(c.usage) ? c.usage : [c.usage];
      return u.includes("KsefTokenEncryption");
    }) ?? items[0];
  if (!pick?.certificate)
    throw new Error("Brak certyfikatu KsefTokenEncryption w odpowiedzi KSeF.");
  const der = Buffer.from(pick.certificate, "base64");
  const cert = new X509Certificate(der);
  return cert.publicKey.export({ type: "spki", format: "pem" }) as string;
}

async function pollAuthStatus(
  baseUrl: string,
  referenceNumber: string,
  authToken: string,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/api/v2/auth/${encodeURIComponent(referenceNumber)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`GET /auth/${referenceNumber} ${res.status}`);
    const j = (await res.json()) as {
      status?: { code?: number; description?: string } | string;
      authenticationTokenStatus?: string;
    };
    const status =
      typeof j.status === "string"
        ? j.status
        : (j.status?.description ?? "") + " " + (j.authenticationTokenStatus ?? "");
    if (/success|zakończ|complete/i.test(status)) return;
    if (/fail|error|blad|błąd/i.test(status))
      throw new Error(`Uwierzytelnianie KSeF nie powiodło się: ${status}`);
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("Timeout uwierzytelniania KSeF.");
}

/** Otwiera sesję KSeF 2.0 i zwraca `accessToken` (JWT) używany jako Bearer. */
export async function openKsefSession(entity: KsefEntity): Promise<KsefSession> {
  const envToken = pickEnvTokenFor(entity);
  const environment: KsefEnvironment =
    entity.ksef_environment && entity.ksef_environment !== "disabled"
      ? entity.ksef_environment
      : envToken
        ? "prod"
        : "disabled";
  if (environment === "disabled") throw new Error("KSeF wyłączony dla tego podmiotu.");
  const token = decryptSensitive(entity.ksef_token_encrypted) ?? envToken;
  if (!token) throw new Error("Brak tokenu autoryzacyjnego KSeF dla podmiotu.");
  const nip = entity.ksef_nip ?? "";
  if (!nip) throw new Error("Brak NIP podmiotu dla autoryzacji KSeF.");
  const base = ksefBaseUrl(environment);
  if (!base) throw new Error("Nieznane środowisko KSeF.");

  // 1) klucz publiczny z API KSeF (PEM)
  const publicKeyPem = await fetchEncryptionPublicKey(base);

  // 2) challenge
  const chRes = await fetch(`${base}/api/v2/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: "{}",
  });
  if (!chRes.ok) throw new Error(`POST /auth/challenge ${chRes.status}`);
  const ch = (await chRes.json()) as { challenge: string; timestamp: string; timestampMs?: number };
  const tsMs = ch.timestampMs ?? Date.parse(ch.timestamp);

  // 3) szyfrowanie tokenu (RSA-OAEP SHA-256)
  const encryptedToken = publicEncrypt(
    { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(`${token}|${tsMs}`, "utf8"),
  ).toString("base64");

  // 4) submit
  const submitRes = await fetch(`${base}/api/v2/auth/ksef-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      challenge: ch.challenge,
      contextIdentifier: { type: "nip", value: nip },
      subjectIdentifierType: "certificateSubject",
      encryptedToken,
    }),
  });
  if (!submitRes.ok) {
    const txt = await submitRes.text().catch(() => "");
    throw new Error(`POST /auth/ksef-token ${submitRes.status}: ${txt.slice(0, 300)}`);
  }
  const submit = (await submitRes.json()) as {
    referenceNumber: string;
    authenticationToken?: { token: string };
  };
  const authToken = submit.authenticationToken?.token;
  if (!submit.referenceNumber || !authToken)
    throw new Error("Brak referenceNumber/authenticationToken w odpowiedzi KSeF.");

  // 5) poll
  await pollAuthStatus(base, submit.referenceNumber, authToken);

  // 6) redeem access/refresh
  const rdRes = await fetch(`${base}/api/v2/auth/token/redeem`, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${authToken}` },
  });
  if (!rdRes.ok) {
    const txt = await rdRes.text().catch(() => "");
    throw new Error(`POST /auth/token/redeem ${rdRes.status}: ${txt.slice(0, 300)}`);
  }
  const rd = (await rdRes.json()) as {
    accessToken?: { token: string };
    refreshToken?: { token: string };
  };
  const accessToken = rd.accessToken?.token;
  if (!accessToken) throw new Error("Brak accessToken w odpowiedzi redeem.");

  return {
    baseUrl: base,
    environment,
    accessToken,
    refreshToken: rd.refreshToken?.token ?? null,
    nip,
  };
}

/** Zamyka sesję (best-effort). */
export async function closeKsefSession(session: KsefSession): Promise<void> {
  try {
    await fetch(`${session.baseUrl}/api/v2/auth/token/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
  } catch {
    // best-effort
  }
}
