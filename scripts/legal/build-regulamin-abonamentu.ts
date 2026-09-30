/**
 * Zapisuje Regulamin Abonamentu Inwestora do dokumentacji (kopia do wglądu
 * prawnika; źródłem jest src/lib/legal/regulamin-abonamentu.ts).
 *
 *   npx tsx scripts/legal/build-regulamin-abonamentu.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REGULAMIN_ABONAMENTU_VERSION,
  regulaminAbonamentuInwestora,
} from "../../src/lib/legal/regulamin-abonamentu";

const out = join(process.cwd(), "docs", "legal", "inwestor", `${REGULAMIN_ABONAMENTU_VERSION}.md`);
writeFileSync(out, regulaminAbonamentuInwestora(), "utf8");
console.log(out);
