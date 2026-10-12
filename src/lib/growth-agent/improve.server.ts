// Samodoskonalenie agenta wzrostu (raz w tygodniu albo po 3 nowych pomiarach):
//   1. refleksja — model czyta wyniki postów i zapisuje wnioski (playbook),
//      które trafiają do każdego kolejnego briefu,
//   2. pomysły na rozwój — darmowe i wykonalne kodem przyznajemy od razu
//      (źródło danych z dozwolonej domeny, eksperyment w playbooku), znane
//      płatne/ręczne idą do właściciela z darmowymi alternatywami
//      (capabilities.server.ts), reszta czeka jako propozycja w dzienniku,
//   3. kontrola faktów — stopa referencyjna NBP vs odsetki maksymalne w kodzie
//      (zmiana stóp = zmiana prawdy, którą agenci mówią klientom),
//   4. przegląd możliwości — czego brakuje do celu (np. kanałów).
import { maxCapitalRate } from "@/lib/contract-engine/fees";
import { getAgentState, logAgentAction, setAgentState } from "@/lib/agent-toolkit/store.server";
import { requestCapability } from "@/lib/agent-toolkit/capabilities.server";
import { capabilityInfo, resolveCapabilityKey } from "@/lib/agent-toolkit/capabilities";
import {
  REFLECTION_SYSTEM_PROMPT,
  buildReflectionUserPrompt,
  openingOf,
  type ReflectionRow,
} from "./brief";
import { growthLlmJson } from "./llm.server";
import { guardContent } from "./truth-guard";
import { expectedMaxFromRef, parseNbpRefRate } from "./nbp";
import { getPlaybook, listItems, savePlaybook, type GrowthItemPayload } from "./state.server";

const REFLECT_EVERY_DAYS = 7;
const REFLECT_AFTER_NEW_MEASURES = 3;

export interface NbpCheck {
  ok: boolean;
  refRate: number | null;
  validFrom: string | null;
  expectedMax: number | null;
  codeMax: number;
  note: string;
}

export async function checkNbpDrift(now = new Date()): Promise<NbpCheck> {
  const codeMax = maxCapitalRate(now);
  try {
    const res = await fetch("https://static.nbp.pl/dane/stopy/stopy_procentowe.xml", {
      headers: { "User-Agent": "FinanceYouGrowthAgent/1.0" },
    });
    if (!res.ok)
      return {
        ok: true,
        refRate: null,
        validFrom: null,
        expectedMax: null,
        codeMax,
        note: `NBP HTTP ${res.status} — pominięto`,
      };
    const parsed = parseNbpRefRate(await res.text());
    if (!parsed)
      return {
        ok: true,
        refRate: null,
        validFrom: null,
        expectedMax: null,
        codeMax,
        note: "Nie rozpoznano XML NBP — pominięto",
      };
    const expected = expectedMaxFromRef(parsed.ref);
    const ok =
      Math.abs(expected - codeMax) < 0.001 || new Date(parsed.from).getTime() > now.getTime();
    return {
      ok,
      refRate: parsed.ref,
      validFrom: parsed.from,
      expectedMax: expected,
      codeMax,
      note: ok
        ? "Zgodne z NBP"
        : `NBP: ref ${parsed.ref}% od ${parsed.from} → max ${expected}%, w kodzie ${codeMax}%`,
    };
  } catch (e) {
    return {
      ok: true,
      refRate: null,
      validFrom: null,
      expectedMax: null,
      codeMax,
      note: `NBP niedostępne: ${e instanceof Error ? e.message : e}`,
    };
  }
}

interface Idea {
  title?: string;
  description?: string;
  kind?: string;
  free?: boolean;
  url?: string;
}

async function handleIdeas(ideas: Idea[], dryRun: boolean): Promise<string[]> {
  const out: string[] = [];
  for (const idea of ideas.slice(0, 3)) {
    const description = `${idea.title ?? ""}: ${idea.description ?? ""}`.trim().slice(0, 400);
    if (!description || description === ":") continue;
    if (idea.kind === "data_source" && idea.url) {
      const r = await requestCapability(
        { key: "public_data_source", description, url: idea.url },
        { requester: "growth_agent", dryRun },
      );
      out.push(`źródło ${idea.url}: ${r.decision}`);
      continue;
    }
    const key = resolveCapabilityKey({ description });
    if (key !== "other" && capabilityInfo(key)) {
      const r = await requestCapability(
        { key, description },
        { requester: "growth_agent", dryRun },
      );
      out.push(`${key}: ${r.decision}${r.ownerNotified ? " (SMS do właściciela)" : ""}`);
      continue;
    }
    // Pomysł spoza katalogu: propozycja w dzienniku (MCP: growth_agent_proposals),
    // bez SMS-a — właściciel dostaje je w raporcie, nie w telefonie.
    if (!dryRun) {
      await logAgentAction({
        module: "growth_agent",
        action: "proposal",
        summary: description.slice(0, 300),
        payload: { stage: "proposed", idea, free: idea.free ?? null },
      });
    }
    out.push(`propozycja: ${idea.title ?? description.slice(0, 60)}`);
  }
  return out;
}

export async function shouldReflect(now = new Date()): Promise<boolean> {
  const last = await getAgentState<string | null>("growth_last_reflection", null);
  const measuredSince = await listItems({
    stage: "measured",
    sinceIso: last ?? undefined,
    limit: 20,
  });
  if (!last) return measuredSince.length >= 1;
  const days = (now.getTime() - new Date(last).getTime()) / 86_400_000;
  return days >= REFLECT_EVERY_DAYS || measuredSince.length >= REFLECT_AFTER_NEW_MEASURES;
}

export async function reflect(opts: { now?: Date; dryRun?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const rows = await listItems({ stage: "measured", limit: 40 });
  const data: ReflectionRow[] = rows
    .map((r) => r.payload as unknown as GrowthItemPayload)
    .filter((p) => typeof p?.score === "number")
    .map((p) => ({
      format: p.format ?? "post",
      audience: p.plan.audience,
      pillar: p.plan.pillar,
      hook: p.plan.hook,
      slot: p.plan.slot,
      score: p.score as number,
      opening: p.reel?.title || openingOf(p.texts.facebook),
    }))
    .sort((a, b) => b.score - a.score);
  const current = await getPlaybook();
  const notes: string[] = [];
  let costPln = 0;

  if (data.length > 0) {
    const llm = await growthLlmJson<{ lessons?: string[]; ideas?: Idea[] }>({
      system: REFLECTION_SYSTEM_PROMPT,
      user: buildReflectionUserPrompt(data, current),
      temperature: 0.3,
    });
    costPln += llm.costPln;
    const lessons = (llm.data.lessons ?? [])
      .filter((l): l is string => typeof l === "string" && l.trim().length > 5)
      .map((l) => l.trim().slice(0, 220))
      // Wniosek nie może przemycić obietnicy ani liczby sprzecznej z faktami.
      .filter(
        (l) =>
          guardContent({ text: l, audience: "ogolny", platform: "comment_reply", date: now }).ok,
      )
      .slice(0, 8);
    if (lessons.length && !opts.dryRun) await savePlaybook(lessons);
    notes.push(`wnioski: ${lessons.length}`);
    notes.push(...(await handleIdeas(llm.data.ideas ?? [], Boolean(opts.dryRun))));
  } else {
    notes.push("brak zmierzonych postów — refleksja pominięta");
  }

  const nbp = await checkNbpDrift(now);
  notes.push(nbp.note);
  if (!nbp.ok) {
    const r = await requestCapability(
      {
        key: "max_interest_update",
        description: `Zmiana stóp NBP: ${nbp.note}. Trzeba dopisać nowy próg w MAX_INTEREST_TABLE (src/lib/contract-engine/fees.ts).`,
      },
      { requester: "growth_agent", dryRun: opts.dryRun },
    );
    notes.push(`odsetki maksymalne: ${r.decision}${r.ownerNotified ? " (SMS)" : ""}`);
  }

  if (!opts.dryRun) {
    await setAgentState(
      "growth_last_reflection",
      now.toISOString(),
      "ostatnia refleksja agenta wzrostu",
    );
    await logAgentAction({
      module: "growth_agent",
      action: "reflection",
      summary: notes.join(" | ").slice(0, 480),
      payload: { notes, nbp },
      costPln,
    });
  }
  return { costPln, notes, nbp };
}
