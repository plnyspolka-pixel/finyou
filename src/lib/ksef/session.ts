// Wspólna sesja KSeF: challenge → InitToken → sessionToken.
// Używane zarówno przy wysyłce faktur (client.ts) jak i przy pobieraniu (Query API).
import { publicEncrypt, constants } from "node:crypto";
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
  sessionToken: string;
  nip: string;
};

/**
 * Otwiera sesję KSeF (Online) dla podmiotu. Zwraca base + sessionToken.
 * Rzuca opisowy błąd, kiedy nie da się otworzyć sesji — wołający zapisuje go do accounting_sync_status.
 */
export async function openKsefSession(entity: KsefEntity): Promise<KsefSession> {
  const envToken = pickEnvTokenFor(entity);
  const environment: KsefEnvironment =
    entity.ksef_environment && entity.ksef_environment !== "disabled" ? entity.ksef_environment : envToken ? "prod" : "disabled";
  if (environment === "disabled") throw new Error("KSeF wyłączony dla tego podmiotu.");
  const token = decryptSensitive(entity.ksef_token_encrypted) ?? envToken;
  if (!token) throw new Error("Brak tokenu KSeF dla podmiotu.");
  const nip = entity.ksef_nip ?? "";
  if (!nip) throw new Error("Brak NIP podmiotu dla autoryzacji KSeF.");
  const base = ksefBaseUrl(environment);
  if (!base) throw new Error("Nieznane środowisko KSeF.");

  const mfPublicKey = process.env.KSEF_MF_PUBLIC_KEY;
  if (!mfPublicKey) {
    throw new Error("Brak klucza publicznego MF (KSEF_MF_PUBLIC_KEY) — nie można otworzyć realnej sesji KSeF. Dodaj sekret KSEF_MF_PUBLIC_KEY albo użyj trybu testowego.");
  }

  const challengeRes = await fetch(`${base}/api/online/Session/AuthorisationChallenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ contextIdentifier: { type: "onip", identifier: nip } }),
  });
  if (!challengeRes.ok) throw new Error(`AuthorisationChallenge ${challengeRes.status}`);
  const challenge = (await challengeRes.json()) as { challenge: string; timestamp: string };
  const epochMs = Date.parse(challenge.timestamp);
  const encrypted = publicEncrypt(
    { key: mfPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(`${token}|${epochMs}`, "utf8"),
  ).toString("base64");

  const initXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ns3:InitSessionTokenRequest xmlns:ns3="http://ksef.mf.gov.pl/schema/gtw/svc/online/auth/request/2021/10/01/0001">` +
    `<ns3:Context><Challenge>${challenge.challenge}</Challenge>` +
    `<Identifier xsi:type="ns2:SubjectIdentifierByCompanyType" xmlns:ns2="http://ksef.mf.gov.pl/schema/gtw/svc/types/2021/10/01/0001" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Identifier>${nip}</Identifier></Identifier>` +
    `<DocumentType><Service>KSeF</Service><FormCode><SystemCode>FA (2)</SystemCode><SchemaVersion>1-0E</SchemaVersion><TargetNamespace>http://crd.gov.pl/wzor/2023/06/29/12648/</TargetNamespace><Value>FA</Value></FormCode></DocumentType>` +
    `<Token>${encrypted}</Token></ns3:Context></ns3:InitSessionTokenRequest>`;

  const initRes = await fetch(`${base}/api/online/Session/InitToken`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", Accept: "application/json" },
    body: initXml,
  });
  if (!initRes.ok) throw new Error(`InitToken ${initRes.status}`);
  const session = (await initRes.json()) as { sessionToken?: { token: string } };
  const sessionToken = session.sessionToken?.token;
  if (!sessionToken) throw new Error("Brak tokenu sesji KSeF.");
  return { baseUrl: base, environment, sessionToken, nip };
}

export async function closeKsefSession(session: KsefSession): Promise<void> {
  try {
    await fetch(`${session.baseUrl}/api/online/Session/Terminate`, {
      method: "GET",
      headers: { SessionToken: session.sessionToken, Accept: "application/json" },
    });
  } catch {
    // best-effort
  }
}
