import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/labels";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  analyzeLandingPerformance,
  applyOptimization,
  rejectOptimization,
} from "@/lib/ai-optimizer.functions";

export function MicroOptimizerDialog({
  landing,
  open,
  onClose,
}: {
  landing: { id: string; title: string };
  open: boolean;
  onClose: () => void;
}) {
  const analyze = useServerFn(analyzeLandingPerformance);
  const apply = useServerFn(applyOptimization);
  const reject = useServerFn(rejectOptimization);
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("ai_landing_optimizations")
      .select("*")
      .eq("landing_id", landing.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows(data ?? []);
  }

  useEffect(() => {
    if (open) load();
  }, [open, landing.id]);

  async function runAnalysis() {
    setLoading(true);
    try {
      const r = await analyze({ data: { landing_id: landing.id } });
      setStats(r.stats);
      toast.success(`Wygenerowano ${r.recommendations?.length ?? 0} rekomendacji`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onApply(id: string) {
    setBusyId(id);
    try {
      await apply({ data: { id } });
      toast.success("Zastosowano");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    setBusyId(id);
    try {
      await reject({ data: { id } });
      toast.success("Odrzucono");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" /> AI Micro-Optimizer
          </DialogTitle>
          <DialogDescription>{landing.title}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            AI analizuje wyświetlenia, scroll, kliknięcia i warianty, a potem proponuje konkretne
            zmiany.
          </p>
          <Button onClick={runAnalysis} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Analizuj z AI
          </Button>
        </div>

        {stats && (
          <div className="rounded-md border p-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Wyświetlenia" value={stats.total_views} />
            <Stat label="CR (kontrola)" value={`${(stats.control.cr * 100).toFixed(1)}%`} />
            <Stat label="Avg czas" value={`${stats.avg_time_seconds}s`} />
            <Stat label="Scroll 75%" value={`${(stats.scroll.pct_75 * 100).toFixed(0)}%`} />
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Do zaakceptowania ({pending.length})</h3>
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Brak nowych rekomendacji. Uruchom analizę.
            </p>
          )}
          {pending.map((r) => (
            <div key={r.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.kind}</Badge>
                    {r.expected_lift_pct != null && (
                      <Badge variant="secondary">
                        +{Number(r.expected_lift_pct).toFixed(1)}% CR
                      </Badge>
                    )}
                    <span className="font-medium text-sm">{r.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{r.rationale}</p>
                  <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                  {r.error_message && (
                    <p className="text-xs text-destructive mt-1">Błąd: {r.error_message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" onClick={() => onApply(r.id)} disabled={busyId === r.id}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Zastosuj
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onReject(r.id)}
                    disabled={busyId === r.id}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Odrzuć
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </section>

        {history.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Historia</h3>
            {history.map((r) => (
              <div
                key={r.id}
                className="rounded-md border p-2 text-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      r.status === "applied"
                        ? "default"
                        : r.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {r.status}
                  </Badge>
                  <span>{r.title}</span>
                </div>
                <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>
              </div>
            ))}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  );
}
