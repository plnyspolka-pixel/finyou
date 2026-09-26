// Studio publikacji — BANK B-ROLLI (przebitki + wizual hooki).
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
    kind: row.kind === "hook" ? "hook" : "broll",
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
  kind?: BrollKind;
  search?: string;
  includeInactive?: boolean;
  limit?: number;
}): Promise<BrollAsset[]> {
  let q = supabaseAdmin
    .from("studio_broll_assets")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.kind) q = q.eq("kind", opts.kind);
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
  const assets = (await listBrollAssets({ kind: "broll", limit: 400 })).filter(
    (a) => !exclude.has(a.id),
  );
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
 * Materiał danego rodzaju bez dopasowania do treści — najdawniej użyty.
 * Tak bierzemy wizual hooki (to efekt, nie ilustracja) i tak ratujemy
 * przebitkę, dla której nie było frazy albo nic nie pasowało.
 */
export async function pickLeastUsedFromBank(
  kind: BrollKind,
  exclude: Set<string> = new Set(),
): Promise<BrollAsset | null> {
  const assets = (await listBrollAssets({ kind, limit: 200 })).filter((a) => !exclude.has(a.id));
  if (!assets.length) return null;
  return [...assets].sort(
    (a, b) => byLeastUsed(a, b) || orientationRank(a.orientation) - orientationRank(b.orientation),
  )[0];
}

/**
 * Wizual hook — efekciarskie ujęcie tuż po pierwszym zdaniu. Nie dobieramy go
 * do treści (to nie ilustracja, tylko zatrzymanie kciuka), więc bierzemy
 * najdawniej użyty, żeby rolki nie zaczynały się w kółko tym samym.
 */
export function pickHookFromBank(exclude: Set<string> = new Set()): Promise<BrollAsset | null> {
  return pickLeastUsedFromBank("hook", exclude);
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
  kind: BrollKind;
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
  const path = `broll/${input.kind}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
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
      kind: input.kind,
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
 * Bez `PEXELS_API_KEY` po prostu nie istnieje (zwracamy null) i zostaje HeyGen.
 */
async function searchPexels(query: string): Promise<StockHit | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", "5");
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) {
    console.warn(`[Bank] Pexels "${query}": ${res.status}`);
    return null;
  }
  const json = (await res.json()) as {
    photos?: Array<{ photographer?: string; src?: { portrait?: string; large2x?: string } }>;
  };
  const photo = (json.photos ?? []).find((p) => p?.src?.portrait || p?.src?.large2x);
  const src = photo?.src?.portrait ?? photo?.src?.large2x;
  if (!src) return null;
  return {
    url: src,
    orientation: "portrait",
    source: "pexels",
    attribution: photo?.photographer ? `Pexels / ${photo.photographer}` : "Pexels",
  };
}

async function searchHeygenStock(query: string): Promise<StockHit | null> {
  if (!process.env.HEYGEN_API_KEY) return null;
  const { searchHeygenStockImage } = await import("./avatar-faq.server");
  const url = await searchHeygenStockImage(query);
  return url ? { url, orientation: null, source: "heygen", attribution: "HeyGen stock" } : null;
}

/** Stock: Pexels (pionowe kadry, gdy jest klucz) → biblioteka HeyGena. */
export async function searchStockImage(query: string): Promise<StockHit | null> {
  try {
    const pexels = await searchPexels(query);
    if (pexels) return pexels;
  } catch (e) {
    console.warn(`[Bank] Pexels "${query}" nieudany: ${e instanceof Error ? e.message : e}`);
  }
  try {
    return await searchHeygenStock(query);
  } catch (e) {
    console.warn(`[Bank] HeyGen stock "${query}" nieudany: ${e instanceof Error ? e.message : e}`);
    return null;
  }
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
    const fallback = await pickLeastUsedFromBank("broll", exclude);
    return fallback ? { url: fallback.media_url, assetId: fallback.id } : null;
  }
  try {
    const stored = await addBrollFromUrl({
      url: hit.url,
      kind: "broll",
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
 * Startowy zestaw fraz. Przebitki ilustrują to, o czym mówimy (nieruchomość,
 * umowa, pieniądze), hooki to ujęcia „efekciarskie" — mają zatrzymać kciuk,
 * nie objaśniać treści.
 */
export const SEED_BROLL_QUERIES = [
  "signing mortgage contract",
  "apartment building exterior",
  "house keys handover",
  "counting cash money",
  "financial documents on desk",
  "calculator and invoices",
  "modern city skyline",
  "bank building facade",
  "notary stamp on document",
  "real estate handshake deal",
  "construction site building",
  "stack of coins growth",
  "laptop with financial charts",
  "house for sale sign",
  "warehouse commercial property",
];

export const SEED_HOOK_QUERIES = [
  "abstract gradient motion background",
  "glowing arrow pointing up",
  "red warning sign dark background",
  "stopwatch countdown close up",
  "neon question mark dark",
  "green rising chart glow",
  "hourglass running out of sand",
  "spotlight beam dark stage",
];

/**
 * Wypełnia bank ze stocku. Idempotentne: frazy, które już mają materiał
 * (po `source_query`), są pomijane — kliknięcie drugi raz nic nie dubluje.
 */
export async function seedBrollBank(opts: {
  kinds: BrollKind[];
  userId?: string | null;
}): Promise<{ added: number; skipped: number; failed: number }> {
  const plan: Array<{ kind: BrollKind; query: string }> = [];
  if (opts.kinds.includes("broll")) {
    plan.push(...SEED_BROLL_QUERIES.map((query) => ({ kind: "broll" as const, query })));
  }
  if (opts.kinds.includes("hook")) {
    plan.push(...SEED_HOOK_QUERIES.map((query) => ({ kind: "hook" as const, query })));
  }
  if (!plan.length) return { added: 0, skipped: 0, failed: 0 };

  const { data: existing } = await supabaseAdmin
    .from("studio_broll_assets")
    .select("kind, source_query")
    .limit(1000);
  const taken = new Set(
    (existing ?? []).map((r) => `${r.kind}::${String(r.source_query ?? "").toLowerCase()}`),
  );

  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const { kind, query } of plan) {
    if (taken.has(`${kind}::${query.toLowerCase()}`)) {
      skipped++;
      continue;
    }
    try {
      const hit = await searchStockImage(query);
      if (!hit) {
        failed++;
        continue;
      }
      await addBrollFromUrl({
        url: hit.url,
        kind,
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
  return { added, skipped, failed };
}
