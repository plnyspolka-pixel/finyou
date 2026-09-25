// Klient KSeF (Krajowy System e-Faktur).
// Tryby:
//  - 'disabled' / brak tokenu → faktura nie jest wysyłana do KSeF (status 'disabled').
//  - tryb MOCK (token zaczyna się od "mock:" lub KSEF_MOCK=true) → symulacja akceptacji,
//    do demonstracji i testów przepływu bez realnego połączenia.
//  - tryb realny → KSeF 2.0: uwierzytelnienie tokenem (session.ts) i wysyłka FA(3)
//    w sesji interaktywnej (online.ts).
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
  /** Numer KSeF faktury (po przyjęciu; przy duplikacie — numer oryginału). */
  referenceNumber?: string | null;
  elementReference?: string | null;
  /** Numer referencyjny sesji interaktywnej i faktury — do sprawdzania statusu. */
  sessionReference?: string | null;
  invoiceReference?: string | null;
  /** Kod statusu faktury z KSeF (100/150/200/4xx). */
  statusCode?: number | null;
  /** Czy faktura mogła dotrzeć do KSeF (jeśli tak — nie wysyłać ponownie bez sprawdzenia). */
  sent?: boolean;
  upoXml?: string | null;
  message?: string | null;
};

/** Środowisko i token, którymi podmiot faktycznie łączy się z KSeF (null = wyłączony). */
export function effectiveKsef(
  entity: KsefEntity,
): { environment: KsefEnvironment; token: string } | null {
  const envToken = pickEnvToken(entity);
  const environment: KsefEnvironment =
    entity.ksef_environment && entity.ksef_environment !== "disabled"
      ? entity.ksef_environment
      : envToken
        ? "prod"
        : "disabled";
  if (environment === "disabled") return null;
  const token = decryptSensitive(entity.ksef_token_encrypted) ?? envToken;
  return token ? { environment, token } : null;
}

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

/** Wysyła fakturę FA(3) do KSeF (lub symuluje w trybie mock). */
export async function ksefSubmitInvoice(entity: KsefEntity, faXml: string): Promise<KsefResult> {
  const eff = effectiveKsef(entity);
  if (!eff) return { status: "disabled", message: "KSeF wyłączony albo brak tokenu dla podmiotu." };

  if (isMock(eff.token)) {
    const hash = sha256Base64(faXml);
    const ref = `MOCK-KSEF-${entity.ksef_nip ?? "NIP"}-${hash.slice(0, 10).replace(/[^A-Za-z0-9]/g, "")}`;
    const upo = `<?xml version="1.0" encoding="UTF-8"?><UPO><Symulacja>true</Symulacja><NumerReferencyjny>${ref}</NumerReferencyjny></UPO>`;
    return {
      status: "accepted",
      referenceNumber: ref,
      elementReference: ref,
      sessionReference: `MOCK-SESSION-${hash.slice(0, 8)}`,
      invoiceReference: `MOCK-INVOICE-${hash.slice(0, 8)}`,
      statusCode: 200,
      sent: true,
      upoXml: upo,
      message: "Tryb testowy (mock) — faktura nie została wysłana do realnego KSeF.",
    };
  }

  const { sendInvoiceOnline } = await import("./online");
  return sendInvoiceOnline({ ...entity, ksef_environment: eff.environment }, faXml);
}

/** Sprawdza status faktury wysłanej wcześniej (sesja + numer referencyjny faktury). */
export async function ksefCheckInvoice(
  entity: KsefEntity,
  sessionReference: string,
  invoiceReference: string,
): Promise<KsefResult> {
  const eff = effectiveKsef(entity);
  if (!eff) return { status: "pending", message: "KSeF wyłączony albo brak tokenu dla podmiotu." };
  if (isMock(eff.token)) return { status: "accepted", statusCode: 200, sent: true };
  const { checkInvoiceOnline } = await import("./online");
  return checkInvoiceOnline(
    { ...entity, ksef_environment: eff.environment },
    sessionReference,
    invoiceReference,
  );
}
