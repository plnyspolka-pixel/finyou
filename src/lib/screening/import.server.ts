// Importery warstwy referencyjnej (PEP + listy sankcyjne).
//
// Gwarancje (wymagania jakościowe modułu):
//  * idempotencja — upsert po (źródło, source_id), hash rekordu decyduje o zapisie;
//  * ponawianie z wycofaniem wykładniczym (http.server.ts);
//  * nigdy nie nadpisujemy danych pustym wynikiem: 0 rekordów albo podejrzanie
//    mało rekordów (< 50% aktywnych) → import kończy się błędem, stare dane zostają;
//  * każdy import zapisuje sumę kontrolną pliku; zmiana treści listy sankcyjnej
//    uruchamia rescreening aktywnego portfela wyłącznie pod kątem sankcji;
//  * osoby PEP, które zniknęły ze źródła, NIE są usuwane — dostają datę
//    zakończenia funkcji (status PEP trwa jeszcze co najmniej 12 miesięcy).
import {
  chunk,
  getScreeningSettings,
  screeningAudit,
  sdb,
  selectAll,
  sha256Hex,
  stableJson,
  type ScreeningSettings,
} from "./db.server";
import { fetchWithRetry } from "./http.server";
import { indexKeys, normalizeName, parsePartialDate } from "./normalize";
import { parseEuFsf, parseMswia, parseOfacSdn, parseUnSc } from "./sources/sanctions-parsers";
import {
  parseKprm,
  parseSejmMps,
  parseWikidataHolders,
  parseWikidataPositions,
  wikidataHoldersQuery,
  wikidataPositionsQuery,
  type SejmTerm,
  type WikidataMode,
} from "./sources/pep-parsers";
import type {
  PepRecord,
  PepSource,
  SanctionRecord,
  SanctionSource,
  SourceKey,
} from "./sources/types";

export type ImportGroup = "sanctions" | "pep_weekly" | "pep_monthly" | "continue";

export const IMPORT_GROUPS: Record<Exclude<ImportGroup, "continue">, SourceKey[]> = {
  sanctions: ["eu_fsf", "un_sc", "mswia", "ofac_sdn"],
  pep_weekly: ["sejm_api", "kprm", "wikidata"],
  pep_monthly: ["senat", "krs"],
};

export interface ImportResult {
  source: SourceKey;
  status: "success" | "unchanged" | "failed" | "skipped" | "running";
  recordCount?: number;
  upserted?: number;
  deactivated?: number;
  changed?: boolean;
  error?: string;
  importId?: string;
}

/** Publiczny „token-2017” z dokumentacji FSF; zalecany jest własny token (EU_FSF_TOKEN). */
const EU_FSF_PUBLIC_TOKEN = "dG9rZW4tMjAxNw";
const MIN_RATIO = 0.5;
const STAGED_BUDGET_MS = 55_000;

// --- Wspólne -----------------------------------------------------------------------

async function lastSuccess(
  source: SourceKey,
): Promise<{ file_checksum: string | null; details: Record<string, unknown> } | null> {
  const { data } = await sdb
    .from("screening_source_imports")
    .select("file_checksum, details")
    .eq("source", source)
    .in("status", ["success", "unchanged"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function startImportRow(
  source: SourceKey,
): Promise<{ id: string; started_at: string } | null> {
  // Przerwane importy (np. timeout workera) zamykamy jako nieudane po 2 h.
  await sdb
    .from("screening_source_imports")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: "Import przerwany (brak postępu > 2 h)",
    })
    .eq("source", source)
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 2 * 3600_000).toISOString());
  const { data: running } = await sdb
    .from("screening_source_imports")
    .select("id")
    .eq("source", source)
    .eq("status", "running")
    .limit(1);
  if (running?.length) return null;
  const { data, error } = await sdb
    .from("screening_source_imports")
    .insert({ source, started_at: new Date().toISOString() })
    .select("id, started_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function finishImportRow(id: string, patch: Record<string, unknown>) {
  await sdb
    .from("screening_source_imports")
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq("id", id);
}

async function failImport(source: SourceKey, id: string, e: unknown): Promise<ImportResult> {
  const error = (e as Error)?.message ?? String(e);
  await finishImportRow(id, { status: "failed", error: error.slice(0, 2000) });
  await screeningAudit({
    eventType: "import.failed",
    entityType: "import",
    entityId: id,
    details: { source, error },
  });
  return { source, status: "failed", error, importId: id };
}

async function fetchText(
  url: string,
  settings: ScreeningSettings,
  init?: RequestInit,
): Promise<{ text: string; attempts: number }> {
  const { res, attempts } = await fetchWithRetry(url, {
    userAgent: settings.http_user_agent,
    init,
  });
  return { text: await res.text(), attempts };
}

/** Ochrona przed nadpisaniem danych pustym lub obciętym wynikiem. */
function assertPlausible(source: SourceKey, parsed: number, activeBefore: number) {
  if (parsed === 0)
    throw new Error(`${source}: źródło zwróciło 0 rekordów — import przerwany, dane bez zmian`);
  if (activeBefore >= 50 && parsed < activeBefore * MIN_RATIO) {
    throw new Error(
      `${source}: ${parsed} rekordów wobec ${activeBefore} aktywnych (< ${MIN_RATIO * 100}%) — podejrzenie obciętego pliku, dane bez zmian`,
    );
  }
}

// --- Indeks nazw ---------------------------------------------------------------------

interface IndexRow {
  reference_type: "pep" | "sanction";
  reference_id: string;
  name_key: string;
  surname_key: string | null;
  is_active: boolean;
}

async function reindex(type: "pep" | "sanction", rows: IndexRow[], referenceIds: string[]) {
  for (const ids of chunk(referenceIds, 150)) {
    const { error } = await sdb
      .from("screening_name_index")
      .delete()
      .eq("reference_type", type)
      .in("reference_id", ids);
    if (error) throw new Error(`reindex delete: ${error.message}`);
  }
  for (const part of chunk(rows, 1000)) {
    const { error } = await sdb.from("screening_name_index").insert(part);
    if (error) throw new Error(`reindex insert: ${error.message}`);
  }
}

async function setIndexActive(type: "pep" | "sanction", ids: string[], active: boolean) {
  for (const part of chunk(ids, 150)) {
    await sdb
      .from("screening_name_index")
      .update({ is_active: active })
      .eq("reference_type", type)
      .in("reference_id", part);
  }
}

// --- Sankcje --------------------------------------------------------------------------

async function fetchSanctions(
  source: SanctionSource,
  settings: ScreeningSettings,
): Promise<{ raw: string; records: SanctionRecord[]; meta: Record<string, unknown> }> {
  const cfg = settings.sources[source] ?? { enabled: false };
  switch (source) {
    case "eu_fsf": {
      const token = process.env.EU_FSF_TOKEN || EU_FSF_PUBLIC_TOKEN;
      const url = `${cfg.url ?? "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content"}?token=${encodeURIComponent(token)}`;
      const { text, attempts } = await fetchText(url, settings);
      return {
        raw: text,
        records: parseEuFsf(text),
        meta: { attempts, ownToken: !!process.env.EU_FSF_TOKEN },
      };
    }
    case "un_sc": {
      const { text, attempts } = await fetchText(
        cfg.url ?? "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
        settings,
      );
      return { raw: text, records: parseUnSc(text), meta: { attempts } };
    }
    case "mswia": {
      const { text, attempts } = await fetchText(
        cfg.url ?? "https://www.gov.pl/web/mswia/lista-osob-i-podmiotow-objetych-sankcjami",
        settings,
      );
      const { records, listVersion } = parseMswia(text);
      // Strona HTML zawiera elementy zmienne (skrypty, tokeny) — suma kontrolna liczona z treści listy.
      return { raw: stableJson(records), records, meta: { attempts, listVersion } };
    }
    case "ofac_sdn": {
      const sdn = await fetchText(
        cfg.sdn_url ??
          "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV",
        settings,
      );
      const alt = await fetchText(
        cfg.alt_url ??
          "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV",
        settings,
      );
      return {
        raw: sdn.text + "\n--ALT--\n" + alt.text,
        records: parseOfacSdn(sdn.text, alt.text),
        meta: { attempts: sdn.attempts + alt.attempts },
      };
    }
  }
}

export async function importSanctions(
  source: SanctionSource,
  opts: { force?: boolean } = {},
): Promise<ImportResult> {
  const settings = await getScreeningSettings();
  if (!settings.sources[source]?.enabled) return { source, status: "skipped" };
  const row = await startImportRow(source);
  if (!row) return { source, status: "running" };
  try {
    const { raw, records, meta } = await fetchSanctions(source, settings);
    const fileChecksum = await sha256Hex(raw);
    const contentChecksum = await sha256Hex(stableJson(records));
    const prev = await lastSuccess(source);
    const existing = await selectAll<{
      id: string;
      source_id: string;
      record_hash: string;
      is_active: boolean;
    }>((f, t) =>
      sdb
        .from("sanctions_reference_entries")
        .select("id, source_id, record_hash, is_active")
        .eq("list_name", source)
        .range(f, t),
    );
    const activeBefore = existing.filter((e) => e.is_active).length;
    assertPlausible(source, records.length, activeBefore);

    if (
      !opts.force &&
      prev &&
      (prev.details as { content_checksum?: string })?.content_checksum === contentChecksum &&
      activeBefore > 0
    ) {
      await finishImportRow(row.id, {
        status: "unchanged",
        record_count: records.length,
        file_checksum: fileChecksum,
        changed: false,
        details: { ...meta, content_checksum: contentChecksum },
      });
      await sdb
        .from("sanctions_reference_entries")
        .update({ fetched_at: new Date().toISOString() })
        .eq("list_name", source)
        .eq("is_active", true);
      return {
        source,
        status: "unchanged",
        recordCount: records.length,
        changed: false,
        importId: row.id,
      };
    }

    const bySourceId = new Map(existing.map((e) => [e.source_id, e]));
    const seen = new Set<string>();
    const toUpsert: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    for (const r of records) {
      if (seen.has(r.sourceId)) continue;
      seen.add(r.sourceId);
      const active = !r.delistedAt;
      const hash = await sha256Hex(
        stableJson({
          n: r.names,
          b: r.birthDates,
          c: r.nationalities,
          t: r.entityType,
          p: r.programme,
          d: r.delistedAt,
        }),
      );
      const ex = bySourceId.get(r.sourceId);
      if (ex && ex.record_hash === hash && ex.is_active === active) continue;
      toUpsert.push({
        list_name: source,
        source_id: r.sourceId,
        entity_type: r.entityType,
        names: r.names,
        primary_name: r.primaryName,
        birth_dates: r.birthDates,
        nationalities: r.nationalities,
        programme: r.programme,
        listed_at: r.listedAt,
        delisted_at: r.delistedAt,
        remarks: r.remarks,
        source_url: r.sourceUrl,
        record_hash: hash,
        fetched_at: now,
        file_checksum: fileChecksum,
        is_active: active,
      });
    }
    const changedIds: string[] = [];
    const indexRows: IndexRow[] = [];
    for (const part of chunk(toUpsert, 400)) {
      const { data, error } = await sdb
        .from("sanctions_reference_entries")
        .upsert(part, { onConflict: "list_name,source_id" })
        .select("id, source_id, is_active, entity_type, names");
      if (error) throw new Error(`upsert: ${error.message}`);
      for (const d of data ?? []) {
        changedIds.push(d.id);
        for (const n of d.names as SanctionRecord["names"]) {
          for (const k of indexKeys(n.name, {
            entity: d.entity_type !== "person",
            surname: n.last ?? null,
          })) {
            indexRows.push({
              reference_type: "sanction",
              reference_id: d.id,
              name_key: k.nameKey,
              surname_key: k.surnameKey,
              is_active: d.is_active,
            });
          }
        }
      }
    }
    await reindex("sanction", dedupeIndex(indexRows), changedIds);

    // Wpisy, które zniknęły z listy → nieaktywne (zachowane do audytu).
    const gone = existing.filter((e) => e.is_active && !seen.has(e.source_id)).map((e) => e.id);
    for (const part of chunk(gone, 150)) {
      await sdb
        .from("sanctions_reference_entries")
        .update({ is_active: false, delisted_at: now.slice(0, 10) })
        .in("id", part);
    }
    await setIndexActive("sanction", gone, false);
    await sdb
      .from("sanctions_reference_entries")
      .update({ fetched_at: now, file_checksum: fileChecksum })
      .eq("list_name", source)
      .eq("is_active", true);

    const changed = toUpsert.length > 0 || gone.length > 0;
    await finishImportRow(row.id, {
      status: "success",
      record_count: records.length,
      upserted: toUpsert.length,
      deactivated: gone.length,
      file_checksum: fileChecksum,
      changed,
      details: { ...meta, content_checksum: contentChecksum },
    });
    await screeningAudit({
      eventType: "import.success",
      entityType: "import",
      entityId: row.id,
      details: {
        source,
        records: records.length,
        upserted: toUpsert.length,
        deactivated: gone.length,
        fileChecksum,
        changed,
      },
    });
    if (changed && activeBefore > 0) {
      // Zmiana listy → rescreening aktywnego portfela wyłącznie pod kątem sankcji.
      const { data: n } = await sdb.rpc("screening_enqueue_portfolio", {
        p_scope: "sanctions",
        p_trigger: "list_change",
      });
      await screeningAudit({
        eventType: "rescreening.enqueued",
        entityType: "queue",
        details: { source, scope: "sanctions", enqueued: n },
      });
    }
    return {
      source,
      status: "success",
      recordCount: records.length,
      upserted: toUpsert.length,
      deactivated: gone.length,
      changed,
      importId: row.id,
    };
  } catch (e) {
    return failImport(source, row.id, e);
  }
}

function dedupeIndex(rows: IndexRow[]): IndexRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.reference_id}|${r.name_key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// --- PEP ---------------------------------------------------------------------------------

interface ExistingPep {
  id: string;
  source_id: string;
  record_hash: string;
  positions: PepRecord["positions"];
  aliases: string[];
  nationality: string[];
  fetched_at: string;
  is_current: boolean;
  latest_position_end: string | null;
}

function latestEnd(positions: PepRecord["positions"]): string | null {
  if (positions.some((p) => !p.to)) return null;
  return (
    positions
      .map((p) => p.to as string)
      .sort()
      .pop() ?? null
  );
}

/**
 * Zapis rekordów PEP źródła. `mergeSince` — scalanie stanowisk z rekordem
 * zapisanym w tym samym imporcie (Wikidata pobierana partiami).
 */
async function upsertPep(
  source: PepSource,
  records: PepRecord[],
  opts: { mergeSince?: string } = {},
): Promise<{ upserted: number }> {
  if (records.length === 0) return { upserted: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const existing = new Map<string, ExistingPep>();
  for (const ids of chunk([...new Set(records.map((r) => r.sourceId))], 150)) {
    const { data, error } = await sdb
      .from("pep_reference_persons")
      .select(
        "id, source_id, record_hash, positions, aliases, nationality, fetched_at, is_current, latest_position_end",
      )
      .eq("source", source)
      .in("source_id", ids);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) existing.set(d.source_id, d);
  }
  const rows: Record<string, unknown>[] = [];
  const touch: string[] = [];
  const merged = new Map<string, PepRecord>();
  for (const r of records) {
    const prev = merged.get(r.sourceId);
    if (prev) {
      prev.positions.push(...r.positions);
      prev.aliases = [...new Set([...prev.aliases, ...r.aliases])];
      prev.nationality = [...new Set([...prev.nationality, ...r.nationality])];
      prev.current ||= r.current;
    } else merged.set(r.sourceId, { ...r, positions: [...r.positions] });
  }
  for (const r of merged.values()) {
    const ex = existing.get(r.sourceId);
    let positions = r.positions;
    if (ex && opts.mergeSince && ex.fetched_at >= opts.mergeSince) {
      positions = [...ex.positions, ...positions];
      r.aliases = [...new Set([...ex.aliases, ...r.aliases])];
      r.nationality = [...new Set([...ex.nationality, ...r.nationality])];
      r.current ||= ex.is_current;
    }
    // Źródła bez dat (KPRM): początek funkcji = pierwszy import, w którym osoba wystąpiła.
    positions = positions.map((p) => {
      if (p.from) return p;
      const old = ex?.positions.find((o) => o.title === p.title && !o.to);
      return { ...p, from: old?.from ?? today };
    });
    const uniquePositions = positions.filter(
      (p, i) =>
        positions.findIndex((q) => q.title === p.title && q.from === p.from && q.to === p.to) === i,
    );
    const end = r.current ? null : latestEnd(uniquePositions);
    const payload = {
      full_name: r.fullName,
      aliases: r.aliases,
      birth_date: r.birthDate,
      birth_year: r.birthYear,
      nationality: r.nationality,
      positions: uniquePositions,
      is_current: r.current,
      latest_position_end: end,
    };
    const hash = await sha256Hex(
      stableJson({
        ...payload,
        positions: [...uniquePositions].sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
      }),
    );
    if (ex && ex.record_hash === hash) {
      touch.push(ex.id);
      continue;
    }
    rows.push({
      source,
      source_id: r.sourceId,
      ...payload,
      normalized_name: normalizeName(r.fullName),
      source_url: r.sourceUrl,
      record_hash: hash,
      fetched_at: new Date().toISOString(),
      is_active: true,
      _lastName: r.lastName,
    });
  }
  const changedIds: string[] = [];
  const indexRows: IndexRow[] = [];
  for (const part of chunk(rows, 400)) {
    const lastNames = new Map(
      part.map((p) => [p.source_id as string, p._lastName as string | null]),
    );
    const clean = part.map(({ _lastName, ...rest }) => rest);
    const { data, error } = await sdb
      .from("pep_reference_persons")
      .upsert(clean, { onConflict: "source,source_id" })
      .select("id, source_id, full_name, aliases");
    if (error) throw new Error(`upsert pep: ${error.message}`);
    for (const d of data ?? []) {
      changedIds.push(d.id);
      for (const k of indexKeys(d.full_name, {
        surname: lastNames.get(d.source_id) ?? null,
        aliases: (d.aliases as string[]).slice(0, 10),
      })) {
        indexRows.push({
          reference_type: "pep",
          reference_id: d.id,
          name_key: k.nameKey,
          surname_key: k.surnameKey,
          is_active: true,
        });
      }
    }
  }
  await reindex("pep", dedupeIndex(indexRows), changedIds);
  // Rekordy bez zmian: tylko znacznik pobrania (do wykrycia osób, które zniknęły ze źródła).
  for (const ids of chunk(touch, 150)) {
    await sdb
      .from("pep_reference_persons")
      .update({ fetched_at: new Date().toISOString() })
      .in("id", ids);
  }
  return { upserted: rows.length };
}

/** Osoby, które zniknęły z pełnego zrzutu źródła: koniec funkcji = dziś (jeśli brak), rekord zostaje. */
async function endMissingPep(source: PepSource, seenSince: string): Promise<number> {
  const stale = await selectAll<{
    id: string;
    positions: PepRecord["positions"];
    latest_position_end: string | null;
  }>((f, t) =>
    sdb
      .from("pep_reference_persons")
      .select("id, positions, latest_position_end")
      .eq("source", source)
      .eq("is_current", true)
      .lt("fetched_at", seenSince)
      .range(f, t),
  );
  const today = new Date().toISOString().slice(0, 10);
  for (const s of stale) {
    const positions = s.positions.map((p) => (p.to ? p : { ...p, to: today }));
    await sdb
      .from("pep_reference_persons")
      .update({ is_current: false, positions, latest_position_end: s.latest_position_end ?? today })
      .eq("id", s.id);
  }
  return stale.length;
}

async function activePepCount(source: PepSource): Promise<number> {
  const { count } = await sdb
    .from("pep_reference_persons")
    .select("id", { count: "exact", head: true })
    .eq("source", source)
    .eq("is_current", true);
  return count ?? 0;
}

async function simplePepImport(
  source: PepSource,
  load: (
    s: ScreeningSettings,
  ) => Promise<{ records: PepRecord[]; raw: string; meta: Record<string, unknown> }>,
  opts: { force?: boolean },
): Promise<ImportResult> {
  const settings = await getScreeningSettings();
  if (!settings.sources[source]?.enabled) return { source, status: "skipped" };
  const row = await startImportRow(source);
  if (!row) return { source, status: "running" };
  try {
    const { records, raw, meta } = await load(settings);
    assertPlausible(source, records.length, await activePepCount(source));
    const fileChecksum = await sha256Hex(raw);
    const { upserted } = await upsertPep(source, records);
    const ended = await endMissingPep(source, row.started_at);
    await finishImportRow(row.id, {
      status: "success",
      record_count: records.length,
      upserted,
      deactivated: ended,
      file_checksum: fileChecksum,
      changed: upserted > 0 || ended > 0,
      details: { ...meta, force: !!opts.force },
    });
    await screeningAudit({
      eventType: "import.success",
      entityType: "import",
      entityId: row.id,
      details: { source, records: records.length, upserted, ended },
    });
    return {
      source,
      status: "success",
      recordCount: records.length,
      upserted,
      deactivated: ended,
      importId: row.id,
    };
  } catch (e) {
    return failImport(source, row.id, e);
  }
}

export function importSejm(opts: { force?: boolean } = {}) {
  return simplePepImport(
    "sejm_api",
    async (settings) => {
      const cfg = settings.sources.sejm_api ?? { enabled: true };
      const base = cfg.base_url ?? "https://api.sejm.gov.pl/sejm";
      const termsRaw = await fetchText(`${base}/term`, settings);
      const terms = (JSON.parse(termsRaw.text) as SejmTerm[])
        .sort((a, b) => b.num - a.num)
        .slice(0, Math.max(1, cfg.terms_back ?? 3));
      const loaded: Array<{ term: SejmTerm; mps: never[] }> = [];
      let raw = termsRaw.text;
      for (const term of terms) {
        const r = await fetchText(`${base}/term${term.num}/MP`, settings);
        raw += r.text;
        loaded.push({ term, mps: JSON.parse(r.text) });
      }
      return { records: parseSejmMps(loaded), raw, meta: { terms: terms.map((t) => t.num) } };
    },
    opts,
  );
}

export function importKprm(opts: { force?: boolean } = {}) {
  return simplePepImport(
    "kprm",
    async (settings) => {
      const url =
        settings.sources.kprm?.url ?? "https://www.gov.pl/web/premier/sklad-rady-ministrow";
      const { text } = await fetchText(url, settings);
      const records = parseKprm(text, url);
      return { records, raw: stableJson(records), meta: { url } };
    },
    opts,
  );
}

/** Źródła, które przy weryfikacji okazały się niedostępne do automatycznego pobrania. */
export async function importUnavailable(source: "senat" | "krs"): Promise<ImportResult> {
  const settings = await getScreeningSettings();
  if (!settings.sources[source]?.enabled) return { source, status: "skipped" };
  const row = await startImportRow(source);
  if (!row) return { source, status: "running" };
  const reason =
    source === "senat"
      ? "senat.gov.pl odrzuca automatyczne pobieranie (HTTP 403, weryfikacja 2026-10-09). Senatorowie pokryci przez Wikidata (częściowo)."
      : "API KRS anonimizuje imiona, nazwiska i PESEL członków organów spółek — brak danych do dopasowania. Pozycje 24–30 wykazu pokryte oświadczeniem.";
  return failImport(source, row.id, new Error(reason));
}

// --- Wikidata (import etapowy, partiami) ----------------------------------------------

interface WikidataPlan {
  batches: Array<{ qids: string[]; codes: Record<string, string> }>;
  next: number;
  records: number;
  upserted: number;
  errors: string[];
}

async function sparql(query: string, settings: ScreeningSettings) {
  const endpoint = settings.sources.wikidata?.endpoint ?? "https://query.wikidata.org/sparql";
  const { res } = await fetchWithRetry(endpoint, {
    userAgent: settings.http_user_agent,
    attempts: 5,
    baseDelayMs: 5000,
    timeoutMs: 70_000,
    init: {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }).toString(),
    },
  });
  return res.json();
}

async function buildWikidataPlan(settings: ScreeningSettings): Promise<WikidataPlan> {
  const { data: catalog, error } = await sdb
    .from("pep_position_catalog")
    .select("code, wikidata_ids, wikidata_mode")
    .eq("is_active", true)
    .contains("data_sources", ["wikidata"]);
  if (error) throw new Error(error.message);
  const batches: WikidataPlan["batches"] = [];
  for (const c of (catalog ?? []) as Array<{
    code: string;
    wikidata_ids: string[];
    wikidata_mode: WikidataMode;
  }>) {
    if (!c.wikidata_ids?.length) continue;
    let qids = c.wikidata_ids;
    if (c.wikidata_mode !== "direct") {
      qids = [
        ...new Set([
          ...qids,
          ...parseWikidataPositions(
            await sparql(wikidataPositionsQuery(c.wikidata_ids, c.wikidata_mode), settings),
          ),
        ]),
      ];
    }
    for (const part of chunk(qids, 40))
      batches.push({ qids: part, codes: Object.fromEntries(part.map((q) => [q, c.code])) });
  }
  return { batches, next: 0, records: 0, upserted: 0, errors: [] };
}

/** Startuje nowy import Wikidata albo kontynuuje trwający (w limicie czasu wywołania). */
export async function importWikidata(
  opts: { force?: boolean; continueOnly?: boolean } = {},
): Promise<ImportResult> {
  const t0 = Date.now();
  const settings = await getScreeningSettings();
  if (!settings.sources.wikidata?.enabled) return { source: "wikidata", status: "skipped" };
  let { data: row } = await sdb
    .from("screening_source_imports")
    .select("id, started_at, details")
    .eq("source", "wikidata")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) {
    if (opts.continueOnly) return { source: "wikidata", status: "skipped" };
    const started = await startImportRow("wikidata");
    if (!started) return { source: "wikidata", status: "running" };
    try {
      const plan = await buildWikidataPlan(settings);
      await sdb.from("screening_source_imports").update({ details: { plan } }).eq("id", started.id);
      row = { ...started, details: { plan } };
    } catch (e) {
      return failImport("wikidata", started.id, e);
    }
  }
  const plan = (row.details as { plan: WikidataPlan }).plan;
  try {
    while (plan.next < plan.batches.length && Date.now() - t0 < STAGED_BUDGET_MS) {
      const b = plan.batches[plan.next];
      const json = await sparql(
        wikidataHoldersQuery(b.qids, settings.wikidata_min_end_year),
        settings,
      );
      const records = parseWikidataHolders(json, b.codes);
      const { upserted } = await upsertPep("wikidata", records, { mergeSince: row.started_at });
      plan.records += records.length;
      plan.upserted += upserted;
      plan.next++;
      await sdb
        .from("screening_source_imports")
        .update({ details: { plan }, attempts: plan.next })
        .eq("id", row.id);
    }
  } catch (e) {
    // Partia nie przeszła mimo ponowień — zapisujemy błąd; kolejne wywołanie spróbuje tej samej partii.
    plan.errors.push(
      `${new Date().toISOString()} partia ${plan.next}: ${(e as Error).message}`.slice(0, 500),
    );
    await sdb.from("screening_source_imports").update({ details: { plan } }).eq("id", row.id);
    if (plan.errors.length >= 10) return failImport("wikidata", row.id, e);
    return { source: "wikidata", status: "running", error: (e as Error).message, importId: row.id };
  }
  if (plan.next < plan.batches.length) {
    return { source: "wikidata", status: "running", recordCount: plan.records, importId: row.id };
  }
  try {
    // Koniec — ochrona przed pustym wynikiem przed oznaczeniem brakujących osób.
    assertPlausible("wikidata", plan.records, await activePepCount("wikidata"));
    const ended = await endMissingPep("wikidata", row.started_at);
    await finishImportRow(row.id, {
      status: "success",
      record_count: plan.records,
      upserted: plan.upserted,
      deactivated: ended,
      changed: plan.upserted > 0 || ended > 0,
      details: { batches: plan.batches.length, errors: plan.errors },
    });
    await screeningAudit({
      eventType: "import.success",
      entityType: "import",
      entityId: row.id,
      details: { source: "wikidata", records: plan.records, upserted: plan.upserted, ended },
    });
    return {
      source: "wikidata",
      status: "success",
      recordCount: plan.records,
      upserted: plan.upserted,
      deactivated: ended,
      importId: row.id,
    };
  } catch (e) {
    return failImport("wikidata", row.id, e);
  }
}

// --- Orkiestracja -------------------------------------------------------------------------

export async function runImport(
  source: SourceKey,
  opts: { force?: boolean } = {},
): Promise<ImportResult> {
  switch (source) {
    case "eu_fsf":
    case "un_sc":
    case "mswia":
    case "ofac_sdn":
      return importSanctions(source, opts);
    case "sejm_api":
      return importSejm(opts);
    case "kprm":
      return importKprm(opts);
    case "wikidata":
      return importWikidata(opts);
    case "senat":
    case "krs":
      return importUnavailable(source);
  }
}

export async function runImportGroup(
  group: ImportGroup,
  opts: { force?: boolean } = {},
): Promise<ImportResult[]> {
  if (group === "continue") return [await importWikidata({ continueOnly: true })];
  const out: ImportResult[] = [];
  for (const source of IMPORT_GROUPS[group]) {
    try {
      out.push(await runImport(source, opts));
    } catch (e) {
      out.push({ source, status: "failed", error: (e as Error).message });
    }
  }
  return out;
}

/** Statusy PEP: czy osoba nadal jest PEP (funkcja trwa lub zakończyła się w okresie karencji). */
export function pepTimeStatus(
  rec: { is_current: boolean; latest_position_end: string | null },
  graceMonths: number,
  now = new Date(),
): "current" | "within_grace" | "former" {
  if (rec.is_current || !rec.latest_position_end) return "current";
  const end = parsePartialDate(rec.latest_position_end);
  if (!end.date) return "current";
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() - graceMonths);
  return new Date(end.date) >= limit ? "within_grace" : "former";
}
