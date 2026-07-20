// Certyfikat szyfrujący GIIF — pobierany dynamicznie z publicznego,
// nieuwierzytelnianego endpointu SI*GIIF:
//
//   GET {GIIF_BASE_URL}/certyfikatSzyfrowania
//   Accept: application/x-pem-file
//
// (dokumentacja publiczna: https://giif.mofnet.gov.pl/api/)
//
// Zasady:
//  - walidacja formatu PEM/X.509, odczyt fingerprintu SHA-256 (z DER)
//    i okresu ważności,
//  - cache w pamięci przez ograniczony czas; wymuszone odświeżenie przed
//    wysyłką, gdy certyfikat wygasł albo zbliża się koniec ważności,
//  - fingerprint użyty do zaszyfrowania KONKRETNEGO zgłoszenia zapisuje
//    wywołujący (aml_reports.encryption_cert_fingerprint + audit),
//  - NIE logujemy pełnego certyfikatu — wyłącznie fingerprint i daty,
//  - sekret GIIF_ENCRYPTION_CERT_PEM to JAWNIE oznaczony fallback wyłącznie
//    dla testów lokalnych i trybu GIIF_MOCK — produkcja zawsze pobiera
//    certyfikat z endpointu.
import { createHash, X509Certificate } from "node:crypto";
import { giifBaseUrl } from "@/lib/aml/giif-connector.server";
import { pemToDer } from "@/lib/aml/crypto.server";

export interface GiifEncryptionCert {
  pem: string;
  /** SHA-256 z DER certyfikatu, hex, małe litery. */
  fingerprintSha256: string;
  validFrom: string;
  validTo: string;
  source: "giif_endpoint" | "local_fallback";
  fetchedAt: string;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h
const EXPIRY_MARGIN_MS = 24 * 60 * 60 * 1000; // odśwież, gdy < 24 h ważności

const cache = new Map<string, { cert: GiifEncryptionCert; expiresAt: number }>();

function parseAndValidate(pem: string, source: GiifEncryptionCert["source"]): GiifEncryptionCert {
  if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(pem)) {
    throw new Error("Odpowiedź nie jest certyfikatem w formacie PEM.");
  }
  const cert = new X509Certificate(pem); // rzuca przy niepoprawnym X.509
  const fingerprint = createHash("sha256").update(pemToDer(pem)).digest("hex");
  const validTo = new Date(cert.validTo);
  if (Number.isNaN(validTo.getTime()) || validTo.getTime() < Date.now()) {
    throw new Error(`Certyfikat szyfrujący GIIF wygasł (${cert.validTo}).`);
  }
  return {
    pem,
    fingerprintSha256: fingerprint,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    source,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchFromGiif(environment: "test" | "production"): Promise<GiifEncryptionCert> {
  const res = await fetch(`${giifBaseUrl(environment)}/certyfikatSzyfrowania`, {
    method: "GET",
    headers: { Accept: "application/x-pem-file" },
  });
  if (!res.ok) throw new Error(`GET /certyfikatSzyfrowania HTTP ${res.status}`);
  return parseAndValidate(await res.text(), "giif_endpoint");
}

/**
 * Zwraca aktualny certyfikat szyfrujący GIIF dla środowiska. Cache 6 h;
 * wymusza świeży certyfikat, gdy zbliża się koniec ważności. Fallback na
 * GIIF_ENCRYPTION_CERT_PEM działa wyłącznie w trybie mock/testach lokalnych.
 */
export async function getGiifEncryptionCert(
  environment: "test" | "production",
): Promise<GiifEncryptionCert> {
  const cached = cache.get(environment);
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    new Date(cached.cert.validTo).getTime() - Date.now() > EXPIRY_MARGIN_MS
  ) {
    return cached.cert;
  }

  try {
    const cert = await fetchFromGiif(environment);
    cache.set(environment, { cert, expiresAt: Date.now() + CACHE_TTL_MS });
    console.info(
      `[AML] Certyfikat szyfrujący GIIF (${environment}): fingerprint ${cert.fingerprintSha256.slice(0, 16)}…, ważny do ${cert.validTo}`,
    );
    return cert;
  } catch (e) {
    // Fallback WYŁĄCZNIE dla testów lokalnych / mocka.
    const fallback = process.env.GIIF_ENCRYPTION_CERT_PEM;
    if (fallback && process.env.GIIF_MOCK === "true") {
      const cert = parseAndValidate(fallback, "local_fallback");
      console.warn(
        `[AML] Używam lokalnego fallbacku certyfikatu szyfrującego (GIIF_MOCK) — fingerprint ${cert.fingerprintSha256.slice(0, 16)}…. To NIE jest tryb produkcyjny.`,
      );
      return cert;
    }
    throw new Error(
      `Nie udało się pobrać certyfikatu szyfrującego GIIF (${environment}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
