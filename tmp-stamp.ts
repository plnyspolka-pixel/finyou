import { Jimp } from "jimp";
const WORDMARK_URL =
  "https://financeyou.pl/__l5e/assets-v1/78c589be-8669-4bdf-a471-ff97875e8d7a/financeyou-wordmark.png";
const baseBuf = await Bun.file("/tmp/cover-base.jpg").bytes();
const markBuf = Buffer.from(await (await fetch(WORDMARK_URL)).arrayBuffer());
const base = await Jimp.read(Buffer.from(baseBuf));
const mark = await Jimp.read(markBuf);
const targetW = Math.round(base.bitmap.width * 0.22);
mark.resize({ w: targetW, h: Math.round(mark.bitmap.height * (targetW / mark.bitmap.width)) });
mark.opacity(0.95);
const pad = Math.round(base.bitmap.width * 0.025);
base.composite(
  mark,
  base.bitmap.width - mark.bitmap.width - pad,
  base.bitmap.height - mark.bitmap.height - pad,
);
const out = await base.getBuffer("image/jpeg", { quality: 90 });
await Bun.write("/tmp/cover-final.jpg", out);
console.log("ok", out.length, base.bitmap.width, "x", base.bitmap.height);
