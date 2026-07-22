import {
  MessageCircle,
  Mail,
  Phone,
  ClipboardList,
  User,
  ScanText,
  Bot,
  HelpCircle,
  Facebook,
  PencilLine,
  DatabaseZap,
  type LucideIcon,
} from "lucide-react";
import { normalizeLeadSource, leadSourceLabel } from "@/lib/lead-source";

const ICONS: Record<string, { Icon: LucideIcon; cls: string }> = {
  messenger: { Icon: MessageCircle, cls: "text-sky-600" },
  meta_lead: { Icon: Facebook, cls: "text-blue-600" },
  email_inbound: { Icon: Mail, cls: "text-amber-600" },
  landing_wizard: { Icon: ClipboardList, cls: "text-emerald-600" },
  landing_single_page: { Icon: ClipboardList, cls: "text-emerald-600" },
  embed: { Icon: ClipboardList, cls: "text-emerald-600" },
  panel_klienta: { Icon: User, cls: "text-indigo-600" },
  scheduled: { Icon: Phone, cls: "text-violet-600" },
  inbound_enrichment: { Icon: Phone, cls: "text-violet-600" },
  ocr: { Icon: ScanText, cls: "text-fuchsia-600" },
  mcp: { Icon: Bot, cls: "text-slate-600" },
  manual: { Icon: PencilLine, cls: "text-rose-600" },
  ekw_auto: { Icon: DatabaseZap, cls: "text-fuchsia-600" },
  lead: { Icon: HelpCircle, cls: "text-muted-foreground" },
  unknown: { Icon: HelpCircle, cls: "text-muted-foreground" },
};

/**
 * Miniaturowa ikonka wskazująca kanał, którym dana informacja trafiła do
 * systemu (formularz, Messenger, telefon, e-mail, panel klienta…). Bazujemy na
 * `loan_applications.source` / `clients.source` — jedynych polach źródła, jakie
 * mamy w bazie. Wartość nieznana → subtelna ikonka „?" z pełną nazwą w tooltipie.
 */
export function SourceIcon({
  source,
  className = "",
  title,
}: {
  source: string | null | undefined;
  className?: string;
  title?: string;
}) {
  const key = normalizeLeadSource(source) ?? "unknown";
  const spec = ICONS[key] ?? ICONS.unknown;
  const label = title ?? `Źródło: ${leadSourceLabel(source)}`;
  const Icon = spec.Icon;
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex items-center ${spec.cls} ${className}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}
