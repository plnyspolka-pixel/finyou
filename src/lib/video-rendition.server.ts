// Kompresja wideo przed publikacją — strona serwerowa: tabela
// `video_renditions`, kodowanie FFmpegiem na AWS Lambda
// (services/video-transcoder; bez jej sekretów — jak dawniej usługa
// caption-burner, zadanie `transcode`, wybór w src/lib/video-transcoder.server.ts)
// i bucket `studio-media`. Decyzje (co zrobić z wierszem po
// odczycie / po odpytaniu usługi) siedzą w src/lib/video-rendition.ts.
//
// Dwa wejścia:
//   * ensurePublishableVideo(url) — wołane przez KAŻDY publikator (YouTube,
//     TikTok, X, Meta) tuż przed pobraniem pliku. Zwraca adres gotowego pliku
//     albo rzuca VideoPreparingError (publikator odkłada wpis kolejki na
//     kilka minut BEZ zużycia próby). Gdy usługa nie jest skonfigurowana
//     albo kompresja ostatecznie się nie uda — zwraca oryginał (jak dotąd).
//   * runVideoRenditionTick() — z ticka social-publish-tick (co 10 min):
//     zakłada renditions dla wpisów czekających w kolejkach (żeby plik był
//     gotowy PRZED terminem), domyka zadania w usłudze i zleca nowe.
//
// Deduplikacja po (source_url, profil): ten sam film wysłany na cztery
// platformy kompresuje się raz. Wynik usługa wgrywa sama na podpisany URL
// Storage (bajty nie idą przez worker); gdy jej się to nie uda, pobieramy
// plik z usługi — jest ograniczony profilem (≤ 60 MB), więc mieści się
// w pamięci workera.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  VIDEO_PREPARING_RETRY_MIN,
  VIDEO_RENDITION_MAX_ATTEMPTS,
  VIDEO_RENDITION_PROFILE,
  VIDEO_RENDITION_TARGET,
  TRANSCODE_UNSUPPORTED_REASON,
  isRenditionCandidateUrl,
  isTranscodeUnsupportedError,
  preparingNote,
  renditionGiveUpNote,
  renditionSourcesToDiscover,
  renditionStoragePath,
  resolveVideoRendition,
  type RenditionJobProbe,
  type VideoRenditionRowLike,
} from "./video-rendition";

const PUBLIC_BUCKET = "studio-media";
/**
 * Ile zadań zlecamy w jednym ticku: caption-burner koduje jedno naraz, Lambda
 * równolegle (limit konta to 10 wywołań naraz, dzielony z Remotion).
 */
const MAX_SUBMITS_PER_TICK_BURNER = 2;
const MAX_SUBMITS_PER_TICK_AWS = 4;
/** Ile zadań w toku odpytujemy w jednym ticku. */
const MAX_POLLS_PER_TICK = 5;
/** Ile adresów z kolejek zakładamy w jednym ticku. */
const MAX_DISCOVER_PER_TICK = 20;
/** Zapas ponad profil przy pobieraniu wyniku przez worker (nagłówki kontenera). */
const RESULT_SLACK_BYTES = 2 * 1024 * 1024;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Limit czasu z env (minuty) — jak CAPTION_BURN_TIMEOUT_MINUTES dla napisów. */
function renditionTimeoutMs(): number | undefined {
  const minutes = Number(process.env.VIDEO_RENDITION_TIMEOUT_MINUTES);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : undefined;
}

/**
 * Wideo jeszcze się kompresuje — publikator odkłada wpis kolejki na
 * `nextAt` i wpisuje `note` do `last_error` (panel pokazuje ją jako
 * informację, nie błąd — isVideoPreparingNote).
 */
export class VideoPreparingError extends Error {
  readonly nextAt: Date;
  readonly note: string;
  constructor() {
    const nextAt = new Date(Date.now() + VIDEO_PREPARING_RETRY_MIN * 60_000);
    const note = preparingNote(nextAt);
    super(note);
    this.name = "VideoPreparingError";
    this.nextAt = nextAt;
    this.note = note;
  }
}

export type VideoRenditionRow = VideoRenditionRowLike & {
  profile: string;
  output_bytes: number | null;
  source_bytes: number | null;
  created_at: string;
  updated_at: string;
};

const table = () => supabaseAdmin.from("video_renditions");

async function loadRendition(sourceUrl: string): Promise<VideoRenditionRow | null> {
  const { data, error } = await table()
    .select("*")
    .eq("source_url", sourceUrl)
    .eq("profile", VIDEO_RENDITION_PROFILE)
    .maybeSingle();
  if (error) throw new Error(`video_renditions: ${error.message}`);
  return (data as VideoRenditionRow | null) ?? null;
}

/**
 * Zakłada wiersz `pending` dla adresu (idempotentnie — wyścig dwóch
 * publikacji tego samego pliku kończy się jednym wierszem). Tanie: bez
 * wołania usługi; zlecenie robi tick albo pierwszy publikator.
 */
export async function requestVideoRendition(sourceUrl: string): Promise<VideoRenditionRow | null> {
  if (!isRenditionCandidateUrl(sourceUrl)) return null;
  const existing = await loadRendition(sourceUrl);
  if (existing) return existing;
  const { data, error } = await table()
    .insert({ source_url: sourceUrl, profile: VIDEO_RENDITION_PROFILE })
    .select("*")
    .maybeSingle();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return loadRendition(sourceUrl);
    throw new Error(`video_renditions: ${error.message}`);
  }
  return (data as VideoRenditionRow | null) ?? loadRendition(sourceUrl);
}

/**
 * „Ponów" przy wpisie kolejki: nieudany rendition dostaje nowy budżet prób,
 * żeby ponowiona publikacja znów spróbowała kompresji (np. po naprawie
 * usługi), zamiast od razu słać oryginał.
 */
export async function resetVideoRendition(sourceUrl: string | null | undefined): Promise<void> {
  if (!isRenditionCandidateUrl(sourceUrl)) return;
  await table()
    .update({ status: "pending", attempt_count: 0, job_id: null, job_started_at: null })
    .eq("source_url", sourceUrl)
    .eq("profile", VIDEO_RENDITION_PROFILE)
    .eq("status", "failed");
}

// ── Zlecenie i domknięcie ───────────────────────────────────────────────────

type SubmitOutcome = {
  /** Wiersz przejęty przez ten przebieg (false = ktoś inny zdążył). */
  claimed: boolean;
  /**
   * Kompresja teraz niemożliwa (stara wersja usługi) — wołający publikuje
   * oryginał od razu. Próba NIE jest zużyta: po redeployu usługi kolejna
   * publikacja tego pliku spróbuje ponownie sama.
   */
  unsupported: string | null;
};

/**
 * Zleca zadanie w usłudze. Optymistyczne przejęcie wiersza (pending/failed →
 * processing) chroni przed podwójnym zleceniem, gdy tick i publikator trafią
 * na ten sam wiersz w tej samej chwili.
 */
async function submitRendition(
  row: VideoRenditionRow,
  reason: string | null,
): Promise<SubmitOutcome> {
  const attempt = row.attempt_count + 1;
  const { data: claimed, error: claimErr } = await table()
    .update({
      status: "processing",
      attempt_count: attempt,
      job_id: null,
      job_started_at: new Date().toISOString(),
      last_error: reason,
    })
    .eq("id", row.id)
    .in("status", ["pending", "failed"])
    .select("id");
  if (claimErr) throw new Error(`video_renditions: ${claimErr.message}`);
  if (!claimed?.length) return { claimed: false, unsupported: null };

  try {
    const path = renditionStoragePath(row.id);
    // Podpisany adres uploadu (2 h): usługa wgra wynik prosto do Storage.
    // Gdy Storage nie wystawi adresu, zadanie idzie bez niego — wynik
    // pobierzemy przez worker.
    let uploadUrl: string | null = null;
    const signed = await supabaseAdmin.storage
      .from(PUBLIC_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signed.data?.signedUrl) uploadUrl = signed.data.signedUrl;
    else console.warn(`[renditions] brak podpisanego adresu uploadu: ${signed.error?.message}`);

    const { submitTranscodeJob } = await import("./video-transcoder.server");
    const jobId = await submitTranscodeJob({
      videoUrl: row.source_url,
      uploadUrl,
      target: VIDEO_RENDITION_TARGET,
      name: `publikacja-${row.id.slice(0, 8)}`,
    });
    await table()
      .update({ job_id: jobId, job_started_at: new Date().toISOString() })
      .eq("id", row.id);
    return { claimed: true, unsupported: null };
  } catch (e) {
    if (isTranscodeUnsupportedError(errMsg(e))) {
      await table()
        .update({
          status: "failed",
          attempt_count: row.attempt_count,
          job_id: null,
          job_started_at: null,
          last_error: TRANSCODE_UNSUPPORTED_REASON,
        })
        .eq("id", row.id);
      console.warn(`[renditions] ${TRANSCODE_UNSUPPORTED_REASON} (${row.id})`);
      return { claimed: true, unsupported: TRANSCODE_UNSUPPORTED_REASON };
    }
    // Zlecenie nie doszło (usługa śpi, sieć): próba jest zużyta, wiersz wraca
    // do `pending` (albo `failed`, gdy to była ostatnia) — nic nie wisi.
    const exhausted = attempt >= VIDEO_RENDITION_MAX_ATTEMPTS;
    await table()
      .update({
        status: exhausted ? "failed" : "pending",
        job_id: null,
        job_started_at: null,
        last_error: `zlecenie nieudane: ${errMsg(e)}`,
      })
      .eq("id", row.id);
    console.warn(`[renditions] zlecenie nieudane (${row.id}): ${errMsg(e)}`);
    return { claimed: true, unsupported: null };
  }
}

/** Publiczny adres pliku w buckecie. */
function publicUrlFor(path: string): string {
  return supabaseAdmin.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Czy plik pod publicznym adresem istnieje (HEAD) — po uploadzie przez usługę. */
async function publicFileSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return null;
    return Number(res.headers.get("content-length") ?? 0) || null;
  } catch {
    return null;
  }
}

/**
 * Domyka zadanie po stronie Storage: wynik jest już w buckecie (upload przez
 * usługę) albo pobieramy go z usługi i zapisujemy sami. Rzuca, gdy pliku
 * nie ma nigdzie — wołający traktuje to jak błąd usługi.
 */
async function storeRendition(
  row: VideoRenditionRow,
  probe: RenditionJobProbe,
  via: "upload" | "download",
  unchanged: boolean,
): Promise<{ output_url: string | null; output_bytes: number | null }> {
  if (unchanged) return { output_url: null, output_bytes: probe.bytes ?? null };
  const path = renditionStoragePath(row.id);
  const url = publicUrlFor(path);
  if (via === "upload") {
    const size = await publicFileSize(url);
    if (size) return { output_url: url, output_bytes: size };
    console.warn(`[renditions] usługa zgłosiła upload, ale pliku nie ma (${row.id}) — pobieram`);
  }
  const { fetchTranscodeFile } = await import("./video-transcoder.server");
  const { uploadEnsuringBucket } = await import("./media-storage.server");
  const bytes = await fetchTranscodeFile(
    row.job_id!,
    VIDEO_RENDITION_TARGET.max_bytes + RESULT_SLACK_BYTES,
  );
  await uploadEnsuringBucket(PUBLIC_BUCKET, path, new Uint8Array(bytes), "video/mp4", {
    upsert: true,
  });
  return { output_url: url, output_bytes: bytes.byteLength };
}

type SettleOutcome =
  | { state: "ready"; url: string }
  | { state: "waiting" }
  | { state: "original"; url: string; reason: string };

/**
 * Jedno przejście decyzji dla wiersza: odpytanie usługi (gdy trwa), zapis
 * wyniku, ponowienie albo rezygnacja. Wspólne dla ticka i publikatorów.
 */
async function settleRendition(row: VideoRenditionRow): Promise<SettleOutcome> {
  let probe: RenditionJobProbe | null = null;
  if (row.status === "processing" && row.job_id) {
    try {
      const transcoder = await import("./video-transcoder.server");
      probe = await transcoder.getTranscodeJobStatus(row.job_id);
    } catch (e) {
      // Usługa nie odpowiada (uśpiony kontener, sieć) — czekamy do limitu.
      console.warn(`[renditions] usługa nie odpowiada (${row.id}): ${errMsg(e)}`);
      probe = null;
    }
  }
  const resolution = resolveVideoRendition({
    row,
    probe,
    now: new Date(),
    timeoutMs: renditionTimeoutMs(),
  });

  if (resolution.state === "ready") return { state: "ready", url: resolution.url };
  if (resolution.state === "waiting") return { state: "waiting" };

  if (resolution.state === "submit" || resolution.state === "retry") {
    const reason = resolution.state === "retry" ? resolution.reason : null;
    if (reason) console.warn(`[renditions] ponawiam kompresję (${row.id}): ${reason}`);
    const sub = await submitRendition(row, reason);
    if (sub.unsupported) return { state: "original", url: row.source_url, reason: sub.unsupported };
    return { state: "waiting" };
  }

  if (resolution.state === "store") {
    try {
      const stored = await storeRendition(row, probe!, resolution.via, resolution.unchanged);
      // Zapis warunkowy: gdyby drugi wołający domknął wiersz w międzyczasie,
      // nie nadpisujemy jego wyniku ani nie kasujemy zadania drugi raz.
      const { data: done } = await table()
        .update({
          status: "ready",
          unchanged: resolution.unchanged,
          output_url: stored.output_url,
          output_bytes: stored.output_bytes,
          last_error: probe?.note ?? null,
        })
        .eq("id", row.id)
        .eq("status", "processing")
        .select("id");
      if (done?.length && row.job_id) {
        const transcoder = await import("./video-transcoder.server");
        await transcoder.discardTranscodeJob(row.job_id);
      }
      return { state: "ready", url: stored.output_url ?? row.source_url };
    } catch (e) {
      console.warn(`[renditions] zapis wyniku nieudany (${row.id}): ${errMsg(e)}`);
      // Zapis to część zadania — liczy się jak jego błąd: ponowienie albo oryginał.
      const again = resolveVideoRendition({
        row,
        probe: { status: "failed", error: `zapis wyniku: ${errMsg(e)}` },
        now: new Date(),
      });
      if (again.state === "retry") {
        const sub = await submitRendition(row, again.reason);
        if (sub.unsupported) {
          return { state: "original", url: row.source_url, reason: sub.unsupported };
        }
        return { state: "waiting" };
      }
      return giveUp(row, again.state === "give_up" ? again.reason : errMsg(e));
    }
  }

  return giveUp(row, resolution.reason);
}

async function giveUp(row: VideoRenditionRow, reason: string): Promise<SettleOutcome> {
  if (row.status !== "failed" || row.last_error !== reason) {
    await table()
      .update({ status: "failed", job_id: null, job_started_at: null, last_error: reason })
      .eq("id", row.id);
  }
  if (row.job_id) {
    const transcoder = await import("./video-transcoder.server");
    await transcoder.discardTranscodeJob(row.job_id);
  }
  console.warn(`[renditions] ${renditionGiveUpNote(reason)} (${row.source_url})`);
  return { state: "original", url: row.source_url, reason };
}

// ── Wejście dla publikatorów ────────────────────────────────────────────────

/**
 * Adres pliku do wysłania na platformę. Rzuca VideoPreparingError, gdy
 * kompresja trwa (albo została właśnie zlecona). Bez usługi — oryginał.
 */
export async function ensurePublishableVideo(sourceUrl: string): Promise<string> {
  const { isTranscodeConfigured } = await import("./video-transcoder.server");
  if (!isRenditionCandidateUrl(sourceUrl) || !(await isTranscodeConfigured())) return sourceUrl;

  let row: VideoRenditionRow | null;
  try {
    row = await requestVideoRendition(sourceUrl);
  } catch (e) {
    // Brak tabeli (migracja nie poszła) nie może zatrzymać publikacji.
    console.warn(`[renditions] ${errMsg(e)} — publikuję oryginał`);
    return sourceUrl;
  }
  if (!row) return sourceUrl;

  const outcome = await settleRendition(row);
  if (outcome.state === "waiting") throw new VideoPreparingError();
  return outcome.url;
}

// ── Tick ────────────────────────────────────────────────────────────────────

/** Adresy wideo z wpisów czekających w kolejkach (Meta / TikTok / X + YouTube). */
async function queuedVideoUrls(): Promise<string[]> {
  const [social, youtube] = await Promise.all([
    supabaseAdmin
      .from("social_publish_queue")
      .select("video_url")
      .eq("status", "pending")
      .not("video_url", "is", null)
      .order("scheduled_at", { ascending: true })
      .limit(100),
    supabaseAdmin
      .from("youtube_publish_queue")
      .select("source_video_url")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(100),
  ]);
  return [
    ...(social.data ?? []).map((r) => r.video_url),
    ...(youtube.data ?? []).map((r) => r.source_video_url),
  ].filter((u): u is string => typeof u === "string");
}

/**
 * Przebieg ticka: (1) załóż renditions dla wpisów czekających w kolejkach,
 * (2) domknij zadania w toku, (3) zleć nowe. Bez usługi — nic nie robi.
 */
export async function runVideoRenditionTick(): Promise<{
  configured: boolean;
  /** Gdzie idą nowe zlecenia: AWS Lambda albo (bez jej sekretów) caption-burner. */
  engine: "aws-lambda" | "caption-burner" | null;
  discovered: number;
  submitted: number;
  ready: number;
  failed: number;
  errors: string[];
}> {
  const { transcodeEngine } = await import("./video-transcoder.server");
  const engine = await transcodeEngine();
  const result = {
    configured: engine !== null,
    engine,
    discovered: 0,
    submitted: 0,
    ready: 0,
    failed: 0,
    errors: [] as string[],
  };
  if (!result.configured) return result;

  // 1. Odkrywanie — plik ma być gotowy PRZED terminem publikacji.
  try {
    const urls = await queuedVideoUrls();
    if (urls.length) {
      const { data: known } = await table()
        .select("source_url")
        .eq("profile", VIDEO_RENDITION_PROFILE)
        .in("source_url", Array.from(new Set(urls)));
      const fresh = renditionSourcesToDiscover(
        urls,
        new Set((known ?? []).map((k) => k.source_url)),
        MAX_DISCOVER_PER_TICK,
      );
      if (fresh.length) {
        const { error } = await table().insert(
          fresh.map((source_url) => ({ source_url, profile: VIDEO_RENDITION_PROFILE })),
        );
        if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
        result.discovered = fresh.length;
      }
    }
  } catch (e) {
    result.errors.push(`odkrywanie: ${errMsg(e)}`);
  }

  // 2. Domknięcie zadań w toku (najstarsze pierwsze).
  try {
    const { data: rows, error } = await table()
      .select("*")
      .eq("status", "processing")
      .order("job_started_at", { ascending: true, nullsFirst: true })
      .limit(MAX_POLLS_PER_TICK);
    if (error) throw new Error(error.message);
    for (const row of (rows ?? []) as VideoRenditionRow[]) {
      try {
        const out = await settleRendition(row);
        if (out.state === "ready") result.ready += 1;
        else if (out.state === "original") {
          result.failed += 1;
          result.errors.push(`${row.source_url}: ${out.reason}`);
        }
      } catch (e) {
        result.errors.push(`${row.id}: ${errMsg(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(`domykanie: ${errMsg(e)}`);
  }

  // 3. Nowe zlecenia (caption-burner koduje jedno naraz — nie zalewamy jego kolejki).
  try {
    const { data: rows, error } = await table()
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(engine === "aws-lambda" ? MAX_SUBMITS_PER_TICK_AWS : MAX_SUBMITS_PER_TICK_BURNER);
    if (error) throw new Error(error.message);
    for (const row of (rows ?? []) as VideoRenditionRow[]) {
      try {
        const sub = await submitRendition(row, null);
        if (sub.unsupported) {
          // Stara wersja usługi — nie ma sensu zlecać reszty w tym ticku.
          result.errors.push(sub.unsupported);
          break;
        }
        if (sub.claimed) result.submitted += 1;
      } catch (e) {
        result.errors.push(`${row.id}: ${errMsg(e)}`);
      }
    }
  } catch (e) {
    result.errors.push(`zlecanie: ${errMsg(e)}`);
  }

  return result;
}

/** Do panelu / MCP: stan renditions dla listy adresów (np. wpisów kolejki). */
export async function listVideoRenditions(
  sourceUrls: readonly string[],
): Promise<VideoRenditionRow[]> {
  const unique = Array.from(new Set(sourceUrls.filter((u) => isRenditionCandidateUrl(u))));
  if (!unique.length) return [];
  const { data, error } = await table()
    .select("*")
    .eq("profile", VIDEO_RENDITION_PROFILE)
    .in("source_url", unique);
  if (error) throw new Error(`video_renditions: ${error.message}`);
  return (data ?? []) as VideoRenditionRow[];
}
