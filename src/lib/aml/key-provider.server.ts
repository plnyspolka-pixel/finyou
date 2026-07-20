// AmlKeyProvider — abstrakcja szyfrowania kluczy prywatnych certyfikatów
// komunikacyjnych SI*GIIF.
//
//  - LocalEnvelopeKeyProvider: lokalna koperta AES-256-GCM na sekrecie
//    AML_ENVELOPE_MASTER_KEY. To NIE jest KMS/HSM — dopuszczone wyłącznie
//    do testów i developmentu (productionApproved = false).
//  - ProductionKmsKeyProvider: produkcyjny KMS/HSM za dedykowanym backendem
//    (AML_KMS_ENDPOINT + AML_KMS_TOKEN). Wymagany do produkcyjnego
//    przechowywania kluczy certyfikatów GIIF.
//
// Wybór: env AML_KEY_PROVIDER = "local" (domyślnie) | "production".
import { envelopeEncrypt, envelopeDecrypt } from "@/lib/aml/crypto.server";

export interface AmlKeyProviderInfo {
  name: string;
  /** Czy wolno używać tego providera do produkcyjnych kluczy certyfikatów GIIF. */
  productionApproved: boolean;
  description: string;
}

export interface AmlKeyProvider {
  info(): AmlKeyProviderInfo;
  /** Szyfruje materiał klucza dla organizacji; zwraca kopertę i referencję. */
  encrypt(
    organizationId: string,
    plaintext: string,
  ): Promise<{ ciphertext: string; keyRef: string }>;
  /** Odszyfrowuje kopertę dla organizacji. */
  decrypt(organizationId: string, ciphertext: string): Promise<string>;
}

class LocalEnvelopeKeyProvider implements AmlKeyProvider {
  info(): AmlKeyProviderInfo {
    return {
      name: "LocalEnvelopeKeyProvider",
      productionApproved: false,
      description:
        "Lokalna koperta AES-256-GCM (AML_ENVELOPE_MASTER_KEY). Nie jest KMS/HSM — niedopuszczona do produkcyjnego przechowywania kluczy certyfikatów GIIF.",
    };
  }
  async encrypt(_organizationId: string, plaintext: string) {
    const { envelope, keyRef } = envelopeEncrypt(plaintext);
    return { ciphertext: envelope, keyRef };
  }
  async decrypt(_organizationId: string, ciphertext: string) {
    return envelopeDecrypt(ciphertext);
  }
}

class ProductionKmsKeyProvider implements AmlKeyProvider {
  info(): AmlKeyProviderInfo {
    return {
      name: "ProductionKmsKeyProvider",
      productionApproved: true,
      description: "Produkcyjny KMS/HSM (AML_KMS_ENDPOINT) — klucz nigdy nie opuszcza KMS-a.",
    };
  }
  private endpoint(): string {
    const url = process.env.AML_KMS_ENDPOINT;
    if (!url) {
      throw new Error(
        "AML_KEY_PROVIDER=production wymaga AML_KMS_ENDPOINT (usługa KMS/HSM). Bez niej klucze certyfikatów GIIF nie mogą być przechowywane produkcyjnie.",
      );
    }
    return url.replace(/\/$/, "");
  }
  private async call(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.endpoint()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AML_KMS_TOKEN ?? ""}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`KMS ${path} HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }
  async encrypt(organizationId: string, plaintext: string) {
    const out = await this.call("/v1/encrypt", { organizationId, plaintext });
    return { ciphertext: String(out.ciphertext), keyRef: String(out.keyRef) };
  }
  async decrypt(organizationId: string, ciphertext: string) {
    const out = await this.call("/v1/decrypt", { organizationId, ciphertext });
    return String(out.plaintext);
  }
}

export function getAmlKeyProvider(): AmlKeyProvider {
  return process.env.AML_KEY_PROVIDER === "production"
    ? new ProductionKmsKeyProvider()
    : new LocalEnvelopeKeyProvider();
}
