// Klient KSeF (Krajowy System e-Faktur).
// Tryby:
//  - 'disabled' / brak tokenu → faktura nie jest wysyłana do KSeF (status 'disabled').
//  - tryb MOCK (token zaczyna się od "mock:" lub KSEF_MOCK=true) → symulacja akceptacji,
//    do demonstracji i testów przepływu bez realnego połączenia.
//  - tryb realny → wywołania API KSeF (challenge → InitToken → Send → Status).
//    WYMAGA klucza publicznego MF (KSEF_MF_PUBLIC_KEY, PEM) do zaszyfrowania tokenu
//    autoryzacyjnego oraz weryfikacji względem aktualnej wersji API. Przed produkcją
//    potwierdź endpointy i format żądań dla wersji FA(2)/FA(3) / KSeF 2.0.
import { createHash, publicEncrypt, constants } from "node:crypto";
import { decryptSensitive } from "@/lib/affiliate/crypto";

export type KsefEnvironment = "disabled" | "test" | "demo" | "prod";

export type KsefEntity = {
  ksef_environment: KsefEnvironment;
  ksef_nip?: string | null;
  ksef_token_encrypted?: string | null;
  legal_name?: string | null;
};

/** Wybiera token KSeF z env w zależności od podmiotu (po nazwie). */
function pickEnvToken(entity: KsefEntity): string | null {
  const name = (entity.legal_name ?? "").toLowerCase();
  if (name.includes("finance you")) return process.env.KSEF_TOKEN_FINANCE_YOU ?? null;
  if (name.includes("pieczak")) return process.env.KSEF_TOKEN_FUNDACJA_IM_PIECZAKA ?? null;
  // Fallback: spróbuj kolejno (Finance You jako główny podmiot operacyjny).
  return (
    process.env.KSEF_TOKEN_FINANCE_YOU ??
    process.env.KSEF_TOKEN_FUNDACJA_IM_PIECZAKA ??
    null
  );
}

export type KsefResult = {
  status: "disabled" | "pending" | "accepted" | "rejected" | "error";
  referenceNumber?: string | null;
  elementReference?: string | null;
  upoXml?: string | null;
  message?: string | null;
};

export function ksefBaseUrl(env: KsefEnvironment): string | null {
  switch (env) {
    case "test":
      return "https://ksef-test.mf.gov.pl";
    case "demo":
      return "https://ksef-demo.mf.gov.pl";
    case "prod":
      return "https://ksef.mf.gov.pl";
    default:
      return null;
  }
}

export function sha256Base64(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("base64");
}

function isMock(token: string | null): boolean {
  return process.env.KSEF_MOCK === "true" || (token?.startsWith("mock:") ?? false);
}

/** Wysyła fakturę do KSeF (lub symuluje w trybie mock). */
export async function ksefSubmitInvoice(entity: KsefEntity, faXml: string): Promise<KsefResult> {
  // Fallback: jeśli podmiot nie ma jeszcze tokenu / środowiska, użyj globalnego tokenu z env.
  const envToken = process.env.KSEF_TOKEN_FUNDACJA_IM_PIECZAKA ?? null;
  const effectiveEnv: KsefEnvironment =
    entity.ksef_environment && entity.ksef_environment !== "disabled"
      ? entity.ksef_environment
      : envToken
        ? "prod"
        : "disabled";
  if (effectiveEnv === "disabled") {
    return { status: "disabled", message: "KSeF wyłączony dla tego podmiotu." };
  }
  const token = decryptSensitive(entity.ksef_token_encrypted) ?? envToken;
  if (!token) {
    return { status: "disabled", message: "Brak tokenu KSeF dla podmiotu." };
  }
  const effectiveEntity: KsefEntity = { ...entity, ksef_environment: effectiveEnv };

  const hash = sha256Base64(faXml);

  if (isMock(token)) {
    const ref = `MOCK-KSEF-${entity.ksef_nip ?? "NIP"}-${hash.slice(0, 10).replace(/[^A-Za-z0-9]/g, "")}`;
    const upo = `<?xml version="1.0" encoding="UTF-8"?><UPO><Symulacja>true</Symulacja><NumerReferencyjny>${ref}</NumerReferencyjny></UPO>`;
    return { status: "accepted", referenceNumber: ref, elementReference: ref, upoXml: upo, message: "Tryb testowy (mock) — faktura nie została wysłana do realnego KSeF." };
  }

  const base = ksefBaseUrl(effectiveEnv);
  if (!base) return { status: "error", message: "Nieznane środowisko KSeF." };

  try {
    return await ksefRealSubmit(base, effectiveEntity, token, faXml, hash);
  } catch (e) {
    return { status: "error", message: `Błąd integracji KSeF: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------
// Realny przepływ KSeF (szkielet — wymaga klucza publicznego MF i weryfikacji
// względem aktualnej wersji API). W razie braku konfiguracji zwraca błąd opisowy.
// ---------------------------------------------------------------------
async function ksefRealSubmit(base: string, entity: KsefEntity, token: string, faXml: string, hash: string): Promise<KsefResult> {
  const nip = entity.ksef_nip;
  if (!nip) return { status: "error", message: "Brak NIP podmiotu dla autoryzacji KSeF." };

  const mfPublicKey = process.env.KSEF_MF_PUBLIC_KEY;
  if (!mfPublicKey) {
    return {
      status: "error",
      message: "Realne wysyłanie do KSeF wymaga klucza publicznego MF (KSEF_MF_PUBLIC_KEY). Skonfiguruj środowisko lub użyj trybu testowego (token „mock:”).",
    };
  }

  // 1) Challenge autoryzacyjny
  const challengeRes = await fetch(`${base}/api/online/Session/AuthorisationChallenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ contextIdentifier: { type: "onip", identifier: nip } }),
  });
  if (!challengeRes.ok) throw new Error(`AuthorisationChallenge ${challengeRes.status}`);
  const challenge = (await challengeRes.json()) as { challenge: string; timestamp: string };

  // 2) Zaszyfrowanie tokenu kluczem publicznym MF (token|epochMillis)
  const epochMs = Date.parse(challenge.timestamp);
  const encrypted = publicEncrypt(
    { key: mfPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(`${token}|${epochMs}`, "utf8"),
  ).toString("base64");

  // 3) InitToken — utworzenie sesji interaktywnej
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

  // 4) Wysłanie faktury
  const sendBody = {
    invoiceHash: { hashSHA: { algorithm: "SHA-256", encoding: "Base64", value: hash }, fileSize: Buffer.byteLength(faXml, "utf8") },
    invoicePayload: { type: "plain", invoiceBody: Buffer.from(faXml, "utf8").toString("base64") },
  };
  const sendRes = await fetch(`${base}/api/online/Invoice/Send`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json", SessionToken: sessionToken },
    body: JSON.stringify(sendBody),
  });
  if (!sendRes.ok) throw new Error(`Invoice/Send ${sendRes.status}`);
  const sent = (await sendRes.json()) as { elementReferenceNumber?: string; referenceNumber?: string };
  const elementRef = sent.elementReferenceNumber ?? sent.referenceNumber ?? null;

  // Status/UPO pobierane asynchronicznie (osobny krok „odśwież status”).
  return {
    status: "pending",
    elementReference: elementRef,
    message: "Faktura przyjęta do KSeF — oczekuje na UPO. Odśwież status, aby pobrać numer KSeF i UPO.",
  };
}
