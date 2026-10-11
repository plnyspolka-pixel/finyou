// Prośby agentów o nowe możliwości: klasyfikacja (capabilities.ts), zapis,
// automatyczne przyznanie darmowych rzeczy, a resztę — zbiorczy SMS do
// właściciela z darmowymi alternatywami.
import {
  capabilityInfo,
  classifyCapabilityRequest,
  type CapabilityRequest,
  type CapabilityVerdict,
} from "./capabilities";
import { notifyOwner, type OwnerItem } from "./owner-notify.server";
import { getAgentState, listAgentActions, logAgentAction, setAgentState } from "./store.server";

export interface DataSource {
  url: string;
  kind: "rss" | "json" | "xml";
  label: string;
  addedBy: string;
  addedAt: string;
}

/** Wbudowane, sprawdzone źródła (darmowe, publiczne). */
export const DEFAULT_DATA_SOURCES: DataSource[] = [
  {
    url: "https://static.nbp.pl/dane/stopy/stopy_procentowe.xml",
    kind: "xml",
    label: "NBP — stopy procentowe (kontrola odsetek maksymalnych)",
    addedBy: "system",
    addedAt: "2026-10-11",
  },
  {
    url: "https://www.bankier.pl/rss/wiadomosci.xml",
    kind: "rss",
    label: "Bankier.pl — wiadomości (inspiracje do treści informacyjnych)",
    addedBy: "system",
    addedAt: "2026-10-11",
  },
];

export async function listDataSources(): Promise<DataSource[]> {
  const extra = await getAgentState<DataSource[]>("data_sources", []);
  const seen = new Set<string>();
  return [...DEFAULT_DATA_SOURCES, ...extra].filter((s) =>
    seen.has(s.url) ? false : (seen.add(s.url), true),
  );
}

/** Możliwości dostępne „od ręki" w tym środowisku (wykrywane, nie zakładane). */
export function detectAvailableCapabilities(): Set<string> {
  const out = new Set<string>(["public_data_source", "knowledge_entry"]);
  if (process.env.LOVABLE_API_KEY) out.add("image_generation");
  if (
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.META_SYSTEM_USER_TOKEN ||
    process.env.META_ACCESS_TOKEN
  ) {
    out.add("comment_replies");
  }
  return out;
}

export async function requestCapability(
  req: CapabilityRequest,
  ctx: { requester: string; notify?: boolean; dryRun?: boolean },
): Promise<CapabilityVerdict & { requestId: string | null; ownerNotified: boolean }> {
  const available = detectAvailableCapabilities();
  // „already_available" tylko dla rzeczy, które są realnie gotowe; źródła
  // danych i wiedza wymagają konkretnego działania (dodania), więc przechodzą dalej.
  const verdict = classifyCapabilityRequest(
    req,
    new Set([...available].filter((k) => k !== "public_data_source" && k !== "knowledge_entry")),
  );

  if (
    verdict.decision === "auto_grant" &&
    verdict.key === "public_data_source" &&
    req.url &&
    !ctx.dryRun
  ) {
    const extra = await getAgentState<DataSource[]>("data_sources", []);
    if (!extra.some((s) => s.url === req.url)) {
      extra.push({
        url: req.url,
        kind: /\.json(\?|$)/i.test(req.url)
          ? "json"
          : /rss|feed|\.xml/i.test(req.url)
            ? "rss"
            : "xml",
        label: req.description.slice(0, 120),
        addedBy: ctx.requester,
        addedAt: new Date().toISOString(),
      });
      await setAgentState("data_sources", extra.slice(-40), `źródła danych: ${extra.length}`);
    }
  }

  const requestId = ctx.dryRun
    ? null
    : await logAgentAction({
        module: "agent_capabilities",
        action: verdict.key,
        status: verdict.decision === "rejected" ? "blocked" : "ok",
        summary: `${verdict.decision}: ${req.description.slice(0, 200)}`,
        payload: {
          stage: verdict.decision === "needs_owner" ? "pending_owner" : verdict.decision,
          request: req,
          verdict,
          requester: ctx.requester,
        },
      });

  let ownerNotified = false;
  if (verdict.notifyOwner && ctx.notify !== false) {
    const info = capabilityInfo(verdict.key);
    const res = await notifyOwner(
      [
        {
          key: verdict.key,
          label: info?.label ?? req.description.slice(0, 80),
          action: verdict.reason,
          alternatives: verdict.freeAlternatives,
          importance: info?.importance ?? 2,
        },
      ],
      { dryRun: ctx.dryRun },
    );
    ownerNotified = res.sent;
  }
  return { ...verdict, requestId, ownerNotified };
}

/** Sprawy czekające na właściciela — do raportu i dziennego SMS-a. */
export async function pendingOwnerItems(): Promise<OwnerItem[]> {
  const rows = await listAgentActions({
    module: "agent_capabilities",
    stage: "pending_owner",
    limit: 50,
  });
  const seen = new Set<string>();
  const items: OwnerItem[] = [];
  for (const r of rows) {
    const key = r.action;
    if (seen.has(key)) continue;
    seen.add(key);
    const info = capabilityInfo(key);
    const verdict = r.payload?.verdict as CapabilityVerdict | undefined;
    items.push({
      key,
      label: info?.label ?? String(r.payload?.request?.description ?? key).slice(0, 80),
      action: verdict?.reason ?? info?.ownerAction ?? "do decyzji",
      alternatives: verdict?.freeAlternatives ?? info?.freeAlternatives,
      importance: info?.importance ?? 2,
    });
  }
  return items;
}
