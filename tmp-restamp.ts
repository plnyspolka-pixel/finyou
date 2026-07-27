import { Jimp } from "jimp";
const WORDMARK_URL =
  "https://financeyou.pl/__l5e/assets-v1/f4352ffd-618d-446b-a632-fc3a5abb0bdd/financeyou-wordmark.png";
const baseBuf = Buffer.from(await Bun.file("/tmp/cover-base.jpg").bytes());
const markBuf = Buffer.from(await (await fetch(WORDMARK_URL)).arrayBuffer());
const base = await Jimp.read(baseBuf);
// Crop to 16:9 centered
const w = base.bitmap.width;
const targetH = Math.round((w * 9) / 16);
const yStart = Math.round((base.bitmap.height - targetH) / 2);
base.crop({ x: 0, y: yStart, w, h: targetH });
const mark = await Jimp.read(markBuf);
// Wordmark file is transparent — trim by alpha not by white
mark.autocrop({ cropOnlyFrames: false, cropSymmetric: false });
const targetW = Math.round(base.bitmap.width * 0.2);
mark.resize({ w: targetW, h: Math.round(mark.bitmap.height * (targetW / mark.bitmap.width)) });
mark.opacity(0.95);
const pad = Math.round(base.bitmap.width * 0.03);
base.composite(
  mark,
  base.bitmap.width - mark.bitmap.width - pad,
  base.bitmap.height - mark.bitmap.height - pad,
);
const out = await base.getBuffer("image/jpeg", { quality: 90 });
await Bun.write("/tmp/cover-final-v3.jpg", out);
console.log("ok", out.length, base.bitmap.width, "x", base.bitmap.height);
