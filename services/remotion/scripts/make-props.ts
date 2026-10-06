// Dane wejściowe kompozycji dla zadania Studia — tą samą logiką co ścieżka
// ASS w produkcji: nakładki odcinka serii / pytania z paczki, dopasowane do
// kwestii SRT (overlaysWithCueTiming), napisy pocięte presetem stylu.
//
//   bun scripts/make-props.ts --video <url> --srt <url> [--episode 1 | --question 12]
//       [--style reels] [--no-badge] [--out props.json]

import { parseArgs } from "node:util";
import {
  CUSTOM_CAPTION_STYLES,
  chunkCues,
  overlaysWithCueTiming,
  parseCaptionStyleId,
  parseSubtitles,
  type DynamicOverlays,
} from "../../../src/lib/caption-style";
import { fixBrandInCues } from "../../../src/lib/caption-brand";
import { buildEpisodeOverlays, findShortsEpisode } from "../../../src/lib/shorts-series";
import { buildShortsOverlays } from "../../../src/lib/shorts-script";
import { findShortsQuestion } from "../../../src/lib/shorts-question-bank";

const { values } = parseArgs({
  options: {
    video: { type: "string" },
    srt: { type: "string" },
    episode: { type: "string" },
    question: { type: "string" },
    style: { type: "string", default: "reels" },
    "no-badge": { type: "boolean", default: false },
    duration: { type: "string" },
    out: { type: "string", default: "props.json" },
  },
});
if (!values.video || !values.srt) {
  console.error("Wymagane: --video <url> --srt <url>");
  process.exit(1);
}

const srtRes = await fetch(values.srt);
if (!srtRes.ok) throw new Error(`SRT: HTTP ${srtRes.status}`);
const cues = fixBrandInCues(parseSubtitles(await srtRes.text()));

let base: DynamicOverlays = {};
if (values.episode) {
  const ep = findShortsEpisode(Number(values.episode));
  if (!ep) throw new Error(`Nie ma odcinka #S${values.episode}`);
  base = buildEpisodeOverlays(ep);
} else if (values.question) {
  const q = findShortsQuestion(Number(values.question));
  if (!q) throw new Error(`Nie ma pytania #${values.question}`);
  base = buildShortsOverlays(q);
}
const overlays = overlaysWithCueTiming(base, cues);

const style = CUSTOM_CAPTION_STYLES[parseCaptionStyleId(values.style)];
const captions = chunkCues(cues, { maxChars: style.maxChars, maxLines: style.maxLines });

const props = {
  videoUrl: values.video,
  durationSeconds: values.duration ? Number(values.duration) : null,
  overlays,
  captions,
  caption: {
    fontSize: style.fontSize,
    marginBottom: style.marginBottom,
    uppercase: style.uppercase,
  },
  aiBadge: !values["no-badge"],
};
await Bun.write(values.out!, JSON.stringify(props, null, 2));
console.log(
  `${values.out}: kwestie=${cues.length} napisy=${captions.length} karty=${overlays.cards?.length ?? 0}`,
);
