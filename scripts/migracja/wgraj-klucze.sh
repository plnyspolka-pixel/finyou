#!/usr/bin/env bash
# Wgrywa uzupełnione pozycje z .sekrety/klucze-dostawcow.env do Workera Cloudflare `finyou`.
#   bash scripts/migracja/wgraj-klucze.sh [plik.env]
# Puste pozycje są pomijane. Wartości nie są wypisywane; plik JSON powstaje tymczasowo poza repo.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC="${1:-.sekrety/klucze-dostawcow.env}"
STATE="${STATE:-$HOME/.finyou-migracja}"
TMP="$STATE/klucze-do-wgrania.json"
[ -f "$SRC" ] || { echo "brak pliku $SRC"; exit 1; }
node -e '
const fs = require("fs");
const out = {};
for (const raw of fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 1) continue;
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if (/^".*"$/.test(v) || /^\x27.*\x27$/.test(v)) v = v.slice(1, -1);
  if (v) out[k] = v;
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
fs.chmodSync(process.argv[2], 0o600);
console.log(Object.keys(out).length + " do wgrania: " + Object.keys(out).join(", "));
' "$SRC" "$TMP"
if [ "$(node -e 'console.log(Object.keys(require(process.argv[1])).length)' "$TMP")" = 0 ]; then
  rm -f "$TMP"; echo "nic nie uzupełniono — wpisz wartości po znaku = i uruchom ponownie"; exit 0
fi
bash scripts/migracja/wrangler.sh secret bulk "$TMP" 2>&1 | tail -3
rm -f "$TMP"
echo "gotowe; aktualna lista sekretów Workera: bash scripts/migracja/wrangler.sh secret list"
