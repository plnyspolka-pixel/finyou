// Parser prawny księgi wieczystej — przekształca surowe działy (HTML/tekst)
// z kw_documents na ustrukturyzowaną ocenę stanu prawnego.
// Dział II = własność, Dział III = prawa/roszczenia/ograniczenia, Dział IV = hipoteki.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { KwLegalAnalysis } from "./types";

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Wyciąga kwotę PLN z tekstu typu "1 234 567,89 zł" / "500000 PLN".
function extractAmountPln(text: string): { amount: number | null; currency: string | null } {
  // Najpierw preferuj kwoty z jednostką waluty.
  const m = text.match(/([\d][\d\s.]*,\d{2}|\d[\d\s]{2,})\s*(z[łl]|pln|eur|chf|usd)/i);
  if (m) {
    const raw = m[1].replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
    const n = Number(raw);
    const curRaw = m[2].toLowerCase();
    const currency = /z[łl]|pln/.test(curRaw) ? "PLN" : curRaw.toUpperCase();
    return { amount: Number.isFinite(n) && n > 0 ? Math.round(n) : null, currency };
  }
  return { amount: null, currency: null };
}

function splitEntries(text: string): string[] {
  // Rozbij dług tekst działu na sensowne fragmenty (wpisy).
  return text
    .split(/(?:\.\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])|;\s+|\n)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

// Słowa, które nie są imieniem/nazwiskiem — odsiewają fałszywe dopasowania.
const NAME_STOPWORDS = new Set([
  "wlasciciel", "wspolwlasciciel", "udzial", "prawo", "dzial", "ksiega", "wieczysta",
  "hipoteka", "wpis", "wzmianka", "numer", "data", "rodzaj", "tresc", "podstawa",
  "nieruchomosc", "lokal", "budynek", "dzialka", "wartosc", "kwota", "lista", "osoba",
  "fizyczna", "prawna", "imie", "imiona", "nazwisko", "pesel", "regon", "skarb", "panstwa",
  "gmina", "miasto", "wojewodztwo", "sad", "rejonowy",
]);

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}

function parseOwners(dzial2: string | null | undefined): string[] {
  const text = stripHtml(dzial2);
  if (!text) return [];
  const owners = new Set<string>();

  // 1) Ekstrakcja po etykiecie „Imię: … Nazwisko: …" (typowy układ EKW).
  const labeled = [...text.matchAll(/imi[eę][^:]*:\s*([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+)[\s\S]{0,40}?nazwisk[^:]*:\s*([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+)/giu)];
  for (const m of labeled) {
    const cand = `${m[1]} ${m[2]}`.trim();
    if (cand.length <= 60) owners.add(cand);
  }

  // 2) Osoby fizyczne: dwa–trzy człony rozpoczynające się wielką literą
  //    (obsługuje „Jan Kowalski", „KOWALSKI JAN", „Anna Nowak-Kowalska").
  const personRe = /\b([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+)?)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+)?)(?:\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}]+))?\b/gu;
  let m: RegExpExecArray | null;
  while ((m = personRe.exec(text)) !== null) {
    const tokens = [m[1], m[2], m[3]].filter(Boolean) as string[];
    if (tokens.some((t) => NAME_STOPWORDS.has(norm(t)))) continue;
    const candidate = tokens.join(" ").trim();
    if (candidate.length >= 5 && candidate.length <= 60) owners.add(candidate);
  }

  // 3) Osoby prawne / instytucje.
  const orgRe = /((?:Sp[óo]ł?ka|Sp\.\s*z\s*o\.o\.|S\.A\.|Bank|Gmina|Skarb Pa[ńn]stwa|Wsp[óo]lnota)[^.,;]{0,60})/gi;
  while ((m = orgRe.exec(text)) !== null) {
    const o = m[1].trim();
    if (o.length > 3) owners.add(o);
  }
  return [...owners].slice(0, 12);
}

const ENFORCEMENT_KEYWORDS = ["egzekucj", "komornik", "zajęci", "zajecie", "wszczęci", "wszczecie", "licytacj"];
const USUFRUCT_KEYWORDS = ["służebno", "sluzebno", "dożywoci", "dozywoci", "użytkowani", "uzytkowani doz"];
const CLAIM_KEYWORDS = ["roszczeni", "ostrzeżeni", "ostrzezeni", "zakaz zbywani", "prawo pierwokupu", "dzierżaw", "najem", "wpis warunkowy"];

function parseEncumbrances(dzial3: string | null | undefined): { encumbrances: string[]; hasEnforcement: boolean; hasUsufruct: boolean } {
  const text = stripHtml(dzial3);
  const entries = splitEntries(text);
  const low = text.toLowerCase();
  const hasEnforcement = ENFORCEMENT_KEYWORDS.some((k) => low.includes(k));
  const hasUsufruct = USUFRUCT_KEYWORDS.some((k) => low.includes(k));
  const flagged = entries.filter((e) => {
    const el = e.toLowerCase();
    return (
      ENFORCEMENT_KEYWORDS.some((k) => el.includes(k)) ||
      USUFRUCT_KEYWORDS.some((k) => el.includes(k)) ||
      CLAIM_KEYWORDS.some((k) => el.includes(k))
    );
  });
  // Gdy dział niepusty, ale nic nie sflagowano — pokaż pierwsze wpisy jako ograniczenia.
  const encumbrances = (flagged.length ? flagged : entries).slice(0, 10);
  return { encumbrances, hasEnforcement, hasUsufruct };
}

function parseMortgages(dzial4: string | null | undefined): KwLegalAnalysis["mortgages"] {
  const text = stripHtml(dzial4);
  if (!text || /brak wpis/i.test(text)) return [];
  const entries = splitEntries(text).filter((e) => /hipotek|wierzyteln|zabezpiecz|kwota/i.test(e));
  const out: KwLegalAnalysis["mortgages"] = [];
  for (const e of entries.slice(0, 10)) {
    const { amount, currency } = extractAmountPln(e);
    const creditorM = e.match(/(?:na rzecz|wierzyciel[a-z]*:?)\s+([^.,;]{3,60})/i);
    out.push({
      text: e.slice(0, 240),
      amount,
      currency,
      creditor: creditorM ? creditorM[1].trim() : null,
    });
  }
  return out;
}

function computeLegalRiskScore(a: {
  hasMortgages: boolean;
  totalMortgage: number | null;
  hasEnforcement: boolean;
  hasUsufruct: boolean;
  encumbranceCount: number;
  hasCoOwners: boolean;
}): number {
  let score = 100;
  if (a.hasMortgages) score -= 25;
  if (a.hasEnforcement) score -= 35;
  if (a.hasUsufruct) score -= 20;
  if (a.hasCoOwners) score -= 10;
  score -= Math.min(15, a.encumbranceCount * 3);
  return Math.max(0, Math.min(100, score));
}

export async function analyzeKwLegal(args: {
  kwNumber: string | null;
  hasCoOwners?: boolean | null;
  hasMortgageFlag?: boolean | null;
}): Promise<KwLegalAnalysis> {
  const empty: KwLegalAnalysis = {
    available: false,
    kwNumber: args.kwNumber ?? null,
    owners: [],
    encumbrances: [],
    mortgages: [],
    totalMortgageAmountPln: null,
    hasEnforcement: false,
    hasUsufruct: false,
    legalRiskScore: 60,
    warnings: [],
    summary: "Brak pobranej treści KW — stan prawny wymaga weryfikacji.",
  };

  const kw = (args.kwNumber ?? "").replace(/\s|\//g, "").toUpperCase();
  if (!kw) return empty;

  const { data: row } = await supabaseAdmin
    .from("kw_documents")
    .select("kw_number, status, dzial_2, dzial_3, dzial_4")
    .eq("kw_number", kw)
    .maybeSingle();

  if (!row || row.status !== "ready") return empty;

  const owners = parseOwners(row.dzial_2);
  const { encumbrances, hasEnforcement, hasUsufruct } = parseEncumbrances(row.dzial_3);
  const mortgages = parseMortgages(row.dzial_4);
  const totalMortgage = mortgages.reduce<number | null>((acc, m) => {
    if (m.amount == null) return acc;
    return (acc ?? 0) + m.amount;
  }, null);

  const hasCoOwners = args.hasCoOwners ?? owners.length > 1;
  const legalRiskScore = computeLegalRiskScore({
    hasMortgages: mortgages.length > 0,
    totalMortgage,
    hasEnforcement,
    hasUsufruct,
    encumbranceCount: encumbrances.length,
    hasCoOwners: !!hasCoOwners,
  });

  const warnings: string[] = [];
  if (mortgages.length > 0)
    warnings.push(
      `Nieruchomość obciążona hipoteką${totalMortgage ? ` na ok. ${totalMortgage.toLocaleString("pl-PL")} PLN` : ""} (dział IV KW).`,
    );
  if (hasEnforcement) warnings.push("W dziale III KW występują wpisy o egzekucji/zajęciu — bardzo wysokie ryzyko prawne.");
  if (hasUsufruct) warnings.push("W dziale III KW występuje służebność/dożywocie — ograniczenie zbywalności/wartości.");
  if (owners.length > 1) warnings.push(`Wielu właścicieli w dziale II KW (${owners.length}) — wymagana zgoda współwłaścicieli.`);

  const summary =
    `Dział II: ${owners.length ? owners.length + " podmiotów (" + owners.slice(0, 3).join(", ") + (owners.length > 3 ? "…" : "") + ")" : "brak rozpoznanych właścicieli"}. ` +
    `Dział III: ${encumbrances.length ? encumbrances.length + " wpisów" : "brak istotnych wpisów"}${hasEnforcement ? " (w tym egzekucja)" : ""}. ` +
    `Dział IV: ${mortgages.length ? mortgages.length + " hipotek" + (totalMortgage ? ", łącznie ~" + totalMortgage.toLocaleString("pl-PL") + " PLN" : "") : "brak hipotek"}.`;

  return {
    available: true,
    kwNumber: kw,
    owners,
    encumbrances,
    mortgages,
    totalMortgageAmountPln: totalMortgage,
    hasEnforcement,
    hasUsufruct,
    legalRiskScore,
    warnings,
    summary,
  };
}
