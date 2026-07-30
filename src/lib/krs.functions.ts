// Integracja z oficjalnym API KRS Ministerstwa Sprawiedliwości.
// Endpoint: GET https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/{krs}?rejestr=P&format=json
// Bez klucza API. Cache 24h w tabeli krs_cache. Log w external_api_logs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const KRS_BASE = "https://api-krs.ms.gov.pl/api/krs";
const TIMEOUT_MS = 15000;

export type KrsAddress = {
  country: string;
  voivodeship: string;
  county: string;
  municipality: string;
  city: string;
  postalCode: string;
  street: string;
  buildingNumber: string;
  apartmentNumber: string;
  fullAddress: string;
};

export type KrsPerson = { firstName: string; lastName: string; role?: string; pesel?: string };

export type KrsCompany = {
  name: string;
  krs: string;
  nip: string;
  regon: string;
  legalForm: string;
  status: string;
  registrationDate: string;
  deletionDate: string;
  address: KrsAddress;
  court: string;
  shareCapital: string;
  representation: { method: string; bodyName: string; members: KrsPerson[] };
  managementBoard: KrsPerson[];
  supervisoryBoard: KrsPerson[];
  proxies: KrsPerson[];
  partnersOrShareholders: Array<{ name: string; share?: string; sharesCount?: string }>;
  pkd: { main: string; additional: string[] };
  flags: {
    liquidation: boolean;
    bankruptcy: boolean;
    restructuring: boolean;
    suspended: boolean;
    deleted: boolean;
    section4HasEntries: boolean;
    section5HasEntries: boolean;
    section6HasEntries: boolean;
    representationMissing: boolean;
  };
  sections: {
    section1: any;
    section2: any;
    section3: any;
    section4: any;
    section5: any;
    section6: any;
  };
  raw: any;
};

export type KrsLookupResult =
  | { success: true; source: string; searchType: "krs"; cached: boolean; company: KrsCompany }
  | {
      success: false;
      errorCode: "NOT_FOUND" | "INVALID_KRS" | "KRS_API_ERROR" | "KRS_TIMEOUT";
      message: string;
    };

// ---------- helpers ----------

function normalizeKrs(input: string): string | null {
  const cleaned = (input ?? "").replace(/[\s\-_.]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  if (cleaned.length === 0 || cleaned.length > 10) return null;
  return cleaned.padStart(10, "0");
}

function pickAddress(adr: any): KrsAddress {
  const a = adr ?? {};
  const street = a.ulica ?? "";
  const building = a.nrDomu ?? "";
  const apt = a.nrLokalu ?? "";
  const postal = a.kodPocztowy ?? "";
  const city = a.miejscowosc ?? "";
  const country = a.kraj ?? "POLSKA";
  const full = [
    [street, building].filter(Boolean).join(" ") + (apt ? `/${apt}` : ""),
    [postal, city].filter(Boolean).join(" "),
    country,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    country,
    voivodeship: a.wojewodztwo ?? "",
    county: a.powiat ?? "",
    municipality: a.gmina ?? "",
    city,
    postalCode: postal,
    street,
    buildingNumber: building,
    apartmentNumber: apt,
    fullAddress: full,
  };
}

function readLastName(n: any): string {
  if (!n) return "";
  if (typeof n === "string") return n;
  return n.nazwiskoICzlon ?? n.nazwisko ?? n.pierwszyCzlonNazwiska ?? "";
}

function pickPersonOsoba(o: any): KrsPerson {
  const dane = o?.daneOsoby ?? o ?? {};
  return {
    firstName:
      [dane.imiona?.imie, dane.imiona?.imieDrugie].filter(Boolean).join(" ").trim() ||
      dane.imiePierwsze ||
      "",
    lastName: readLastName(dane.nazwisko) || dane.nazwiskoIPierwszyCzlonNazwiskaZlozonego || "",
    pesel: dane.pesel ?? dane.identyfikator?.pesel ?? undefined,
  };
}

function pickPersonInOrgan(c: any): KrsPerson {
  const dane = c?.daneOsoby ?? c ?? {};
  return {
    firstName:
      [dane.imiona?.imie, dane.imiona?.imieDrugie].filter(Boolean).join(" ").trim() ||
      dane.imiePierwsze ||
      dane.imie ||
      "",
    lastName: readLastName(dane.nazwisko),
    role: c?.funkcjaWOrganie ?? c?.funkcja ?? dane?.funkcjaWOrganie ?? undefined,
    pesel: dane?.identyfikator?.pesel ?? dane?.pesel ?? undefined,
  };
}

function nonEmpty(v: any): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim().length > 0;
}

// ---------- map raw KRS response ----------

function mapKrs(raw: any, normalizedKrs: string): KrsCompany {
  const odpis = raw?.odpis ?? raw ?? {};
  const dane = odpis?.dane ?? {};
  const d1 = dane?.dzial1 ?? {};
  const d2 = dane?.dzial2 ?? {};
  const d3 = dane?.dzial3 ?? {};
  const d4 = dane?.dzial4 ?? {};
  const d5 = dane?.dzial5 ?? {};
  const d6 = dane?.dzial6 ?? {};

  const naglowek = odpis?.naglowekA ?? odpis?.naglowekP ?? odpis?.naglowek ?? {};

  // Dział 1 – podmiot
  const podmiot = d1?.danePodmiotu ?? {};
  const name = podmiot?.nazwa ?? "";
  const legalForm = podmiot?.formaPrawna ?? "";
  const nip = podmiot?.identyfikatory?.nip ?? "";
  const regon = podmiot?.identyfikatory?.regon ?? "";

  const siedziba = d1?.siedzibaIAdres ?? {};
  const address = pickAddress(siedziba?.adres);

  const kapitalSrc = d1?.kapital ?? {};
  const shareCapital = kapitalSrc?.wysokoscKapitaluZakladowego
    ? `${kapitalSrc.wysokoscKapitaluZakladowego.wartosc ?? ""} ${kapitalSrc.wysokoscKapitaluZakladowego.waluta ?? ""}`.trim()
    : "";
  const court = naglowek?.nazwaSaduRejestrowego ?? naglowek?.oznaczenieSaduRejestrowego ?? "";
  const registrationDate = naglowek?.dataRejestracjiWKRS ?? podmiot?.dataRejestracji ?? "";
  const deletionDate = naglowek?.dataDokonaniaWpisuWykreslenia ?? "";
  const status = deletionDate
    ? "Wykreślony z KRS"
    : d6?.likwidacja
      ? "W likwidacji"
      : d6?.postepowanieUpadlosciowe
        ? "W upadłości"
        : "Aktywny";

  // Dział 2 – reprezentacja / zarząd
  // Realne API KRS używa klucza `reprezentacja`; zostawiamy fallback do `organReprezentacji` na wszelki wypadek.
  const organReprezentacji = d2?.reprezentacja ?? d2?.organReprezentacji ?? {};
  const repMethod = organReprezentacji?.sposobReprezentacji ?? "";
  const repBody = organReprezentacji?.nazwaOrganu ?? "";
  const repMembersRaw = organReprezentacji?.sklad ?? organReprezentacji?.czlonkowieOrganu ?? [];
  const repMembers: KrsPerson[] = (Array.isArray(repMembersRaw) ? repMembersRaw : []).map(
    pickPersonInOrgan,
  );

  const zarzadSrc =
    organReprezentacji?.sklad ?? d2?.zarzad?.sklad ?? organReprezentacji?.czlonkowieOrganu ?? [];
  const managementBoard: KrsPerson[] = (Array.isArray(zarzadSrc) ? zarzadSrc : []).map(
    pickPersonInOrgan,
  );

  const nadzorSrc = d2?.organNadzoru?.sklad ?? d2?.organNadzoru?.czlonkowieOrganu ?? [];
  const supervisoryBoard: KrsPerson[] = (Array.isArray(nadzorSrc) ? nadzorSrc : []).map(
    pickPersonInOrgan,
  );

  const prokurenciSrc = d2?.prokurenci ?? d2?.prokura?.prokurenci ?? [];
  const proxies: KrsPerson[] = (Array.isArray(prokurenciSrc) ? prokurenciSrc : []).map(
    (p: any) => ({
      ...pickPersonOsoba(p),
      role: p?.rodzajProkury ?? "Prokurent",
    }),
  );

  // Wspólnicy / udziałowcy (różne lokalizacje)
  const wspolnicySrc = d1?.wspolnicySpzoo ?? d1?.wspolnicy ?? d1?.akcjonariusze ?? [];
  const partnersOrShareholders = (Array.isArray(wspolnicySrc) ? wspolnicySrc : []).map((w: any) => {
    const dn = w?.daneOsoby ?? w?.daneSpolki ?? w ?? {};
    const fullName =
      dn?.nazwa ||
      [dn?.imiona?.imie, dn?.imiona?.imieDrugie, readLastName(dn?.nazwisko)]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      "";

    const share = w?.udzialy?.wartoscUdzialow
      ? `${w.udzialy.wartoscUdzialow.wartosc ?? ""} ${w.udzialy.wartoscUdzialow.waluta ?? ""}`.trim()
      : "";
    const sharesCount = w?.udzialy?.liczbaUdzialow ?? w?.iloscPosiadanychUdzialow ?? undefined;
    return { name: fullName, share, sharesCount: sharesCount ? String(sharesCount) : undefined };
  });

  // Dział 3 – PKD
  const pkdSrc = d3?.przedmiotDzialalnosci?.przedmiotPrzewazajacejDzialalnosci ?? [];
  const pkdAddSrc = d3?.przedmiotDzialalnosci?.przedmiotPozostalejDzialalnosci ?? [];
  const pkdMain =
    Array.isArray(pkdSrc) && pkdSrc[0]
      ? `${pkdSrc[0].kodPkd ?? ""} ${pkdSrc[0].opis ?? ""}`.trim()
      : "";
  const pkdAdditional: string[] = (Array.isArray(pkdAddSrc) ? pkdAddSrc : []).map((p: any) =>
    `${p.kodPkd ?? ""} ${p.opis ?? ""}`.trim(),
  );

  // Flagi ryzyka
  const liquidation = nonEmpty(d6?.likwidacja);
  const bankruptcy = nonEmpty(d6?.postepowanieUpadlosciowe) || nonEmpty(d6?.postepowanieUkladowe);
  const restructuring =
    nonEmpty(d6?.postepowanieRestrukturyzacyjne) || nonEmpty(d6?.postepowanieNaprawcze);
  const suspended = nonEmpty(d6?.zawieszenieDzialalnosci);
  const deleted = nonEmpty(deletionDate) || nonEmpty(d6?.wykreslenie);
  const section4HasEntries =
    nonEmpty(d4?.zaleglosci) ||
    nonEmpty(d4?.wierzytelnosci) ||
    nonEmpty(d4?.zabezpieczenia) ||
    Object.keys(d4 || {}).length > 0;
  const section5HasEntries = nonEmpty(d5?.kurator) || Object.keys(d5 || {}).length > 0;
  const section6HasEntries = Object.keys(d6 || {}).length > 0;

  return {
    name,
    krs: normalizedKrs,
    nip,
    regon,
    legalForm,
    status,
    registrationDate,
    deletionDate,
    address,
    court,
    shareCapital,
    representation: { method: repMethod, bodyName: repBody, members: repMembers },
    managementBoard,
    supervisoryBoard,
    proxies,
    partnersOrShareholders,
    pkd: { main: pkdMain, additional: pkdAdditional },
    flags: {
      liquidation,
      bankruptcy,
      restructuring,
      suspended,
      deleted,
      section4HasEntries,
      section5HasEntries,
      section6HasEntries,
      representationMissing: !repMethod && repMembers.length === 0 && managementBoard.length === 0,
    },
    sections: {
      section1: d1,
      section2: d2,
      section3: d3,
      section4: d4,
      section5: d5,
      section6: d6,
    },
    raw,
  };
}

// ---------- HTTP fetch with timeout + 1 retry ----------

async function fetchKrsOnce(
  krs: string,
  rejestr: "P" | "S",
): Promise<{ status: number; body: any }> {
  const url = `${KRS_BASE}/OdpisAktualny/${krs}?rejestr=${rejestr}&format=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchKrs(
  krs: string,
): Promise<
  { ok: true; body: any } | { ok: false; code: "NOT_FOUND" | "KRS_API_ERROR" | "KRS_TIMEOUT" }
> {
  for (const rejestr of ["P", "S"] as const) {
    let attempt = 0;
    while (attempt < 2) {
      try {
        const { status, body } = await fetchKrsOnce(krs, rejestr);
        if (status === 200 && body && typeof body === "object" && body.odpis) {
          return { ok: true, body };
        }
        if (status === 404) break; // spróbuj kolejnego rejestru
        if (status >= 500) {
          attempt++;
          continue;
        }
        // 200 bez body lub inny status → spróbuj kolejnego rejestru
        break;
      } catch (e: any) {
        if (e?.name === "AbortError") return { ok: false, code: "KRS_TIMEOUT" };
        attempt++;
        if (attempt >= 2) return { ok: false, code: "KRS_API_ERROR" };
      }
    }
  }
  return { ok: false, code: "NOT_FOUND" };
}

// ---------- Public server function ----------

export const krsCompanyLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        krs: z.string().trim().min(1).max(20),
        forceRefresh: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<KrsLookupResult> => {
    const normalized = normalizeKrs(data.krs);
    if (!normalized) {
      return { success: false, errorCode: "INVALID_KRS", message: "Numer KRS jest nieprawidłowy." };
    }

    const t0 = Date.now();

    // Cache lookup
    if (!data.forceRefresh) {
      const { data: cached } = await supabaseAdmin
        .from("krs_cache")
        .select("response_json, mapped_json, expires_at")
        .eq("normalized_krs", normalized)
        .maybeSingle();
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return {
          success: true,
          source: "KRS API Ministerstwo Sprawiedliwości",
          searchType: "krs",
          cached: true,
          company: cached.mapped_json as KrsCompany,
        };
      }
    }

    const result = await fetchKrs(normalized);
    const elapsed = Date.now() - t0;

    if (!result.ok) {
      await supabaseAdmin.from("external_api_logs").insert({
        provider: "KRS",
        query_type: "krs",
        query_value: normalized,
        success: false,
        error_code: result.code,
        response_time_ms: elapsed,
      });
      const msg =
        result.code === "NOT_FOUND"
          ? "Nie znaleziono podmiotu w KRS."
          : result.code === "KRS_TIMEOUT"
            ? "API KRS nie odpowiedziało w wymaganym czasie."
            : "Nie udało się pobrać danych z API KRS.";
      return { success: false, errorCode: result.code, message: msg };
    }

    const company = mapKrs(result.body, normalized);

    // Upsert cache
    await supabaseAdmin.from("krs_cache").upsert(
      {
        krs: data.krs,
        normalized_krs: normalized,
        source: "KRS API Ministerstwo Sprawiedliwości",
        response_json: result.body,
        mapped_json: company as any,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "normalized_krs" },
    );

    await supabaseAdmin.from("external_api_logs").insert({
      provider: "KRS",
      query_type: "krs",
      query_value: normalized,
      success: true,
      error_code: null,
      response_time_ms: elapsed,
    });

    return {
      success: true,
      source: "KRS API Ministerstwo Sprawiedliwości",
      searchType: "krs",
      cached: false,
      company,
    };
  });
