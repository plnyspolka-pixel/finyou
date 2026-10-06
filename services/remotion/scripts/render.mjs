// Render rolki na Remotion Lambda z pliku props (scripts/make-props.ts).
// Funkcja i strona z deploy-output.json albo z env REMOTION_FUNCTION_NAME /
// REMOTION_SERVE_URL. Wypisuje URL gotowego MP4, czas i koszt renderu.
//
//   node scripts/render.mjs props.json

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRenderProgress, renderMediaOnLambda } from "@remotion/lambda/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const propsFile = process.argv[2] ?? "props.json";
const inputProps = JSON.parse(await readFile(path.resolve(propsFile), "utf8"));

let deployed = {};
try {
  deployed = JSON.parse(await readFile(path.join(root, "deploy-output.json"), "utf8"));
} catch {
  // brak pliku — bierzemy z env
}
const region = process.env.AWS_REGION || deployed.region || "eu-central-1";
const functionName = process.env.REMOTION_FUNCTION_NAME || deployed.functionName;
const serveUrl = process.env.REMOTION_SERVE_URL || deployed.serveUrl;
if (!functionName || !serveUrl) {
  console.error("Brak funkcji / strony — uruchom najpierw scripts/deploy.mjs.");
  process.exit(1);
}

const started = Date.now();
const { renderId, bucketName } = await renderMediaOnLambda({
  region,
  functionName,
  serveUrl,
  composition: "Reel",
  inputProps,
  codec: "h264",
  imageFormat: "jpeg",
  jpegQuality: 90,
  privacy: "public",
  maxRetries: 2,
  downloadBehavior: { type: "play-in-browser" },
});
console.log(`render ${renderId} (bucket ${bucketName})`);

for (;;) {
  await new Promise((r) => setTimeout(r, 2000));
  const p = await getRenderProgress({ renderId, bucketName, functionName, region });
  if (p.fatalErrorEncountered) {
    console.error("BŁĄD:", JSON.stringify(p.errors?.slice(0, 3), null, 2));
    process.exit(1);
  }
  if (p.done) {
    console.log(
      JSON.stringify(
        {
          outputFile: p.outputFile,
          seconds: Math.round((Date.now() - started) / 100) / 10,
          costUsd: p.costs?.accruedSoFar,
          lambdas: p.lambdasInvoked,
        },
        null,
        2,
      ),
    );
    break;
  }
  process.stdout.write(`\r${Math.round(p.overallProgress * 100)}%   `);
}
