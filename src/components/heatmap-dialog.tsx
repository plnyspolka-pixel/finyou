import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

type EventRow = { event_type: string; meta: any };

export function HeatmapDialog({
  landing,
  open,
  onClose,
}: {
  landing: any;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("ai_landing_events")
      .select("event_type, meta")
      .eq("landing_id", landing.id)
      .then(({ data }) => {
        setRows((data as any) ?? []);
        setLoading(false);
      });
  }, [landing.id, open]);

  const views = rows.filter((r) => r.event_type === "view").length;
  const ctaClicks = rows.filter((r) => r.event_type === "cta_click").length;
  const scroll = (t: number) => rows.filter((r) => r.event_type === `scroll_${t}`).length;
  const scrollPct = (t: number) => (views > 0 ? (scroll(t) / views) * 100 : 0);

  const times = rows
    .filter((r) => r.event_type === "time_on_page")
    .map((r) => Number(r.meta?.seconds ?? 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const median = times.length > 0 ? times[Math.floor(times.length / 2)] : 0;
  const avg = times.length > 0 ? Math.round(times.reduce((s, n) => s + n, 0) / times.length) : 0;

  const clicks = rows.filter((r) => r.event_type === "click");
  const clickCounts = new Map<string, { count: number; sample: any }>();
  for (const c of clicks) {
    const m = c.meta || {};
    const key =
      [m.tag, m.id ? `#${m.id}` : "", m.text ? `"${String(m.text).slice(0, 40)}"` : ""]
        .filter(Boolean)
        .join(" ") || "?";
    const cur = clickCounts.get(key) ?? { count: 0, sample: m };
    cur.count++;
    clickCounts.set(key, cur);
  }
  const topClicks = Array.from(clickCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Heatmapy & Engagement — {landing.title}</DialogTitle>
          <DialogDescription>
            Agregaty dla całego landingu: scroll depth, CTR, czas na stronie i top-klikane elementy.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Ładowanie…</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Odsłony" value={views} />
              <Stat label="Klik CTA" value={ctaClicks} />
              <Stat
                label="CTR"
                value={`${views > 0 ? ((ctaClicks / views) * 100).toFixed(1) : "0"}%`}
              />
              <Stat label="Mediana czasu" value={`${median}s`} sub={`śr. ${avg}s`} />
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Scroll depth (% odsłon, które przewinęły do…)
              </h3>
              {[25, 50, 75, 100].map((t) => (
                <div key={t} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{t}%</span>
                    <span>
                      {scroll(t)} / {views} ({scrollPct(t).toFixed(0)}%)
                    </span>
                  </div>
                  <Progress value={scrollPct(t)} />
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Top klikane elementy</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Element</TableHead>
                    <TableHead>Klików</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topClicks.map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell className="font-mono text-xs">{k}</TableCell>
                      <TableCell>{v.count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]">
                        {v.sample?.href ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {topClicks.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-sm text-muted-foreground py-4"
                      >
                        Brak kliknięć
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
