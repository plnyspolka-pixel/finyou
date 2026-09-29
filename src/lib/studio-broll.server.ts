// Studio publikacji — BANK B-ROLLI (przebitki ilustrujące treść rolki).
//
// Wizual hooki (efekciarskie ujęcia po pierwszym zdaniu) wyleciały — bank
// trzyma już tylko b-rolle. Stare wiersze `kind = 'hook'` zostają w tabeli,
// ale nikt ich nie czyta (wszystkie zapytania filtrują `kind = 'broll'`).
//
// Po co bank, skoro HeyGen ma stock (`/v3/assets/search`):
//   * stock oddaje co przebieg co innego — rolki wychodzą niespójne, a raz
//     znalezionej dobrej grafiki nie da się użyć drugi raz,
//   * URL-e stocku nie są nasze i mogą wygasnąć między planowaniem a renderem,
//   * do banku wrzucimy też własne materiały (grafiki AI, ujęcia z biura).
//
// ZASADA: wszystko, co wchodzi do banku, ląduje w publicznym buckecie
// `studio-media` — ten sam trwały https, który czyta HeyGen przy renderze
// i Meta przy publikacji. Nigdy nie renderujemy z cudzego, wygasającego URL-a,
// chyba że zapis do bucketu padnie (wtedy jedziemy oryginałem, bo rolka jest
// ważniejsza niż higiena banku).
//
// PODŁĄCZENIE DO STUDIA: `resolveBrollImage` jest jedynym wejściem dla
// renderu — najpierw bank (po tagach, z rotacją „najdawniej użyte"), potem
// stock zewnętrzny (Pexels, jeśli jest klucz → HeyGen), a to, co stock oddał,
// wpada do banku. Bank sam się więc zapełnia w trakcie normalnej pracy.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  byLeastUsed,
  keywordsFrom,
  MATCH_THRESHOLD,
  orientationRank,
  scoreAsset,
} from "./studio-broll-match";

const STORAGE_BUCKET = "studio-media";
/** Grafika do rolki 9:16 — powyżej tego to już nie jest przebitka, to pomyłka. */
const MAX_ASSET_BYTES = 15 * 1024 * 1024;

export type { BrollKind } from "./studio-broll-match";
export { keywordsFrom, scoreAsset } from "./studio-broll-match";

import type { BrollKind } from "./studio-broll-match";

export type BrollAsset = {
  id: string;
  kind: BrollKind;
  title: string;
  tags: string[];
  media_url: string;
  storage_path: string | null;
  source: string;
  source_query: string;
  orientation: string | null;
  attribution: string;
  active: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
};

const SELECT_COLUMNS =
  "id, kind, title, tags, media_url, storage_path, source, source_query, orientation, attribution, active, use_count, last_used_at, created_at";

function asAsset(row: Record<string, unknown>): BrollAsset {
  return {
    id: String(row.id),
    kind: "broll",
    title: String(row.title ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    media_url: String(row.media_url),
    storage_path: (row.storage_path as string | null) ?? null,
    source: String(row.source ?? "url"),
    source_query: String(row.source_query ?? ""),
    orientation: (row.orientation as string | null) ?? null,
    attribution: String(row.attribution ?? ""),
    active: row.active !== false,
    use_count: Number(row.use_count ?? 0),
    last_used_at: (row.last_used_at as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

// ── Odczyt banku ─────────────────────────────────────────────────────────────

export async function listBrollAssets(opts?: {
  search?: string;
  includeInactive?: boolean;
  limit?: number;
}): Promise<BrollAsset[]> {
  let q = supabaseAdmin
    .from("studio_broll_assets")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .eq("kind", "broll")
    .limit(opts?.limit ?? 200);
  if (!opts?.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const items = (data ?? []).map((r) => asAsset(r as Record<string, unknown>));
  const search = opts?.search?.trim().toLowerCase();
  if (!search) return items;
  return items.filter(
    (a) =>
      a.title.toLowerCase().includes(search) ||
      a.source_query.toLowerCase().includes(search) ||
      a.tags.some((t) => t.toLowerCase().includes(search)),
  );
}

/**
 * Przebitka z banku dla frazy planera. `exclude` trzyma to, co już poszło
 * do tej rolki — dwa razy ten sam obrazek w jednym wideo wygląda na błąd.
 */
export async function pickBrollFromBank(
  query: string,
  exclude: Set<string> = new Set(),
): Promise<BrollAsset | null> {
  const assets = (await listBrollAssets({ limit: 2000 })).filter((a) => !exclude.has(a.id));
  const scored = assets
    .map((a) => ({ a, score: scoreAsset(a, query) }))
    .filter((s) => s.score >= MATCH_THRESHOLD)
    .sort(
      (x, y) =>
        y.score - x.score ||
        orientationRank(x.a.orientation) - orientationRank(y.a.orientation) ||
        byLeastUsed(x.a, y.a),
    );
  return scored[0]?.a ?? null;
}

/**
 * Przebitka bez dopasowania do treści — najdawniej użyta. Tak ratujemy
 * scenę, dla której nie było frazy albo nic w banku ani w stocku nie pasowało.
 */
export async function pickLeastUsedFromBank(
  exclude: Set<string> = new Set(),
): Promise<BrollAsset | null> {
  const assets = (await listBrollAssets({ limit: 2000 })).filter((a) => !exclude.has(a.id));
  if (!assets.length) return null;
  return [...assets].sort(
    (a, b) => byLeastUsed(a, b) || orientationRank(a.orientation) - orientationRank(b.orientation),
  )[0];
}

/** Odnotowuje użycie — to ono napędza rotację przy kolejnych rolkach. */
export async function markBrollUsed(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return;
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("studio_broll_assets")
    .select("id, use_count")
    .in("id", unique);
  await Promise.all(
    (data ?? []).map((row) =>
      supabaseAdmin
        .from("studio_broll_assets")
        .update({ use_count: Number(row.use_count ?? 0) + 1, last_used_at: now })
        .eq("id", row.id),
    ),
  );
}

// ── Zapis do banku ───────────────────────────────────────────────────────────

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export type AddBrollInput = {
  url: string;
  title?: string;
  tags?: string[];
  source?: string;
  sourceQuery?: string;
  orientation?: string | null;
  attribution?: string;
  userId?: string | null;
};

/**
 * Ściąga grafikę spod URL-a i zapisuje ją w buckecie `studio-media`,
 * a potem wpisuje do banku. Zwraca gotowy materiał.
 *
 * Kopiujemy do siebie celowo: URL-e stocku (HeyGen, Pexels) potrafią wygasnąć
 * albo zmienić się w 404 między planowaniem a renderem, a wtedy w rolce
 * zostaje dziura.
 */
export async function addBrollFromUrl(input: AddBrollInput): Promise<BrollAsset> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Podaj publiczny adres http(s) do grafiki.");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pobranie grafiki nieudane: ${res.status}`);
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mime.startsWith("image/")) {
    throw new Error(`To nie jest grafika (${mime || "nieznany typ"}). Bank przyjmuje obrazy.`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!buf.byteLength) throw new Error("Pusty plik.");
  if (buf.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`Plik za duży (${Math.round(buf.byteLength / 1024 / 1024)} MB, limit 15 MB).`);
  }

  const ext = EXT_BY_MIME[mime] ?? mime.split("/")[1] ?? "jpg";
  const path = `broll/broll/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) throw new Error(`Zapis do Storage: ${upErr.message}`);
  const { data: pub } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  const sourceQuery = (input.sourceQuery ?? "").trim();
  const title = (input.title ?? "").trim() || sourceQuery || "Materiał b-roll";
  const tags = [...new Set([...(input.tags ?? []), ...keywordsFrom(`${title} ${sourceQuery}`)])]
    .map((t) => t.toLowerCase())
    .slice(0, 24);

  const { data: row, error: insErr } = await supabaseAdmin
    .from("studio_broll_assets")
    .insert({
      kind: "broll",
      title: title.slice(0, 160),
      tags,
      media_url: pub.publicUrl,
      storage_path: path,
      source: input.source ?? "url",
      source_query: sourceQuery,
      orientation: input.orientation ?? null,
      attribution: input.attribution ?? "",
      created_by: input.userId ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (insErr) {
    // Wpis nie wszedł — nie zostawiaj sieroty w buckecie.
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([path]);
    throw new Error(insErr.message);
  }
  return asAsset(row as Record<string, unknown>);
}

export async function setBrollActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("studio_broll_assets").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteBrollAsset(id: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("studio_broll_assets")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabaseAdmin.from("studio_broll_assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  const path = (data?.storage_path as string | null) ?? null;
  if (path) await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([path]);
}

// ── Stock zewnętrzny (zasilanie banku) ───────────────────────────────────────

export type StockHit = {
  url: string;
  orientation: string | null;
  source: "pexels" | "heygen";
  attribution: string;
};

/**
 * Pexels — darmowa biblioteka zdjęć; licencja pozwala na użycie komercyjne
 * bez podawania autora, ale i tak zapisujemy fotografa w `attribution`.
 * Bez `PEXELS_API_KEY` po prostu nie istnieje (pusta lista) i zostaje HeyGen.
 */
async function searchPexels(query: string, count: number): Promise<StockHit[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", String(Math.min(80, Math.max(5, count * 2))));
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) {
    console.warn(`[Bank] Pexels "${query}": ${res.status}`);
    return [];
  }
  const json = (await res.json()) as {
    photos?: Array<{ photographer?: string; src?: { portrait?: string; large2x?: string } }>;
  };
  const hits: StockHit[] = [];
  for (const photo of json.photos ?? []) {
    const src = photo?.src?.portrait ?? photo?.src?.large2x;
    if (!src) continue;
    hits.push({
      url: src,
      orientation: "portrait",
      source: "pexels",
      attribution: photo?.photographer ? `Pexels / ${photo.photographer}` : "Pexels",
    });
    if (hits.length >= count) break;
  }
  return hits;
}

async function searchHeygenStock(query: string, count: number): Promise<StockHit[]> {
  if (!process.env.HEYGEN_API_KEY) return [];
  const { searchHeygenStockImages } = await import("./avatar-faq.server");
  const items = await searchHeygenStockImages(query, count);
  return items.map((i) => ({
    url: i.url,
    orientation: i.orientation,
    source: "heygen" as const,
    attribution: "HeyGen stock",
  }));
}

/**
 * Stock: Pexels (pionowe kadry, gdy jest klucz) → biblioteka HeyGena.
 * `count` > 1 przy zasilaniu banku — z jednej frazy bierzemy kilka ujęć,
 * żeby było z czego wybierać i żeby rolki nie powtarzały tego samego kadru.
 */
export async function searchStockImages(query: string, count = 1): Promise<StockHit[]> {
  try {
    const pexels = await searchPexels(query, count);
    if (pexels.length) return pexels;
  } catch (e) {
    console.warn(`[Bank] Pexels "${query}" nieudany: ${e instanceof Error ? e.message : e}`);
  }
  try {
    return await searchHeygenStock(query, count);
  } catch (e) {
    console.warn(`[Bank] HeyGen stock "${query}" nieudany: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

export async function searchStockImage(query: string): Promise<StockHit | null> {
  return (await searchStockImages(query, 1))[0] ?? null;
}

export type ResolvedBroll = { url: string; assetId: string | null };

/**
 * JEDYNE wejście renderu po przebitkę: bank → stock → bank.
 * Trafienie ze stocku dokładamy do banku (trwały URL + następnym razem
 * znajdzie się od ręki); gdy zapis padnie, oddajemy surowy URL — rolka nie
 * może się wywalić przez higienę biblioteki.
 */
export async function resolveBrollImage(
  query: string | null,
  exclude: Set<string> = new Set(),
): Promise<ResolvedBroll | null> {
  const phrase = query?.trim() ?? "";
  const fromBank = phrase ? await pickBrollFromBank(phrase, exclude) : null;
  if (fromBank) return { url: fromBank.media_url, assetId: fromBank.id };

  const hit = phrase ? await searchStockImage(phrase) : null;
  if (!hit) {
    // Bez frazy (albo gdy stock nic nie oddał) lepszy jest materiał z banku
    // niż dziura w montażu — bank jest tematyczny, więc nie odleci od treści.
    const fallback = await pickLeastUsedFromBank(exclude);
    return fallback ? { url: fallback.media_url, assetId: fallback.id } : null;
  }
  try {
    const stored = await addBrollFromUrl({
      url: hit.url,
      title: phrase,
      source: hit.source,
      sourceQuery: phrase,
      orientation: hit.orientation,
      attribution: hit.attribution,
    });
    return { url: stored.media_url, assetId: stored.id };
  } catch (e) {
    console.warn(`[Bank] nie zapisałem stocku "${phrase}": ${e instanceof Error ? e.message : e}`);
    return { url: hit.url, assetId: null };
  }
}

// ── Zasilenie banku jednym kliknięciem ───────────────────────────────────────

/**
 * Startowy zestaw fraz — wszystko to, o czym mówią rolki Finance You:
 * nieruchomości, pożyczki pod zabezpieczenie, formalności, pieniądze,
 * inwestowanie, biznes i ludzie. Frazy po angielsku, bo tak szuka stock.
 * Z każdej frazy bierzemy kilka ujęć (SEED_IMAGES_PER_QUERY), więc pełny
 * zestaw daje kilkaset przebitek do wyboru.
 */
export const SEED_BROLL_QUERIES = [
  // Nieruchomości — z zewnątrz
  "apartment building exterior",
  "modern apartment block",
  "old tenement house europe",
  "single family house suburb",
  "luxury villa exterior",
  "house for sale sign",
  "residential street aerial view",
  "new housing development",
  "townhouses row",
  "house with garden",
  "building plot land",
  "farmland aerial view",
  "construction site building",
  "crane over construction site",
  "renovation of apartment",
  "warehouse commercial property",
  "office building glass facade",
  "retail shop storefront",
  "hotel building exterior",
  "modern city skyline",
  "polish city old town",
  "warsaw skyline",
  // Nieruchomości — wnętrza i klucze
  "empty apartment interior",
  "bright living room interior",
  "modern kitchen interior",
  "house keys handover",
  "keys in door lock",
  "real estate agent showing house",
  "couple viewing apartment",
  "moving boxes new home",
  "family in front of new house",
  "house model on desk",
  "architect blueprint plans",
  "property valuation inspection",
  // Umowy i formalności
  "signing mortgage contract",
  "signing document pen close up",
  "notary stamp on document",
  "notary office meeting",
  "financial documents on desk",
  "paperwork stack office",
  "contract review with lawyer",
  "reading loan agreement",
  "land registry documents",
  "checklist on clipboard",
  "folder with documents",
  "handshake after agreement",
  "real estate handshake deal",
  "business meeting at table",
  // Pieniądze i finanse
  "counting cash money",
  "polish zloty banknotes",
  "euro banknotes",
  "stack of coins growth",
  "wallet with money",
  "calculator and invoices",
  "calculating budget at home",
  "bank building facade",
  "bank transfer on smartphone",
  "online banking laptop",
  "credit card payment",
  "piggy bank savings",
  "money in envelope",
  "unpaid bills stress",
  "debt problem worried man",
  "financial freedom happy",
  "interest rate concept",
  "loan approved stamp",
  "rejected loan application",
  // Inwestowanie i wzrost
  "laptop with financial charts",
  "stock market chart screen",
  "investor analyzing data",
  "growth chart arrow up",
  "gold bars investment",
  "portfolio diversification concept",
  "passive income concept",
  "rental property investment",
  "landlord handing keys tenant",
  "return on investment concept",
  "safe deposit vault",
  "padlock security concept",
  "shield protection concept",
  // Biznes i ludzie
  "small business owner shop",
  "entrepreneur working laptop",
  "businessman thinking window",
  "businesswoman phone call",
  "consultant advising client",
  "financial advisor meeting couple",
  "team meeting office",
  "customer service headset",
  "person using smartphone app",
  "video call on laptop",
  "calendar deadline",
  "clock time pressure",
  "man relieved smiling",
  "woman celebrating success",
  "senior couple at home",
  "young couple planning finances",
  "family budget kitchen table",
  "car keys new car",
  "tractor farmer field",
  "doctor private clinic",
];

/** Ile ujęć bierzemy ze stocku na jedną frazę przy zasilaniu banku. */
export const SEED_IMAGES_PER_QUERY = 4;
/**
 * Ile fraz przerabia jedno wywołanie — każda to kilkanaście żądań (szukanie,
 * pobranie, zapis do Storage, wpis), a funkcja serwerowa ma limit żądań
 * i czasu. Panel woła seed w pętli, dopóki `remaining` nie spadnie do zera.
 */
export const SEED_QUERIES_PER_CALL = 12;

/**
 * Wypełnia bank ze stocku, porcjami. Idempotentne: frazy, które już mają
 * materiał (po `source_query`), są pomijane — kliknięcie drugi raz nic nie
 * dubluje, a przerwane zasilanie wznawia się od następnej frazy.
 */
export async function seedBrollBank(opts: {
  userId?: string | null;
  maxQueries?: number;
}): Promise<{ added: number; skipped: number; failed: number; remaining: number }> {
  const { data: existing } = await supabaseAdmin
    .from("studio_broll_assets")
    .select("source_query")
    .eq("kind", "broll")
    .limit(10000);
  const taken = new Set((existing ?? []).map((r) => String(r.source_query ?? "").toLowerCase()));

  const pending = SEED_BROLL_QUERIES.filter((q) => !taken.has(q.toLowerCase()));
  const skipped = SEED_BROLL_QUERIES.length - pending.length;
  const batch = pending.slice(0, Math.max(1, opts.maxQueries ?? SEED_QUERIES_PER_CALL));

  let added = 0;
  let failed = 0;
  for (const query of batch) {
    let hits: StockHit[] = [];
    try {
      hits = await searchStockImages(query, SEED_IMAGES_PER_QUERY);
    } catch (e) {
      console.warn(`[Bank] seed "${query}": ${e instanceof Error ? e.message : e}`);
    }
    if (!hits.length) {
      failed++;
      continue;
    }
    for (const hit of hits) {
      try {
        await addBrollFromUrl({
          url: hit.url,
          title: query,
          source: hit.source,
          sourceQuery: query,
          orientation: hit.orientation,
          attribution: hit.attribution,
          userId: opts.userId ?? null,
        });
        added++;
      } catch (e) {
        console.warn(`[Bank] seed "${query}": ${e instanceof Error ? e.message : e}`);
        failed++;
      }
    }
  }
  return { added, skipped, failed, remaining: pending.length - batch.length };
}
