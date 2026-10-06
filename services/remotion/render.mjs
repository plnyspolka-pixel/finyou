// Renderuje kompozycję na Lambdzie i czeka na wynik.
// Użycie: node render.mjs [compositionId] ['{"title":"..."}']
import {
  getFunctions,
  getRenderProgress,
  getSites,
  presignUrl,
  renderMediaOnLambda,
} from "@remotion/lambda/client";

const region = process.env.REMOTION_REGION ?? "eu-central-1";
const siteName = process.env.REMOTION_SITE_NAME ?? "finyou";
const composition = process.argv[2] ?? "HelloFinanceYou";
const inputProps = process.argv[3] ? JSON.parse(process.argv[3]) : {};

const [fn] = await getFunctions({ region, compatibleOnly: true });
if (!fn) throw new Error("Brak funkcji Remotion — uruchom najpierw `npm run lambda:deploy`.");
const { sites } = await getSites({ region });
const site = sites.find((s) => s.id === siteName);
if (!site) throw new Error(`Brak strony "${siteName}" — uruchom \`npm run lambda:deploy\`.`);

const { renderId, bucketName } = await renderMediaOnLambda({
  region,
  functionName: fn.functionName,
  serveUrl: site.serveUrl,
  composition,
  inputProps,
  codec: "h264",
  privacy: "private",
  framesPerLambda: 50,
});
console.log(`Render ${renderId} wystartował…`);

for (;;) {
  const p = await getRenderProgress({ renderId, bucketName, functionName: fn.functionName, region });
  if (p.fatalErrorEncountered) throw new Error(JSON.stringify(p.errors, null, 2));
  if (p.done) {
    console.log(`Gotowe: s3://${p.outBucket}/${p.outKey}`);
    const url = await presignUrl({ region, bucketName: p.outBucket, objectKey: p.outKey, expiresInSeconds: 3600 });
    console.log(`Link (1 h): ${url}`);
    console.log(`Koszt (szac.): ${p.costs.displayCost}`);
    break;
  }
  console.log(`Postęp: ${Math.round(p.overallProgress * 100)}%`);
  await new Promise((r) => setTimeout(r, 2000));
}
