// Testy czystej logiki planu transkodowania. Uruchomienie (bez zależności):
//   node --test services/caption-burner/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TARGET,
  complianceIssues,
  ffmpegTranscodeArgs,
  fitDimensions,
  parseTarget,
  planEncode,
  summarizeProbe,
} from "./transcode-plan.mjs";

const MB = 1024 * 1024;

/** Minimalny JSON ffprobe rolki HeyGen 1080×1920, H.264 + AAC, 60 s. */
function probe(overrides = {}) {
  const { format = {}, video = {}, audio = {}, extraStreams = [], noAudio = false } = overrides;
  return {
    format: {
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      duration: "60.000000",
      size: String(40 * MB),
      bit_rate: "5600000",
      tags: { major_brand: "isom" },
      ...format,
    },
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        profile: "High",
        pix_fmt: "yuv420p",
        width: 1080,
        height: 1920,
        avg_frame_rate: "25/1",
        r_frame_rate: "25/1",
        ...video,
      },
      ...(noAudio
        ? []
        : [
            {
              codec_type: "audio",
              codec_name: "aac",
              channels: 2,
              sample_rate: "48000",
              ...audio,
            },
          ]),
      ...extraStreams,
    ],
  };
}

describe("summarizeProbe", () => {
  it("czyta wymiary, klatkaż i audio", () => {
    const s = summarizeProbe(probe());
    assert.equal(s.video.width, 1080);
    assert.equal(s.video.height, 1920);
    assert.equal(s.video.fps, 25);
    assert.equal(s.audio.codec, "aac");
    assert.equal(s.duration, 60);
    assert.equal(s.size, 40 * MB);
  });

  it("obraca wymiary przy metadanych obrotu (film z telefonu)", () => {
    const s = summarizeProbe(
      probe({ video: { width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] } }),
    );
    assert.equal(s.video.width, 1080);
    assert.equal(s.video.height, 1920);
    assert.equal(s.video.rotation, -90);
  });

  it("pomija okładkę (attached_pic) jako ścieżkę filmu", () => {
    const s = summarizeProbe(
      probe({
        extraStreams: [
          {
            codec_type: "video",
            codec_name: "mjpeg",
            width: 300,
            height: 300,
            disposition: { attached_pic: 1 },
          },
        ],
      }),
    );
    assert.equal(s.video.codec, "h264");
    assert.equal(s.streams.video, 2);
  });
});

describe("complianceIssues", () => {
  it("rolka HeyGen w limicie jest zgodna — bez przekodowania", () => {
    assert.deepEqual(complianceIssues(summarizeProbe(probe()), DEFAULT_TARGET), []);
  });

  it("za duży plik wymaga przekodowania", () => {
    const issues = complianceIssues(
      summarizeProbe(probe({ format: { size: String(300 * MB) } })),
      DEFAULT_TARGET,
    );
    assert.equal(issues.length, 1);
    assert.match(issues[0], /300 MB > limit 60 MB/);
  });

  it("MOV z HEVC (iPhone) wymaga przekodowania z kilku powodów", () => {
    const issues = complianceIssues(
      summarizeProbe(
        probe({
          format: { tags: { major_brand: "qt  " } },
          video: { codec_name: "hevc", pix_fmt: "yuv420p10le", avg_frame_rate: "60/1" },
        }),
      ),
      DEFAULT_TARGET,
    );
    assert.ok(issues.some((i) => /MOV/.test(i)));
    assert.ok(issues.some((i) => /hevc/.test(i)));
    assert.ok(issues.some((i) => /yuv420p10le/.test(i)));
    assert.ok(issues.some((i) => /60 kl\.\/s/.test(i)));
  });

  it("4K i dodatkowe strumienie to powody do przekodowania", () => {
    const issues = complianceIssues(
      summarizeProbe(
        probe({
          video: { width: 2160, height: 3840 },
          extraStreams: [{ codec_type: "subtitle", codec_name: "mov_text" }],
        }),
      ),
      DEFAULT_TARGET,
    );
    assert.ok(issues.some((i) => /2160×3840/.test(i)));
    assert.ok(issues.some((i) => /dodatkowe strumienie/.test(i)));
  });

  it("brak audio jest dozwolony, ale nie-AAC już nie", () => {
    assert.deepEqual(
      complianceIssues(summarizeProbe(probe({ noAudio: true })), DEFAULT_TARGET),
      [],
    );
    const issues = complianceIssues(
      summarizeProbe(probe({ audio: { codec_name: "mp3" } })),
      DEFAULT_TARGET,
    );
    assert.deepEqual(issues, ["kodek audio mp3"]);
  });
});

describe("fitDimensions", () => {
  it("nie powiększa i trzyma parzyste wymiary", () => {
    assert.deepEqual(fitDimensions(720, 1280, 1920, 1080), { width: 720, height: 1280 });
    assert.deepEqual(fitDimensions(2160, 3840, 1920, 1080), { width: 1080, height: 1920 });
    assert.deepEqual(fitDimensions(3840, 2160, 1920, 1080), { width: 1920, height: 1080 });
    assert.deepEqual(fitDimensions(1001, 1001, 1920, 1080), { width: 1000, height: 1000 });
  });
});

describe("planEncode", () => {
  it("krótka rolka: pełne 1080p, bitrate z sufitu jakości, bez skalowania", () => {
    const plan = planEncode(summarizeProbe(probe()), DEFAULT_TARGET);
    assert.equal(plan.scale, false);
    assert.equal(plan.width, 1080);
    assert.equal(plan.video_kbps, 6000);
    assert.equal(plan.audio_kbps, 128);
    assert.equal(plan.limit_fps, false);
    assert.ok(plan.expected_bytes < DEFAULT_TARGET.max_bytes);
  });

  it("3 minuty: budżet z długości filmu, nadal 1080p", () => {
    const plan = planEncode(
      summarizeProbe(probe({ format: { duration: "180", size: String(400 * MB) } })),
      DEFAULT_TARGET,
    );
    assert.equal(plan.width, 1080);
    assert.ok(plan.video_kbps < 6000 && plan.video_kbps >= 2200, `bitrate ${plan.video_kbps}`);
    assert.ok(plan.expected_bytes <= DEFAULT_TARGET.max_bytes);
  });

  it("5 minut: schodzi do 720p, żeby nie rozmazać obrazu", () => {
    const plan = planEncode(
      summarizeProbe(probe({ format: { duration: "300", size: String(500 * MB) } })),
      DEFAULT_TARGET,
    );
    assert.equal(plan.scale, true);
    assert.equal(plan.width, 720);
    assert.equal(plan.height, 1280);
    assert.ok(plan.video_kbps >= 1100);
    assert.ok(plan.expected_bytes <= DEFAULT_TARGET.max_bytes);
  });

  it("10 minut: kolejny szczebel (540p), rozmiar nadal w limicie", () => {
    const plan = planEncode(
      summarizeProbe(probe({ format: { duration: "600", size: String(900 * MB) } })),
      DEFAULT_TARGET,
    );
    assert.equal(plan.width, 540);
    assert.equal(plan.height, 960);
    assert.ok(plan.video_kbps >= 600);
    assert.ok(plan.expected_bytes <= DEFAULT_TARGET.max_bytes);
  });

  it("60 kl./s ogranicza do 30", () => {
    const plan = planEncode(
      summarizeProbe(probe({ video: { avg_frame_rate: "60/1" } })),
      DEFAULT_TARGET,
    );
    assert.equal(plan.limit_fps, true);
    assert.equal(plan.fps, 30);
  });

  it("druga próba obniża bitrate proporcjonalnie do nadwyżki", () => {
    const summary = summarizeProbe(probe({ format: { duration: "180" } }));
    const first = planEncode(summary, DEFAULT_TARGET);
    const second = planEncode(summary, DEFAULT_TARGET, {
      bytes: 70 * MB,
      video_kbps: first.video_kbps,
    });
    assert.ok(second.video_kbps < first.video_kbps);
    assert.ok(second.video_kbps <= Math.floor(first.video_kbps * (60 / 70) * 0.9) + 1);
  });

  it("film bez audio nie rezerwuje bitrate na dźwięk", () => {
    const plan = planEncode(summarizeProbe(probe({ noAudio: true })), DEFAULT_TARGET);
    assert.equal(plan.has_audio, false);
    assert.equal(plan.audio_kbps, 0);
  });
});

describe("ffmpegTranscodeArgs", () => {
  it("składa pełny zestaw: mapowanie, skala, H.264 High 4.1, AAC, faststart", () => {
    const plan = planEncode(
      summarizeProbe(probe({ video: { width: 2160, height: 3840, avg_frame_rate: "60/1" } })),
      DEFAULT_TARGET,
    );
    const args = ffmpegTranscodeArgs(plan, { preset: "ultrafast" });
    const joined = args.join(" ");
    assert.match(joined, /-map 0:v:0 -map 0:a:0\? -sn -dn/);
    assert.match(joined, /-vf scale=1080:1920:flags=lanczos,format=yuv420p/);
    assert.match(joined, /-r 30/);
    assert.match(joined, /-c:v libx264 -preset ultrafast -profile:v high -level 4.1/);
    assert.match(joined, /-maxrate 6000k -bufsize 12000k/);
    assert.match(joined, /-c:a aac -b:a 128k -ac 2 -ar 48000/);
    assert.match(joined, /-movflags \+faststart out\.mp4$/);
  });

  it("bez audio daje -an; bez skalowania tylko format=yuv420p", () => {
    const plan = planEncode(
      summarizeProbe(probe({ noAudio: true, format: { size: String(100 * MB) } })),
      DEFAULT_TARGET,
    );
    const joined = ffmpegTranscodeArgs(plan).join(" ");
    assert.match(joined, / -an /);
    assert.match(joined, /-vf format=yuv420p/);
    assert.doesNotMatch(joined, /scale=/);
  });
});

describe("parseTarget", () => {
  it("uzupełnia braki domyślnymi i przycina absurdy", () => {
    const t = parseTarget({ max_bytes: 100 * MB, max_fps: 999, audio_kbps: "abc" });
    assert.equal(t.max_bytes, 100 * MB);
    assert.equal(t.max_fps, 60);
    assert.equal(t.audio_kbps, DEFAULT_TARGET.audio_kbps);
    assert.equal(t.max_long_edge, 1920);
  });
});
