// Adapter + normalizacja KW → `NormalizedLandRegister` (provider-agnostic).
//
// Wejście: sekcje HTML z kw_documents (format CMD KW Engine / renderKwSections).
// NIE przepisujemy pobierania KW — dobudowujemy jedynie warstwę normalizacji.
//
// Zasada: jeżeli wpisu nie da się jednoznacznie sklasyfikować, NIE pomijamy go —
// oznaczamy `needsManualReview`, zachowując pełną treść źródłową (spec).
//
// Moduł czysty (bez Supabase) — testowalny.

import { stripHtml, parseMortgages } from "@/lib/risk-assessment/kw-parse-core";
import { extractKwOwnerPersons, extractKwOwnerPesels } from "@/lib/risk-assessment/kw-parse-core";
import { parseKwAddress } from "@/lib/kw-address-core";
import type {
  KwSection,
  NormalizedLandRegister,
  NormalizedMention,
  NormalizedMortgage,
  NormalizedOwner,
  NormalizedProperty,
  NormalizedSectionThreeEntry,
  NormalizedVacantRankRight,
  NormalizedAssociatedRight,
  SectionThreeKind,
  SourceEvidence,
} from "./types";

export interface KwDocumentSections {
  kwNumber?: string | null;
  okladka?: string | null;
  dzial_1o?: string | null;
  dzial_1s?: string | null;
  dzial_2?: string | null;
  dzial_3?: string | null;
  dzial_4?: string | null;
  fetchedAt?: string | null;
}

function norm(s: string): string {
  // NFD nie rozk\u0142ada \u0142/\u0141 \u2014 usuwamy je osobno, poza znakami \u0142\u0105cz\u0105cymi.
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0142/g, "l")
    .trim();
}

function ev(section: KwSection, rawValue: string, extra?: Partial<SourceEvidence>): SourceEvidence {
  return { section, rawValue: rawValue.slice(0, 400), ...extra };
}

// ── Rozbicie działu na sensowne wpisy (współdzielona heurystyka). ────────────
function splitEntries(text: string): string[] {
  return text
    .split(/(?:\.\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])|;\s+|\n)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

// ── Okładka + stan księgi (0.1 / 0.3). ───────────────────────────────────────
function parseMeta(doc: KwDocumentSections): NormalizedLandRegister["meta"] {
  const cover = stripHtml(doc.okladka);
  const io = stripHtml(doc.dzial_1o);
  const all = `${cover} ${io} ${stripHtml(doc.dzial_2)}`;

  const kwMatch = all.match(/\b([A-Z]{2}\d[A-Z0-9]\/?\d{7,8}\/?\d)\b/);
  const kwNumber = doc.kwNumber ?? (kwMatch ? kwMatch[1] : null) ?? "(nieznany numer KW)";

  const courtMatch = all.match(/(S[ĄA]D\s+REJONOWY[^,.;]*?)(?=,|\.|;|\s+WYDZIA|$)/i);
  const typeMatch = all.match(
    /(LOKAL\s+STANOWI[ĄA]CY\s+ODR[ĘE]BN[ĄA]\s+NIERUCHOMO[ŚS][ĆC]|NIERUCHOMO[ŚS][ĆC]\s+GRUNTOWA|NIERUCHOMO[ŚS][ĆC]\s+BUDYNKOWA|NIERUCHOMO[ŚS][ĆC]\s+LOKALOWA)/i,
  );

  // Zamknięcie księgi (0.3.0.1 chwila zamknięcia / 0.3.0.2 podstawa).
  const low = norm(cover);
  const isClosed =
    /chwila\s+zamkniecia/.test(low) &&
    !/chwila\s+zamkniecia[^a-z0-9]{0,20}(brak|---|nie\s+dotyczy)/.test(low) &&
    /zamkniet/.test(low);
  const closureMatch = cover.match(
    /podstawa\s+zamkni[ęe]cia[^a-ząćęłńóśźż0-9]{0,10}([^.;]{3,120})/i,
  );

  const available = Boolean(
    stripHtml(doc.dzial_1o) ||
    stripHtml(doc.dzial_2) ||
    stripHtml(doc.dzial_3) ||
    stripHtml(doc.dzial_4),
  );

  return {
    kwNumber: (kwNumber || "").replace(/\s/g, ""),
    court: courtMatch ? courtMatch[1].replace(/\s+/g, " ").trim() : null,
    type: typeMatch ? typeMatch[1].replace(/\s+/g, " ").toUpperCase() : null,
    fetchedAt: doc.fetchedAt ?? new Date(0).toISOString(),
    isClosed,
    closureReason: isClosed && closureMatch ? closureMatch[1].trim() : null,
    available,
  };
}

// ── Wzmianki (wszystkie działy: *.1.0.1, chwila wykreślenia *.1.0.3). ─────────
const MENTION_FIELDS: Array<{
  section: KwSection;
  fieldCode: string;
  src: keyof KwDocumentSections;
}> = [
  { section: "I_O", fieldCode: "1.1.0.1", src: "dzial_1o" },
  { section: "I_SP", fieldCode: "1.10.0.1", src: "dzial_1s" },
  { section: "II", fieldCode: "2.1.0.1", src: "dzial_2" },
  { section: "III", fieldCode: "3.1.0.1", src: "dzial_3" },
  { section: "IV", fieldCode: "4.1.0.1", src: "dzial_4" },
];

function parseMentions(doc: KwDocumentSections): NormalizedMention[] {
  const out: NormalizedMention[] = [];
  for (const f of MENTION_FIELDS) {
    const text = stripHtml(doc[f.src] as string | null | undefined);
    if (!text) continue;
    const low = norm(text);
    if (!/wzmiank/.test(low)) continue;
    // Każdy segment zawierający „wzmianka" traktujemy jako kandydata.
    for (const seg of splitEntries(text)) {
      const segLow = norm(seg);
      if (!/wzmiank/.test(segLow)) continue;
      const dz = seg.match(/dz\.?\s*kw[^0-9A-Z]{0,4}([A-Z0-9/.-]{4,})/i);
      // Aktywna, dopóki nie ma chwili wykreślenia w pobliżu.
      const isActive = !/(chwila\s+wykresl|wykreslono|wykreslon[ea])/.test(segLow);
      out.push({
        section: f.section,
        fieldCode: f.fieldCode,
        rawText: seg.slice(0, 400),
        dzKwNumber: dz ? dz[1].trim() : null,
        isActive,
        evidence: ev(f.section, seg, {
          fieldCode: f.fieldCode,
          fieldLabel: "Wzmianka",
          sourcePath: f.src,
        }),
      });
    }
  }
  return out;
}

// ── Dział I-O: nieruchomość + działki. ───────────────────────────────────────
function parseProperties(doc: KwDocumentSections): NormalizedProperty[] {
  const text = stripHtml(doc.dzial_1o);
  if (!text) return [];
  const addr = parseKwAddress(doc.dzial_1o);
  const parcels: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(
    /(?:numer\s+dzia[łl]ki|dzia[łl]ki\s+ewidencyjne)[^0-9]{0,40}(\d{1,4}(?:\/\d{1,4})?)/gi,
  )) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      parcels.push(m[1]);
    }
  }
  const kindM = text.match(
    /(?:przeznaczenie|rodzaj)\s+(?:lokalu|nieruchomo[śs]ci|budynku)[:\s]{0,4}([\s\S]{2,50}?)(?=\s+(?:obszar|numer|pole|kondygnacj|imi[eę]|dzia[łl]|wpis)|[.;]|$)/i,
  );
  const areaM = text.match(/obszar[^0-9]{0,20}(\d[\d\s.]*(?:,\d+)?)\s*(ha|m)/i);
  let areaM2: number | null = null;
  if (areaM) {
    const n = Number(
      areaM[1]
        .replace(/\s/g, "")
        .replace(/\.(?=\d{3}\b)/g, "")
        .replace(",", "."),
    );
    if (Number.isFinite(n) && n > 0)
      areaM2 = /ha/i.test(areaM[2]) ? Math.round(n * 10_000) : Math.round(n);
  }
  const useM = text.match(
    /spos[óo]b\s+korzystania[:\s]{0,4}([\s\S]{1,50}?)(?=\s+(?:obszar|numer|pole|wpis|dzia[łl])|[.;]|$)/i,
  );

  return [
    {
      kind: kindM ? kindM[1].trim().replace(/\s+/g, " ").toLowerCase() : null,
      address: addr.fullAddress ?? null,
      parcels,
      areaM2,
      landUse: useM ? useM[1].trim().replace(/\s+/g, " ") : null,
      // Lokal stanowiący odrębną nieruchomość albo nieruchomość gruntowa = pełne prawo.
      isDetached: true,
      evidence: [
        ev("I_O", text, {
          fieldCode: "1.4",
          fieldLabel: "Oznaczenie nieruchomości",
          sourcePath: "dzial_1o",
        }),
      ],
    },
  ];
}

// ── Dział I-Sp: prawa związane (udział w drodze, część wspólna, uż. wieczyste). ─
function parseAssociatedRights(doc: KwDocumentSections): NormalizedAssociatedRight[] {
  const text = stripHtml(doc.dzial_1s);
  if (!text) return [];
  const out: NormalizedAssociatedRight[] = [];
  for (const seg of splitEntries(text)) {
    const low = norm(seg);
    let kind: NormalizedAssociatedRight["kind"] = "OTHER";
    if (/droga|dojazd|dzialka\s+drogow/.test(low) && /udzia/.test(low)) kind = "ROAD_SHARE";
    else if (/droga|dojazd|przejazd|przechod/.test(low)) kind = "ROAD_ACCESS";
    else if (/nieruchomosci\s+wspoln|czesci\s+wspoln|udzial\s+zwiazany/.test(low))
      kind = "SHARE_IN_COMMON";
    else if (/uzytkowani[ae]\s+wieczyst/.test(low)) kind = "PERPETUAL_USUFRUCT";
    else continue;
    out.push({
      kind,
      description: seg.slice(0, 300),
      evidence: ev("I_SP", seg, {
        fieldCode: "1.11",
        fieldLabel: "Spis praw związanych",
        sourcePath: "dzial_1s",
      }),
    });
  }
  return out;
}

// ── Dział II: właściciele z udziałem i PESEL/REGON. ──────────────────────────
function parseOwners(doc: KwDocumentSections): NormalizedOwner[] {
  const text = stripHtml(doc.dzial_2);
  if (!text) return [];
  const persons = extractKwOwnerPersons(doc.dzial_2);
  const pesels = extractKwOwnerPesels(doc.dzial_2);
  const shares = [
    ...text.matchAll(
      /(?:wielko[śs][ćc]\s+udzia[łl]u|udzia[łl])[^0-9]{0,12}(\d{1,3}\s*\/\s*\d{1,3})/gi,
    ),
  ].map((m) => m[1].replace(/\s/g, ""));
  const coType = text.match(
    /wsp[óo]lno[śs][ćc]\s+(ustawow[a-z]*\s+majatkow[a-z]*|[a-ząćęłńóśźż]+)/i,
  );

  const out: NormalizedOwner[] = persons.map((p, i) => {
    const match = pesels.find(
      (x) => x.ownerName && norm(x.ownerName) === norm(`${p.firstName} ${p.lastName}`),
    );
    return {
      firstName: p.firstName,
      lastName: p.lastName,
      companyName: null,
      pesel: match?.pesel ?? null,
      krs: null,
      regon: null,
      fatherName: null,
      motherName: null,
      share: shares[i] ?? null,
      coOwnershipType: coType ? coType[1].trim() : null,
      evidence: [
        ev("II", `${p.firstName} ${p.lastName}`, {
          fieldCode: "2.2.5",
          fieldLabel: "Osoba fizyczna",
          sourcePath: "dzial_2",
        }),
      ],
    };
  });
  // PESEL bez rozpoznanej pary imię-nazwisko.
  for (const x of pesels) {
    if (out.some((o) => o.pesel === x.pesel)) continue;
    const parts = (x.ownerName ?? "").split(/\s+/).filter(Boolean);
    out.push({
      firstName: parts[0] ?? null,
      lastName: parts.slice(1).join(" ") || null,
      companyName: null,
      pesel: x.pesel,
      krs: null,
      regon: null,
      fatherName: null,
      motherName: null,
      share: null,
      coOwnershipType: coType ? coType[1].trim() : null,
      evidence: [
        ev("II", x.ownerName ?? x.pesel, {
          fieldCode: "2.2.5.8",
          fieldLabel: "PESEL",
          sourcePath: "dzial_2",
        }),
      ],
    });
  }
  // Osoby prawne (Nazwa / REGON / KRS).
  for (const m of text.matchAll(
    /nazwa[^A-ZĄĆĘŁŃÓŚŹŻ]{0,6}([A-ZĄĆĘŁŃÓŚŹŻ][^;]{2,80}?)(?=\s+(?:siedziba|regon|krs|kraj|lp\b|numer|udzia|$))/gi,
  )) {
    const name = m[1].trim();
    if (out.some((o) => o.companyName && norm(o.companyName) === norm(name))) continue;
    const rest = text.slice(m.index ?? 0, (m.index ?? 0) + 300);
    const regon = rest.match(/regon[^0-9]{0,6}(\d{9}|\d{14})/i);
    const krs = rest.match(/krs[^0-9]{0,6}(\d{10})/i);
    out.push({
      firstName: null,
      lastName: null,
      companyName: name,
      pesel: null,
      krs: krs ? krs[1] : null,
      regon: regon ? regon[1] : null,
      fatherName: null,
      motherName: null,
      share: null,
      coOwnershipType: coType ? coType[1].trim() : null,
      evidence: [
        ev("II", name, { fieldCode: "2.2.4", fieldLabel: "Osoba prawna", sourcePath: "dzial_2" }),
      ],
    });
  }
  return out;
}

// ── Dział III: klasyfikacja praw / roszczeń / ograniczeń. ────────────────────
const SECTION_THREE_MATCHERS: Array<{ kind: SectionThreeKind; label: string; re: RegExp }> = [
  {
    kind: "ENFORCEMENT",
    label: "Egzekucja / zajęcie",
    re: /egzekucj|komornik|zajeci[ae]|wszczeci|licytacj|zaje[łl]/,
  },
  {
    kind: "WARNING_MISMATCH",
    label: "Ostrzeżenie o niezgodności",
    re: /ostrzezenie.*niezgod|niezgodnosci\s+stanu\s+prawnego/,
  },
  {
    kind: "PROHIBITION",
    label: "Zakaz zbywania/obciążania",
    re: /zakaz\s+zbywani|zakaz\s+obciazani/,
  },
  {
    kind: "INSOLVENCY",
    label: "Upadłość / zarząd / syndyk",
    re: /upadlosc|likwidacj|restrukturyzacj|syndyk|zarzadc/,
  },
  { kind: "LIFE_ESTATE", label: "Dożywocie", re: /dozywoci/ },
  {
    kind: "PERSONAL_EASEMENT_FLAT",
    label: "Służebność osobista mieszkania",
    re: /sluzebnosc\s+osobist.*mieszk|sluzebnosc\s+mieszkani/,
  },
  {
    kind: "ROAD_EASEMENT",
    label: "Służebność drogi koniecznej",
    re: /sluzebnosc\s+drogi\s+koniecznej|droga\s+konieczn/,
  },
  {
    kind: "TRANSMISSION_EASEMENT",
    label: "Służebność przesyłu",
    re: /sluzebnosc\s+przesyl|przesyl/,
  },
  { kind: "USUFRUCT", label: "Użytkowanie", re: /uzytkowanie(?!\s+wieczyst)/ },
  { kind: "LEASE", label: "Najem / dzierżawa", re: /najem|najmu|dzierzaw/ },
  {
    kind: "OWNERSHIP_CLAIM",
    label: "Roszczenie o przeniesienie własności",
    re: /roszczenie.*(przeniesieni[ae]\s+wlasnosci|wlasnosc)|roszczenie\s+o\s+wybudowani|roszczenie\s+nabywc|roszczenie\s+dewelopersk/,
  },
  {
    kind: "MORTGAGE_CLAIM",
    label: "Roszczenie o ustanowienie hipoteki",
    re: /roszczenie.*hipotek/,
  },
  { kind: "PREEMPTION", label: "Prawo pierwokupu / odkupu", re: /pierwokup|prawo\s+odkupu/ },
  { kind: "LAND_EASEMENT", label: "Służebność gruntowa", re: /sluzebnosc\s+gruntow/ },
  {
    kind: "CO_ENCUMBRANCE",
    label: "Współobciążenie",
    re: /wsp[óo]lobciaz|nieruchomosc\s+wspolobciazon/,
  },
];

function classifySectionThree(seg: string): { kind: SectionThreeKind; label: string } {
  const low = norm(seg);
  for (const m of SECTION_THREE_MATCHERS) {
    if (m.re.test(low)) return { kind: m.kind, label: m.label };
  }
  return { kind: "OTHER", label: "Wpis Działu III" };
}

function extractBeneficiary(seg: string): string | null {
  const m =
    seg.match(/na\s+rzecz\s+([^.,;]{3,60})/i) ||
    seg.match(/uprawnion[ya][^:]{0,10}:?\s+([^.,;]{3,60})/i);
  return m ? m[1].trim() : null;
}

function parseSectionThree(doc: KwDocumentSections): NormalizedSectionThreeEntry[] {
  const text = stripHtml(doc.dzial_3);
  if (!text) return [];
  if (/brak\s+wpis/i.test(text) && norm(text).length < 40) return [];
  const out: NormalizedSectionThreeEntry[] = [];
  let idx = 0;
  for (const seg of splitEntries(text)) {
    const low = norm(seg);
    if (/brak\s+wpis/.test(low)) continue;
    if (/wzmiank/.test(low)) continue; // wzmianki obsługiwane osobno
    idx += 1;
    const { kind, label } = classifySectionThree(seg);
    const isActive = !/wykreslon|wykreslono/.test(low);
    out.push({
      entryNumber: String(idx),
      kind,
      kindLabel: label,
      rawText: seg.slice(0, 400),
      isActive,
      beneficiary: extractBeneficiary(seg),
      evidence: ev("III", seg, {
        fieldCode: "3.4.1.2",
        fieldLabel: "Treść wpisu",
        entryNumber: String(idx),
        sourcePath: "dzial_3",
      }),
      // Wpis, którego nie umiemy zaklasyfikować, wymaga ręcznej analizy.
      needsManualReview: kind === "OTHER",
    });
  }
  return out;
}

// ── Dział IV: hipoteki (wzbogacone o udział/pierwszeństwo/inne informacje). ───
function parseMortgagesNormalized(doc: KwDocumentSections): NormalizedMortgage[] {
  const base = parseMortgages(doc.dzial_4);
  return base.map((m, i) => {
    const low = norm(m.text);
    const shareM = m.text.match(/udzia[łl][^0-9]{0,20}(\d{1,3}\s*\/\s*\d{1,3})/i);
    const priorityM = m.text.match(
      /(pierwsze[ńn]stw[a-ząćęłńóśźż]*[^.;]{0,80}|r[óo]wne\s+pierwsze[ńn]stw[^.;]{0,60}|opr[óo]znion[ea]\s+miejsc[^.;]{0,60})/i,
    );
    const jointBooks = [...m.text.matchAll(/\b([A-Z]{2}\d[A-Z0-9]\/\d{7,8}\/\d)\b/g)].map(
      (x) => x[1],
    );
    const otherM = m.text.match(
      /(zaj[ęe]ci[ea]\s+wierzytelno[śs]ci[^.;]{0,80}|cesj[a-z]*[^.;]{0,60}|przelew[^.;]{0,60})/i,
    );
    return {
      entryNumber: String(i + 1),
      kind: /przymusow/.test(low)
        ? "HIPOTEKA PRZYMUSOWA"
        : /[łl]aczn/.test(low)
          ? "HIPOTEKA ŁĄCZNA"
          : "HIPOTEKA UMOWNA",
      sum: m.amount,
      currency: m.currency,
      creditor: m.creditor,
      encumberedShare: shareM ? shareM[1].replace(/\s/g, "") : null,
      priority: priorityM ? priorityM[1].trim() : null,
      jointBooks: [...new Set(jointBooks)],
      otherInfo: otherM ? otherM[1].trim() : null,
      isRevolvingHint: /odnawialn|rewolwing|limit\s+kredytow|linia\s+kredytow/.test(low),
      isActive: !/wykreslon/.test(low),
      rawText: m.text,
      evidence: ev("IV", m.text, {
        fieldCode: "4.4.1",
        fieldLabel: "Hipoteka",
        entryNumber: String(i + 1),
        sourcePath: "dzial_4",
      }),
    };
  });
}

// ── Opróżnione miejsce hipoteczne (4.8). ─────────────────────────────────────
function parseVacantRank(doc: KwDocumentSections): NormalizedVacantRankRight[] {
  const text = stripHtml(doc.dzial_4);
  if (!text) return [];
  const out: NormalizedVacantRankRight[] = [];
  for (const seg of splitEntries(text)) {
    if (
      /opr[óo][żz]nion\w*\s+miejsc|rozporz[ąa]dz\w*.*miejsc\w*.*hipotecz|uprawnieni\w*.*opr[óo][żz]nion/i.test(
        seg,
      )
    ) {
      out.push({
        rawText: seg.slice(0, 300),
        evidence: ev("IV", seg, {
          fieldCode: "4.8",
          fieldLabel: "Uprawnienie do rozporządzania opróżnionym miejscem",
          sourcePath: "dzial_4",
        }),
      });
    }
  }
  return out;
}

// ── Komentarze migracyjne (*.9.0.1 / *.x.0.1). ───────────────────────────────
function parseMigrationComments(doc: KwDocumentSections): SourceEvidence[] {
  const out: SourceEvidence[] = [];
  const map: Array<[KwSection, keyof KwDocumentSections, string]> = [
    ["I_O", "dzial_1o", "1.9.0.1"],
    ["I_SP", "dzial_1s", "1.14.0.1"],
    ["II", "dzial_2", "2.8.0.1"],
    ["III", "dzial_3", "3.7.0.1"],
    ["IV", "dzial_4", "4.7.0.1"],
  ];
  for (const [section, src, code] of map) {
    const text = stripHtml(doc[src] as string | null | undefined);
    if (!text) continue;
    const m = text.match(/komentarz\s+migracyjny[:\s]{0,4}([^.;]{4,300})/i);
    if (m && !/^brak\b/i.test(m[1].trim())) {
      out.push(
        ev(section, m[1].trim(), {
          fieldCode: code,
          fieldLabel: "Komentarz migracyjny",
          sourcePath: String(src),
        }),
      );
    }
  }
  return out;
}

/**
 * Buduje `NormalizedLandRegister` z sekcji KW. Jedno źródło prawdy dla silnika
 * reguł, resolvera pierwszeństwa i detektora tożsamości.
 */
export function normalizeLandRegister(doc: KwDocumentSections): NormalizedLandRegister {
  return {
    meta: parseMeta(doc),
    properties: parseProperties(doc),
    associatedRights: parseAssociatedRights(doc),
    owners: parseOwners(doc),
    sectionThreeEntries: parseSectionThree(doc),
    mortgages: parseMortgagesNormalized(doc),
    vacantRankRights: parseVacantRank(doc),
    mentions: parseMentions(doc),
    migrationComments: parseMigrationComments(doc),
  };
}
