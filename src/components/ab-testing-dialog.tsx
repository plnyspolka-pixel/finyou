import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2, Plus } from "lucide-react";
import {
  createVariant,
  updateVariant,
  deleteVariant,
  generateVariantWithAI,
} from "@/lib/ai-ab-testing.functions";

type Variant = { id: string; label: string; weight: number; is_active: boolean; overrides: any };
type Stat = { variant_id: string | null; views: number; clicks: number; leads: number };

export function AbTestingDialog({
  landing,
  open,
  onClose,
}: {
  landing: any;
  open: boolean;
  onClose: () => void;
}) {
  const create = useServerFn(createVariant);
  const update = useServerFn(updateVariant);
  const del = useServerFn(deleteVariant);
  const aiGen = useServerFn(generateVariantWithAI);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [tick, setTick] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLabel, setAiLabel] = useState("Wariant B");
  const [aiAngle, setAiAngle] = useState("");
  const [aiWeight, setAiWeight] = useState(50);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: v }, { data: e }] = await Promise.all([
        supabase
          .from("ai_landing_variants")
          .select("*")
          .eq("landing_id", landing.id)
          .order("created_at"),
        supabase
          .from("ai_landing_events")
          .select("variant_id, event_type")
          .eq("landing_id", landing.id),
      ]);
      setVariants((v as any) ?? []);
      const agg = new Map<string, Stat>();
      const key = (id: string | null) => id ?? "__control__";
      for (const ev of e ?? []) {
        const k = key(ev.variant_id);
        if (!agg.has(k)) agg.set(k, { variant_id: ev.variant_id, views: 0, clicks: 0, leads: 0 });
        const s = agg.get(k)!;
        if (ev.event_type === "view") s.views++;
        else if (ev.event_type === "cta_click") s.clicks++;
        else if (ev.event_type === "lead") s.leads++;
      }
      setStats(Array.from(agg.values()));
    })();
  }, [landing.id, open, tick]);

  const reload = () => setTick((x) => x + 1);
  const statFor = (id: string | null) =>
    stats.find((s) => s.variant_id === id) ?? { variant_id: id, views: 0, clicks: 0, leads: 0 };
  const cr = (s: Stat) => (s.views > 0 ? `${((s.clicks / s.views) * 100).toFixed(1)}%` : "—");

  const runAi = async () => {
    if (!aiAngle.trim()) return toast.error("Podaj kąt komunikacji");
    setAiLoading(true);
    try {
      await aiGen({
        data: { landing_id: landing.id, label: aiLabel, angle: aiAngle, weight: aiWeight },
      });
      toast.success("AI wygenerowało wariant");
      setAiAngle("");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const addBlank = async () => {
    await create({
      data: {
        landing_id: landing.id,
        label: `Wariant ${String.fromCharCode(66 + variants.length)}`,
        weight: 50,
        overrides: {},
      },
    });
    reload();
  };

  const control = statFor(null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>A/B testy — {landing.title}</DialogTitle>
          <DialogDescription>
            Ruch jest dzielony proporcjonalnie do wagi wariantów. Wariant „kontrola" (oryginał)
            dostaje pozostały ruch, gdy suma wag &lt; 100.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="font-semibold text-sm">Wyniki</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wariant</TableHead>
                <TableHead>Waga</TableHead>
                <TableHead>Aktywny</TableHead>
                <TableHead>Odsłony</TableHead>
                <TableHead>Klik CTA</TableHead>
                <TableHead>CR</TableHead>
                <TableHead>Leady</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Badge variant="outline">Kontrola</Badge>{" "}
                  <span className="ml-2 text-xs text-muted-foreground">oryginał</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">reszta</TableCell>
                <TableCell>—</TableCell>
                <TableCell>{control.views}</TableCell>
                <TableCell>{control.clicks}</TableCell>
                <TableCell className="font-medium">{cr(control)}</TableCell>
                <TableCell>{control.leads}</TableCell>
                <TableCell></TableCell>
              </TableRow>
              {variants.map((v) => {
                const s = statFor(v.id);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.label}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="h-7 w-16"
                        defaultValue={v.weight}
                        onBlur={async (e) => {
                          const w = Math.max(0, Math.min(100, Number(e.target.value)));
                          await update({ data: { id: v.id, weight: w } });
                          reload();
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={v.is_active}
                        onChange={async (e) => {
                          await update({ data: { id: v.id, is_active: e.target.checked } });
                          reload();
                        }}
                      />
                    </TableCell>
                    <TableCell>{s.views}</TableCell>
                    <TableCell>{s.clicks}</TableCell>
                    <TableCell className="font-medium">{cr(s)}</TableCell>
                    <TableCell>{s.leads}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Usunąć wariant?")) return;
                          await del({ data: { id: v.id } });
                          reload();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {variants.length > 0 && (
            <div className="text-xs text-muted-foreground rounded border bg-muted/40 p-3 space-y-1">
              {variants.map((v) => {
                const s = statFor(v.id);
                const cBase = control.views > 0 ? control.clicks / control.views : 0;
                const cVar = s.views > 0 ? s.clicks / s.views : 0;
                const lift = cBase > 0 ? ((cVar - cBase) / cBase) * 100 : 0;
                return (
                  <div key={v.id}>
                    <strong>{v.label}</strong> vs. kontrola:{" "}
                    {cBase > 0
                      ? `${lift >= 0 ? "+" : ""}${lift.toFixed(1)}% CR`
                      : "brak danych kontroli"}{" "}
                    <span className="opacity-60">
                      (n_var={s.views}, n_ctrl={control.views})
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Wygeneruj wariant AI</h3>
            <Button size="sm" variant="outline" onClick={addBlank}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Pusty wariant
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Etykieta</Label>
              <Input value={aiLabel} onChange={(e) => setAiLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Waga (0-100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={aiWeight}
                onChange={(e) => setAiWeight(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kąt komunikacji do testu</Label>
            <Textarea
              rows={3}
              value={aiAngle}
              onChange={(e) => setAiAngle(e.target.value)}
              placeholder='Np. "Postaw na pilność i szybkość — decyzja w 24h, zero formalności" lub "Skup się na zaufaniu i bezpieczeństwie".'
            />
          </div>
          <Button onClick={runAi} disabled={aiLoading || !aiAngle.trim()}>
            {aiLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Wygeneruj wariant
          </Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}
