// Profil gospodarczy — pobieranie danych z rejestrów publicznych i oficjalnej
// strony firmy. Zasady:
// - tylko oficjalne, publiczne API (KRS MS, wykaz VAT MF, CEIDG z tokenem, CRBR MF);
// - strona WWW wyłącznie z adresu wpisanego w KRS/CEIDG, z poszanowaniem
//   robots.txt, jawnym User-Agent, maks. 4 stronami i przerwą między żądaniami;
// - PESEL służy wyłącznie do porównania z CRBR i nie trafia do wyniku.
import { registryGet } from "@/lib/registry-fetch.server";
import {
  WEBSITE_USER_AGENT,
  ceidgFlags,
  companyFlags,
  extractLinks,
  htmlText,
  htmlTitle,
  identifiersInText,
  normalizeWebsite,
  parseCeidgDetails,
  parseKrsCompanyProfile,
  parseVatSubject,
  rankPages,
  robotsAllows,
  vatFlags,
} from "./business-profile";
import { matchKnfWarnings, type KnfWarningEntry } from "./knf-warnings";
import { loadKnfWarnings } from "./knf-warnings.server";
import type {
  BusinessFlag,
  BusinessProfile,
  CeidgDetails,
  KrsCompanyProfile,
  VatRegistryInfo,
  WebsiteCheck,
} from "./business-profile.types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const KRS_BASE = "https://api-krs.ms.gov.pl/api/krs";
const WL_API = "https://wl-api.mf.gov.pl/api/search/nip";
const MAX_COMPANIES = 6;
const MAX_WEBSITES = 4;
const MAX_PAGES_PER_SITE = 4;
const PAGE_BYTES = 1_500_000;

async function getJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 15_000,
): Promise<any | null> {
  const res = await registryGet(url, {
    headers: { Accept: "application/json", ...headers },
    timeoutMs,
    prefer: "direct",
  }).catch(() => null);
  if (!res?.ok || !res.text.trim()) return null;
  try {
    return JSON.parse(res.text);
  } catch {
    return null;
  }
}

export async function fetchKrsOdpisy(
  krs: string,
): Promise<{ aktualny: any | null; pelny: any | null }> {
  for (const rejestr of ["P", "S"] as const) {
    const aktualny = await getJson(
      `${KRS_BASE}/OdpisAktualny/${krs}?rejestr=${rejestr}&format=json`,
    );
    if (aktualny?.odpis) {
      const pelny = await getJson(
        `${KRS_BASE}/OdpisPelny/${krs}?rejestr=${rejestr}&format=json`,
        {},
        20_000,
      );
      return { aktualny, pelny: pelny?.odpis ? pelny : null };
    }
  }
  return { aktualny: null, pelny: null };
}

export async function fetchVatInfo(nip: string): Promise<VatRegistryInfo | null> {
  if (!/^\d{10}$/.test(nip)) return null;
  const j = await getJson(
    `${WL_API}/${nip}?date=${new Date().toISOString().slice(0, 10)}`,
    {},
    12_000,
  );
  return parseVatSubject(j?.result?.subject);
}

export async function fetchCeidgDetails(
  nip: string,
): Promise<{ details: CeidgDetails | null; note: string | null }> {
  const token = process.env.CEIDG_JWT_TOKEN;
  if (!token)
    return { details: null, note: "CEIDG: brak tokenu — szczegóły działalności niedostępne." };
  if (!/^\d{10}$/.test(nip)) return { details: null, note: null };
  const base = process.env.CEIDG_API_BASE_URL || "https://dane.biznes.gov.pl/api/ceidg/v3";
  const auth = { Authorization: `Bearer ${token}` };
  const list = await getJson(`${base}/firmy?nip=${nip}`, auth);
  const item = (list?.firmy ?? list?.firma ?? [])[0];
  if (!item)
    return { details: null, note: list ? null : "CEIDG: brak odpowiedzi — szczegóły niedostępne." };
  let detail = item;
  if (item.id) {
    const d = await getJson(`${base}/firma?id=${encodeURIComponent(item.id)}`, auth);
    detail = d?.firma?.[0] ?? d?.firma ?? d ?? item;
  }
  return { details: parseCeidgDetails(detail), note: null };
}

async function crbrFor(profile: KrsCompanyProfile, pesel: string | null): Promise<void> {
  try {
    const { fetchCrbr } = await import("@/lib/crbr.server");
    const r = await fetchCrbr(profile.nip ? { nip: profile.nip } : { krs: profile.krs });
    if (r.status !== "ok") {
      profile.crbrNote =
        r.status === "not_found"
          ? "CRBR: brak zgłoszenia beneficjentów."
          : `CRBR: ${"message" in r ? r.message : "niedostępny"}.`;
      return;
    }
    profile.beneficiaries = r.beneficialOwners.slice(0, 8).map((b) => ({
      name: `${b.firstName} ${b.lastName}`.trim(),
      sharePercent: b.sharePercent ?? null,
      role: b.role ? b.role.slice(0, 160) : null,
      matchesSubject: Boolean(pesel && b.pesel && b.pesel === pesel),
    }));
    profile.crbrNote = `CRBR: ${profile.beneficiaries.length} beneficjent(ów) rzeczywistych.`;
  } catch {
    profile.crbrNote = "CRBR: niedostępny.";
  }
}

/* ---------- strona WWW ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FetchedText = { status: number; text: string; finalUrl: string };

/** Jedno ponowienie po błędzie sieci (strony z WAF potrafią zrywać pojedyncze połączenia). */
async function fetchText(url: string, timeoutMs = 10_000): Promise<FetchedText | null> {
  const first = await fetchOnce(url, timeoutMs);
  if (first) return first;
  await sleep(2000);
  return fetchOnce(url, timeoutMs);
}

async function fetchOnce(url: string, timeoutMs: number): Promise<FetchedText | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": WEBSITE_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
        "Accept-Language": "pl-PL,pl;q=0.9",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const type = res.headers.get("content-type") ?? "";
    if (!/text|html|xml/i.test(type) && res.ok)
      return { status: res.status, text: "", finalUrl: res.url || url };
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buf.slice(0, PAGE_BYTES));
    return { status: res.status, text, finalUrl: res.url || url };
  } catch (e) {
    if (process.env.DEBUG_WEBSITE) console.error("[website]", url, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkWebsite(
  rawUrl: string,
  declaredIn: string,
  expected: { nips: string[]; krs: string[] },
): Promise<WebsiteCheck | null> {
  const url = normalizeWebsite(rawUrl);
  if (!url) return null;
  const origin = new URL(url).origin;
  const result: WebsiteCheck = {
    url,
    declaredIn,
    reachable: false,
    httpStatus: null,
    https: url.startsWith("https:"),
    title: null,
    robotsAllowed: true,
    nipOnSite: [],
    krsOnSite: [],
    identifiersMatch: null,
    financialDocs: [],
    pagesFetched: 0,
    note: "",
  };
  const robots = await fetchText(`${origin}/robots.txt`, 8_000);
  // Jak Google: robots.txt nieosiągalny (błąd sieci / 5xx) = brak zgody na pobieranie.
  if (!robots || robots.status >= 500) {
    result.robotsAllowed = false;
    result.note =
      "Nie udało się pobrać robots.txt (błąd sieci / serwera) — z ostrożności nie pobrano treści strony.";
    return result;
  }
  const robotsTxt =
    robots && robots.status === 200 && !/<html/i.test(robots.text.slice(0, 200))
      ? robots.text
      : null;
  if (!robotsAllows(robotsTxt, new URL(url).pathname)) {
    result.robotsAllowed = false;
    result.note = "robots.txt strony nie pozwala na automatyczne pobieranie — nie pobrano treści.";
    return result;
  }
  await sleep(1000);
  const home = await fetchText(url);
  if (!home) {
    result.note = "Strona nie odpowiada (błąd sieci / timeout).";
    return result;
  }
  result.httpStatus = home.status;
  result.reachable = home.status >= 200 && home.status < 400;
  result.https = home.finalUrl.startsWith("https:");
  if (!result.reachable) {
    result.note = `Strona zwraca HTTP ${home.status}.`;
    return result;
  }
  result.title = htmlTitle(home.text);
  result.pagesFetched = 1;
  const texts = [htmlText(home.text)];
  const links = extractLinks(home.text, home.finalUrl);
  const docs = [...links.documents];
  // Kolejka podstron: relacje inwestorskie / sprawozdania najpierw; ze stron
  // finansowych dokładamy ich podstrony (np. „raporty okresowe”).
  let queue = rankPages(links.pages);
  const visited = new Set<string>([home.finalUrl]);
  while (queue.length && result.pagesFetched < MAX_PAGES_PER_SITE) {
    const page = queue.shift()!;
    if (visited.has(page) || !robotsAllows(robotsTxt, new URL(page).pathname)) continue;
    visited.add(page);
    await sleep(1500);
    const sub = await fetchText(page);
    if (!sub || sub.status >= 400) continue;
    result.pagesFetched += 1;
    texts.push(htmlText(sub.text));
    const subLinks = extractLinks(sub.text, sub.finalUrl);
    for (const d of subLinks.documents) if (!docs.some((x) => x.url === d.url)) docs.push(d);
    if (/sprawozd|finans|raport|relacj|inwestor|investor/i.test(page))
      queue = rankPages([
        ...subLinks.pages.filter((p) => /sprawozd|finans|raport|wyniki/i.test(p)),
        ...queue,
      ]);
  }
  const ids = identifiersInText(texts.join(" "));
  result.nipOnSite = ids.nips;
  result.krsOnSite = ids.krs;
  result.financialDocs = docs.slice(0, 10);
  // Strona grupy może podawać kilka NIP-ów — niezgodność tylko, gdy żaden nie pasuje.
  const comparable =
    (ids.nips.length > 0 && expected.nips.length > 0) ||
    (ids.krs.length > 0 && expected.krs.length > 0);
  if (comparable) {
    result.identifiersMatch =
      ids.nips.some((n) => expected.nips.includes(n)) ||
      ids.krs.some((k) => expected.krs.includes(k));
  }
  result.note =
    `Pobrano ${result.pagesFetched} stron(y) z poszanowaniem robots.txt.` +
    (result.financialDocs.length
      ? ` Znaleziono ${result.financialDocs.length} link(ów) do dokumentów finansowych.`
      : " Brak linków do sprawozdań / raportów.") +
    (result.identifiersMatch === false
      ? " NIP/KRS na stronie NIE zgadza się z rejestrem."
      : result.identifiersMatch
        ? " NIP/KRS na stronie zgodny z rejestrem."
        : " Na stronie nie podano NIP/KRS.");
  return result;
}

function websiteFlags(w: WebsiteCheck, subject: string): BusinessFlag[] {
  const f: BusinessFlag[] = [];
  if (w.identifiersMatch === false)
    f.push({
      level: "alert",
      source: "Strona WWW",
      text: `${subject}: na stronie ${w.url} podano inny NIP/KRS niż w rejestrze (${[...w.nipOnSite, ...w.krsOnSite].join(", ")}).`,
    });
  if (w.robotsAllowed && !w.reachable)
    f.push({
      level: "info",
      source: "Strona WWW",
      text: `${subject}: strona wpisana w rejestrze (${w.url}) nie działa${w.httpStatus ? ` (HTTP ${w.httpStatus})` : ""}.`,
    });
  if (w.financialDocs.length)
    f.push({
      level: "info",
      source: "Strona WWW",
      text: `${subject}: firma publikuje dokumenty finansowe na swojej stronie (${w.financialDocs.length}).`,
    });
  return f;
}

/* ---------- orkiestracja ---------- */

export interface BusinessProfileSubject {
  subject: string;
  role: "client" | "owner";
  kind: "person" | "company";
  firstName?: string | null;
  lastName?: string | null;
  /** Tylko do porównań z CRBR — nie trafia do wyniku. */
  pesel?: string | null;
  /** NIP działalności / spółki (potwierdzony w CEIDG, wykazie VAT lub dziale II KW). */
  nip?: string | null;
  /** Spółki z KRS powiązane z osobą (potwierdzone odpisem) lub KRS podmiotu. */
  krs: Array<{ krs: string; role: string | null }>;
}

export async function buildBusinessProfile(
  s: BusinessProfileSubject,
  budget: { companies: number; websites: number },
  knf: { entries: KnfWarningEntry[] | null; note: string } = {
    entries: null,
    note: "Lista KNF nie była sprawdzana.",
  },
): Promise<BusinessProfile> {
  const profile: BusinessProfile = {
    subject: s.subject,
    role: s.role,
    kind: s.kind,
    ceidg: null,
    vat: null,
    companies: [],
    websites: [],
    flags: [],
    notes: [],
  };
  const nip = /^\d{10}$/.test(s.nip ?? "") ? s.nip! : null;
  const [vat, ceidg] = await Promise.all([
    nip ? fetchVatInfo(nip) : Promise.resolve(null),
    nip && s.kind === "person"
      ? fetchCeidgDetails(nip)
      : Promise.resolve({ details: null, note: null }),
  ]);
  profile.vat = vat;
  profile.ceidg = ceidg.details;
  if (ceidg.note) profile.notes.push(ceidg.note);
  if (nip && !vat)
    profile.notes.push(`Wykaz VAT: brak podmiotu o NIP ${nip} lub wykaz niedostępny.`);
  if (vat) profile.flags.push(...vatFlags(vat));
  if (profile.ceidg) profile.flags.push(...ceidgFlags(profile.ceidg));

  const krsList = [...s.krs];
  if (vat?.krs && !krsList.some((k) => k.krs === vat.krs))
    krsList.push({ krs: vat.krs, role: null });
  for (const k of krsList) {
    if (budget.companies <= 0) {
      profile.notes.push("Limit profili spółek w analizie — pozostałe pominięto.");
      break;
    }
    budget.companies -= 1;
    const { aktualny, pelny } = await fetchKrsOdpisy(k.krs);
    const p = parseKrsCompanyProfile(aktualny, pelny, { krs: k.krs, subjectRole: k.role });
    if (!p) {
      profile.notes.push(`KRS ${k.krs}: odpis niedostępny.`);
      continue;
    }
    await crbrFor(p, s.pesel ?? null);
    profile.companies.push(p);
    profile.flags.push(...companyFlags(p));
    if (s.kind === "person" && p.beneficiaries.some((b) => b.matchesSubject))
      profile.flags.push({
        level: "info",
        source: "CRBR",
        text: `${s.subject}: potwierdzony PESEL-em jako beneficjent rzeczywisty ${p.name}.`,
      });
  }

  const sites = [
    ...profile.companies.map((c) => ({
      url: c.website,
      from: `KRS ${c.krs}`,
      nips: c.nip ? [c.nip] : [],
      krs: [c.krs],
    })),
    ...(profile.ceidg?.website
      ? [
          {
            url: profile.ceidg.website,
            from: "CEIDG",
            nips: profile.ceidg.nip ? [profile.ceidg.nip] : [],
            krs: [],
          },
        ]
      : []),
  ].filter((x) => x.url);
  const seen = new Set<string>();
  for (const site of sites) {
    const norm = normalizeWebsite(site.url);
    if (!norm || seen.has(new URL(norm).hostname)) continue;
    seen.add(new URL(norm).hostname);
    if (budget.websites <= 0) break;
    budget.websites -= 1;
    const w = await checkWebsite(norm, site.from, { nips: site.nips, krs: site.krs }).catch(
      () => null,
    );
    if (w) {
      profile.websites.push(w);
      profile.flags.push(...websiteFlags(w, s.subject));
    }
  }
  profile.knf = knfCheck(s, profile, knf);
  profile.flags.push(...knfFlags(profile));
  return profile;
}

const KNF_ORDER = ["identifier", "domain", "name"];

/** Podmiot, jego spółki z KRS, NIP-y, REGON-y i domeny vs lista ostrzeżeń KNF. */
function knfCheck(
  s: BusinessProfileSubject,
  p: BusinessProfile,
  knf: { entries: KnfWarningEntry[] | null; note: string },
): BusinessProfile["knf"] {
  const entries = knf.entries;
  if (!entries) return { checked: false, note: knf.note, hits: [] };
  const domains = [
    ...p.websites.map((w) => w.url),
    ...p.companies.map((c) => c.website ?? ""),
    p.ceidg?.website ?? "",
  ]
    .map((u) => normalizeWebsite(u))
    .filter((u): u is string => Boolean(u))
    .map((u) => new URL(u).hostname.replace(/^www\./, ""));
  const nips = [s.nip, p.vat?.nip, p.ceidg?.nip, ...p.companies.map((c) => c.nip)].filter(
    (x): x is string => Boolean(x),
  );
  const regons = [p.vat?.regon, p.ceidg?.regon, ...p.companies.map((c) => c.regon)].filter(
    (x): x is string => Boolean(x),
  );
  const hits = [
    ...matchKnfWarnings(entries, {
      name: s.subject,
      kind: s.kind,
      firstName: s.firstName,
      lastName: s.lastName,
      krs: [...s.krs.map((k) => k.krs), ...p.companies.map((c) => c.krs)],
      nips,
      regons,
      domains,
    }),
    // Spółki i firma JDG osoby — także po nazwie (lista KNF często nie podaje identyfikatora).
    ...p.companies.flatMap((c) =>
      matchKnfWarnings(entries, { name: c.name, kind: "company" }).filter(
        (h) => h.match === "name",
      ),
    ),
    ...(p.ceidg?.name
      ? matchKnfWarnings(entries, { name: p.ceidg.name, kind: "company" }).filter(
          (h) => h.match === "name",
        )
      : []),
  ];
  // Najmocniejsze dopasowanie wpisu wygrywa (identyfikator > domena > nazwa).
  const best = new Map<string, (typeof hits)[number]>();
  for (const h of [...hits].sort(
    (a, b) => KNF_ORDER.indexOf(a.match) - KNF_ORDER.indexOf(b.match),
  )) {
    const key = `${h.category}|${h.lp}`;
    if (!best.has(key)) best.set(key, h);
  }
  const unique = [...best.values()].slice(0, 8);
  return {
    checked: true,
    note: `${knf.note} ${unique.length ? `Trafienia: ${unique.length}.` : "Podmiot ani jego spółki / domeny nie figurują na liście."}`,
    hits: unique,
  };
}

function knfFlags(p: BusinessProfile): BusinessFlag[] {
  return (p.knf?.hits ?? []).map((h) => ({
    level: h.match === "name" ? ("warning" as const) : ("alert" as const),
    source: "Lista ostrzeżeń KNF",
    text:
      `${p.subject}: ${h.match === "name" ? "zgodność nazwy (do weryfikacji) z" : `${h.matchedOn} zgodny z`} wpisem ${h.lp} — ${h.entryName}` +
      `${h.prosecutor ? ` · ${h.prosecutor}` : ""} · ${h.category.slice(0, 140)}`,
  }));
}

/** Profile dla wszystkich podmiotów — sekwencyjnie, ze wspólnym limitem zapytań. */
export async function buildBusinessProfiles(
  subjects: BusinessProfileSubject[],
): Promise<BusinessProfile[]> {
  const budget = { companies: MAX_COMPANIES, websites: MAX_WEBSITES };
  const out: BusinessProfile[] = [];
  // Klient pierwszy — nie może wypaść poza limit.
  const ordered = [...subjects].sort(
    (a, b) => Number(b.role === "client") - Number(a.role === "client"),
  );
  // Lista KNF dotyczy każdego podmiotu — także osób bez działalności (po nazwisku).
  const knf = await loadKnfWarnings();
  for (const s of ordered) {
    out.push(
      await buildBusinessProfile(s, budget, knf).catch(() => ({
        subject: s.subject,
        role: s.role,
        kind: s.kind,
        ceidg: null,
        vat: null,
        companies: [],
        websites: [],
        flags: [],
        notes: ["Błąd budowy profilu gospodarczego — sprawdź ręcznie."],
      })),
    );
  }
  return out;
}
