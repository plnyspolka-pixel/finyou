// PoC: tablica obwieszczeń Krajowego Rejestru Zadłużonych → JSON/Supabase → analiza AI.
//
//   bun scripts/krz-tablica.ts fetch   [--od 2026-11-05] [--do 2026-11-06] [--kategorie R01,U02]
//                                      [--out tmp/krz] [--db] [--limit 50] [--bez-szczegolow]
//   bun scripts/krz-tablica.ts analyze [--in tmp/krz | --db] [--limit 20]
//   bun scripts/krz-tablica.ts raport  [--in tmp/krz | --db]
//
// (zamiast `bun` działa też `npx tsx scripts/krz-tablica.ts …`)
//
// Jak to działa: portal KRZ to SPA, które po wejściu pobiera anonimowy token
// gościa (OAuth, acp-guest-auth-server) i woła wewnętrzne API JSON. Bez tokena
// API zwraca 401, a zapytania z przeglądarki headless / CI blokuje WAF
// (Incapsula, 403). Skrypt otwiera więc zwykły Chrome Z OKNEM, przechwytuje
// nagłówek Authorization z pierwszego żądania do API, zamyka przeglądarkę
// i dalej używa czystego `fetch` z tym tokenem (ok. 5 żądań/s).
//
// Ograniczenia i zasady:
// - To NIE jest oficjalne API; MS nie publikuje dokumentacji. Endpointy mogą się zmienić.
// - Nie uruchamiać na Cloudflare Workers ani w GitHub Actions (403). Lokalny
//   komputer lub VPS z Chrome + harmonogram.
// - PESEL osób fizycznych nie jest zapisywany ani wysyłany do AI (parser maskuje).
// - Nie omijać CAPTCHA/WAF; przy 403/429 skrypt przerywa.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { flattenSearch, parseNoticeXml, displayName } from "../src/lib/krz/parse";
import type {
  KrzAiAnalysis,
  KrzNotice,
  KrzNoticeDetail,
  KrzSearchResponse,
} from "../src/lib/krz/types";

const PORTAL_URL =
  "https://krz.ms.gov.pl/#!/application/KRZPortalPUB/1.9/KrzRejPubGui.TablicaObwieszczen?params=JTdCJTdE&seq=1";
const API_BASE = "https://krz-rejpub-gui-krz-pub-prod.apps.ocp.prod.ms.gov.pl/api/v1";
/** Wszystkie podkategorie, jakie portal zaznacza domyślnie (R — restrukturyzacja, U — upadłość, Z — zakazy/inne). */
const ALL_SUBCATEGORIES =
  "R11,R01,R02,R03,R04,R05,R06,R07,R08,R13,R09,R10,R12,R19,R20,U01,U02,U03,U04,U05,U06,U07,U08,U09,U10,U11,U12,U13,U14,U16,U18,U15,U17,U19,U20,Z01,Z02,Z03,Z19";
const DELAY_MS = 200;

// ---------- argumenty / env ----------
const [, , cmd = "help", ...rest] = process.argv;
const args: Record<string, string | true> = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith("--")) continue;
  const next = rest[i + 1];
  if (next && !next.startsWith("--")) {
    args[a.slice(2)] = next;
    i++;
  } else args[a.slice(2)] = true;
}
const opt = (k: string, def?: string) => (typeof args[k] === "string" ? (args[k] as string) : def);
const flag = (k: string) => args[k] === true;

function loadDotEnv() {
  for (const f of [".env", ".env.local"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadDotEnv();

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- token gościa z przeglądarki ----------
async function captureGuestToken(): Promise<string> {
  const { chromium } = await import("playwright");
  log("Otwieram Chrome, żeby pobrać token gościa z portalu KRZ…");
  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: "chrome" });
  } catch {
    browser = await chromium.launch({ headless: false });
  }
  const ctx = await browser.newContext({ locale: "pl-PL" });
  const page = await ctx.newPage();
  const token = new Promise<string>((resolveToken, reject) => {
    const t = setTimeout(
      () => reject(new Error("Nie przechwycono tokena w 60 s (WAF? brak okna?).")),
      60_000,
    );
    page.on("request", (r) => {
      const auth = r.headers()["authorization"];
      if (auth && r.url().startsWith(API_BASE)) {
        clearTimeout(t);
        resolveToken(auth);
      }
    });
  });
  const nav = await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (nav && nav.status() >= 400) {
    await browser.close();
    throw new Error(
      `Portal KRZ odpowiedział HTTP ${nav.status()} — prawdopodobnie blokada WAF. Przerywam.`,
    );
  }
  const auth = await token;
  await browser.close();
  const exp = jwtExp(auth);
  log(`Token gościa OK${exp ? `, ważny do ${exp.toISOString()}` : ""}.`);
  return auth;
}

function jwtExp(auth: string): Date | null {
  try {
    const payload = JSON.parse(
      Buffer.from(auth.split(" ")[1].split(".")[1], "base64url").toString("utf8"),
    );
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

async function apiGet(path: string, auth: string, accept = "application/json"): Promise<Response> {
  const res = await fetch(`${API_BASE}/${path}`, { headers: { authorization: auth, accept } });
  if (res.status === 403 || res.status === 429) {
    throw new Error(
      `API KRZ odpowiedziało HTTP ${res.status} — limit/WAF. Przerywam, nie ponawiam.`,
    );
  }
  return res;
}

// ---------- magazyn: katalog albo Supabase ----------
type StoredNotice = {
  lista: KrzNotice;
  szczegoly: KrzNoticeDetail | null;
  blad?: string | null;
  analiza?: KrzAiAnalysis | null;
  analiza_model?: string | null;
  analiza_at?: string | null;
  analiza_blad?: string | null;
};

function dirStore(dir: string) {
  const d = resolve(dir);
  mkdirSync(join(d, "obwieszczenia"), { recursive: true });
  const file = (id: string) => join(d, "obwieszczenia", `${id}.json`);
  return {
    dir: d,
    has: (id: string) => existsSync(file(id)),
    read: (id: string) => JSON.parse(readFileSync(file(id), "utf8")) as StoredNotice,
    write: (n: StoredNotice) =>
      writeFileSync(file(n.lista.idZewnetrzny), JSON.stringify(n, null, 2)),
    all: () =>
      readdirSync(join(d, "obwieszczenia"))
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(readFileSync(join(d, "obwieszczenia", f), "utf8")) as StoredNotice),
  };
}

function dbClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("--db wymaga SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY w env.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function toRow(n: StoredNotice) {
  const l = n.lista;
  const s = n.szczegoly;
  return {
    id_zewnetrzny: l.idZewnetrzny,
    numer_obwieszczenia: l.numerObwieszczenia,
    data_obwieszczenia: l.dataObwieszczenia,
    rodzaj_sprawy: l.rodzajSprawy,
    grupa: l.grupa,
    kategoria: l.kategoria,
    podkategoria: l.podkategoriaObwieszczenia,
    sygnatura: s?.sygnaturaAkt ?? l.sygnaturaPostepowania ?? null,
    sad: s?.sad ?? l.sadWydajacyPostanowienie ?? null,
    wydzial: s?.wydzial ?? l.nazwaWydzialu ?? null,
    podmiot_rodzaj:
      s?.podmiot.rodzaj ??
      (l.nazwaPodmiotu ? "podmiot" : l.nazwisko ? "osoba_fizyczna" : "nieznany"),
    podmiot_nazwa: s
      ? displayName(s)
      : l.nazwaPodmiotu || [l.imie, l.nazwisko].filter(Boolean).join(" ") || null,
    podmiot_krs: s?.podmiot.krs ?? null,
    podmiot_nip: s?.podmiot.nip ?? null,
    podmiot_miejscowosc: s?.podmiot.miejscowosc ?? null,
    prowadzi_dzialalnosc: s?.podmiot.prowadziDzialalnosc ?? null,
    tresc: s?.tresc ?? null,
    szczegoly: { lista: l, szczegoly: s, blad: n.blad ?? null },
  };
}

/**
 * API zwraca maks. 1000 pozycji na zapytanie (`czyPrzekroczono`). Pytamy więc
 * dzień po dniu, a dzień, który przekracza limit, dzielimy na paczki podkategorii.
 */
async function searchRange(
  auth: string,
  od: string,
  doD: string,
  kategorie: string[],
  outDir: string,
): Promise<KrzNotice[]> {
  const seen = new Map<string, KrzNotice>();
  const query = async (dzien: string, kat: string[]): Promise<void> => {
    const qs = new URLSearchParams({
      "Data Od": dzien,
      "Data Do": dzien,
      podkategoria: kat.join(","),
      odebraneKategorie: "false",
    });
    const res = await apiGet(`obwieszczenie/wyszukaj-po-dacie?${qs}`, auth);
    if (!res.ok)
      throw new Error(
        `Wyszukiwanie ${dzien}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    const data = (await res.json()) as KrzSearchResponse;
    await sleep(DELAY_MS);
    if (data.czyPrzekroczono && kat.length > 1) {
      const half = Math.ceil(kat.length / 2);
      log(`  ${dzien}: >1000 pozycji dla ${kat.length} podkategorii — dzielę na pół.`);
      await query(dzien, kat.slice(0, half));
      await query(dzien, kat.slice(half));
      return;
    }
    if (data.czyPrzekroczono)
      log(
        `  UWAGA ${dzien}/${kat[0]}: ponad 1000 pozycji w jednej podkategorii — część pominięta.`,
      );
    writeFileSync(
      join(outDir, `lista-${dzien}-${kat.length === kategorie.length ? "all" : kat[0]}.json`),
      JSON.stringify(data, null, 1),
    );
    for (const n of flattenSearch(data)) seen.set(n.idZewnetrzny, n);
    log(`  ${dzien} (${kat.length} podkat.): ${data.iloscWBazie} w bazie, łącznie ${seen.size}.`);
  };
  for (
    let d = new Date(od + "T00:00:00Z");
    d.toISOString().slice(0, 10) <= doD;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    await query(d.toISOString().slice(0, 10), kategorie);
  }
  return [...seen.values()];
}

// ---------- fetch ----------
async function cmdFetch() {
  const od = opt("od", daysAgo(1))!;
  const doD = opt("do", today())!;
  const kategorie = opt("kategorie", ALL_SUBCATEGORIES)!;
  const limit = Number(opt("limit", "0"));
  const outDir = opt("out", "tmp/krz")!;
  const useDb = flag("db");
  const store = dirStore(outDir);
  const db = useDb ? dbClient() : null;

  const auth = await captureGuestToken();
  const lista = await searchRange(auth, od, doD, kategorie.split(","), store.dir);
  log(`Lista ${od}…${doD}: ${lista.length} obwieszczeń.`);

  const nowe = lista.filter((n) => !store.has(n.idZewnetrzny));
  const todo = limit > 0 ? nowe.slice(0, limit) : nowe;
  log(
    `Do pobrania szczegółów: ${todo.length} (już zapisanych: ${lista.length - nowe.length}${limit > 0 ? `, limit ${limit}` : ""}).`,
  );
  let ok = 0;
  let err = 0;
  for (const [i, n] of todo.entries()) {
    const stored: StoredNotice = { lista: n, szczegoly: null };
    if (!flag("bez-szczegolow")) {
      try {
        const r = await apiGet(`obwieszczenie/xml?id=${n.idZewnetrzny}`, auth, "text/xml");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        stored.szczegoly = parseNoticeXml(await r.text(), n.idZewnetrzny);
        ok++;
      } catch (e) {
        stored.blad = e instanceof Error ? e.message : String(e);
        err++;
        if (/HTTP (403|429)/.test(stored.blad)) throw e;
      }
      await sleep(DELAY_MS);
    }
    store.write(stored);
    if (db) {
      const { error } = await db
        .from("krz_obwieszczenia")
        .upsert(toRow(stored), { onConflict: "id_zewnetrzny" });
      if (error) log(`DB błąd ${n.idZewnetrzny}: ${error.message}`);
    }
    if ((i + 1) % 25 === 0) log(`…${i + 1}/${todo.length}`);
  }
  log(
    `Gotowe: szczegóły OK ${ok}, błędy ${err}. Katalog: ${store.dir}${db ? ", zapisano też do Supabase" : ""}.`,
  );
}

// ---------- analyze ----------
async function cmdAnalyze() {
  const limit = Number(opt("limit", "20"));
  const useDb = flag("db");
  const { analyzeKrzNotice } = await import("../src/lib/krz/analyze.server");
  const { STUDIO_CLAUDE_MODEL } = await import("../src/lib/claude-json.server");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("analyze wymaga ANTHROPIC_API_KEY w env.");

  if (useDb) {
    const db = dbClient();
    const { data, error } = await db
      .from("krz_obwieszczenia")
      .select("id_zewnetrzny, szczegoly")
      .is("analiza", null)
      .is("analiza_blad", null)
      .order("data_obwieszczenia", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    log(`Do analizy z bazy: ${data.length}`);
    for (const row of data) {
      const det = (row.szczegoly as { szczegoly: KrzNoticeDetail | null }).szczegoly;
      const patch = await runOne(det, analyzeKrzNotice, STUDIO_CLAUDE_MODEL);
      await db.from("krz_obwieszczenia").update(patch).eq("id_zewnetrzny", row.id_zewnetrzny);
    }
    return;
  }

  const store = dirStore(opt("in", "tmp/krz")!);
  const todo = store
    .all()
    .filter((n) => n.szczegoly && !n.analiza && !n.analiza_blad)
    .slice(0, limit);
  log(`Do analizy z katalogu: ${todo.length}`);
  for (const n of todo) {
    const patch = await runOne(n.szczegoly, analyzeKrzNotice, STUDIO_CLAUDE_MODEL);
    store.write({
      ...n,
      analiza: patch.analiza,
      analiza_model: patch.analiza_model,
      analiza_at: patch.analiza_at,
      analiza_blad: patch.analiza_blad,
    });
  }
}

async function runOne(
  det: KrzNoticeDetail | null,
  analyze: (d: KrzNoticeDetail) => Promise<KrzAiAnalysis>,
  model: string,
) {
  const at = new Date().toISOString();
  if (!det)
    return { analiza: null, analiza_model: model, analiza_at: at, analiza_blad: "brak szczegółów" };
  try {
    const a = await analyze(det);
    log(
      `✓ ${displayName(det)} → ${a.etap} / ${a.rodzajPodmiotu} / ryzyko ${a.sygnalRyzyka}${a.wartoSprawdzicWBazie ? " / SPRAWDZIĆ" : ""}`,
    );
    return { analiza: a, analiza_model: model, analiza_at: at, analiza_blad: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`✗ ${displayName(det)}: ${msg}`);
    return { analiza: null, analiza_model: model, analiza_at: at, analiza_blad: msg.slice(0, 500) };
  }
}

// ---------- raport ----------
async function cmdRaport() {
  let rows: StoredNotice[];
  if (flag("db")) {
    const db = dbClient();
    const { data, error } = await db
      .from("krz_obwieszczenia")
      .select("szczegoly, analiza")
      .limit(5000);
    if (error) throw new Error(error.message);
    rows = data.map((r) => ({
      ...(r.szczegoly as StoredNotice),
      analiza: r.analiza as KrzAiAnalysis | null,
    }));
  } else rows = dirStore(opt("in", "tmp/krz")!).all();

  const count = (f: (n: StoredNotice) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const n of rows) {
      const k = f(n) ?? "(brak)";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  console.log(
    `Obwieszczeń: ${rows.length}, ze szczegółami: ${rows.filter((r) => r.szczegoly).length}, z analizą: ${rows.filter((r) => r.analiza).length}\n`,
  );
  console.log(
    "Grupa:",
    count((n) => n.lista.grupa),
  );
  console.log(
    "Rodzaj podmiotu:",
    count((n) => n.szczegoly?.podmiot.rodzaj),
  );
  console.log(
    "Etap (AI):",
    count((n) => n.analiza?.etap),
  );
  console.log(
    "Ryzyko (AI):",
    count((n) => n.analiza?.sygnalRyzyka),
  );
  console.log("\nDo sprawdzenia w bazie Finyou (AI, spółki/JDG):");
  for (const n of rows.filter((r) => r.analiza?.wartoSprawdzicWBazie && r.szczegoly)) {
    const d = n.szczegoly!;
    console.log(
      ` - ${displayName(d)} | KRS ${d.podmiot.krs ?? "-"} | NIP ${d.podmiot.nip ?? "-"} | ${n.analiza!.etap} | ${n.analiza!.streszczenie}`,
    );
  }
}

// ---------- main ----------
try {
  if (cmd === "fetch") await cmdFetch();
  else if (cmd === "analyze") await cmdAnalyze();
  else if (cmd === "raport") await cmdRaport();
  else {
    console.log(
      readFileSync(new URL(import.meta.url), "utf8")
        .split("\n")
        .slice(0, 8)
        .join("\n"),
    );
    process.exit(cmd === "help" ? 0 : 1);
  }
} catch (e) {
  console.error("BŁĄD:", e instanceof Error ? e.message : e);
  process.exit(1);
}
