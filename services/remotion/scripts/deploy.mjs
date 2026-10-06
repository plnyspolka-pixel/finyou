// Wdrożenie Remotion Lambda na koncie AWS z env (AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY albo REMOTION_AWS_*; region z AWS_REGION, domyślnie
// Frankfurt). Idempotentne: istniejąca funkcja / bucket zostają, strona
// (bundle kompozycji) jest nadpisywana pod tą samą nazwą — URL się nie zmienia.
// Wymaga roli IAM `remotion-lambda-role` (polityka: `remotion lambda policies role`).
//
//   node scripts/deploy.mjs   →   deploy-output.json { region, functionName, bucketName, serveUrl }

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployFunction, deploySite, getOrCreateBucket } from "@remotion/lambda";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const region = process.env.AWS_REGION || process.env.REMOTION_AWS_REGION || "eu-central-1";

const fn = await deployFunction({
  region,
  // 40-sekundowa rolka liczy się w kilkadziesiąt sekund; zapas na zimny start.
  timeoutInSeconds: 240,
  memorySizeInMb: 2048,
  diskSizeInMb: 2048,
  createCloudWatchLogGroup: true,
  cloudWatchLogRetentionPeriodInDays: 14,
});
console.log(`funkcja: ${fn.functionName}${fn.alreadyExisted ? " (już była)" : " (nowa)"}`);

const { bucketName } = await getOrCreateBucket({ region });
console.log(`bucket: ${bucketName}`);

const site = await deploySite({
  entryPoint: path.join(root, "src/index.ts"),
  bucketName,
  region,
  siteName: "finyou-reels",
});
console.log(`strona: ${site.serveUrl}`);

const out = { region, functionName: fn.functionName, bucketName, serveUrl: site.serveUrl };
await writeFile(path.join(root, "deploy-output.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
