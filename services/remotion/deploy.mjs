// Wdraża Remotion Lambda: funkcję renderującą, bucket i stronę (bundle
// kompozycji) w S3, a potem gateway (gateway.mjs) z adresem Function URL,
// przez który backend Finance You zleca rendery. Idempotentne — ponowne
// uruchomienie aktualizuje stronę i kod gatewaya, używa istniejącej funkcji
// i zachowuje sekret gatewaya.
//
// Zmienne (opcjonalne): REMOTION_REGION (eu-central-1), REMOTION_SITE_NAME
// (finyou), REMOTION_GATEWAY_NAME (finyou-remotion-gateway),
// REMOTION_GATEWAY_SECRET (gdy brak: istniejący z funkcji albo losowy),
// REMOTION_CONCURRENCY (8).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  GetFunctionCommand,
  GetFunctionUrlConfigCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionActiveV2,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";
import { deployFunction, deploySite, getOrCreateBucket } from "@remotion/lambda";

const region = process.env.REMOTION_REGION ?? "eu-central-1";
const siteName = process.env.REMOTION_SITE_NAME ?? "finyou";
const gatewayName = process.env.REMOTION_GATEWAY_NAME ?? "finyou-remotion-gateway";
const concurrency = process.env.REMOTION_CONCURRENCY ?? "8";

// ── 1. Funkcja renderująca + bucket + strona ────────────────────────────────

const { functionName, alreadyExisted } = await deployFunction({
  region,
  timeoutInSeconds: 240,
  memorySizeInMb: 2048,
  diskSizeInMb: 2048,
  createCloudWatchLogGroup: true,
  cloudWatchLogRetentionPeriodInDays: 14,
});
console.log(`Funkcja: ${functionName}${alreadyExisted ? " (istniała)" : " (nowa)"}`);

// Reguły wygasania w buckecie: render zlecony z `deleteAfter: "1-day"` znika
// sam, gdyby Worker nie zdążył go skasować po skopiowaniu.
const { bucketName } = await getOrCreateBucket({ region, enableFolderExpiry: true });
console.log(`Bucket: ${bucketName}`);

const { serveUrl } = await deploySite({
  entryPoint: path.resolve("src/index.ts"),
  bucketName,
  region,
  siteName,
});
console.log(`Serve URL: ${serveUrl}`);

// ── 2. Gateway (Function URL) ───────────────────────────────────────────────

const lambda = new LambdaClient({ region });

async function getFunction(name) {
  try {
    return await lambda.send(new GetFunctionCommand({ FunctionName: name }));
  } catch (e) {
    if (e?.name === "ResourceNotFoundException") return null;
    throw e;
  }
}

// Gateway chodzi na tej samej roli, co funkcja Remotion (ma lambda:Invoke
// i dostęp do bucketów remotionlambda-*), więc nie zakładamy nowej.
const renderFn = await getFunction(functionName);
const roleArn = renderFn?.Configuration?.Role;
if (!roleArn) throw new Error(`Nie można odczytać roli funkcji ${functionName}.`);

const existing = await getFunction(gatewayName);
const secret =
  (process.env.REMOTION_GATEWAY_SECRET ?? "").trim() ||
  existing?.Configuration?.Environment?.Variables?.GATEWAY_SECRET ||
  randomBytes(24).toString("hex");

function buildZip() {
  const zip = new AdmZip();
  zip.addFile("gateway.mjs", readFileSync(path.resolve("gateway.mjs")));
  zip.addFile("package.json", Buffer.from(JSON.stringify({ type: "module" })));
  // Klient Remotion jest jednym plikiem bez zależności — pakujemy cały pakiet.
  zip.addLocalFolder(
    path.resolve("node_modules/@remotion/lambda-client"),
    "node_modules/@remotion/lambda-client",
  );
  return zip.toBuffer();
}

const environment = {
  Variables: {
    GATEWAY_SECRET: secret,
    REMOTION_REGION: region,
    REMOTION_FUNCTION_NAME: functionName,
    REMOTION_SERVE_URL: serveUrl,
    REMOTION_BUCKET: bucketName,
    REMOTION_CONCURRENCY: String(concurrency),
    REMOTION_COMPOSITION: "StudioReel",
  },
};
const code = buildZip();
console.log(`Gateway: paczka ${(code.byteLength / 1024 / 1024).toFixed(1)} MB`);

if (existing) {
  await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: gatewayName, ZipFile: code }));
  await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: gatewayName });
  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: gatewayName,
      Runtime: "nodejs22.x",
      Handler: "gateway.handler",
      Role: roleArn,
      Timeout: 60,
      MemorySize: 512,
      Environment: environment,
    }),
  );
  await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: gatewayName });
  console.log(`Gateway: ${gatewayName} zaktualizowany`);
} else {
  await lambda.send(
    new CreateFunctionCommand({
      FunctionName: gatewayName,
      Runtime: "nodejs22.x",
      Handler: "gateway.handler",
      Role: roleArn,
      Timeout: 60,
      MemorySize: 512,
      Code: { ZipFile: code },
      Environment: environment,
      Description: "Finance You — zlecanie renderów rolek na Remotion Lambda",
    }),
  );
  await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: gatewayName });
  console.log(`Gateway: ${gatewayName} utworzony`);
}

let urlConfig;
try {
  urlConfig = await lambda.send(new GetFunctionUrlConfigCommand({ FunctionName: gatewayName }));
} catch (e) {
  if (e?.name !== "ResourceNotFoundException") throw e;
  // Publiczny adres; dostęp pilnuje Bearer w gateway.mjs (jak w caption-burner).
  urlConfig = await lambda.send(
    new CreateFunctionUrlConfigCommand({ FunctionName: gatewayName, AuthType: "NONE" }),
  );
  await lambda.send(
    new AddPermissionCommand({
      FunctionName: gatewayName,
      StatementId: "FunctionURLAllowPublicAccess",
      Action: "lambda:InvokeFunctionUrl",
      Principal: "*",
      FunctionUrlAuthType: "NONE",
    }),
  );
}

console.log("");
console.log("Sekrety do ustawienia w Finance You (Lovable → ustawienia → sekrety):");
console.log(`  REMOTION_RENDER_URL=${urlConfig.FunctionUrl.replace(/\/$/, "")}`);
console.log(`  REMOTION_RENDER_SECRET=${secret}`);
