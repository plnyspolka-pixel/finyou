// Bezpośrednia integracja z oficjalnym API CRBR Ministerstwa Finansów.
// SOAP 1.2, publiczne, bez uwierzytelniania.
// Endpoint: https://bramka-crbr.mf.gov.pl:5058/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/2022/12/01
// Operacja: PobierzInformacjeOSpolkachIBeneficjentach
//
// Cache 90 dni w tabeli `crbr_cache` (klucz: NIP; dla wyszukiwań po KRS/nazwie
// cachujemy po znalezionym NIP-ie spółki).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { XMLParser } from "fast-xml-parser";

const ENDPOINT =
  "https://bramka-crbr.mf.gov.pl:5058/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/2022/12/01";
const CACHE_TTL_DAYS = 90;

export type CrbrBeneficiary = {
  firstName: string;
  lastName: string;
  pesel?: string | null;
  dateOfBirth?: string | null;
  citizenships?: string[];
  countryOfResidence?: string | null;
  role?: string | null; // charakter uprawnienia (opis)
  sharePercent?: number | null;
};

export type CrbrRepresentative = {
  firstName: string;
  lastName: string;
  pesel?: string | null;
  function?: string | null;
  citizenships?: string[];
  countryOfResidence?: string | null;
};

export type CrbrAddress = {
  postalCode?: string | null;
  city?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  apartmentNumber?: string | null;
  wojewodztwo?: string | null;
  powiat?: string | null;
  gmina?: string | null;
};

export type CrbrCompanyInfo = {
  nip?: string | null;
  krs?: string | null;
  name?: string | null;
  legalForm?: string | null;
  address?: CrbrAddress | null;
};

export type CrbrLookupResult =
  | {
      status: "ok";
      cached: boolean;
      fetchedAt: string;
      expiresAt: string;
      requestId?: string | null;
      requestDate?: string | null;
      company: CrbrCompanyInfo;
      beneficialOwners: CrbrBeneficiary[];
      representatives: CrbrRepresentative[];
      matches?: CrbrCompanyInfo[]; // gdy wyszukiwanie po nazwie zwróciło wiele
      source: "CRBR Ministerstwa Finansów";
    }
  | {
      status: "not_found";
      cached: boolean;
      fetchedAt: string;
      message: string;
      requestId?: string | null;
    }
  | {
      status: "multiple";
      matches: CrbrCompanyInfo[];
      message: string;
    }
  | { status: "invalid_input"; code: string; message: string }
  | { status: "error"; code: string; message: string };

// ---------- helpers ----------

export function normalizeNip(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").replace(/[\s\-_.]/g, "");
  return /^\d{10}$/.test(cleaned) ? cleaned : null;
}

export function normalizeKrs(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").replace(/[\s\-_.]/g, "");
  if (!/^\d{1,10}$/.test(cleaned)) return null;
  return cleaned.padStart(10, "0");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSoap(field: "NIP" | "KRS" | "Nazwa", value: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://www.mf.gov.pl/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/2022/12/01" xmlns:ns1="http://www.mf.gov.pl/schematy/AP/ApiPrzegladoweCRBR/2022/12/01">
<soap:Header/>
<soap:Body>
<ns:PobierzInformacjeOSpolkachIBeneficjentach>
<PobierzInformacjeOSpolkachIBeneficjentachDane>
<ns1:SzczegolyWniosku><ns1:${field}>${xmlEscape(value)}</ns1:${field}></ns1:SzczegolyWniosku>
</PobierzInformacjeOSpolkachIBeneficjentachDane>
</ns:PobierzInformacjeOSpolkachIBeneficjentach>
</soap:Body></soap:Envelope>`;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) =>
    [
      "SpolkaIBeneficjenci",
      "BeneficjentRzeczywisty",
      "Zglaszajacy",
      "InformacjaOUdzialach",
      "Funkcja",
    ].includes(name),
});

function toArr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function mapCitizenship(c: any): string[] {
  return toArr(c)
    .map((x: any) => (typeof x === "string" ? x : (x?.Nazwa ?? x?.Kod)))
    .filter(Boolean);
}

function mapAddress(s: any): CrbrAddress {
  const t = s?.Teryt ?? {};
  return {
    postalCode: s?.KodPocztowy ?? null,
    city: s?.Miejscowosc ?? null,
    street: s?.Ulica ?? null,
    houseNumber: s?.NrDomu ?? null,
    apartmentNumber: s?.NrLokalu ?? null,
    wojewodztwo: t?.Wojewodztwo ?? null,
    powiat: t?.Powiat ?? null,
    gmina: t?.Gmina ?? null,
  };
}

function mapCompany(sp: any): CrbrCompanyInfo {
  return {
    nip: sp?.NIP ?? null,
    krs: sp?.KRS ?? null,
    name: sp?.Nazwa ?? null,
    legalForm: sp?.OpisFormyOrganizacyjnej ?? sp?.KodFormyOrganizacyjnej ?? null,
    address: mapAddress(sp),
  };
}

function mapBeneficiary(b: any): CrbrBeneficiary {
  const shares = toArr(b?.ListaInformacjiOUdzialach?.InformacjaOUdzialach);
  const roleParts = shares
    .map(
      (s: any) =>
        s?.UprawnieniaWlascicielskieBezposrednie ??
        s?.UprawnieniaWlascicielskiePosrednie ??
        s?.Opis ??
        null,
    )
    .filter(Boolean);
  return {
    firstName: [b?.PierwszeImie, b?.KolejneImiona].filter(Boolean).join(" "),
    lastName: b?.Nazwisko ?? "",
    pesel: b?.PESEL ?? null,
    dateOfBirth: b?.DataUrodzenia ?? null,
    citizenships: mapCitizenship(b?.Obywatelstwo),
    countryOfResidence: b?.KrajZamieszkania?.Nazwa ?? null,
    role: roleParts.join(" | ") || null,
    sharePercent: null,
  };
}

function mapRepresentative(z: any): CrbrRepresentative {
  const funcs = toArr(z?.ListaFunkcjiZglaszajacego?.Funkcja);
  return {
    firstName: [z?.PierwszeImie, z?.KolejneImiona].filter(Boolean).join(" "),
    lastName: z?.Nazwisko ?? "",
    pesel: z?.PESEL ?? null,
    function:
      funcs
        .map((f: any) => f?.Opis)
        .filter(Boolean)
        .join(", ") || null,
    citizenships: mapCitizenship(z?.Obywatelstwo),
    countryOfResidence: z?.KrajZamieszkania?.Nazwa ?? null,
  };
}

// ---------- cache ----------

async function readFromCache(nip: string): Promise<CrbrLookupResult | null> {
  const { data } = await supabaseAdmin.from("crbr_cache").select("*").eq("nip", nip).maybeSingle();
  if (!data) return null;
  const expired = new Date(data.expires_at as string).getTime() < Date.now();
  if (expired) return null;
  if (data.error_code === "NOT_FOUND") {
    return {
      status: "not_found",
      cached: true,
      fetchedAt: data.fetched_at as string,
      message: (data.error_message as string) ?? "Brak wpisu w CRBR",
    };
  }
  const raw = (data.raw_response as any) ?? {};
  return {
    status: "ok",
    cached: true,
    fetchedAt: data.fetched_at as string,
    expiresAt: data.expires_at as string,
    requestId: raw?.requestId ?? null,
    requestDate: raw?.requestDate ?? null,
    company: {
      nip,
      krs: (data.krs as string) ?? null,
      name: (data.nazwa_spolki as string) ?? null,
      legalForm: (data.forma_organizacyjna as string) ?? null,
      address: raw?.company?.address ?? null,
    },
    beneficialOwners: ((data.beneficjenci as any[]) ?? []) as CrbrBeneficiary[],
    representatives: (raw?.representatives ?? []) as CrbrRepresentative[],
    source: "CRBR Ministerstwa Finansów",
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
  await supabaseAdmin.from("crbr_cache").upsert(
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

// ---------- SOAP call ----------

async function callCrbr(
  field: "NIP" | "KRS" | "Nazwa",
  value: string,
): Promise<{ ok: true; parsed: any } | { ok: false; code: string; message: string }> {
  const body = buildSoap(field, value);
  let res: Response;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25_000);
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(t));
  } catch (e: any) {
    if (e?.name === "AbortError")
      return { ok: false, code: "TIMEOUT", message: "Bramka CRBR nie odpowiedziała" };
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: e?.message ?? "Błąd sieci przy połączeniu z bramką CRBR",
    };
  }
  const text = await res.text();

  let parsed: any;
  try {
    parsed = parser.parse(text);
  } catch (e: any) {
    return { ok: false, code: "PARSE_ERROR", message: "Nieprawidłowa odpowiedź XML z CRBR" };
  }

  const fault = parsed?.Envelope?.Body?.Fault;
  if (fault) {
    const reason = fault?.Reason?.Text ?? fault?.faultstring ?? fault?.Code?.Value ?? "SOAP Fault";
    // Formalne błędy (np. zły NIP) mogą przychodzić jako fault
    return {
      ok: false,
      code: "SOAP_FAULT",
      message: typeof reason === "string" ? reason : JSON.stringify(reason),
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      code: `HTTP_${res.status}`,
      message: `Bramka CRBR zwróciła HTTP ${res.status}`,
    };
  }

  return { ok: true, parsed };
}

// ---------- główna funkcja ----------

type LookupInput = { nip?: string; krs?: string; nazwa?: string };

export async function fetchCrbr(
  input: LookupInput,
  opts?: { force?: boolean },
): Promise<CrbrLookupResult> {
  const nip = normalizeNip(input.nip);
  const krs = normalizeKrs(input.krs);
  const nazwa = (input.nazwa ?? "").trim();

  let field: "NIP" | "KRS" | "Nazwa";
  let value: string;
  if (nip) {
    field = "NIP";
    value = nip;
  } else if (krs) {
    field = "KRS";
    value = krs;
  } else if (nazwa.length >= 3) {
    field = "Nazwa";
    value = nazwa;
  } else {
    return {
      status: "invalid_input",
      code: "INVALID_INPUT",
      message: "Podaj poprawny NIP (10 cyfr), KRS lub nazwę spółki (min. 3 znaki).",
    };
  }

  // Cache tylko po NIP (najstabilniejszy klucz)
  if (field === "NIP" && !opts?.force) {
    const cached = await readFromCache(value);
    if (cached) return cached;
  }

  const call = await callCrbr(field, value);
  if (!call.ok) {
    // Formalne błędy nie zapisujemy do cache
    return { status: "error", code: call.code, message: call.message };
  }

  const body =
    call.parsed?.Envelope?.Body?.PobierzInformacjeOSpolkachIBeneficjentachOdpowiedz
      ?.PobierzInformacjeOSpolkachIBeneficjentachOdpowiedzDane;

  if (!body) {
    return {
      status: "error",
      code: "UNEXPECTED_RESPONSE",
      message: "Nieoczekiwana struktura odpowiedzi z CRBR",
    };
  }

  const status = body?.Status; // IstniejaInformacje | BrakInformacji | BladFormalny | ...
  const requestId = body?.IdentyfikatorWniosku ?? null;
  const requestDate = body?.DataICzasZlozeniaWniosku ?? null;

  if (status === "BladFormalny") {
    return {
      status: "error",
      code: "FORMAL_ERROR",
      message: `CRBR odrzuciło zapytanie (${field}=${value}) jako niepoprawne formalnie.`,
    };
  }

  if (status === "BrakInformacji") {
    if (field === "NIP") {
      await writeCache(value, { errorCode: "NOT_FOUND", errorMessage: "Brak wpisu w CRBR" });
    }
    return {
      status: "not_found",
      cached: false,
      fetchedAt: new Date().toISOString(),
      requestId,
      message: "Brak wpisu w CRBR dla podanego kryterium.",
    };
  }

  const list = toArr(body?.ListaInformacjiOSpolkachIBeneficjentach?.SpolkaIBeneficjenci);

  if (list.length === 0) {
    return {
      status: "not_found",
      cached: false,
      fetchedAt: new Date().toISOString(),
      requestId,
      message: "Brak wpisu w CRBR dla podanego kryterium.",
    };
  }

  // Wyszukiwanie po nazwie może zwrócić kilka spółek — zwróć listę do wyboru.
  if (field === "Nazwa" && list.length > 1) {
    return {
      status: "multiple",
      matches: list.map(mapCompany),
      message: `Znaleziono ${list.length} spółek — doprecyzuj wyszukiwanie po NIP lub KRS.`,
    };
  }

  const sp = list[0];
  const company = mapCompany(sp);
  const beneficialOwners = toArr(sp?.ListaBeneficjentowRzeczywistych?.BeneficjentRzeczywisty).map(
    mapBeneficiary,
  );
  const representatives = toArr(sp?.ListaZglaszajacych?.Zglaszajacy).map(mapRepresentative);

  const now = new Date();
  const raw = {
    requestId,
    requestDate,
    company,
    beneficialOwners,
    representatives,
    matches: list.length > 1 ? list.map(mapCompany) : undefined,
  };

  const cacheKey = company.nip ?? (field === "NIP" ? value : null);
  if (cacheKey) {
    await writeCache(cacheKey, {
      krs: company.krs,
      name: company.name,
      legalForm: company.legalForm,
      beneficjenci: beneficialOwners,
      raw,
    });
  }

  return {
    status: "ok",
    cached: false,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CACHE_TTL_DAYS * 24 * 3600 * 1000).toISOString(),
    requestId,
    requestDate,
    company,
    beneficialOwners,
    representatives,
    matches: list.length > 1 ? list.map(mapCompany) : undefined,
    source: "CRBR Ministerstwa Finansów",
  };
}

/** Kompatybilność wsteczna dla starych call-siteów. */
export async function fetchCrbrByNip(
  nipInput: string,
  opts?: { force?: boolean },
): Promise<CrbrLookupResult> {
  return fetchCrbr({ nip: nipInput }, opts);
}

// ---------- AML matcher ----------

export function matchOwnerAgainstBeneficiaries(
  ownerFullNames: string[],
  beneficjenci: CrbrBeneficiary[],
): "ok" | "mismatch" {
  const norm = (s: string) =>
    s
      .toLocaleLowerCase("pl-PL")
      .normalize("NFKD")
      .replace(/[^\p{L}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const owners = ownerFullNames.map(norm).filter(Boolean);
  const bens = beneficjenci.map((b) => norm(`${b.firstName} ${b.lastName}`));
  const hit = owners.some((o) =>
    bens.some((b) => b && (b === o || b.includes(o) || o.includes(b))),
  );
  return hit ? "ok" : "mismatch";
}

// Legacy dead helper — proxy już nie istnieje, ale komponenty mogą to importować.
export function hasCrbrConfig(): boolean {
  return true; // API CRBR jest publiczne, konfiguracja nie jest wymagana.
}
