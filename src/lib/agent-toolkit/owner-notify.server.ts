// SMS do właściciela (889 888 700) — tylko sprawy, których agent nie załatwi
// sam: płatne usługi albo ważne rzeczy wymagające człowieka. Z hamulcem:
//   • ta sama sprawa (klucz) najwyżej raz na 7 dni,
//   • najwyżej 2 SMS-y do właściciela na dobę,
//   • zbiorczo — jedna wiadomość z listą spraw, nie SMS na każdą prośbę.
// Wysyłka przez sendSmsInternal z kategorią „critical" (właściciel nie podlega
// limitom marketingowym ani stop-klatce automatów), ale z własnym limitem.
import { COMPANY_DATA } from "@/lib/company";
import { ownerDigestSms } from "./capabilities";
import { countAgentActions, hoursAgoIso, listAgentActions, logAgentAction } from "./store.server";

export interface OwnerItem {
  key: string;
  label: string;
  action: string;
  alternatives?: string[];
  importance?: number;
}

const MAX_SMS_PER_DAY = 2;
const SAME_KEY_COOLDOWN_H = 24 * 7;

export function ownerPhone(): string {
  return process.env.OWNER_ALERT_PHONE?.trim() || COMPANY_DATA.phoneContracts.e164;
}

export async function notifyOwner(
  items: OwnerItem[],
  opts: { dryRun?: boolean } = {},
): Promise<{ sent: boolean; reason?: string; body?: string; keys: string[] }> {
  if (items.length === 0) return { sent: false, reason: "brak spraw", keys: [] };

  const sentToday = await countAgentActions({
    module: "agent_owner",
    action: "sms",
    sinceIso: hoursAgoIso(24),
  });
  if (sentToday >= MAX_SMS_PER_DAY) {
    return { sent: false, reason: `limit ${MAX_SMS_PER_DAY} SMS/dobę do właściciela`, keys: [] };
  }

  const recent = await listAgentActions({
    module: "agent_owner",
    action: "sms",
    sinceIso: hoursAgoIso(SAME_KEY_COOLDOWN_H),
    limit: 50,
  });
  const recentKeys = new Set(recent.flatMap((r) => (r.payload?.keys as string[]) ?? []));
  const fresh = items
    .filter((i) => !recentKeys.has(i.key))
    .sort((a, b) => (b.importance ?? 1) - (a.importance ?? 1))
    .slice(0, 3);
  if (fresh.length === 0)
    return { sent: false, reason: "sprawy zgłoszone w ostatnich 7 dniach", keys: [] };

  const body = ownerDigestSms(fresh);
  const keys = fresh.map((f) => f.key);
  if (opts.dryRun) return { sent: false, reason: "dry_run", body, keys };

  const { sendSmsInternal } = await import("@/lib/voicebot.functions");
  const res = await sendSmsInternal({
    phone: ownerPhone(),
    body,
    source: "owner_alert",
    category: "critical",
    metadata: { owner_alert_keys: keys },
  });
  await logAgentAction({
    module: "agent_owner",
    action: "sms",
    status: res.ok ? "ok" : "error",
    summary: res.ok
      ? `SMS do właściciela: ${keys.join(", ")}`
      : `SMS nieudany: ${res.error ?? res.reason}`,
    payload: { keys, body, sid: res.sid ?? null, error: res.error ?? null },
  });
  return { sent: res.ok, reason: res.ok ? undefined : (res.error ?? res.reason), body, keys };
}
