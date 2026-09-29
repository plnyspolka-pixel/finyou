import { describe, it, expect } from "vitest";
import {
  VIDEO_RENDITION_MAX_ATTEMPTS,
  VIDEO_RENDITION_TIMEOUT_MS,
  isRenditionCandidateUrl,
  isTranscodeUnsupportedError,
  isVideoPreparingNote,
  preparingNote,
  renditionSourcesToDiscover,
  renditionStoragePath,
  resolveVideoRendition,
  type RenditionJobProbe,
  type VideoRenditionRowLike,
} from "./video-rendition";

const NOW = new Date("2026-09-29T10:00:00.000Z");
const SOURCE =
  "https://xyz.supabase.co/storage/v1/object/public/studio-media/marketing-materials/abc.mov";
const OUTPUT =
  "https://xyz.supabase.co/storage/v1/object/public/studio-media/renditions/social-v1/row-1.mp4";

function row(patch: Partial<VideoRenditionRowLike> = {}): VideoRenditionRowLike {
  return {
    id: "row-1",
    source_url: SOURCE,
    status: "processing",
    job_id: "job-1",
    job_started_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    attempt_count: 1,
    unchanged: false,
    output_url: null,
    last_error: null,
    ...patch,
  };
}

const resolve = (r: VideoRenditionRowLike, probe: RenditionJobProbe | null, now = NOW) =>
  resolveVideoRendition({ row: r, probe, now });

describe("resolveVideoRendition", () => {
  it("gotowy rendition oddaje adres wyniku", () => {
    const r = resolve(row({ status: "ready", output_url: OUTPUT }), null);
    expect(r).toEqual({ state: "ready", url: OUTPUT, unchanged: false });
  });

  it("gotowy rendition bez zmian oddaje oryginał", () => {
    const r = resolve(row({ status: "ready", output_url: null, unchanged: true }), null);
    expect(r).toEqual({ state: "ready", url: SOURCE, unchanged: true });
  });

  it("wiersz pending prosi o zlecenie", () => {
    expect(resolve(row({ status: "pending", job_id: null, attempt_count: 0 }), null)).toEqual({
      state: "submit",
    });
  });

  it("usługa pracuje → czekamy; milczy w limicie → też czekamy", () => {
    expect(resolve(row(), { status: "processing", error: null })).toEqual({ state: "waiting" });
    expect(resolve(row(), { status: "queued", error: null })).toEqual({ state: "waiting" });
    expect(resolve(row(), null)).toEqual({ state: "waiting" });
  });

  it("zadanie skończone: wgrane przez usługę → store/upload, inaczej → download", () => {
    expect(resolve(row(), { status: "done", error: null, uploaded: true })).toEqual({
      state: "store",
      via: "upload",
      unchanged: false,
    });
    expect(
      resolve(row(), { status: "done", error: null, uploaded: false, upload_error: "HTTP 403" }),
    ).toEqual({ state: "store", via: "download", unchanged: false });
    expect(resolve(row(), { status: "done", error: null, unchanged: true })).toEqual({
      state: "store",
      via: "upload",
      unchanged: true,
    });
  });

  it("błąd usługi albo zaginione zadanie: ponowienie, a po limicie prób oryginał", () => {
    expect(resolve(row({ attempt_count: 1 }), { status: "failed", error: "ffmpeg padł" })).toEqual({
      state: "retry",
      reason: "ffmpeg padł",
    });
    expect(resolve(row({ attempt_count: 1 }), { status: "missing", error: null })).toEqual({
      state: "retry",
      reason: "zadanie zaginęło",
    });
    expect(
      resolve(row({ attempt_count: VIDEO_RENDITION_MAX_ATTEMPTS }), {
        status: "failed",
        error: "ffmpeg padł",
      }),
    ).toEqual({ state: "give_up", reason: "ffmpeg padł" });
  });

  it("przekroczony czas: ponowienie, potem oryginał", () => {
    const stale = row({
      job_started_at: new Date(NOW.getTime() - VIDEO_RENDITION_TIMEOUT_MS - 1000).toISOString(),
    });
    const r = resolve(stale, { status: "processing", error: null });
    expect(r.state).toBe("retry");
    const r2 = resolve(
      { ...stale, attempt_count: VIDEO_RENDITION_MAX_ATTEMPTS },
      { status: "processing", error: null },
    );
    expect(r2.state).toBe("give_up");
    // Usługa milczy dłużej niż limit — też nie wisimy w nieskończoność.
    expect(resolve(stale, null).state).toBe("retry");
  });

  it("wiersz failed z wyzerowanym licznikiem (Ponów) próbuje od nowa", () => {
    expect(
      resolve(row({ status: "failed", attempt_count: 0, last_error: "za długi materiał" }), null),
    ).toEqual({ state: "retry", reason: "za długi materiał" });
    expect(
      resolve(
        row({
          status: "failed",
          attempt_count: VIDEO_RENDITION_MAX_ATTEMPTS,
          last_error: "za długi materiał",
        }),
        null,
      ),
    ).toEqual({ state: "give_up", reason: "za długi materiał" });
  });

  it("processing bez id zadania nie wisi", () => {
    expect(resolve(row({ job_id: null }), null).state).toBe("retry");
  });
});

describe("adresy i odkrywanie źródeł", () => {
  it("renditionStoragePath jest deterministyczna", () => {
    expect(renditionStoragePath("row-1")).toBe("renditions/social-v1/row-1.mp4");
  });

  it("kandydatem jest publiczny https, ale nie nasz własny wynik", () => {
    expect(isRenditionCandidateUrl(SOURCE)).toBe(true);
    expect(isRenditionCandidateUrl(OUTPUT)).toBe(false);
    expect(isRenditionCandidateUrl("http://example.com/a.mp4")).toBe(false);
    expect(isRenditionCandidateUrl(null)).toBe(false);
  });

  it("renditionSourcesToDiscover deduplikuje i pomija znane", () => {
    const known = new Set(["https://a.example/known.mp4"]);
    expect(
      renditionSourcesToDiscover(
        [SOURCE, SOURCE, "https://a.example/known.mp4", null, OUTPUT, "https://b.example/x.mp4"],
        known,
      ),
    ).toEqual([SOURCE, "https://b.example/x.mp4"]);
    expect(renditionSourcesToDiscover([SOURCE, "https://b.example/x.mp4"], known, 1)).toEqual([
      SOURCE,
    ]);
  });
});

describe("komunikaty", () => {
  it("notatka o przygotowaniu jest rozpoznawalna dla panelu", () => {
    const note = preparingNote(new Date("2026-09-29T10:05:00.000Z"));
    expect(note).toMatch(/^Wideo w przygotowaniu \(kompresja do 60 MB, MP4 H\.264\)/);
    expect(note).toMatch(/12:05/);
    expect(isVideoPreparingNote(note)).toBe(true);
    expect(isVideoPreparingNote("Plik za duży")).toBe(false);
    expect(isVideoPreparingNote(null)).toBe(false);
  });
});

describe("isTranscodeUnsupportedError", () => {
  it("rozpoznaje odpowiedź starej wersji usługi (sprzed zadania transcode)", () => {
    expect(isTranscodeUnsupportedError("caption-burner: brak pola ass")).toBe(true);
    expect(
      isTranscodeUnsupportedError("caption-burner: ass nie zawiera sekcji [Events] z kwestiami"),
    ).toBe(true);
    expect(isTranscodeUnsupportedError("caption-burner: przekroczony czas odpowiedzi")).toBe(false);
  });
});
