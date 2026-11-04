# Windows: build Vite + wrangler deploy Workera finyou. Odpowiednik deploy.sh.
# Logowanie: token z ~/.finyou-migracja/env (przez wrangler.sh) albo sesja `npx wrangler login`.
#   powershell -ExecutionPolicy Bypass -File scripts/migracja/build-deploy.ps1 [-SkipBuild]
param([switch]$SkipBuild)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")
if (-not $SkipBuild) {
  $env:NODE_OPTIONS = "--max-old-space-size=8192"
  & node .\node_modules\vite\bin\vite.js build
  if ($LASTEXITCODE -ne 0) { Write-Output "BUILD FAILED ($LASTEXITCODE)"; exit 1 }
  Write-Output "BUILD_OK"
}
if (-not (Test-Path .output\server\index.mjs)) { Write-Output "brak paczki .output - najpierw build"; exit 1 }
& bash scripts/migracja/wrangler.sh deploy
Write-Output "DEPLOY EXIT $LASTEXITCODE"
