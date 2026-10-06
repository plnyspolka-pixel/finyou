// Testy kontroli kadru. Uruchomienie: node --test services/caption-burner/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isFlatBand, parseSignalstats, sampleTimes, summarizeFrameCheck } from "./frame-check.mjs";

const flat = { ymin: 31, ymax: 32, umin: 140, umax: 140, vmin: 124, vmax: 125, yavg: 31 };
const busy = { ymin: 12, ymax: 210, umin: 100, umax: 160, vmin: 110, vmax: 150, yavg: 90 };

describe("sampleTimes", () => {
  it("rozkłada próbki w filmie z marginesem", () => {
    const t = sampleTimes(60, 4);
    assert.equal(t.length, 4);
    assert.equal(t[0], 0.5);
    assert.equal(t[3], 59.5);
  });
  it("nieznana długość = jedna próbka na początku", () => {
    assert.deepEqual(sampleTimes(NaN), [0]);
  });
});

describe("parseSignalstats", () => {
  it("czyta wartości z metadata=print", () => {
    const out = [
      "frame:0    pts:0       pts_time:0",
      "lavfi.signalstats.YMIN=31",
      "lavfi.signalstats.YMAX=32",
      "lavfi.signalstats.UMIN=140",
      "lavfi.signalstats.UMAX=140",
      "lavfi.signalstats.VMIN=124",
      "lavfi.signalstats.VMAX=125",
      "lavfi.signalstats.YAVG=31.4",
    ].join("\n");
    assert.deepEqual(parseSignalstats(out), { ...flat, yavg: 31.4 });
    assert.equal(parseSignalstats("nic"), null);
  });
});

describe("isFlatBand / summarizeFrameCheck", () => {
  it("jednolity pas to tło, obraz z fakturą — nie", () => {
    assert.equal(isFlatBand(flat), true);
    assert.equal(isFlatBand(busy), false);
    assert.equal(isFlatBand(null), false);
  });

  it("rolka HeyGen z poziomym awatarem w części ujęć", () => {
    const summary = summarizeFrameCheck([
      { t: 1, bands: { top: flat, bottom: flat, left: busy, right: busy } },
      { t: 10, bands: { top: busy, bottom: busy, left: busy, right: busy } },
      { t: 20, bands: { top: flat, bottom: flat, left: busy, right: busy } },
      { t: 30, bands: { top: busy, bottom: busy, left: busy, right: busy } },
    ]);
    assert.deepEqual(summary.letterbox_at, [1, 20]);
    assert.equal(summary.has_bars, true);
    assert.equal(summary.bars_ratio, 0.5);
    assert.equal(summary.verdict, "pasy w części ujęć");
  });

  it("pełny kadr i brak pomiaru", () => {
    const full = summarizeFrameCheck([{ t: 1, bands: { top: busy, bottom: flat } }]);
    assert.equal(full.has_bars, false);
    assert.equal(full.verdict, "pełny kadr we wszystkich próbkach");
    assert.equal(summarizeFrameCheck([{ t: 1, bands: { top: null } }]).verdict, "nie zmierzono");
  });
});
