// Testy zadania kompresji z prawdziwym FFmpegiem (gdy jest w PATH) i magazynem
// w pamięci. Uruchomienie: node --test services/video-transcoder/
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdtemp, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJob, processJob, route, HttpError, JOB_PREFIX } from "./core.mjs";

const hasFfmpeg = await new Promise((r) => execFile("ffmpeg", ["-version"], (e) => r(!e)));

function memoryStore() {
  const jobs = new Map();
  const results = new Map();
  return {
    jobs,
    results,
    getJob: async (id) => (jobs.has(id) ? structuredClone(jobs.get(id)) : null),
    putJob: async (j) => void jobs.set(j.id, structuredClone(j)),
    deleteJob: async (id) => void jobs.delete(id),
    putResult: async (id, file) => void results.set(id, await readFile(file)),
    resultUrl: async (id) => `https://s3.example/results/${id}.mp4?sig=1`,
    deleteResult: async (id) => void results.delete(id),
  };
}

const run = (bin, args, cwd) =>
  new Promise((resolve, reject) => {
    const c = spawn(bin, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    c.stderr.on("data", (d) => (err += d));
    c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-300)))));
  });

const probe = (file) =>
  new Promise((resolve, reject) =>
    execFile(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      (e, out) => (e ? reject(e) : resolve(JSON.parse(out))),
    ),
  );

function deps(store, fixtures) {
  return {
    store,
    uuid: () => "00000000-0000-4000-8000-000000000001",
    authorized: (h) => h === "Bearer s3cret",
    invokeWorker: async () => {},
    ffmpegVersion: async () => "ffmpeg test",
    runFfmpeg: (args, cwd) => run("ffmpeg", args, cwd),
    ffprobe: probe,
    download: async (url, dest) => {
      const src = fixtures[new URL(url).pathname.slice(1)];
      await copyFile(src, dest);
      return (await stat(dest)).size;
    },
    upload: async (file, url) => {
      if (url.includes("fail")) throw new Error("upload: HTTP 500");
      fixtures.uploaded = await stat(file);
    },
    preset: "ultrafast",
  };
}

describe("route / createJob", () => {
  it("odrzuca bez sekretu i zadania z napisami", async () => {
    const d = deps(memoryStore(), {});
    await assert.rejects(
      route({ method: "POST", path: "/jobs", headers: {}, body: "{}" }, d),
      (e) => e instanceof HttpError && e.status === 401,
    );
    await assert.rejects(
      createJob({ ass: "x", video_url: "https://a/b.mp4" }, d),
      (e) => e.status === 400,
    );
  });

  it("POST zapisuje zadanie z prefiksem aws- i woła workera", async () => {
    const store = memoryStore();
    const calls = [];
    const d = { ...deps(store, {}), invokeWorker: async (id) => calls.push(id) };
    const out = await route(
      {
        method: "POST",
        path: "/jobs",
        headers: { authorization: "Bearer s3cret" },
        body: JSON.stringify({ kind: "transcode", video_url: "https://cdn.example/v.mp4" }),
      },
      d,
    );
    assert.equal(out.status, 202);
    assert.ok(out.body.id.startsWith(JOB_PREFIX));
    assert.deepEqual(calls, [out.body.id]);
    const get = await route(
      { method: "GET", path: `/jobs/${out.body.id}`, headers: { authorization: "Bearer s3cret" } },
      d,
    );
    assert.equal(get.body.status, "queued");
    assert.equal(get.body.engine, "aws-lambda");
  });

  it("prywatne adresy są odrzucane", async () => {
    await assert.rejects(
      createJob({ video_url: "https://127.0.0.1/v.mp4" }, deps(memoryStore(), {})),
      (e) => e.status === 400,
    );
  });
});

describe("processJob (FFmpeg)", { skip: !hasFfmpeg && "brak ffmpeg w PATH" }, () => {
  let fixtures;
  before(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "vt-"));
    // 4K 60 kl/s MOV — musi zejść do 1080p / 30 kl/s.
    await run(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=2160x3840:rate=60:duration=2",
        "-f",
        "lavfi",
        "-i",
        "sine=duration=2",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-shortest",
        "big.mov",
      ],
      dir,
    );
    await run(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1080x1920:rate=30:duration=2",
        "-f",
        "lavfi",
        "-i",
        "sine=duration=2",
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        "-movflags",
        "+faststart",
        "ok.mp4",
      ],
      dir,
    );
    fixtures = { "big.mov": path.join(dir, "big.mov"), "ok.mp4": path.join(dir, "ok.mp4") };
  });

  it("4K MOV → 1080×1920 MP4 wgrany na upload_url", async () => {
    const store = memoryStore();
    const d = deps(store, fixtures);
    const job = await createJob(
      { video_url: "https://cdn.example/big.mov", upload_url: "https://storage.example/up" },
      d,
    );
    const done = await processJob(job.id, d);
    assert.equal(done.status, "done", done.error);
    assert.equal(done.uploaded, true);
    assert.equal(done.output.width, 1080);
    assert.equal(done.output.height, 1920);
    assert.equal(done.output.fps, 30);
    assert.equal(done.upload_url, null);
  });

  it("nieudany upload → wynik w magazynie i file_url w GET", async () => {
    const store = memoryStore();
    const d = deps(store, fixtures);
    const job = await createJob(
      { video_url: "https://cdn.example/big.mov", upload_url: "https://storage.example/fail" },
      d,
    );
    const done = await processJob(job.id, d);
    assert.equal(done.status, "done");
    assert.equal(done.uploaded, false);
    assert.ok(store.results.has(job.id));
    const get = await route(
      { method: "GET", path: `/jobs/${job.id}`, headers: { authorization: "Bearer s3cret" } },
      d,
    );
    assert.match(get.body.file_url, /results/);
  });

  it("zgodny plik zostaje bez przekodowania", async () => {
    const d = deps(memoryStore(), fixtures);
    const job = await createJob({ video_url: "https://cdn.example/ok.mp4" }, d);
    const done = await processJob(job.id, d);
    assert.equal(done.status, "done");
    assert.equal(done.unchanged, true);
  });
});
