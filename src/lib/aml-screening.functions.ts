// Screening AML: CRBR (beneficjenci rzeczywiści) + PEP/sankcje przez OpenSanctions/yente.
//
// Konfiguracja (zmienne środowiskowe, wyłącznie po stronie serwera):
//  - CRBR_SEARCH_URL        URL wyszukiwarki CRBR z placeholderem {nip},
//                           np. endpoint publicznej wyszukiwarki MF (crbr.podatki.gov.pl)
//                           albo komercyjnego proxy zwracającego surową odpowiedź CRBR.
//                           Parser szuka w odpowiedzi pola `listaBeneficjentow`
//                           (pola beneficjenta wg schematu MF: imiePierwsze, nazwisko,
//                           pesel, dataUrodzenia, obywatelstwo, panstwoZamieszkania,
//                           informacjeOUdzialeLubUprawnieniach, ...).
//                           Uwaga: wyszukiwarka MF stoi za ochroną anty-botową — jeśli
//                           bezpośrednie wywołania są odrzucane, należy wskazać tu proxy.
//  - CRBR_API_KEY           opcjonalny nagłówek Authorization dla powyższego URL.
//  - YENTE_API_URL          baza API yente / OpenSanctions (domyślnie https://api.opensanctions.org;
//                           dla self-hosted yente np. http://yente.internal:8000).
//  - OPENSANCTIONS_API_KEY  klucz API OpenSanctions (zbędny przy self-hosted yente).
//  - AML_MATCH_THRESHOLD    próg score uznawany za trafienie (domyślnie 0.7).
//
// Wyniki zapisujemy w tabeli aml_screenings — screening trzeba móc powtarzać
// okresowo i wykazać jego wykonanie (dokumentacja środków bezpieczeństwa finansowego).
// Ocena trafień należy do operatora; oświadczenie PEP klienta znajduje się w dokumentach.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { lookupKrsCompany, type KrsCompany } from "./krs.functions";
import { parsePesel } from "./risk-assessment/pesel";
import type { ClientProfile } from "./client-profile-types";
import type {
  AmlOverallStatus,
  AmlScreeningReport,
  AmlStage,
  AmlStageName,
  AmlStageStatus,
  CrbrBeneficiary,
  CrbrDiscrepancy,
  CrbrResult,
  PersonScreeningResult,
  ScreenedPersonSource,
  ScreeningCandidate,
} from "./aml-screening-types";

const CRBR_TIMEOUT_MS = 20000;
const YENTE_TIMEOUT_MS = 30000;
const YENTE_BATCH_SIZE = 20;
const CANDIDATE_MIN_SCORE = 0.5;
const CANDIDATES_PER_PERSON = 5;

// Podmioty podlegające wpisowi do CRBR (art. 58 ustawy AML).
// JDG i spółka cywilna nie podlegają — dla nich CRBR pomijamy.
const CRBR_SUBJECT_TYPES = new Set(["sp_zoo", "sp_jawna", "sp_komandytowa", "sp_akcyjna", "psa", "inny"]);

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Spłaszcza wartości z odpowiedzi CRBR (słowniki MF: {wartosc}/{opis}/{nazwa}/{kod}, tablice). */
function asText(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const joined = v.map(asText).filter(Boolean).join(", ");
    return joined || undefined;
  }
  if (typeof v === "object") {
    for (const k of ["wartosc", "opis", "nazwa", "kod"]) {
      if (v[k] != null) return asText(v[k]);
    }
    const joined = Object.values(v).map(asText).filter(Boolean).join(", ");
    return joined || undefined;
  }
  return undefined;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function logExternalCall(provider: string, queryType: string, queryValue: string, success: boolean, errorCode: string | null, ms: number) {
  try {
    await supabaseAdmin.from("external_api_logs").insert({
      provider, query_type: queryType, query_value: queryValue,
      success, error_code: errorCode, response_time_ms: ms,
    });
  } catch {
    // log nie może wywrócić screeningu
  }
}

// ─── CRBR ─────────────────────────────────────────────────────────────

/** Szuka w drzewie odpowiedzi pierwszej niepustej tablicy pod kluczem `listaBeneficjentow`. */
function findBeneficiariesNode(root: any): any[] | null {
  const queue: any[] = [root];
  let guard = 0;
  while (queue.length > 0 && guard < 5000) {
    guard++;
    const node = queue.shift();
    if (node == null || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    const lista = node.listaBeneficjentow ?? node.beneficjenci;
    if (Array.isArray(lista) && lista.length > 0) return lista;
    queue.push(...Object.values(node));
  }
  return null;
}

function mapBeneficiary(b: any): CrbrBeneficiary {
  return {
    firstName: asText(b?.imiePierwsze ?? b?.imie),
    middleNames: asText(b?.imieDrugieINastepne ?? b?.imieDrugie),
    lastName: asText(b?.nazwisko),
    pesel: asText(b?.pesel),
    birthDate: asText(b?.dataUrodzenia),
    citizenship: asText(b?.obywatelstwo ?? b?.obywatelstwa),
    residenceCountry: asText(b?.panstwoZamieszkania),
    groupName: asText(b?.nazwaBeneficjentaGrupowego),
    rights: asText(b?.informacjeOUdzialeLubUprawnieniach),
    trustRights: asText(b?.informacjeOUprawnieniachTrust),
  };
}

async function crbrLookupByNip(nip: string): Promise<CrbrResult> {
  const template = process.env.CRBR_SEARCH_URL;
  if (!template) {
    return {
      status: "not_configured",
      beneficiaries: [],
      message: "Integracja CRBR nie jest skonfigurowana — ustaw zmienną CRBR_SEARCH_URL (URL wyszukiwarki z placeholderem {nip}).",
    };
  }
  const url = template.includes("{nip}")
    ? template.replace("{nip}", encodeURIComponent(nip))
    : `${template}${template.includes("?") ? "&" : "?"}nip=${encodeURIComponent(nip)}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.CRBR_API_KEY) headers.Authorization = process.env.CRBR_API_KEY;

  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(url, { headers }, CRBR_TIMEOUT_MS);
    const elapsed = Date.now() - t0;
    if (res.status === 404) {
      await logExternalCall("CRBR", "nip", nip, true, "NOT_FOUND", elapsed);
      return { status: "not_found", beneficiaries: [], message: "Brak wpisu w CRBR dla podanego NIP." };
    }
    if (!res.ok) {
      await logExternalCall("CRBR", "nip", nip, false, `HTTP_${res.status}`, elapsed);
      return { status: "error", beneficiaries: [], message: `Błąd CRBR: HTTP ${res.status}.` };
    }
    const json: any = await res.json().catch(() => null);
    if (!json) {
      await logExternalCall("CRBR", "nip", nip, false, "INVALID_JSON", elapsed);
      return { status: "error", beneficiaries: [], message: "CRBR zwrócił odpowiedź w nieoczekiwanym formacie (brak JSON)." };
    }
    const lista = findBeneficiariesNode(json);
    if (!lista) {
      await logExternalCall("CRBR", "nip", nip, true, "EMPTY", elapsed);
      return { status: "not_found", beneficiaries: [], message: "Brak wpisu w CRBR dla podanego NIP (lub odpowiedź bez listy beneficjentów)." };
    }
    await logExternalCall("CRBR", "nip", nip, true, null, elapsed);
    return { status: "found", beneficiaries: lista.map(mapBeneficiary) };
  } catch (e: any) {
    await logExternalCall("CRBR", "nip", nip, false, e?.name === "AbortError" ? "TIMEOUT" : "NETWORK", Date.now() - t0);
    return { status: "error", beneficiaries: [], message: `Błąd połączenia z CRBR: ${String(e?.message ?? e)}` };
  }
}

// ─── Porównanie CRBR ↔ KRS ────────────────────────────────────────────

function beneficiaryDisplayName(b: CrbrBeneficiary): string {
  return b.groupName ?? [b.firstName, b.lastName].filter(Boolean).join(" ");
}

/** Dopasowanie osoby po imieniu i nazwisku, odporne na drugie imiona i diakrytyki. */
function samePerson(aFirst: string | undefined, aLast: string | undefined, bFull: string): boolean {
  const last = normalizeName(aLast ?? "");
  const first = normalizeName(aFirst ?? "").split(" ")[0] ?? "";
  const target = normalizeName(bFull);
  if (!last || !target) return false;
  const tokens = target.split(" ");
  return tokens.includes(last) && (!first || tokens.includes(first));
}

// Tokeny form prawnych — wspólnik będący spółką nie podlega porównaniu osobowemu.
const LEGAL_FORM_TOKENS = /(SPÓŁKA|SPOLKA|SP\.\s*Z\s*O\.?\s*O|S\.A\.|SP\.K\.|SP\.J\.|P\.S\.A|FUNDACJA|STOWARZYSZENIE|SPÓŁDZIELNIA|HOLDING|LIMITED|LTD|GMBH|B\.V\.|S\.R\.L)/i;

function compareCrbrWithKrs(crbr: CrbrResult, krs: KrsCompany | null): CrbrDiscrepancy[] {
  const out: CrbrDiscrepancy[] = [];

  if (crbr.status === "not_found") {
    out.push({
      level: "critical",
      code: "BRAK_WPISU_CRBR",
      message:
        "Spółka podlega wpisowi do CRBR, ale wpisu nie znaleziono. Jako instytucja obowiązana mamy obowiązek odnotować i zgłosić rozbieżność (art. 61a ustawy AML).",
    });
    return out;
  }
  if (crbr.status !== "found") return out;

  if (crbr.beneficiaries.length === 0) {
    out.push({
      level: "warning",
      code: "BRAK_BENEFICJENTOW",
      message: "Wpis w CRBR istnieje, ale lista beneficjentów jest pusta — wymaga wyjaśnienia.",
    });
    return out;
  }
  if (!krs) return out;

  const krsPersons = [
    ...krs.representation.members,
    ...krs.managementBoard,
    ...krs.proxies,
  ].map((p) => `${p.firstName} ${p.lastName}`);
  const krsPartnerPersons = krs.partnersOrShareholders
    .map((w) => w.name)
    .filter((n) => n && !LEGAL_FORM_TOKENS.test(n));
  const allKrsNames = [...krsPersons, ...krsPartnerPersons];

  // 1. Beneficjent z CRBR nieobecny w KRS — informacyjnie (normalne przy strukturach
  //    pośrednich, ale operator powinien umieć wyjaśnić źródło kontroli).
  for (const b of crbr.beneficiaries) {
    if (b.groupName && !b.lastName) continue;
    const found = allKrsNames.some((n) => samePerson(b.firstName, b.lastName, n));
    if (!found) {
      out.push({
        level: "info",
        code: "BENEFICJENT_SPOZA_KRS",
        message: `Beneficjent „${beneficiaryDisplayName(b)}" nie występuje w KRS (zarząd/prokura/wspólnicy) — ustal źródło kontroli (np. struktura pośrednia).`,
      });
    }
  }

  // 2. Wspólnik-osoba fizyczna z KRS nieujęty w CRBR — potencjalna rozbieżność.
  for (const name of krsPartnerPersons) {
    const found = crbr.beneficiaries.some((b) => samePerson(b.firstName, b.lastName, name));
    if (!found) {
      out.push({
        level: "warning",
        code: "WSPOLNIK_KRS_POZA_CRBR",
        message: `Wspólnik z KRS „${name}" nie figuruje jako beneficjent w CRBR — zweryfikuj wielkość udziałów i aktualność wpisu.`,
      });
    }
  }

  // 3. Ta sama osoba, różny PESEL w KRS i CRBR.
  const krsWithPesel = [...krs.representation.members, ...krs.managementBoard, ...krs.proxies].filter((p) => p.pesel);
  for (const b of crbr.beneficiaries) {
    if (!b.pesel) continue;
    for (const p of krsWithPesel) {
      if (samePerson(b.firstName, b.lastName, `${p.firstName} ${p.lastName}`) && p.pesel !== b.pesel) {
        out.push({
          level: "critical",
          code: "ROZBIEZNY_PESEL",
          message: `Rozbieżny PESEL dla „${beneficiaryDisplayName(b)}" między KRS a CRBR — możliwa pomyłka we wpisie, wymaga zgłoszenia rozbieżności.`,
        });
      }
    }
  }

  return out;
}

// ─── Zbieranie osób do screeningu ─────────────────────────────────────

interface ScreenTarget {
  name: string;
  birthDate?: string;
  schema: "Person" | "Company" | "LegalEntity";
  sources: ScreenedPersonSource[];
}

function birthDateFromPesel(pesel?: string): string | undefined {
  if (!pesel) return undefined;
  const info = parsePesel(pesel);
  return info.valid && info.birthDate ? info.birthDate : undefined;
}

function collectScreenTargets(
  profile: ClientProfile,
  krs: KrsCompany | null,
  crbr: CrbrResult,
): ScreenTarget[] {
  const targets = new Map<string, ScreenTarget>();

  const add = (name: string | undefined, source: ScreenedPersonSource, opts?: { birthDate?: string; schema?: ScreenTarget["schema"] }) => {
    const clean = (name ?? "").replace(/\s+/g, " ").trim();
    if (clean.length < 3) return;
    const key = `${opts?.schema ?? "Person"}|${normalizeName(clean)}`;
    const existing = targets.get(key);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.birthDate && opts?.birthDate) existing.birthDate = opts.birthDate;
      return;
    }
    targets.set(key, {
      name: clean,
      birthDate: opts?.birthDate,
      schema: opts?.schema ?? "Person",
      sources: [source],
    });
  };

  const b = profile.borrowerData ?? {};

  // Sam podmiot (spółka) — sankcje bywają nakładane też na firmy.
  if (profile.borrowerType !== "JDG" && b.companyName) {
    add(b.companyName, "spolka", { schema: "Company" });
  }

  // Pożyczkobiorca-osoba (JDG) i dane osobowe z profilu.
  if (b.firstName || b.lastName) {
    add(`${b.firstName ?? ""} ${b.lastName ?? ""}`, "profil", { birthDate: birthDateFromPesel(b.pesel) });
  }

  const rep = profile.representativeData;
  if (rep && (rep.firstName || rep.lastName)) {
    add(`${rep.firstName ?? ""} ${rep.lastName ?? ""}`, "reprezentant", { birthDate: birthDateFromPesel(rep.pesel) });
  }

  if (krs) {
    for (const p of [...krs.representation.members, ...krs.managementBoard]) {
      add(`${p.firstName} ${p.lastName}`, "KRS_zarzad", { birthDate: birthDateFromPesel(p.pesel) });
    }
    for (const p of krs.proxies) {
      add(`${p.firstName} ${p.lastName}`, "KRS_prokurent", { birthDate: birthDateFromPesel(p.pesel) });
    }
    for (const w of krs.partnersOrShareholders) {
      // Wspólnikiem może być osoba lub spółka — LegalEntity dopasowuje oba typy.
      add(w.name, "KRS_wspolnik", { schema: LEGAL_FORM_TOKENS.test(w.name) ? "Company" : "LegalEntity" });
    }
  }

  for (const ben of crbr.beneficiaries) {
    if (ben.groupName && !ben.lastName) {
      add(ben.groupName, "CRBR_beneficjent", { schema: "LegalEntity" });
      continue;
    }
    add(`${ben.firstName ?? ""} ${ben.lastName ?? ""}`, "CRBR_beneficjent", {
      birthDate: ben.birthDate ?? birthDateFromPesel(ben.pesel),
    });
  }

  if (profile.securityData?.guarantorName) {
    add(profile.securityData.guarantorName, "poreczyciel", {
      birthDate: birthDateFromPesel(profile.securityData.guarantorPesel),
    });
  }

  const owner = profile.propertyData?.owner;
  if (owner && !owner.isBorrower && (owner.firstName || owner.lastName)) {
    add(`${owner.firstName ?? ""} ${owner.lastName ?? ""}`, "wlasciciel_nieruchomosci", {
      birthDate: birthDateFromPesel(owner.pesel),
    });
  }

  return Array.from(targets.values());
}

// ─── OpenSanctions / yente ────────────────────────────────────────────

function yenteConfig(): { base: string; headers: Record<string, string> } {
  const base = (process.env.YENTE_API_URL || "https://api.opensanctions.org").replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const key = process.env.OPENSANCTIONS_API_KEY;
  if (key) headers.Authorization = `ApiKey ${key}`;
  return { base, headers };
}

function matchThreshold(): number {
  const v = Number(process.env.AML_MATCH_THRESHOLD);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.7;
}

function mapCandidate(r: any): ScreeningCandidate {
  const topics: string[] = Array.isArray(r?.properties?.topics) ? r.properties.topics : [];
  return {
    entityId: String(r?.id ?? ""),
    caption: String(r?.caption ?? ""),
    score: Number(r?.score ?? 0),
    match: Boolean(r?.match),
    topics,
    datasets: Array.isArray(r?.datasets) ? r.datasets : [],
    isPep: topics.includes("role.pep"),
    isRca: topics.includes("role.rca"),
    isSanctioned: topics.some((t) => t.startsWith("sanction")),
  };
}

async function screenTargets(targets: ScreenTarget[]): Promise<{ results: PersonScreeningResult[]; provider: string; error?: string }> {
  const { base, headers } = yenteConfig();
  const provider = base.includes("opensanctions.org") ? "OpenSanctions API" : `yente (${base})`;
  const threshold = matchThreshold();
  const results: PersonScreeningResult[] = [];

  for (let i = 0; i < targets.length; i += YENTE_BATCH_SIZE) {
    const batch = targets.slice(i, i + YENTE_BATCH_SIZE);
    const queries: Record<string, any> = {};
    batch.forEach((t, idx) => {
      const properties: Record<string, string[]> = { name: [t.name] };
      if (t.schema === "Person") {
        properties.country = ["pl"];
        if (t.birthDate) properties.birthDate = [t.birthDate];
      }
      if (t.schema === "Company") {
        properties.jurisdiction = ["pl"];
      }
      queries[`q${idx}`] = { schema: t.schema, properties };
    });

    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(
        `${base}/match/default`,
        { method: "POST", headers, body: JSON.stringify({ queries }) },
        YENTE_TIMEOUT_MS,
      );
      const elapsed = Date.now() - t0;
      if (!res.ok) {
        await logExternalCall("OpenSanctions", "match", `batch:${batch.length}`, false, `HTTP_${res.status}`, elapsed);
        const msg =
          res.status === 401 || res.status === 403
            ? "Klucz OPENSANCTIONS_API_KEY jest nieprawidłowy lub wygasł."
            : `Błąd API screeningu: HTTP ${res.status}.`;
        return { results, provider, error: msg };
      }
      const json: any = await res.json().catch(() => null);
      await logExternalCall("OpenSanctions", "match", `batch:${batch.length}`, true, null, elapsed);

      batch.forEach((t, idx) => {
        const raw: any[] = json?.responses?.[`q${idx}`]?.results ?? [];
        const candidates = raw
          .map(mapCandidate)
          .filter((c) => c.score >= CANDIDATE_MIN_SCORE)
          .sort((a, b2) => b2.score - a.score)
          .slice(0, CANDIDATES_PER_PERSON);
        const top = candidates[0];
        const status: PersonScreeningResult["status"] =
          top && (top.match || top.score >= threshold) ? "hit" : top ? "review" : "clear";
        results.push({
          name: t.name,
          birthDate: t.birthDate,
          sources: t.sources,
          status,
          candidates,
        });
      });
    } catch (e: any) {
      await logExternalCall("OpenSanctions", "match", `batch:${batch.length}`, false, e?.name === "AbortError" ? "TIMEOUT" : "NETWORK", Date.now() - t0);
      return { results, provider, error: `Błąd połączenia ze screeningiem: ${String(e?.message ?? e)}` };
    }
  }

  return { results, provider };
}

// ─── Server functions ─────────────────────────────────────────────────

function makeStages(): Record<AmlStageName, AmlStage> {
  const names: AmlStageName[] = [
    "Pobranie profilu",
    "CRBR — beneficjenci rzeczywiści",
    "KRS — reprezentacja i wspólnicy",
    "Porównanie CRBR ↔ KRS",
    "Screening PEP/sankcje",
    "Zapis wyniku",
  ];
  return Object.fromEntries(names.map((n) => [n, { name: n, status: "oczekuje" as AmlStageStatus }])) as Record<AmlStageName, AmlStage>;
}

function computeOverallStatus(
  crbr: CrbrResult,
  discrepancies: CrbrDiscrepancy[],
  screening: PersonScreeningResult[],
  screeningError: string | undefined,
): AmlOverallStatus {
  const anyHit = screening.some((s) => s.status === "hit") || discrepancies.some((d) => d.level === "critical");
  if (anyHit) return "hits";
  if (crbr.status === "not_configured" || crbr.status === "error" || screeningError) return "incomplete";
  const anyReview = screening.some((s) => s.status === "review") || discrepancies.some((d) => d.level === "warning");
  if (anyReview) return "review";
  return "clear";
}

export const runAmlScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AmlScreeningReport> => {
    const { supabase, userId } = context;
    const stages = makeStages();
    const warnings: string[] = [];

    // 1. Profil
    stages["Pobranie profilu"].status = "trwa";
    const { data: row, error } = await supabase
      .from("client_profiles")
      .select("id, data, borrower_type, nip")
      .eq("id", data.profileId)
      .single();
    if (error || !row) {
      stages["Pobranie profilu"].status = "błąd";
      stages["Pobranie profilu"].message = error?.message ?? "Profil nie został znaleziony.";
      throw new Error(error?.message ?? "Profil nie został znaleziony.");
    }
    const profile = { ...(row.data as unknown as ClientProfile), id: row.id };
    const nip = (profile.borrowerData?.nip ?? row.nip ?? "").replace(/[\s-]/g, "") || undefined;
    stages["Pobranie profilu"].status = "sukces";

    const isCompany = profile.borrowerType !== "JDG";
    const crbrApplies = CRBR_SUBJECT_TYPES.has(profile.borrowerType);

    // 2. CRBR — tylko dla spółek podlegających wpisowi
    let crbr: CrbrResult;
    if (!isCompany || !crbrApplies) {
      crbr = {
        status: "not_applicable",
        beneficiaries: [],
        message:
          profile.borrowerType === "sp_cywilna"
            ? "Spółka cywilna nie podlega wpisowi do CRBR — beneficjentami rzeczywistymi są wspólnicy."
            : "JDG nie podlega wpisowi do CRBR — beneficjentem rzeczywistym jest przedsiębiorca.",
      };
      stages["CRBR — beneficjenci rzeczywiści"].status = "pominięto";
      stages["CRBR — beneficjenci rzeczywiści"].message = crbr.message;
    } else if (!nip) {
      crbr = { status: "error", beneficiaries: [], message: "Brak numeru NIP w profilu — uzupełnij i uruchom ponownie." };
      stages["CRBR — beneficjenci rzeczywiści"].status = "błąd";
      stages["CRBR — beneficjenci rzeczywiści"].message = crbr.message;
    } else {
      stages["CRBR — beneficjenci rzeczywiści"].status = "trwa";
      crbr = await crbrLookupByNip(nip);
      stages["CRBR — beneficjenci rzeczywiści"].status =
        crbr.status === "found" ? "sukces"
        : crbr.status === "not_found" ? "brak danych"
        : crbr.status === "not_configured" ? "pominięto"
        : "błąd";
      stages["CRBR — beneficjenci rzeczywiści"].message =
        crbr.status === "found" ? `Beneficjentów: ${crbr.beneficiaries.length}` : crbr.message;
      if (crbr.status === "not_configured" || crbr.status === "error") warnings.push(crbr.message ?? "Problem z CRBR.");
    }

    // 3. KRS (reprezentacja + wspólnicy do porównania i screeningu)
    let krsCompany: KrsCompany | null = null;
    if (isCompany && profile.borrowerData?.krs) {
      stages["KRS — reprezentacja i wspólnicy"].status = "trwa";
      const krsRes = await lookupKrsCompany(profile.borrowerData.krs);
      if (krsRes.success) {
        krsCompany = krsRes.company;
        stages["KRS — reprezentacja i wspólnicy"].status = "sukces";
        stages["KRS — reprezentacja i wspólnicy"].message =
          `Zarząd/reprezentacja: ${krsCompany.representation.members.length + krsCompany.managementBoard.length}, prokurenci: ${krsCompany.proxies.length}, wspólnicy: ${krsCompany.partnersOrShareholders.length}`;
      } else {
        stages["KRS — reprezentacja i wspólnicy"].status = "błąd";
        stages["KRS — reprezentacja i wspólnicy"].message = krsRes.message;
        warnings.push(`KRS: ${krsRes.message}`);
      }
    } else {
      stages["KRS — reprezentacja i wspólnicy"].status = "pominięto";
      stages["KRS — reprezentacja i wspólnicy"].message = isCompany
        ? "Brak numeru KRS w profilu."
        : "Nie dotyczy (JDG).";
    }

    // 4. Porównanie
    if (crbr.status === "found" || crbr.status === "not_found") {
      stages["Porównanie CRBR ↔ KRS"].status = "trwa";
    }
    const discrepancies =
      crbr.status === "found" || crbr.status === "not_found"
        ? compareCrbrWithKrs(crbr, krsCompany)
        : [];
    if (crbr.status === "found" || crbr.status === "not_found") {
      stages["Porównanie CRBR ↔ KRS"].status = "sukces";
      stages["Porównanie CRBR ↔ KRS"].message =
        discrepancies.length === 0 ? "Brak rozbieżności." : `Rozbieżności/uwagi: ${discrepancies.length}`;
    } else {
      stages["Porównanie CRBR ↔ KRS"].status = "pominięto";
    }

    // 5. Screening PEP/sankcje
    stages["Screening PEP/sankcje"].status = "trwa";
    const targets = collectScreenTargets(profile, krsCompany, crbr);
    let screening: PersonScreeningResult[] = [];
    let provider = "";
    let screeningError: string | undefined;
    if (targets.length === 0) {
      stages["Screening PEP/sankcje"].status = "brak danych";
      stages["Screening PEP/sankcje"].message = "Brak osób/podmiotów do sprawdzenia — uzupełnij dane profilu.";
    } else {
      const res = await screenTargets(targets);
      screening = res.results;
      provider = res.provider;
      screeningError = res.error;
      if (screeningError) {
        stages["Screening PEP/sankcje"].status = "błąd";
        stages["Screening PEP/sankcje"].message = screeningError;
        warnings.push(screeningError);
      } else {
        const hits = screening.filter((s) => s.status === "hit").length;
        const review = screening.filter((s) => s.status === "review").length;
        stages["Screening PEP/sankcje"].status = "sukces";
        stages["Screening PEP/sankcje"].message =
          `Sprawdzono: ${screening.length} · trafienia: ${hits} · do weryfikacji: ${review}`;
      }
    }

    const overallStatus = computeOverallStatus(crbr, discrepancies, screening, screeningError);

    // 6. Zapis
    stages["Zapis wyniku"].status = "trwa";
    const { data: saved, error: saveErr } = await supabase
      .from("aml_screenings")
      .insert({
        client_profile_id: profile.id!,
        nip: nip ?? null,
        borrower_type: profile.borrowerType,
        crbr_status: crbr.status,
        crbr_data: crbr as any,
        crbr_discrepancies: discrepancies as any,
        screening_provider: provider || null,
        screening_results: screening as any,
        overall_status: overallStatus,
        warnings: warnings as any,
        created_by: userId,
      })
      .select("id, created_at")
      .single();
    if (saveErr) {
      stages["Zapis wyniku"].status = "błąd";
      stages["Zapis wyniku"].message = saveErr.message;
      warnings.push(`Nie udało się zapisać wyniku: ${saveErr.message}`);
    } else {
      stages["Zapis wyniku"].status = "sukces";
    }

    return {
      id: saved?.id,
      profileId: profile.id!,
      nip,
      borrowerType: profile.borrowerType,
      createdAt: saved?.created_at,
      stages: Object.values(stages),
      crbr,
      crbrDiscrepancies: discrepancies,
      screening,
      screeningProvider: provider || undefined,
      overallStatus,
      warnings,
    };
  });

export const getLatestAmlScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ report: AmlScreeningReport | null }> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("aml_screenings")
      .select("*")
      .eq("client_profile_id", data.profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { report: null };
    return {
      report: {
        id: row.id,
        profileId: row.client_profile_id,
        nip: row.nip ?? undefined,
        borrowerType: row.borrower_type ?? "",
        createdAt: row.created_at,
        stages: [],
        crbr: (row.crbr_data as unknown as CrbrResult) ?? { status: "error", beneficiaries: [] },
        crbrDiscrepancies: (row.crbr_discrepancies as unknown as CrbrDiscrepancy[]) ?? [],
        screening: (row.screening_results as unknown as PersonScreeningResult[]) ?? [],
        screeningProvider: row.screening_provider ?? undefined,
        overallStatus: (row.overall_status as AmlOverallStatus) ?? "incomplete",
        warnings: (row.warnings as unknown as string[]) ?? [],
      },
    };
  });
