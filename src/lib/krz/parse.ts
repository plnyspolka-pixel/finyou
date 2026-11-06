// Parsowanie odpowiedzi tablicy obwieszczeń KRZ (lista JSON + XML szczegółów).
// Czyste funkcje bez sieci — testowalne na fixture'ach.
//
// Ochrona danych: XML osoby fizycznej zawiera PESEL. Nigdy go nie zwracamy
// ani nie zapisujemy; w treści obwieszczenia jest maskowany.
import { XMLParser } from "fast-xml-parser";
import type { KrzEntityKind, KrzNotice, KrzNoticeDetail, KrzSearchResponse } from "./types";

/** Spłaszcza odpowiedź wyszukiwania do listy obwieszczeń z grupą i kategorią. */
export function flattenSearch(res: KrzSearchResponse): KrzNotice[] {
  const out: KrzNotice[] = [];
  for (const g of res.grupaKategoriiKategorieObweszczeniaResponse ?? []) {
    for (const k of g.kategorie ?? []) {
      for (const o of k.obwieszczenia ?? []) {
        out.push({ ...o, grupa: g.tytul, kategoria: k.tytul });
      }
    }
  }
  return out;
}

const PESEL_RE = /\b\d{11}\b/g;

/** Maskuje 11-cyfrowe ciągi (PESEL) w tekście; NIP (10 cyfr) i KRS zostają. */
export function maskPesel(text: string): string {
  return text.replace(PESEL_RE, "[PESEL]");
}

/** Prosty HTML → tekst (treść obwieszczenia to zakodowany HTML w XML). */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(
    typeof v === "object" && "#text" in (v as object) ? (v as { "#text": unknown })["#text"] : v,
  ).trim();
  return s ? s : null;
};

const asArray = <T>(v: T | T[] | undefined | null): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

/** Parsuje XML szczegółów obwieszczenia. Pomija PESEL. */
export function parseNoticeXml(xml: string, idZewnetrzny: string): KrzNoticeDetail {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });
  const root = (parser.parse(xml) as Record<string, unknown>).dokumentObwieszczenia as
    Record<string, unknown> | undefined;
  if (!root) throw new Error("XML obwieszczenia bez elementu dokumentObwieszczenia.");

  const metryka = (root.metryka ?? {}) as Record<string, unknown>;
  const sys = (root.metrykaSystemowa ?? {}) as Record<string, unknown>;
  const osoba = root.osobaFizyczna as Record<string, unknown> | undefined;
  const podmiot = root.uczestnikPodmiot as Record<string, unknown> | undefined;

  let rodzaj: KrzEntityKind = "nieznany";
  const p: KrzNoticeDetail["podmiot"] = {
    rodzaj,
    nazwa: null,
    imie: null,
    nazwisko: null,
    miejscowosc: null,
    kraj: null,
    formaPrawna: null,
    prowadziDzialalnosc: null,
    krs: null,
    nip: null,
  };
  if (osoba) {
    rodzaj = "osoba_fizyczna";
    p.imie = str(osoba.imie);
    p.nazwisko = str(osoba.nazwisko);
    p.nazwa = str(osoba.nazwa);
    p.miejscowosc = str(osoba.miejscowosc);
    p.kraj = str(osoba.krajZamieszkania);
    const dz = str(osoba.prowadziDzialalnosc);
    p.prowadziDzialalnosc = dz === null ? null : dz === "true";
    p.nip = str(osoba.NIP);
    // PESEL świadomie pominięty.
  } else if (podmiot) {
    rodzaj = "podmiot";
    p.nazwa = str(podmiot.nazwa);
    p.miejscowosc = str(podmiot.siedziba);
    p.kraj = str(podmiot.krajSiedziby);
    p.formaPrawna = str(podmiot.formaPrawna);
    p.krs = str(podmiot.KRS);
    p.nip = str(podmiot.NIP);
  }
  p.rodzaj = rodzaj;

  const atrybuty: Record<string, string> = {};
  for (const [k, v] of Object.entries(
    (root.atrybutyObwieszczenia ?? {}) as Record<string, unknown>,
  )) {
    const s = str(v);
    if (s) atrybuty[k] = s;
  }

  const doradcyRoot = (root.doradcyRestrukturyzacyjni ?? {}) as Record<string, unknown>;
  const doradcy = asArray(
    doradcyRoot.doradca as Record<string, unknown> | Record<string, unknown>[],
  ).map((d) => {
    const z = d.zdarzenie;
    const zObj = z && typeof z === "object" ? (z as Record<string, unknown>) : null;
    return {
      zdarzenie: str(z),
      zdarzenieKod: zObj ? str(zObj["@_kod"]) : null,
      tytul: str(d.tytul),
      imie: str(d.imie),
      nazwisko: str(d.nazwisko),
      nazwa: str(d.nazwa),
      nrLicencji: str(d.nrLicencji),
      krs: str(d.KRS),
    };
  });

  const trescRaw = str(root.tresc) ?? "";
  return {
    idZewnetrzny,
    sygnaturaAkt: str(metryka.sygnaturaAkt),
    numerObwieszczenia: str(metryka.numerObwieszczenia),
    dataObwieszczenia: str(metryka.dataObwieszczenia),
    tytul: str(metryka.tytulObwieszczenia),
    sad: str(metryka.sad),
    wydzial: str(metryka.wydzialSadu),
    czasWygenerowania: str(sys.czasWygenerowania),
    podmiot: p,
    atrybuty,
    doradcy,
    tresc: maskPesel(htmlToText(trescRaw)),
  };
}

/** Nazwa podmiotu do wyświetlenia (osoba lub firma). */
export function displayName(d: Pick<KrzNoticeDetail, "podmiot">): string {
  const p = d.podmiot;
  if (p.nazwa) return p.nazwa;
  return [p.imie, p.nazwisko].filter(Boolean).join(" ") || "(brak nazwy)";
}
