// GiifMtlsProvider — warstwa mTLS dla połączeń z SI*GIIF.
//
// Każdy inwestor ma WŁASNY certyfikat komunikacyjny SI*GIIF, więc jeden
// binding Cloudflare nie może być rozwiązaniem produkcyjnym dla wielu
// organizacji (bindingi mTLS są konfigurowane per Worker:
// https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/).
//
// Implementacje:
//  - MockGiifMtlsProvider           — testy lokalne (GIIF_MOCK=true),
//  - CloudflareTestGiifMtlsProvider — JEDEN testowy certyfikat Finance You
//    przez binding GIIF_MTLS (środowisko testowe SI*GIIF),
//  - ProductionGiifMtlsProvider     — wydzielona usługa backendowa w UE
//    (GIIF_MTLS_PROXY_URL), która dynamicznie wybiera certyfikat kliencki
//    właściwy dla organizationId; przed żądaniem walidujemy organizację,
//    NIP, identyfikator/status/ważność certyfikatu i jego przynależność.
//
// Frontend NIGDY nie wskazuje certyfikatu ani bindingu — wybór następuje
// wyłącznie po stronie serwera na podstawie organizationId (user_id).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface GiifMtlsRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array | string;
}

export interface GiifMtlsProvider {
  name: string;
  fetchForOrganization(organizationId: string, request: GiifMtlsRequest): Promise<Response>;
}

class MockGiifMtlsProvider implements GiifMtlsProvider {
  name = "MockGiifMtlsProvider";
  async fetchForOrganization(_organizationId: string, request: GiifMtlsRequest): Promise<Response> {
    // Mock nie wychodzi w sieć — connector w trybie GIIF_MOCK sam symuluje
    // odpowiedzi; ten provider istnieje, żeby przepływ wyboru providera był
    // identyczny jak w środowiskach realnych.
    return new Response(JSON.stringify({ mock: true, url: request.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

class CloudflareTestGiifMtlsProvider implements GiifMtlsProvider {
  name = "CloudflareTestGiifMtlsProvider";
  async fetchForOrganization(_organizationId: string, request: GiifMtlsRequest): Promise<Response> {
    const binding = (globalThis as Record<string, unknown>).GIIF_MTLS as
      | { fetch: typeof fetch }
      | undefined;
    const doFetch = binding ? binding.fetch.bind(binding) : fetch;
    return doFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body as BodyInit | undefined,
    });
  }
}

class ProductionGiifMtlsProvider implements GiifMtlsProvider {
  name = "ProductionGiifMtlsProvider";

  private proxyUrl(): string {
    const url = process.env.GIIF_MTLS_PROXY_URL;
    if (!url) {
      throw new Error(
        "Produkcyjne mTLS wymaga GIIF_MTLS_PROXY_URL — wydzielonej usługi backendowej w UE z dynamicznym wyborem certyfikatu klienta. Jeden binding Cloudflare nie obsłuży wielu inwestorów.",
      );
    }
    return url.replace(/\/$/, "");
  }

  /** Walidacja przed żądaniem: organizacja, NIP, certyfikat (status, ważność, przynależność). */
  private async validate(organizationId: string): Promise<{ certificateId: string; nip: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabele aml_* nie są jeszcze w wygenerowanych typach Database
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { data: settings } = await db
      .from("aml_settings")
      .select("institution, giif_environment")
      .eq("user_id", organizationId)
      .maybeSingle();
    const nip = String(settings?.institution?.nip ?? "").replace(/\D/g, "");
    if (!nip) throw new Error("Organizacja nie ma NIP w ustawieniach AML — mTLS odrzucone.");
    if (settings?.giif_environment !== "production") {
      throw new Error("Organizacja nie jest przełączona na środowisko produkcyjne SI*GIIF.");
    }
    const { data: cert } = await db
      .from("aml_certificates")
      .select("id, status, environment, valid_to, user_id")
      .eq("user_id", organizationId)
      .eq("environment", "production")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cert)
      throw new Error("Brak aktywnego produkcyjnego certyfikatu komunikacyjnego organizacji.");
    if (cert.user_id !== organizationId)
      throw new Error("Certyfikat nie należy do tej organizacji.");
    if (cert.valid_to && new Date(cert.valid_to).getTime() < Date.now()) {
      throw new Error("Certyfikat komunikacyjny organizacji wygasł.");
    }
    return { certificateId: cert.id, nip };
  }

  async fetchForOrganization(organizationId: string, request: GiifMtlsRequest): Promise<Response> {
    const { certificateId, nip } = await this.validate(organizationId);
    // Usługa proxy (UE) terminuje mTLS certyfikatem wskazanej organizacji.
    return fetch(`${this.proxyUrl()}/v1/giif-fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GIIF_MTLS_PROXY_TOKEN ?? ""}`,
      },
      body: JSON.stringify({
        organizationId,
        nip,
        certificateId,
        environment: "production",
        request: {
          url: request.url,
          method: request.method,
          headers: request.headers,
          bodyBase64: request.body
            ? Buffer.from(
                typeof request.body === "string"
                  ? new TextEncoder().encode(request.body)
                  : request.body,
              ).toString("base64")
            : null,
        },
      }),
    });
  }
}

/** Wybór providera — wyłącznie po stronie serwera, nigdy z frontendu. */
export function getGiifMtlsProvider(environment: "test" | "production"): GiifMtlsProvider {
  if (process.env.GIIF_MOCK === "true") return new MockGiifMtlsProvider();
  if (environment === "production") return new ProductionGiifMtlsProvider();
  return new CloudflareTestGiifMtlsProvider();
}
