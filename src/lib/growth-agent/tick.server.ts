// Przebieg agenta wzrostu — wołany z crona Studia publikacji (co 10 min)
// i ręcznie przez MCP. Każda faza jest odporna na błąd pozostałych.
//
// Kolejność: publikacja wymagalnych → ROLKA (główny produkt: domknięcie
// renderu i publikacji, a gdy dzień nie ma rolki — nowa) → pomiar → ciepły
// start (raz) → post tekstowy (gdy brakuje na najbliższą dobę) → komentarze
// (co godzinę) → samodoskonalenie (co tydzień / po pomiarach).
//
// Hamulce: dzierżawa (dwa równoległe przebiegi nie tworzą dwóch postów),
// dzienny budżet PLN, wyłącznik w ustawieniach, tryb „draft" (szkice
// zamiast publikacji).
import { getAgentState, logAgentAction, setAgentState } from "@/lib/agent-toolkit/store.server";
import { createPost } from "./create.server";
import { advanceReels, createReel } from "./reel.server";
import { engageComments } from "./engage.server";
import { reflect, shouldReflect } from "./improve.server";
import { measurePublished, warmStart, warmStartReels } from "./observe.server";
import { publishDue } from "./publish.server";
import { getGrowthSettings, isReel, listItems, spentLast24h } from "./state.server";

const LEASE_MS = 8 * 60_000;
const ENGAGE_EVERY_MS = 60 * 60_000;
/** Tworzymy z wyprzedzeniem: post na najbliższą dobę powstaje wcześniej. */
const HORIZON_MS = 24 * 3600_000;

export type GrowthPhase = "publish" | "reel" | "measure" | "warm" | "create" | "engage" | "improve";

export interface TickResult {
  ok: boolean;
  skipped?: string;
  phases: Partial<Record<GrowthPhase, unknown>>;
  costPln: number;
  spent24h: number;
}

async function acquireLease(now: Date): Promise<boolean> {
  const lease = await getAgentState<{ until: string } | null>("growth_lease", null);
  if (lease && new Date(lease.until).getTime() > now.getTime()) return false;
  await setAgentState("growth_lease", { until: new Date(now.getTime() + LEASE_MS).toISOString() });
  return true;
}

async function releaseLease(): Promise<void> {
  await setAgentState("growth_lease", { until: new Date(0).toISOString() });
}

async function plannedWithinHorizon(now: Date): Promise<number> {
  const rows = await listItems({ stage: ["scheduled", "awaiting_approval"], limit: 50 });
  const limit = now.getTime() + HORIZON_MS;
  return rows.filter(
    (r) => !isReel(r.payload) && new Date(String(r.payload?.plan?.slotIso ?? 0)).getTime() <= limit,
  ).length;
}

async function createdLast24h(now: Date): Promise<number> {
  const rows = await listItems({
    sinceIso: new Date(now.getTime() - 24 * 3600_000).toISOString(),
    limit: 50,
  });
  return rows.filter((r) => r.payload?.stage !== "blocked" && !isReel(r.payload)).length;
}

export async function runGrowthTick(
  opts: { now?: Date; force?: GrowthPhase[]; dryRun?: boolean } = {},
): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const settings = await getGrowthSettings();
  const phases: TickResult["phases"] = {};
  let costPln = 0;
  if (!settings.enabled && !opts.force?.length) {
    return { ok: true, skipped: "agent wyłączony w ustawieniach", phases, costPln, spent24h: 0 };
  }
  if (!opts.dryRun && !(await acquireLease(now))) {
    return { ok: true, skipped: "inny przebieg w toku", phases, costPln, spent24h: 0 };
  }
  const forced = new Set(opts.force ?? []);
  const run = async <T>(phase: GrowthPhase, fn: () => Promise<T>) => {
    try {
      phases[phase] = await fn();
    } catch (e) {
      phases[phase] = { error: e instanceof Error ? e.message : String(e) };
    }
  };

  try {
    const spent = await spentLast24h();
    const budgetLeft = settings.dailyBudgetPln - spent;

    if (!opts.dryRun) await run("publish", () => publishDue(now));

    // Rolka — główny produkt. Najpierw domykamy rozpoczęte, potem (gdy dzień
    // nie ma jeszcze rolki) zlecamy nową. Budżet PLN dotyczy tu tylko modelu
    // od scenariusza — render rozlicza HeyGen, sprawdzany osobno.
    if (settings.reelsPerDay > 0 || forced.has("reel")) {
      await run("reel", async () => {
        const advanced = opts.dryRun ? [] : await advanceReels(settings, now);
        if (budgetLeft <= 0.05 && !forced.has("reel")) {
          const reason = "budżet dzienny wyczerpany";
          return advanced.length ? { advanced, create: { skipped: reason } } : { skipped: reason };
        }
        const r = await createReel({
          settings,
          now,
          dryRun: opts.dryRun,
          force: forced.has("reel"),
        });
        costPln += r.costPln;
        if (r.stage === "skipped") {
          // Nic nowego — bez wpisu w dzienniku co 10 minut.
          return advanced.length
            ? { advanced, create: { skipped: r.reason } }
            : { skipped: r.reason };
        }
        return {
          advanced,
          create: {
            itemId: r.itemId,
            stage: r.stage,
            slot: r.plan?.slotIso,
            title: r.draft?.title,
            platforms: r.platforms?.platforms,
            pominiete: r.platforms?.skipped,
            blocking: (r.violations ?? []).filter((v) => v.severity === "block").map((v) => v.code),
          },
        };
      });
    }
    if (!opts.dryRun) await run("measure", () => measurePublished(now));
    if (!opts.dryRun)
      await run("warm", async () => ({ posty: await warmStart(), rolki: await warmStartReels() }));

    const wantCreate =
      forced.has("create") ||
      (settings.postsPerDay > 0 &&
        (await plannedWithinHorizon(now)) === 0 &&
        (await createdLast24h(now)) < settings.postsPerDay);
    if (wantCreate) {
      if (budgetLeft <= 0.3 && !forced.has("create")) {
        phases.create = {
          skipped: `budżet dzienny wyczerpany (${spent} / ${settings.dailyBudgetPln} zł)`,
        };
      } else {
        await run("create", async () => {
          const r = await createPost({ settings, now, dryRun: opts.dryRun });
          costPln += r.costPln;
          return {
            itemId: r.itemId,
            stage: r.stage,
            plan: r.plan,
            costPln: r.costPln,
            blocking: r.violations.filter((v) => v.severity === "block").map((v) => v.code),
          };
        });
      }
    }

    const lastEngage = await getAgentState<string | null>("growth_last_engage", null);
    const engageDue =
      forced.has("engage") ||
      !lastEngage ||
      now.getTime() - new Date(lastEngage).getTime() >= ENGAGE_EVERY_MS;
    if (engageDue && budgetLeft > 0.3) {
      await run("engage", async () => {
        const r = await engageComments(settings, { now, dryRun: opts.dryRun });
        costPln += r.costPln;
        return r;
      });
      if (!opts.dryRun) await setAgentState("growth_last_engage", now.toISOString());
    }

    if (forced.has("improve") || (budgetLeft > 0.3 && (await shouldReflect(now)))) {
      await run("improve", async () => {
        const r = await reflect({ now, dryRun: opts.dryRun });
        costPln += r.costPln;
        return r.notes;
      });
    }

    const meaningful = (v: unknown) =>
      Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? !("skipped" in v) : Boolean(v);
    const logged: GrowthPhase[] = ["reel", "create", "engage", "improve"];
    if (!opts.dryRun && logged.some((k) => meaningful(phases[k]))) {
      await logAgentAction({
        module: "growth_agent",
        action: "run",
        summary: Object.keys(phases).join(", "),
        payload: { phases: JSON.parse(JSON.stringify(phases)) },
      });
    }
    return { ok: true, phases, costPln, spent24h: spent };
  } finally {
    if (!opts.dryRun) await releaseLease();
  }
}
