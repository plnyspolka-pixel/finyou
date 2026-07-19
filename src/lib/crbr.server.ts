// Integracja z CRBR (Centralny Rejestr Beneficjentów Rzeczywistych, MF).
// Oficjalny endpoint SOAP: https://bramka.crbr.mf.gov.pl:5058/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/2022/12/01
// Wymaga podpisu XAdES kwalifikowanym certyfikatem + rejestracji podmiotu w MF.
//
// STAN OBECNY:
// - Cache 90 dni w tabeli `crbr_cache` (klucz: znormalizowany NIP).
// - Bez CRBR_CERT_PEM/CRBR_KEY_PEM zwracamy `{ status: "not_configured" }`.
// - Opcjonalnie przez `CRBR_PROXY_URL` można wskazać zewnętrzny proxy
//   (własny serwer z certyfikatem MF), który przyjmie `{ nip }` i odda już
//   sparsowaną odpowiedź `{ spolka, beneficjenci, raw }`. Cloudflare Workers
//   nie obsługują mTLS przez `fetch`, więc dopóki proxy nie stoi — status
//   pozostaje `not_configured`.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CrbrBeneficiary = {
  firstName: string;
  lastName: string;
  pesel?: string | null;
  dateOfBirth?: string | null;
  citizenships?: string[];
  role?: string | null; // charakter uprawnienia
  sharePercent?: number | null;
};

export type CrbrCompanyInfo = {
  nip: string;
  krs?: string | null;
  name?: string | null;
  legalForm?: string | null;
};

export type CrbrLookupResult =
  | {
      status: "ok";
      cached: boolean;
      fetchedAt: string;
      expiresAt: string;
      spolka: CrbrCompanyInfo;
      beneficjenci: CrbrBeneficiary[];
    }
  | { status: "not_found"; cached: boolean; fetchedAt: string; message: string }
  | { status: "not_configured"; message: string }
  | { status: "error"; code: string; message: string };

const CACHE_TTL_DAYS = 90;

export function normalizeNip(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").replace(/[\s\-_.]/g, "");
  return /^\d{10}$/.test(cleaned) ? cleaned : null;
}

export function hasCrbrConfig(): boolean {
  return Boolean(
    (process.env.CRBR_CERT_PEM && process.env.CRBR_KEY_PEM) || process.env.CRBR_PROXY_URL,
  );
}

async function readFromCache(nip: string): Promise<CrbrLookupResult | null> {
  const { data } = await supabaseAdmin
    .from("crbr_cache")
    .select("*")
    .eq("nip", nip)
    .maybeSingle();
  if (!data) return null;
  const expired = new Date(data.expires_at as string).getTime() < Date.now();
  if (expired) return null;
  if (data.error_code) {
    return {
      status: "not_found",
      cached: true,
      fetchedAt: data.fetched_at as string,
      message: (data.error_message as string) ?? "Brak wpisu w CRBR",
    };
  }
  return {
    status: "ok",
    cached: true,
    fetchedAt: data.fetched_at as string,
    expiresAt: data.expires_at as string,
    spolka: {
      nip,
      krs: (data.krs as string) ?? null,
      name: (data.nazwa_spolki as string) ?? null,
      legalForm: (data.forma_organizacyjna as string) ?? null,
    },
    beneficjenci: (data.beneficjenci as any[]) ?? [],
  };
}

async function writeCache(
  nip: string,
  patch: {
    krs?: string | null;
    name?: string | null;
    legalForm?: string | null;
    beneficjenci?: CrbrBeneficiary[];
    raw?: any;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) {
  const now = new Date();
  const expires = new Date(now.getTime() + CACHE_TTL_DAYS * 24 * 3600 * 1000);
  await supabaseAdmin
    .from("crbr_cache")
    .upsert(
      {
        nip,
        krs: patch.krs ?? null,
        nazwa_spolki: patch.name ?? null,
        forma_organizacyjna: patch.legalForm ?? null,
        beneficjenci: (patch.beneficjenci ?? []) as any,
        raw_response: patch.raw ?? null,
        error_code: patch.errorCode ?? null,
        error_message: patch.errorMessage ?? null,
        fetched_at: now.toISOString(),
        expires_at: expires.toISOString(),
      },
      { onConflict: "nip" },
    );
}

async function fetchViaProxy(nip: string): Promise<CrbrLookupResult> {
  const url = process.env.CRBR_PROXY_URL!;
  const token = process.env.CRBR_PROXY_TOKEN;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ nip }),
    });
    if (res.status === 404) {
      await writeCache(nip, { errorCode: "NOT_FOUND", errorMessage: "Brak wpisu w CRBR" });
      return { status: "not_found", cached: false, fetchedAt: new Date().toISOString(), message: "Brak wpisu w CRBR" };
    }
    if (!res.ok) {
      const text = await res.text();
      return { status: "error", code: `HTTP_${res.status}`, message: text.slice(0, 300) };
    }
    const json: any = await res.json();
    const beneficjenci: CrbrBeneficiary[] = Array.isArray(json.beneficjenci)
      ? json.beneficjenci
      : [];
    await writeCache(nip, {
      krs: json.spolka?.krs ?? null,
      name: json.spolka?.name ?? null,
      legalForm: json.spolka?.legalForm ?? null,
      beneficjenci,
      raw: json.raw ?? json,
    });
    const now = new Date();
    return {
      status: "ok",
      cached: false,
      fetchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CACHE_TTL_DAYS * 24 * 3600 * 1000).toISOString(),
      spolka: { nip, krs: json.spolka?.krs ?? null, name: json.spolka?.name ?? null, legalForm: json.spolka?.legalForm ?? null },
      beneficjenci,
    };
  } catch (e: any) {
    return { status: "error", code: "PROXY_ERROR", message: e?.message ?? "Proxy CRBR error" };
  }
}

/**
 * Pobiera dane z CRBR z cachem 90-dniowym.
 * Priorytet: cache → proxy (`CRBR_PROXY_URL`) → `not_configured`.
 * Bezpośredni SOAP z Workerów wymaga mTLS + XAdES — nierealne bez proxy.
 */
export async function fetchCrbrByNip(nipInput: string, opts?: { force?: boolean }): Promise<CrbrLookupResult> {
  const nip = normalizeNip(nipInput);
  if (!nip) return { status: "error", code: "INVALID_NIP", message: "Nieprawidłowy NIP" };

  if (!opts?.force) {
    const cached = await readFromCache(nip);
    if (cached) return cached;
  }
  if (process.env.CRBR_PROXY_URL) return fetchViaProxy(nip);

  return {
    status: "not_configured",
    message:
      "CRBR nie skonfigurowany. Wymagane: certyfikat kwalifikowany MF + rejestracja podmiotu, wystawione przez proxy pod CRBR_PROXY_URL.",
  };
}

/**
 * Prosty AML dla KW: sprawdza, czy imię+nazwisko właściciela występuje wśród
 * beneficjentów rzeczywistych spółki.
 * Zwraca: `ok` (dopasowanie), `mismatch` (brak dopasowania), `missing` (brak wpisu CRBR),
 * `not_configured`, `error`.
 */
export function matchOwnerAgainstBeneficiaries(
  ownerFullNames: string[],
  beneficjenci: CrbrBeneficiary[],
): "ok" | "mismatch" {
  const norm = (s: string) => s.toLocaleLowerCase("pl-PL").normalize("NFKD").replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ").trim();
  const owners = ownerFullNames.map(norm).filter(Boolean);
  const bens = beneficjenci.map((b) => norm(`${b.firstName} ${b.lastName}`));
  const hit = owners.some((o) => bens.some((b) => b && (b === o || b.includes(o) || o.includes(b))));
  return hit ? "ok" : "mismatch";
}
