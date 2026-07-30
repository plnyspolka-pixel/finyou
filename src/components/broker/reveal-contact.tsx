import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Phone, Mail, MessageCircle, Eye } from "lucide-react";
import { logLeadReveal } from "@/lib/leads-admin.functions";
import { formatRelative } from "@/lib/labels";

type Field = "phone" | "email" | "messenger";
export type RevealEntry = { id: string; name?: string | null; count: number; lastAt: string };

const CFG = {
  phone: { Icon: Phone, label: "numer telefonu", href: (v: string) => `tel:${v}` },
  email: { Icon: Mail, label: "adres e-mail", href: (v: string) => `mailto:${v}` },
  messenger: { Icon: MessageCircle, label: "Messenger", href: (v: string) => v },
} as const;

export function RevealContact({
  leadId,
  field,
  value,
  onRevealed,
  onUse,
}: {
  leadId: string;
  field: Field;
  value: string | null | undefined;
  onRevealed?: () => void;
  onUse?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const fn = useServerFn(logLeadReveal);
  const m = useMutation({
    mutationFn: () => fn({ data: { leadId, field } }),
    onSuccess: () => onRevealed?.(),
  });
  if (!value) return null;
  const { Icon, label, href } = CFG[field];
  if (!shown) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShown(true);
          m.mutate();
        }}
        className="inline-flex items-center gap-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 text-white px-2 py-1 text-xs"
        title={`Odsłoń ${label}`}
      >
        <Eye className="h-3 w-3" /> Pokaż {label}
      </button>
    );
  }
  return (
    <a
      href={href(value)}
      onClick={(e) => {
        e.stopPropagation();
        onUse?.();
      }}
      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/25 border border-emerald-300/40 hover:bg-emerald-500/40 text-emerald-50 px-2 py-1 text-xs underline-offset-2 hover:underline max-w-full break-all"
    >
      <Icon className="h-3 w-3 shrink-0" /> <span className="break-all">{value}</span>
    </a>
  );
}

export function RevealsList({
  reveals,
}: {
  reveals?: { phone: RevealEntry[]; email: RevealEntry[]; messenger: RevealEntry[] };
}) {
  if (!reveals) return null;
  const groups = (
    [
      { field: "phone", items: reveals.phone ?? [] },
      { field: "email", items: reveals.email ?? [] },
      { field: "messenger", items: reveals.messenger ?? [] },
    ] as { field: Field; items: RevealEntry[] }[]
  ).filter((g) => g.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="text-[11px] mt-1 flex flex-wrap gap-1">
      {groups.map(({ field, items }) =>
        items.map((r) => {
          const { Icon } = CFG[field];
          return (
            <span
              key={`${field}-${r.id}`}
              className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-300/30 px-2 py-0.5"
              title={`Odsłonił: ${CFG[field].label}`}
            >
              <Eye className="h-3 w-3" />
              <Icon className="h-3 w-3" />
              {r.name ?? "Pośrednik"} · {r.count}× · {formatRelative(r.lastAt)}
            </span>
          );
        }),
      )}
    </div>
  );
}
