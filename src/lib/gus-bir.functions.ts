// Integracja produkcyjna z usługą GUS REGON BIR (1.1).
// SOAP 1.2 + WS-Addressing. Klucz BIR_API_KEY tylko po stronie serwera.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BIR_URL = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const BIR_NS_ACTION = "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl";
const BIR_NS = "http://CIS/BIR/PUBL/2014/07";

type SearchType = "nip" | "regon" | "krs";

export type GusCompany = {
  name: string;
  nip: string;
  regon: string;
  krs: string;
  legalForm: string;
  entityType: string;
  status: string;
  startDate: string;
  suspensionDate: string;
  resumptionDate: string;
  endDate: string;
  address: {
    country: string;
    voivodeship: string;
    county: string;
    municipality: string;
    city: string;
    postalCode: string;
    street: string;
    buildingNumber: string;
    apartmentNumber: string;
    postOffice: string;
    fullAddress: string;
  };
  correspondenceAddress: { fullAddress: string };
  pkd: { main: string; additional: string[] };
  contact: { phone: string; email: string; website: string };
  raw: Record<string, any>;
};

export type GusLookupResult =
  | { success: true; source: "GUS REGON BIR"; searchType: SearchType; company: GusCompany }
  | {
      success: false;
      errorCode:
        | "NOT_FOUND"
        | "INVALID_IDENTIFIER"
        | "LOGIN_FAILED"
        | "GUS_CONNECTION_ERROR"
        | "NOT_CONFIGURED";
      message: string;
    };

// ---------- helpers ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function pickTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}
function pickTagAny(xml: string, ...tags: string[]): string {
  for (const t of tags) {
    const v = pickTag(xml, t);
    if (v) return v;
  }
  return "";
}

function pickAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function validateNip(nip: string) {
  return /^\d{10}$/.test(nip);
}
function validateRegon(r: string) {
  return /^\d{9}$/.test(r) || /^\d{14}$/.test(r);
}
function validateKrs(k: string) {
  return /^\d{1,10}$/.test(k);
}

// ---------- SOAP envelopes ----------

function envZaloguj(key: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">
  <s:Header>
    <a:Action s:mustUnderstand="1">${BIR_NS_ACTION}/Zaloguj</a:Action>
    <a:To s:mustUnderstand="1">${BIR_URL}</a:To>
  </s:Header>
  <s:Body>
    <Zaloguj xmlns="${BIR_NS}"><pKluczUzytkownika>${key}</pKluczUzytkownika></Zaloguj>
  </s:Body>
</s:Envelope>`;
}

function envSzukaj(sid: string, kind: SearchType, value: string): string {
  const param =
    kind === "nip"
      ? "Nip"
      : kind === "regon"
        ? value.length === 14
          ? "Regon14zn"
          : "Regon9zn"
        : "Krs";
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:bir="${BIR_NS}">
  <s:Header>
    <a:Action s:mustUnderstand="1">${BIR_NS_ACTION}/DaneSzukajPodmioty</a:Action>
    <a:To s:mustUnderstand="1">${BIR_URL}</a:To>
    <bir:sid>${sid}</bir:sid>
  </s:Header>
  <s:Body>
    <DaneSzukajPodmioty xmlns="${BIR_NS}">
      <pParametryWyszukiwania xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
        <dat:${param}>${value}</dat:${param}>
      </pParametryWyszukiwania>
    </DaneSzukajPodmioty>
  </s:Body>
</s:Envelope>`;
}

function envPelnyRaport(sid: string, regon: string, raport: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:bir="${BIR_NS}">
  <s:Header>
    <a:Action s:mustUnderstand="1">${BIR_NS_ACTION}/DanePobierzPelnyRaport</a:Action>
    <a:To s:mustUnderstand="1">${BIR_URL}</a:To>
    <bir:sid>${sid}</bir:sid>
  </s:Header>
  <s:Body>
    <DanePobierzPelnyRaport xmlns="${BIR_NS}">
      <pRegon>${regon}</pRegon>
      <pNazwaRaportu>${raport}</pNazwaRaportu>
    </DanePobierzPelnyRaport>
  </s:Body>
</s:Envelope>`;
}

async function soapCall(body: string, action: string, sid?: string): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": `application/soap+xml;charset=UTF-8;action="${BIR_NS_ACTION}/${action}"`,
  };
  if (sid) headers["sid"] = sid;
  const res = await fetch(BIR_URL, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`GUS HTTP ${res.status}`);
  return text;
}

// ---------- SOAP flow ----------

async function login(key: string): Promise<string> {
  const xml = await soapCall(envZaloguj(key), "Zaloguj");
  const sid = pickTag(xml, "ZalogujResult");
  if (!sid) throw new Error("LOGIN_FAILED");
  return sid;
}

async function searchOnce(
  sid: string,
  kind: SearchType,
  value: string,
): Promise<{ inner: string } | null> {
  const xml = await soapCall(envSzukaj(sid, kind, value), "DaneSzukajPodmioty", sid);
  const raw = pickTag(xml, "DaneSzukajPodmiotyResult");
  if (!raw) return null;
  const inner = decodeEntities(raw);
  if (!/<dane>/.test(inner)) return null;
  return { inner };
}

async function reportOnce(sid: string, regon: string, raport: string): Promise<string> {
  const xml = await soapCall(envPelnyRaport(sid, regon, raport), "DanePobierzPelnyRaport", sid);
  const raw = pickTag(xml, "DanePobierzPelnyRaportResult");
  return raw ? decodeEntities(raw) : "";
}

// ---------- Mapping ----------

function mapDane(daneBlock: string): {
  name: string;
  regon: string;
  nip: string;
  typ: string;
  silosID: string;
  voivodeship: string;
  county: string;
  municipality: string;
  city: string;
  postalCode: string;
  street: string;
  buildingNumber: string;
  apartmentNumber: string;
  endDate: string;
} {
  return {
    name: pickTag(daneBlock, "Nazwa"),
    regon: pickTag(daneBlock, "Regon"),
    nip: pickTag(daneBlock, "Nip"),
    typ: pickTag(daneBlock, "Typ"), // P = osoba prawna, F = osoba fizyczna, LP/LF = jedn. lokalna
    silosID: pickTag(daneBlock, "SilosID"),
    voivodeship: pickTag(daneBlock, "Wojewodztwo"),
    county: pickTag(daneBlock, "Powiat"),
    municipality: pickTag(daneBlock, "Gmina"),
    city: pickTag(daneBlock, "Miejscowosc"),
    postalCode: pickTag(daneBlock, "KodPocztowy"),
    street: pickTag(daneBlock, "Ulica"),
    buildingNumber: pickTag(daneBlock, "NrNieruchomosci"),
    apartmentNumber: pickTag(daneBlock, "NrLokalu"),
    endDate: pickTag(daneBlock, "DataZakonczeniaDzialalnosci"),
  };
}

function reportNames(typ: string): { ogolne: string; pkd: string } {
  // BIR1.1 reports
  if (typ === "P" || typ === "LP") return { ogolne: "BIR11OsPrawna", pkd: "BIR11OsPrawnaPkd" };
  return { ogolne: "BIR11OsFizycznaDaneOgolne", pkd: "BIR11OsFizycznaPkd" };
}

function buildFullAddress(a: {
  street: string;
  buildingNumber: string;
  apartmentNumber: string;
  postalCode: string;
  city: string;
  country?: string;
}): string {
  const street = [a.street, a.buildingNumber].filter(Boolean).join(" ");
  const flat = a.apartmentNumber ? `/${a.apartmentNumber}` : "";
  const cityLine = [a.postalCode, a.city].filter(Boolean).join(" ");
  return [street + flat, cityLine, a.country].filter(Boolean).join(", ");
}

// ---------- Public server function ----------

export const gusCompanyLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nip: z.string().trim().optional(),
        regon: z.string().trim().optional(),
        krs: z.string().trim().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<GusLookupResult> => {
    const key = process.env.BIR_API_KEY;
    if (!key)
      return {
        success: false,
        errorCode: "NOT_CONFIGURED",
        message: "Brak BIR_API_KEY w konfiguracji backendu.",
      };

    // Priorytet: NIP > REGON > KRS
    let kind: SearchType | null = null;
    let value = "";
    if (data.nip) {
      const v = data.nip.replace(/\D/g, "");
      if (!validateNip(v))
        return {
          success: false,
          errorCode: "INVALID_IDENTIFIER",
          message: "Nieprawidłowy NIP (oczekiwane 10 cyfr).",
        };
      kind = "nip";
      value = v;
    } else if (data.regon) {
      const v = data.regon.replace(/\D/g, "");
      if (!validateRegon(v))
        return {
          success: false,
          errorCode: "INVALID_IDENTIFIER",
          message: "Nieprawidłowy REGON (9 lub 14 cyfr).",
        };
      kind = "regon";
      value = v;
    } else if (data.krs) {
      const v = data.krs.replace(/\D/g, "");
      if (!validateKrs(v))
        return { success: false, errorCode: "INVALID_IDENTIFIER", message: "Nieprawidłowy KRS." };
      kind = "krs";
      value = v.padStart(10, "0");
    } else {
      return {
        success: false,
        errorCode: "INVALID_IDENTIFIER",
        message: "Podaj NIP, REGON albo KRS.",
      };
    }

    let sid: string;
    try {
      sid = await login(key);
    } catch {
      return {
        success: false,
        errorCode: "LOGIN_FAILED",
        message: "Nie udało się zalogować do usługi GUS BIR.",
      };
    }

    // Wykonaj wyszukiwanie z automatycznym ponowieniem przy wygaśnięciu SID
    const doSearch = async (s: string) => searchOnce(s, kind!, value);
    let found: { inner: string } | null;
    try {
      found = await doSearch(sid);
      if (!found) {
        // SID mógł wygasnąć — ponów logowanie i spróbuj raz jeszcze
        sid = await login(key);
        found = await doSearch(sid);
      }
    } catch {
      return {
        success: false,
        errorCode: "GUS_CONNECTION_ERROR",
        message: "Nie udało się połączyć z usługą GUS REGON.",
      };
    }
    if (!found)
      return {
        success: false,
        errorCode: "NOT_FOUND",
        message: "Nie znaleziono firmy w bazie GUS REGON.",
      };
    const daneBlock = pickAllBlocks(found.inner, "dane")[0] ?? "";
    const base = mapDane(daneBlock);
    // Diagnostyka — gdy brak REGON/TYP, logujemy surowy blok do worker logs (bez PII poza NIP/REGON).
    if (!base.regon || !base.typ) {
      console.warn("[GUS] base incomplete", {
        nip: base.nip,
        regon: base.regon,
        typ: base.typ,
        daneSnippet: daneBlock.slice(0, 800),
      });
    }

    // Pełny raport dla dodatkowych pól (KRS, forma prawna, daty, PKD, kontakt)
    const { ogolne, pkd } = reportNames(base.typ);
    let ogolneXml = "",
      pkdXml = "";
    try {
      ogolneXml = await reportOnce(sid, base.regon, ogolne);
      pkdXml = await reportOnce(sid, base.regon, pkd);
    } catch {
      /* miękko — zwracamy co mamy */
    }

    const ogolneBlock = pickAllBlocks(ogolneXml, "dane")[0] ?? "";
    const pkdBlocks = pickAllBlocks(pkdXml, "dane");

    const isPrawna = base.typ === "P" || base.typ === "LP";
    const legalForm = isPrawna
      ? pickTag(ogolneBlock, "praw_podstawowaFormaPrawna_Nazwa") ||
        pickTag(ogolneBlock, "praw_szczegolnaFormaPrawna_Nazwa")
      : pickTag(ogolneBlock, "fiz_szczegolnaFormaPrawna_Nazwa") ||
        "Osoba fizyczna prowadząca działalność";
    const status = isPrawna
      ? pickTag(ogolneBlock, "praw_statusNip") ||
        pickTag(ogolneBlock, "praw_dataSkresleniaPodmiotuZregon")
        ? "wykreślony"
        : "aktywny"
      : pickTag(ogolneBlock, "fiz_dataZakonczeniaDzialalnosci")
        ? "zakończona"
        : "aktywna";

    // GUS BIR1.1 używa różnych wariantów nazwy pola w zależności od raportu — sprawdź wszystkie znane.
    const krs = isPrawna
      ? pickTagAny(
          ogolneBlock,
          "praw_numerWRejestrzeEwidencji",
          "praw_numerWrejestrzeEwidencji",
          "praw_numerwRejestrzeEwidencji",
          "praw_numerwrejestrzeewidencji",
        )
      : "";

    const startDate = isPrawna
      ? pickTag(ogolneBlock, "praw_dataPowstania") ||
        pickTag(ogolneBlock, "praw_dataRozpoczeciaDzialalnosci")
      : pickTag(ogolneBlock, "fiz_dataRozpoczeciaDzialalnosci") ||
        pickTag(ogolneBlock, "fiz_dataPowstania");
    const suspensionDate = isPrawna
      ? pickTag(ogolneBlock, "praw_dataZawieszeniaDzialalnosci")
      : pickTag(ogolneBlock, "fiz_dataZawieszeniaDzialalnosci");
    const resumptionDate = isPrawna
      ? pickTag(ogolneBlock, "praw_dataWznowieniaDzialalnosci")
      : pickTag(ogolneBlock, "fiz_dataWznowieniaDzialalnosci");
    const endDate =
      base.endDate ||
      (isPrawna
        ? pickTag(ogolneBlock, "praw_dataZakonczeniaDzialalnosci")
        : pickTag(ogolneBlock, "fiz_dataZakonczeniaDzialalnosci"));

    const phone = pickTag(ogolneBlock, isPrawna ? "praw_numerTelefonu" : "fiz_numerTelefonu");
    const email = pickTag(ogolneBlock, isPrawna ? "praw_adresEmail" : "fiz_adresEmail");
    const website = pickTag(
      ogolneBlock,
      isPrawna ? "praw_adresStronyinternetowej" : "fiz_adresStronyinternetowej",
    );
    const postOffice = pickTag(
      ogolneBlock,
      isPrawna ? "praw_adSiedzPoczta_Nazwa" : "fiz_adSiedzPoczta_Nazwa",
    );
    const country = "Polska";

    const pkdList = pkdBlocks.map((b) => {
      const kod = pickTag(b, "praw_pkdKod") || pickTag(b, "fiz_pkdKod");
      const nazwa = pickTag(b, "praw_pkdNazwa") || pickTag(b, "fiz_pkdNazwa");
      const przew = pickTag(b, "praw_pkdPrzewazajace") || pickTag(b, "fiz_pkdPrzewazajace");
      return { kod, nazwa, przewazajace: przew === "1" };
    });
    const main = pkdList.find((p) => p.przewazajace) ?? pkdList[0];
    const mainStr = main ? `${main.kod} ${main.nazwa}`.trim() : "";
    const additional = pkdList
      .filter((p) => !p.przewazajace || (main && p.kod !== main.kod))
      .map((p) => `${p.kod} ${p.nazwa}`.trim());

    const address = {
      country,
      voivodeship: base.voivodeship,
      county: base.county,
      municipality: base.municipality,
      city: base.city,
      postalCode: base.postalCode,
      street: base.street,
      buildingNumber: base.buildingNumber,
      apartmentNumber: base.apartmentNumber,
      postOffice,
      fullAddress: "",
    };
    address.fullAddress = buildFullAddress({ ...address, country });

    // Wyloguj — best effort
    try {
      await soapCall(
        `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:bir="${BIR_NS}">
  <s:Header><a:Action s:mustUnderstand="1">${BIR_NS_ACTION}/Wyloguj</a:Action><a:To s:mustUnderstand="1">${BIR_URL}</a:To><bir:sid>${sid}</bir:sid></s:Header>
  <s:Body><Wyloguj xmlns="${BIR_NS}"><pIdentyfikatorSesji>${sid}</pIdentyfikatorSesji></Wyloguj></s:Body>
</s:Envelope>`,
        "Wyloguj",
        sid,
      );
    } catch {
      /* ignore */
    }

    return {
      success: true,
      source: "GUS REGON BIR",
      searchType: kind,
      company: {
        name: base.name,
        nip: base.nip,
        regon: base.regon,
        krs,
        legalForm,
        entityType: base.typ,
        status,
        startDate,
        suspensionDate,
        resumptionDate,
        endDate,
        address,
        correspondenceAddress: { fullAddress: "" },
        pkd: { main: mainStr, additional },
        contact: { phone, email, website },
        raw: { dane: daneBlock, ogolne: ogolneBlock, pkd: pkdBlocks },
      },
    };
  });
