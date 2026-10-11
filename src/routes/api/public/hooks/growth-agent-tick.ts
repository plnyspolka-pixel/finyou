// Ręczne / zewnętrzne uruchomienie agenta wzrostu (ten sam przebieg, który
// cron Studia publikacji woła co 10 minut). `?force=create,engage,improve`
// wymusza fazy niezależnie od harmonogramu; `?dry=1` liczy plan i treść bez
// zapisów i publikacji.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";
import { runGrowthTick, type GrowthPhase } from "@/lib/growth-agent/tick.server";

const PHASES: GrowthPhase[] = ["publish", "measure", "warm", "create", "engage", "improve"];

async function run(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = (url.searchParams.get("force") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is GrowthPhase => (PHASES as string[]).includes(s));
  try {
    const result = await runGrowthTick({ force, dryRun: url.searchParams.get("dry") === "1" });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/hooks/growth-agent-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => requireCronSecret(request) ?? run(request),
      GET: async ({ request }) => requireCronSecret(request) ?? run(request),
    },
  },
});
