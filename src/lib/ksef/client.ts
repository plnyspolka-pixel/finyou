// Klient KSeF (Krajowy System e-Faktur).
// Tryby:
//  - 'disabled' / brak tokenu → faktura nie jest wysyłana do KSeF (status 'disabled').
//  - tryb MOCK (token zaczyna się od "mock:" lub KSEF_MOCK=true) → symulacja akceptacji,
//    do demonstracji i testów przepływu bez realnego połączenia.
//  - tryb realny → wywołania API KSeF (challenge → InitToken → Send → Status).
//    WYMAGA klucza publicznego MF (KSEF_MF_PUBLIC_KEY, PEM) do zaszyfrowania tokenu
//    autoryzacyjnego oraz weryfikacji względem aktualnej wersji API. Przed produkcją
//    potwierdź endpointy i format żądań dla wersji FA(2)/FA(3) / KSeF 2.0.
import { createHash } from "node:crypto";
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
  return process.env.KSEF_TOKEN_FINANCE_YOU ?? process.env.KSEF_TOKEN_FUNDACJA_IM_PIECZAKA ?? null;
}

export type KsefResult = {
  status: "disabled" | "pending" | "accepted" | "rejected" | "error";
  referenceNumber?: string | null;
  elementReference?: string | null;
  upoXml?: string | null;
  message?: string | null;
};

export function ksefBaseUrl(env: KsefEnvironment): string | null {
  // KSeF 2.0 (API v2). API 1.0 zostało wyłączone.
  switch (env) {
    case "test":
      return "https://api-test.ksef.mf.gov.pl";
    case "demo":
      return "https://api-demo.ksef.mf.gov.pl";
    case "prod":
      return "https://api.ksef.mf.gov.pl";
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
  // Fallback: jeśli podmiot nie ma jeszcze tokenu / środowiska, użyj globalnego tokenu z env (dopasowanego do podmiotu).
  const envToken = pickEnvToken(entity);
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
    return {
      status: "accepted",
      referenceNumber: ref,
      elementReference: ref,
      upoXml: upo,
      message: "Tryb testowy (mock) — faktura nie została wysłana do realnego KSeF.",
    };
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
// Realne wysyłanie faktury w KSeF 2.0 (szkielet). Sesję otwieramy przez
// nowy openKsefSession (Bearer accessToken). Endpoint POST /api/v2/invoices/send
// wymaga jeszcze zaszyfrowanego symetrycznie payloadu (klucz z certyfikatu
// SymmetricKeyEncryption). Zamiast wysyłać niepoprawnie, zwracamy 'pending'
// z jasnym komunikatem — flow księgowy zapisuje fakturę i można ją potem wypchnąć
// ręcznie, kiedy wdrożymy pełne szyfrowanie payloadu.
async function ksefRealSubmit(
  _base: string,
  entity: KsefEntity,
  _token: string,
  _faXml: string,
  _hash: string,
): Promise<KsefResult> {
  const { openKsefSession, closeKsefSession } = await import("./session");
  try {
    const session = await openKsefSession(entity);
    await closeKsefSession(session);
    return {
      status: "pending",
      message:
        "KSeF 2.0: autoryzacja OK, ale wysyłka faktur wymaga jeszcze szyfrowania payloadu SymmetricKeyEncryption. Faktura oczekuje na wysłanie.",
    };
  } catch (e) {
    return { status: "error", message: `KSeF 2.0 auth: ${(e as Error).message}` };
  }
}
