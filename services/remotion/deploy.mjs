// Wdraża Remotion Lambda: funkcję renderującą + stronę (bundle kompozycji) w S3.
// Idempotentne — ponowne uruchomienie aktualizuje stronę i używa istniejącej funkcji.
import path from "node:path";
import { deployFunction, deploySite, getOrCreateBucket } from "@remotion/lambda";

const region = process.env.REMOTION_REGION ?? "eu-central-1";
const siteName = process.env.REMOTION_SITE_NAME ?? "finyou";

const { functionName, alreadyExisted } = await deployFunction({
  region,
  timeoutInSeconds: 240,
  memorySizeInMb: 2048,
  diskSizeInMb: 2048,
  createCloudWatchLogGroup: true,
  cloudWatchLogRetentionPeriodInDays: 14,
});
console.log(`Funkcja: ${functionName}${alreadyExisted ? " (istniała)" : " (nowa)"}`);

const { bucketName } = await getOrCreateBucket({ region });
console.log(`Bucket: ${bucketName}`);

const { serveUrl } = await deploySite({
  entryPoint: path.resolve("src/index.ts"),
  bucketName,
  region,
  siteName,
});
console.log(`Serve URL: ${serveUrl}`);
