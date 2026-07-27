// Wyszukiwanie działalności gospodarczej właściciela w CEIDG (Centralna Ewidencja
// i Informacja o Działalności Gospodarczej) — API v3 hurtowni danych biznes.gov.pl.
//
// Cel: ustalić, czy właściciel (zidentyfikowany po PESEL w analizie właściciela) jest
// już przedsiębiorcą (JDG). Aktywna działalność istotnie OBNIŻA ryzyko.
//
// WAŻNE: publiczne API CEIDG NIE wyszukuje po numerze PESEL (dane chronione). Dlatego:
//   1) jeśli klient ma NIP → pytamy po NIP (dopasowanie pewne),
//   2) w przeciwnym razie po imieniu i nazwisku (+ województwo/miasto) — dopasowanie
//      przybliżone (kotwiczone na właścicielu z PESEL).
//
// Wymaga tokenu: CEIDG_JWT_TOKEN (Bearer). Bez tokenu zwracamy „niedostępne".

import type { CeidgActivity } from "./types";

const CEIDG_BASE = "https://dane.biznes.gov.pl/api/ceidg/v3/firmy";

export function emptyCeidg(
  note: string,
  queried: CeidgActivity["queried"] = "none",
): CeidgActivity {
  return {
    available: false,
    queried,
    isEntrepreneur: false,
    status: "nieznany",
    matchConfidence: "none",
    activeCount: 0,
    company: null,
    note,
  };
}

function normName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z]/g, "");
}

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

// Mapuje status CEIDG na nasze pasmo.
function mapStatus(raw: unknown): CeidgActivity["status"] {
  const s = String(raw ?? "").toUpperCase();
  if (/AKTYW/.test(s)) return "aktywny";
  if (/ZAWIESZ/.test(s)) return "zawieszony";
  if (/WYKRE|WYREJESTR|ZAKON|ZAKOŃCZ/.test(s)) return "wykreslony";
  return "nieznany";
}

interface CeidgFirm {
  name: string | null;
  nip: string | null;
  regon: string | null;
  startDate: string | null;
  pkdMain: string | null;
  status: CeidgActivity["status"];
  ownerFirst: string | null;
  ownerLast: string | null;
  city: string | null;
  voivodeship: string | null;
}

function pickFirms(json: any): any[] {
  if (Array.isArray(json?.firmy)) return json.firmy;
  if (Array.isArray(json?.firma)) return json.firma;
  if (Array.isArray(json)) return json;
  if (json?.firma && typeof json.firma === "object") return [json.firma];
  return [];
}

function parseFirm(f: any): CeidgFirm {
  const owner = f?.wlasciciel ?? f?.przedsiebiorca ?? {};
  const addr =
    f?.adresDzialalnosci ?? f?.adres ?? f?.adresGlownyMiejscaWykonywaniaDzialalnosci ?? {};
  const pkd = f?.pkdGlowny ?? (Array.isArray(f?.pkd) ? f.pkd[0] : f?.pkd) ?? null;
  return {
    name: f?.nazwa ?? owner?.nazwa ?? null,
    nip: f?.nip ?? owner?.nip ?? null,
    regon: f?.regon ?? owner?.regon ?? null,
    startDate: f?.dataRozpoczecia ?? f?.dataRozpoczeciaDzialalnosci ?? null,
    pkdMain: typeof pkd === "string" ? pkd : (pkd?.kod ?? pkd?.symbol ?? null),
    status: mapStatus(f?.status),
    ownerFirst: owner?.imie ?? null,
    ownerLast: owner?.nazwisko ?? null,
    city: addr?.miasto ?? addr?.miejscowosc ?? null,
    voivodeship: addr?.wojewodztwo ?? null,
  };
}

async function ceidgFetch(url: string, token: string): Promise<any | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 404) return { firmy: [] };
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { error: `CEIDG HTTP ${res.status}: ${t.slice(0, 160)}` };
    }
    return await res.json();
  } catch (e: any) {
    return {
      error: e?.name === "AbortError" ? "CEIDG timeout" : (e?.message ?? "CEIDG błąd sieci"),
    };
  } finally {
    clearTimeout(timer);
  }
}

function toActivity(
  firms: CeidgFirm[],
  queried: CeidgActivity["queried"],
  confidence: CeidgActivity["matchConfidence"],
): CeidgActivity {
  if (firms.length === 0) {
    return {
      available: true,
      queried,
      isEntrepreneur: false,
      status: "brak",
      matchConfidence: confidence,
      activeCount: 0,
      company: null,
      note: "Brak wpisu w CEIDG dla podanych danych.",
    };
  }
  const active = firms.filter((f) => f.status === "aktywny");
  const chosen = active[0] ?? firms.find((f) => f.status === "zawieszony") ?? firms[0];
  const status = active.length ? "aktywny" : chosen.status;
  return {
    available: true,
    queried,
    isEntrepreneur: active.length > 0,
    status,
    matchConfidence: confidence,
    activeCount: active.length,
    company: {
      name: chosen.name,
      nip: chosen.nip,
      regon: chosen.regon,
      startDate: chosen.startDate,
      pkdMain: chosen.pkdMain,
    },
    note: active.length
      ? `Aktywna działalność w CEIDG${chosen.startDate ? ` (od ${chosen.startDate})` : ""}.`
      : `Wpis w CEIDG istnieje, ale status: ${status}.`,
  };
}

export async function lookupCeidgActivity(args: {
  firstName: string | null;
  lastName: string | null;
  nip?: string | null;
  city?: string | null;
  voivodeship?: string | null;
}): Promise<CeidgActivity> {
  const token = process.env.CEIDG_JWT_TOKEN;
  if (!token)
    return emptyCeidg("Brak CEIDG_JWT_TOKEN — pominięto sprawdzenie działalności w CEIDG.");

  const nip = digits(args.nip);

  // 1) Zapytanie po NIP — dopasowanie pewne.
  if (nip.length === 10) {
    const json = await ceidgFetch(`${CEIDG_BASE}?nip=${nip}`, token);
    if ((json as any)?.error) return emptyCeidg(String((json as any).error), "nip");
    const firms = pickFirms(json).map(parseFirm);
    return toActivity(firms, "nip", "high");
  }

  // 2) Zapytanie po imieniu i nazwisku (+ województwo).
  if (args.firstName && args.lastName) {
    const params = new URLSearchParams();
    params.set("imie", args.firstName);
    params.set("nazwisko", args.lastName);
    if (args.voivodeship) params.set("wojewodztwo", args.voivodeship);
    const json = await ceidgFetch(`${CEIDG_BASE}?${params.toString()}`, token);
    if ((json as any)?.error) return emptyCeidg(String((json as any).error), "name");

    const all = pickFirms(json).map(parseFirm);
    const wantFirst = normName(args.firstName);
    const wantLast = normName(args.lastName);
    const wantCity = normName(args.city);

    // Dopasowanie po nazwisku i imieniu (jeśli CEIDG zwraca właściciela).
    let matched = all.filter((f) => {
      const okLast = f.ownerLast ? normName(f.ownerLast).includes(wantLast) : true;
      const okFirst = f.ownerFirst ? normName(f.ownerFirst).includes(wantFirst) : true;
      return okLast && okFirst;
    });
    let confidence: CeidgActivity["matchConfidence"] = "low";
    if (wantCity) {
      const byCity = matched.filter((f) => normName(f.city).includes(wantCity));
      if (byCity.length) {
        matched = byCity;
        confidence = "medium";
      }
    }
    if (matched.length === 0) matched = all;
    return toActivity(matched, "name", matched.length ? confidence : "none");
  }

  return emptyCeidg("Brak NIP oraz imienia/nazwiska — nie odpytano CEIDG.", "none");
}
