// Szczegóły pozycji oficjalnego MSiG (/api/Monitor/Detalis) — czysta logika.
// Treść ogłoszenia o upadłości osoby fizycznej zawiera zwykle PESEL dłużnika.
// Porównujemy go WYŁĄCZNIE lokalnie z PESEL-em właściciela/klienta: numer nie
// jest wysyłany do MS ani zapisywany w wyniku (wszystkie teksty mają PESEL ukryty).
import { parsePesel } from "@/lib/risk-assessment/pesel";
import type {
  CourtProceedingNotice,
  CourtProceedingReport,
  CourtProceedingStatus,
} from "./owner-intelligence.types";

export const OFFICIAL_MSIG_DETAIL_ENDPOINT =
  "https://wyszukiwarka-msig.ms.gov.pl/api/Monitor/Detalis";
export const officialMsigPdfUrl = (id: number) =>
  `https://wyszukiwarka-msig.ms.gov.pl/api/Monitor/Download?id=${id}&fileId=false`;

/** Data rozpoczęcia działania KRZ — od tego dnia obwieszczenia upadłościowe/restrukturyzacyjne są tylko w KRZ. */
export const KRZ_START = "2021-12-01";

export interface MsigNoticeDetail {
  id: number;
  monitorNumber: string;
  publicationDate: string;
  position: string | null;
  page: number | null;
  /** Pełna ścieżka rozdziału, np. „III. … /1. Postanowienie o ogłoszeniu upadłości”. */
  chapterPath: string;
  /** Ostatni człon rozdziału bez numeracji. */
  chapter: string | null;
  entityName: string;
  court: string | null;
  /** Znormalizowane sygnatury, np. „XII GUP 30/15”. */
  signatures: string[];
  /** Treść ogłoszenia (spacje znormalizowane; PESEL NIE ukryty — tylko do porównań w pamięci). */
  body: string;
  pesels: string[];
  nips: string[];
  krs: string[];
  residence: string | null;
}

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u00A0\s]+/g, " ")
    .trim();
export const redactPesel = (s: string) => s.replace(/\b\d{11}\b/g, "[PESEL ukryty]");
const digitsOnly = (s: unknown) => String(s ?? "").replace(/\D/g, "");

const SIGNATURE_RE = /\b([IVXL]{1,6})\s+(G[A-Za-z]{1,3})\s+(\d{1,5})\s*\/\s*(\d{2,4})\b/g;

export function extractSignatures(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(SIGNATURE_RE))
      out.add(`${m[1]} ${m[2].toUpperCase()} ${m[3]}/${m[4]}`);
  }
  return [...out];
}

export function extractCourt(position: string, body: string): string | null {
  for (const t of [position, body]) {
    const m = t.match(
      /S[ąa]d(?:u|zie)?\s+(Rejonow\p{L}*|Okr[ęe]gow\p{L}*)\s+(.+?)(?=,|\s+sygn|\s+zawiadamia|\s+podaje|\s+postanowieniem|\.\s|$)/iu,
    );
    if (m)
      return `Sąd ${/^okr/i.test(m[1]) ? "Okręgowy" : "Rejonowy"} ${m[2].trim()}`.slice(0, 120);
  }
  return null;
}

/** Klucz sądu do łączenia ogłoszeń jednej sprawy (bez odmiany i znaków PL). */
export function courtKey(court: string | null): string {
  return (court ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/s[aą]d(u|zie)?\s+(rejonow|okregow)\p{L}*/gu, "$2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(w|we)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMsigDetail(raw: unknown): MsigNoticeDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = Number(r.id);
  const monitorNumber = clean(r.monitorNumber).slice(0, 40);
  const publicationDate = clean(r.dateOfPublication).slice(0, 10);
  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !monitorNumber ||
    !/^\d{4}-\d\d-\d\d$/.test(publicationDate)
  )
    return null;
  const position = clean(r.textInPosition);
  const body = clean(r.textInBody);
  const chapterPath = clean(r.chapterName);
  const chapter = chapterPath
    ? (chapterPath.split("/").pop() ?? "").replace(/^\s*\d+\s*\.\s*/, "").trim() || null
    : null;
  const pesels = [...new Set(body.match(/\b\d{11}\b/g) ?? [])].filter((p) => parsePesel(p).valid);
  const nips = [
    ...new Set([
      ...[...body.matchAll(/\bNIP[:\s]*((?:\d[\s-]?){9}\d)\b/gi)].map((m) => digitsOnly(m[1])),
      digitsOnly(r.nip),
    ]),
  ].filter((n) => n.length === 10);
  const krsField = digitsOnly(r.krs);
  const krs = [
    ...new Set([
      ...[...body.matchAll(/\bKRS[:\s]*(?:nr\s*)?(\d{10})\b/gi)].map((m) => m[1]),
      krsField ? krsField.padStart(10, "0") : "",
    ]),
  ].filter((n) => /^\d{10}$/.test(n));
  const residence =
    body.match(
      /(?:zamieszka[łl]\p{L}*|z\s+siedzib[ąa])\s+w\s+(\p{Lu}[\p{L}-]+(?:\s+\p{Lu}[\p{L}-]+)?)/u,
    )?.[1] ?? null;
  const pageNum = Number(r.page);
  return {
    id,
    monitorNumber,
    publicationDate,
    position: clean(r.numberOfNotice).slice(0, 20) || null,
    page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : null,
    chapterPath,
    chapter,
    entityName: clean(r.entityName).slice(0, 300),
    court: extractCourt(position, body),
    signatures: extractSignatures(clean(r.signatureOfCase), position, body),
    body,
    pesels,
    nips,
    krs,
    residence,
  };
}

export type IdentityVerdict = "confirmed" | "contradicted" | "unknown";

export interface IdentityInput {
  kind: "person" | "company";
  pesel?: string | null;
  nip?: string | null;
  krs?: string | null;
}

/**
 * PESEL / NIP / KRS z treści ogłoszenia vs identyfikator podmiotu.
 * Zgodny → potwierdzenie; inny identyfikator tego samego typu → imiennik.
 */
export function verifyIdentity(
  input: IdentityInput,
  d: MsigNoticeDetail,
): { verdict: IdentityVerdict; basis: string | null } {
  const pesel = input.pesel && parsePesel(input.pesel).valid ? input.pesel : null;
  const nip = /^\d{10}$/.test(input.nip ?? "") ? input.nip! : null;
  const krs = /^\d{10}$/.test(input.krs ?? "") ? input.krs! : null;
  if (pesel && d.pesels.includes(pesel))
    return { verdict: "confirmed", basis: `PESEL zgodny w ogłoszeniu z ${d.publicationDate}` };
  if (krs && d.krs.includes(krs))
    return { verdict: "confirmed", basis: `KRS zgodny w ogłoszeniu z ${d.publicationDate}` };
  if (nip && d.nips.includes(nip))
    return { verdict: "confirmed", basis: `NIP zgodny w ogłoszeniu z ${d.publicationDate}` };
  // Wiele PESEL-i w treści (np. małżonkowie) — inny PESEL wyklucza tylko,
  // gdy nasz nie występuje wcale.
  if (pesel && d.pesels.length > 0) return { verdict: "contradicted", basis: null };
  if (krs && d.krs.length > 0) return { verdict: "contradicted", basis: null };
  if (nip && d.nips.length > 0 && !pesel) return { verdict: "contradicted", basis: null };
  return { verdict: "unknown", basis: null };
}

/** Ogłoszenie dotyczy niewypłacalności / likwidacji (a nie np. spadku czy zasiedzenia). */
export function isInsolvencyNotice(
  d: Pick<MsigNoticeDetail, "chapterPath" | "body" | "entityName">,
): boolean {
  return (
    /upad[łl]o|restruktur|naprawcz|uk[łl]ad|sanac|likwidac|niewyp[łl]acaln|zarz[ąa]dc|syndyk/i.test(
      `${d.chapterPath} ${d.entityName}`,
    ) ||
    (!d.chapterPath && /upad[łl]o[śs]|restrukturyzac|syndyk/i.test(d.body))
  );
}

/**
 * Union-find: ogłoszenia tego samego sądu dzielące sygnaturę = jedna sprawa.
 * Postanowienie o ogłoszeniu upadłości ma często tylko sygnaturę „GU”,
 * a dalsze ogłoszenia — „GUp”; łączy je `mergeByCourt` (ten sam sąd
 * i podmiot dopasowany po nazwie, sprawy upadłościowe).
 */
export function groupIntoProceedings(
  details: MsigNoticeDetail[],
  opts: { mergeByCourt?: (a: MsigNoticeDetail, b: MsigNoticeDetail) => boolean } = {},
): MsigNoticeDetail[][] {
  const parent = details.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const bySig = new Map<string, number>();
  details.forEach((d, i) => {
    const ck = courtKey(d.court);
    for (const s of d.signatures) {
      const key = `${ck}|${s}`;
      const j = bySig.get(key);
      if (j === undefined) bySig.set(key, i);
      else parent[find(i)] = find(j);
    }
  });
  if (opts.mergeByCourt) {
    for (let i = 0; i < details.length; i += 1)
      for (let j = i + 1; j < details.length; j += 1)
        if (find(i) !== find(j) && opts.mergeByCourt(details[i], details[j]))
          parent[find(i)] = find(j);
  }
  const groups = new Map<number, MsigNoticeDetail[]>();
  details.forEach((d, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), d]);
  });
  return [...groups.values()].map((g) =>
    g.sort((a, b) => a.publicationDate.localeCompare(b.publicationDate)),
  );
}

function proceedingKind(opening: MsigNoticeDetail, all: MsigNoticeDetail[]): string {
  const text = all.map((d) => `${d.chapterPath} ${d.body}`).join(" ");
  if (/upad[łl]o\p{L}*\s+osoby\s+fizycznej\s+nieprowadz/iu.test(text))
    return "Upadłość konsumencka (osoba fizyczna nieprowadząca działalności gospodarczej)";
  if (/z\s+mo[żz]liwo[śs]ci[ąa]\s+zawarcia\s+uk[łl]adu/i.test(text))
    return "Upadłość z możliwością zawarcia układu";
  if (/sanacyj/i.test(text)) return "Restrukturyzacja — postępowanie sanacyjne";
  if (/zatwierdzeni\p{L}+\s+uk[łl]adu/iu.test(text))
    return "Restrukturyzacja — postępowanie o zatwierdzenie układu";
  if (/przyspieszon\p{L}+\s+post[ęe]powani\p{L}+\s+uk[łl]ad/iu.test(text))
    return "Restrukturyzacja — przyspieszone postępowanie układowe";
  if (/post[ęe]powani\p{L}+\s+uk[łl]adow/iu.test(text))
    return "Restrukturyzacja — postępowanie układowe";
  if (/upad[łl]o/i.test(text)) {
    const business = /prowadz\p{L}+\s+dzia[łl]alno[śs][ćc]\s+gospodarcz/iu.test(
      `${opening.entityName} ${opening.body}`,
    );
    const liquid = /likwidac\p{L}+\s+maj[ąa]tku|upad[łl]o[śs]ci\s+likwidacyjnej/iu.test(text);
    return `Upadłość${business ? " przedsiębiorcy" : ""}${liquid ? " obejmująca likwidację majątku" : ""}`;
  }
  if (/likwidac/i.test(text)) return "Likwidacja podmiotu";
  return opening.chapter ?? "Postępowanie sądowe (rodzaj nieustalony)";
}

function proceedingStatus(
  group: MsigNoticeDetail[],
  today: string,
): { status: CourtProceedingStatus; note: string } {
  const last = group[group.length - 1];
  const text = (d: MsigNoticeDetail) => `${d.chapterPath} ${d.body.slice(0, 600)}`;
  const closed = [...group]
    .reverse()
    .find((d) =>
      /zako[ńn]czeni\p{L}*\s+post[ęe]powani|stwierdzi\p{L}*\s+zako[ńn]czeni/iu.test(text(d)),
    );
  const discontinued = [...group]
    .reverse()
    .find((d) =>
      /umorz\p{L}*\s+post[ęe]powani|umorzeni\p{L}*\s+post[ęe]powani|uchyl\p{L}*\s+postanowieni\p{L}*\s+o\s+og[łl]oszeniu\s+upad/iu.test(
        text(d),
      ),
    );
  const debtRelief = group.find((d) =>
    /umorzeni\p{L}*\s+zobowi[ąa]za[ńn]|umorzy\p{L}*\s+zobowi[ąa]zani/iu.test(text(d)),
  );
  const plan = [...group]
    .reverse()
    .find((d) =>
      /plan\p{L}*\s+sp[łl]aty\s+wierzycieli|ustal\p{L}*\s+plan\p{L}*\s+sp[łl]aty/iu.test(text(d)),
    );
  const postKrz =
    last.publicationDate < KRZ_START
      ? ` Od ${KRZ_START} obwieszczenia w tych sprawach publikuje wyłącznie KRZ — dalszy przebieg sprawdź w krz.ms.gov.pl.`
      : "";
  if (discontinued && discontinued === last)
    return {
      status: "discontinued",
      note: `Ostatnie ogłoszenie (${last.publicationDate}) dotyczy umorzenia / uchylenia postępowania.${postKrz}`,
    };
  if (closed)
    return {
      status: "closed",
      note:
        `Zakończenie postępowania ogłoszono ${closed.publicationDate}.${debtRelief ? " W aktach jest wzmianka o umorzeniu zobowiązań." : ""}` +
        (plan
          ? ` Ustalono plan spłaty wierzycieli (${plan.publicationDate}) — sprawdź, czy jest wykonywany.`
          : ""),
    };
  if (plan)
    return {
      status: "repayment_plan",
      note: `Ustalono plan spłaty wierzycieli (${plan.publicationDate}); brak ogłoszenia o jego wykonaniu.${postKrz}`,
    };
  const years = (Date.parse(today) - Date.parse(last.publicationDate)) / (365.25 * 864e5);
  return {
    status: years > 3 ? "unknown" : "in_progress",
    note:
      `Brak ogłoszenia o zakończeniu w MSiG; ostatnie ogłoszenie ${last.publicationDate}${last.chapter ? ` (${last.chapter})` : ""}.` +
      (years > 3
        ? ` Od ${Math.floor(years)} lat bez nowych ogłoszeń w MSiG — bieżący stan nieustalony.`
        : " Postępowanie prawdopodobnie w toku.") +
      postKrz,
  };
}

function officialsFrom(group: MsigNoticeDetail[]): string[] {
  const out = new Set<string>();
  const re =
    /([Tt]ymczasow\p{L}+\s+nadzorc\p{L}*(?:\s+s[ąa]dow\p{L}*)?|[Ss]yndyk\p{L}*(?:\s+masy\s+upad\p{L}+)?|[Nn]adzorc\p{L}*(?:\s+s[ąa]dow\p{L}*)?|[Zz]arz[ąa]dc\p{L}*(?:\s+przymusow\p{L}*)?|[Ss][ęe]dzi\p{L}*\s+komisarz\p{L}*)\s+w\s+osobie\s+(?:(?:S[ęe]dziego|asesora|SSR|SSO|SSA)\s+(?:s[ąa]dowego\s+|S[ąa]du\s+Rejonowego\s+)?)?(\p{Lu}[\p{L}-]+(?:\s+\p{Lu}[\p{L}-]+){0,2})/gu;
  for (const d of group) {
    for (const m of d.body.matchAll(re)) {
      const role = m[1].toLowerCase();
      const label = role.startsWith("tymczas")
        ? "Tymczasowy nadzorca sądowy"
        : role.startsWith("syndyk")
          ? "Syndyk"
          : role.startsWith("zarz")
            ? "Zarządca"
            : role.startsWith("s")
              ? "Sędzia komisarz"
              : "Nadzorca sądowy";
      out.add(`${label}: w osobie ${m[2]}`);
      if (out.size >= 6) break;
    }
  }
  return [...out];
}

/** Pogłębiony raport z ogłoszeń jednej sprawy (posortowanych rosnąco po dacie). */
export function buildProceedingReport(
  group: MsigNoticeDetail[],
  opts: {
    identityBasis: string;
    incomplete: boolean;
    today?: string;
    extraRows?: CourtProceedingNotice[];
  },
): CourtProceedingReport {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const opening =
    group.find((d) =>
      /og[łl]oszeniu\s+upad|otwarciu\s+post[ęe]powania|otwarci\p{L}+\s+post[ęe]powania/iu.test(
        d.chapterPath,
      ),
    ) ?? group[0];
  const { status, note } = proceedingStatus(group, today);
  const timeline: CourtProceedingNotice[] = [
    ...group.map((d) => ({
      publicationDate: d.publicationDate,
      monitorNumber: d.monitorNumber,
      position: d.position,
      chapter: d.chapter,
      summary: d.body ? redactPesel(d.body).slice(0, 280) : null,
      pdfUrl: officialMsigPdfUrl(d.id),
    })),
    ...(opts.extraRows ?? []),
  ].sort((a, b) => a.publicationDate.localeCompare(b.publicationDate));
  const decisionDate =
    opening.body
      .match(/postanowieniem\s+z\s+dnia\s+(\d{1,2}(?:\s+\p{L}+\s+|\.\d{1,2}\.)\d{4})/iu)?.[1]
      ?.replace(/\s+/g, " ") ?? null;
  return {
    court: opening.court ?? group.find((d) => d.court)?.court ?? null,
    signatures: [...new Set(group.flatMap((d) => d.signatures))].slice(0, 6),
    kind: proceedingKind(opening, group),
    decisionDate,
    officials: officialsFrom(group),
    residence: opening.residence ?? group.find((d) => d.residence)?.residence ?? null,
    identityBasis: opts.identityBasis,
    firstPublication: timeline[0]?.publicationDate ?? opening.publicationDate,
    lastPublication: timeline[timeline.length - 1]?.publicationDate ?? opening.publicationDate,
    stage: group[group.length - 1].chapter,
    status,
    statusNote: note,
    noticesCount: timeline.length,
    timeline: timeline.slice(-15),
    incomplete: opts.incomplete,
  };
}

export { proceedingStatusLabel } from "./court-proceeding-format";
