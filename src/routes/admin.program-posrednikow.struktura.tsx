import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network } from "lucide-react";
import {
  settlementTypeLabels,
  partnerStatusLabels,
  partnerStatusColors,
} from "@/lib/affiliate/labels";
import { adminGetTree } from "@/lib/affiliate/admin.functions";

export const Route = createFileRoute("/admin/program-posrednikow/struktura")({
  component: StrukturaPage,
});

function nodeName(n: any): string {
  return n.company_name || `${n.first_name ?? ""} ${n.last_name ?? ""}`.trim() || "—";
}

function StrukturaPage() {
  const fn = useServerFn(adminGetTree);
  const q = useQuery({ queryKey: ["admin-affiliate-tree"], queryFn: () => fn() });
  const nodes = (q.data as any[]) ?? [];

  const { roots, childrenBy } = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const childrenBy: Record<string, any[]> = {};
    const roots: any[] = [];
    for (const n of nodes) {
      const sponsor = n.sponsor_partner_id;
      if (sponsor && ids.has(sponsor)) {
        (childrenBy[sponsor] ??= []).push(n);
      } else {
        roots.push(n);
      }
    }
    return { roots, childrenBy };
  }, [nodes]);

  const maxDepth = useMemo(() => {
    let max = 0;
    const walk = (id: string, depth: number) => {
      max = Math.max(max, depth);
      for (const c of childrenBy[id] ?? []) walk(c.id, depth + 1);
    };
    for (const r of roots) walk(r.id, 1);
    return max;
  }, [roots, childrenBy]);

  const renderNode = (n: any, depth: number): React.ReactNode => {
    const kids = childrenBy[n.id] ?? [];
    return (
      <div key={n.id}>
        <div
          className="flex flex-wrap items-center gap-2 py-2 border-b"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          <Badge variant="outline" className="text-[10px]">
            P{depth}
          </Badge>
          <span className="font-medium">{nodeName(n)}</span>
          <span className="text-xs font-mono text-muted-foreground">{n.referral_code}</span>
          <span className="text-xs text-muted-foreground">
            · {settlementTypeLabels[n.settlement_type] ?? n.settlement_type}
          </span>
          <Badge className={partnerStatusColors[n.status] ?? "bg-slate-100"} variant="secondary">
            {partnerStatusLabels[n.status] ?? n.status}
          </Badge>
          {kids.length > 0 && (
            <span className="text-[11px] text-muted-foreground">({kids.length} podległych)</span>
          )}
        </div>
        {kids.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Network className="h-6 w-6" /> Struktura sieci
        </h1>
        <p className="text-sm text-muted-foreground">
          Pełna hierarchia partnerów programu pośredników (relacje sponsor → poleceni).
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Partnerzy: {nodes.length}</Badge>
        <Badge variant="outline">Korzenie: {roots.length}</Badge>
        <Badge variant="outline">Maks. głębokość: {maxDepth}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Drzewo partnerów</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-muted-foreground">Ładowanie…</p>
          ) : nodes.length === 0 ? (
            <p className="text-muted-foreground">Brak partnerów w strukturze.</p>
          ) : (
            <div className="text-sm">{roots.map((r) => renderNode(r, 1))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
