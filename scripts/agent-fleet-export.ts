// Eksport konfiguracji floty agentów do JSON — do wdrożenia przez API
// ElevenLabs (ręcznie, przez MCP albo syncAgentFleet). Uruchom:
//   bun scripts/agent-fleet-export.ts <katalog> <secret_id> [tool_ids.json] [agent_ids.json]
// Bez plików z ID eksportuje same narzędzia; z nimi — także agenty.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  FLEET_AGENTS,
  FLEET_TOOLS,
  buildAgentConfig,
  buildWebhookToolConfig,
  elevenToolName,
  toolsForAgent,
} from "../src/lib/agent-fleet";

const [outDir = "fleet-export", secretId = "SECRET_ID", toolIdsPath, agentIdsPath] = process.argv.slice(2);
mkdirSync(join(outDir, "tools"), { recursive: true });
mkdirSync(join(outDir, "agents"), { recursive: true });

for (const spec of FLEET_TOOLS) {
  for (const key of spec.agentKeys) {
    const cfg = buildWebhookToolConfig(spec, key, { secretId });
    writeFileSync(join(outDir, "tools", `${elevenToolName(spec.tool, key)}.json`), JSON.stringify({ tool_config: cfg }, null, 2));
  }
}

if (toolIdsPath && existsSync(toolIdsPath)) {
  const toolIds = JSON.parse(readFileSync(toolIdsPath, "utf8")) as Record<string, string>;
  const agentIds = agentIdsPath && existsSync(agentIdsPath) ? JSON.parse(readFileSync(agentIdsPath, "utf8")) : {};
  for (const spec of FLEET_AGENTS) {
    const ids = toolsForAgent(spec).map((t) => toolIds[elevenToolName(t.tool, spec.agentKey)]).filter(Boolean);
    writeFileSync(join(outDir, "agents", `${spec.key}.json`), JSON.stringify(buildAgentConfig(spec, { toolIds: ids, agentIds }), null, 2));
  }
}
console.log("ok", outDir);
