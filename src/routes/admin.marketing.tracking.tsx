import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Link2, Plus, Copy, Trash2, BarChart3, Loader2, ExternalLink } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  listCampaigns,
  createCampaign,
  deleteCampaign,
  updateCampaign,
  getCampaignStats,
} from "@/lib/marketing-tracking.functions";

export const Route = createFileRoute("/admin/marketing/tracking")({
  component: TrackingPage,
});

function TrackingPage() {
  const list = useServerFn(listCampaigns);
  const remove = useServerFn(deleteCampaign);
  const toggle = useServerFn(updateCampaign);

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [statsFor, setStatsFor] = useState<any | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await list();
      setCampaigns(r.campaigns);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Tracking kampanii (UTM)</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Twórz krótkie linki z parametrami UTM i mierz kliknięcia oraz pozyskane leady.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nowa kampania
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Nowa kampania</DialogTitle>
            </DialogHeader>
            <NewCampaignForm
              onDone={() => {
                setOpen(false);
                void refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Kampanie" value={campaigns.length} />
        <StatCard label="Aktywne" value={campaigns.filter((c) => c.is_active).length} />
        <StatCard
          label="Suma kliknięć"
          value={campaigns.reduce((s, c) => s + (c.clicks || 0), 0)}
        />
        <StatCard label="Suma leadów" value={campaigns.reduce((s, c) => s + (c.leads || 0), 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista kampanii</CardTitle>
          <CardDescription>
            Krótki link działa pod <code>{baseUrl}/r/&lt;kod&gt;</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Brak kampanii. Utwórz pierwszą.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Krótki link</TableHead>
                  <TableHead>Źródło / Medium</TableHead>
                  <TableHead className="text-right">Kliknięcia</TableHead>
                  <TableHead className="text-right">Leady</TableHead>
                  <TableHead className="text-right">CR</TableHead>
                  <TableHead className="text-right">Koszt / CPL</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const shortLink = `${baseUrl}/r/${c.short_code}`;
                  const cr = c.clicks ? ((c.leads / c.clicks) * 100).toFixed(1) + "%" : "—";
                  const cpl =
                    c.leads && c.cost ? (Number(c.cost) / c.leads).toFixed(2) + " zł" : "—";
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-xs">
                          {c.target_url}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-xs">/r/{c.short_code}</code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              void navigator.clipboard.writeText(shortLink);
                              toast.success("Skopiowano");
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.utm_source || "—"} / {c.utm_medium || "—"}
                      </TableCell>
                      <TableCell className="text-right">{c.clicks || 0}</TableCell>
                      <TableCell className="text-right">{c.leads || 0}</TableCell>
                      <TableCell className="text-right">{cr}</TableCell>
                      <TableCell className="text-right text-xs">
                        {Number(c.cost || 0).toFixed(2)} zł
                        <div className="text-muted-foreground">{cpl}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Badge
                            variant={c.is_active ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={async () => {
                              await toggle({ data: { id: c.id, is_active: !c.is_active } });
                              void refresh();
                            }}
                          >
                            {c.is_active ? "Aktywna" : "Wył."}
                          </Badge>
                          <Button size="icon" variant="ghost" onClick={() => setStatsFor(c)}>
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <a href={shortLink} target="_blank" rel="noreferrer">
                            <Button size="icon" variant="ghost">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={async () => {
                              if (!confirm("Usunąć kampanię?")) return;
                              await remove({ data: { id: c.id } });
                              toast.success("Usunięto");
                              void refresh();
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!statsFor} onOpenChange={(o) => !o && setStatsFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Statystyki: {statsFor?.name}</DialogTitle>
          </DialogHeader>
          {statsFor && <CampaignStats id={statsFor.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function NewCampaignForm({ onDone }: { onDone: () => void }) {
  const create = useServerFn(createCampaign);
  const [form, setForm] = useState({
    name: "",
    target_url: "",
    utm_source: "facebook",
    utm_medium: "cpc",
    utm_campaign: "",
    utm_term: "",
    utm_content: "",
    cost: 0,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await create({
        data: {
          name: form.name,
          target_url: form.target_url,
          utm_source: form.utm_source || null,
          utm_medium: form.utm_medium || null,
          utm_campaign: form.utm_campaign || null,
          utm_term: form.utm_term || null,
          utm_content: form.utm_content || null,
          cost: Number(form.cost) || 0,
          notes: form.notes || null,
        },
      });
      toast.success("Kampania utworzona");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Nazwa kampanii *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="np. FB Wiosna 2026"
        />
      </div>
      <div>
        <Label>URL docelowy *</Label>
        <Input
          value={form.target_url}
          onChange={(e) => setForm({ ...form, target_url: e.target.value })}
          placeholder="https://app.financeyou.pl/wniosek"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>utm_source</Label>
          <Input
            value={form.utm_source}
            onChange={(e) => setForm({ ...form, utm_source: e.target.value })}
          />
        </div>
        <div>
          <Label>utm_medium</Label>
          <Input
            value={form.utm_medium}
            onChange={(e) => setForm({ ...form, utm_medium: e.target.value })}
          />
        </div>
        <div>
          <Label>utm_campaign</Label>
          <Input
            value={form.utm_campaign}
            onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })}
            placeholder="auto ze slug"
          />
        </div>
        <div>
          <Label>utm_term</Label>
          <Input
            value={form.utm_term}
            onChange={(e) => setForm({ ...form, utm_term: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <Label>utm_content</Label>
          <Input
            value={form.utm_content}
            onChange={(e) => setForm({ ...form, utm_content: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label>Koszt kampanii (zł)</Label>
        <Input
          type="number"
          value={form.cost}
          onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
        />
      </div>
      <div>
        <Label>Notatki</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
        />
      </div>
      <Button
        onClick={submit}
        disabled={saving || !form.name || !form.target_url}
        className="w-full"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Utwórz
      </Button>
    </div>
  );
}

function CampaignStats({ id }: { id: string }) {
  const stats = useServerFn(getCampaignStats);
  const [data, setData] = useState<any | null>(null);
  useEffect(() => {
    stats({ data: { id } })
      .then(setData)
      .catch((e) => toast.error(e.message));
  }, [id]);
  if (!data)
    return (
      <div className="grid place-items-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Kliknięcia (30 dni)" value={data.total_clicks} />
        <StatCard label="Leady (30 dni)" value={data.total_leads} />
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="clicks"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="leads"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
