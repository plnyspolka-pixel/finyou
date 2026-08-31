// Auto-dystrybucja — kolejka propozycji wysyłek do instytucji (zatwierdź /
// odrzuć), kryteria kwotowe per instytucja i ustawienia globalne silnika.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  listAutoDistributionQueue,
  decideAutoDistribution,
  listDistributionCriteria,
  upsertDistributionCriteria,
  getAutoDistributionSettings,
  updateAutoDistributionSettings,
  runAutoDistributionSync,
} from "@/lib/auto-distribution/auto-distribution.functions";

export const Route = createFileRoute("/admin/auto-dystrybucja")({
  component: AutoDystrybucjaPage,
});

function fmtPln(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(Number(v));
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  proposed: { label: "Do zatwierdzenia", variant: "default" },
  approved_sent: { label: "Wysłane", variant: "secondary" },
  rejected: { label: "Odrzucone", variant: "outline" },
  failed: { label: "Błąd wysyłki", variant: "destructive" },
  stale: { label: "Nieaktualne", variant: "outline" },
};

function AutoDystrybucjaPage() {
  const qc = useQueryClient();
  const fetchQueue = useServerFn(listAutoDistributionQueue);
  const decide = useServerFn(decideAutoDistribution);
  const fetchCriteria = useServerFn(listDistributionCriteria);
  const saveCriteria = useServerFn(upsertDistributionCriteria);
  const fetchSettings = useServerFn(getAutoDistributionSettings);
  const saveSettings = useServerFn(updateAutoDistributionSettings);
  const runSync = useServerFn(runAutoDistributionSync);

  const { data: queue } = useQuery({ queryKey: ["auto-dist-queue"], queryFn: () => fetchQueue() });
  const { data: criteria } = useQuery({
    queryKey: ["auto-dist-criteria"],
    queryFn: () => fetchCriteria(),
  });
  const { data: settings } = useQuery({
    queryKey: ["auto-dist-settings"],
    queryFn: () => fetchSettings(),
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const onDecide = async (proposalId: string, decision: "approve" | "reject") => {
    setBusyId(proposalId);
    try {
      const res: any = await decide({ data: { proposalId, decision } });
      if (res?.ok === false) {
        toast.error(res.error ?? "Nie udało się wykonać operacji");
      } else if (decision === "approve") {
        toast.success(
          res?.sent?.length
            ? `Wysłano do: ${res.sent.join(", ")}`
            : "Zatwierdzono (brak nowych odbiorców — wszyscy już mieli ten temat)",
        );
      } else {
        toast.success("Propozycja odrzucona");
      }
      void qc.invalidateQueries({ queryKey: ["auto-dist-queue"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd");
    } finally {
      setBusyId(null);
    }
  };

  const onRunSync = async () => {
    setSyncing(true);
    try {
      const res: any = await runSync();
      if (res?.disabled) toast.info("Silnik auto-dystrybucji jest wyłączony w ustawieniach");
      else
        toast.success(
          `Przejrzano ${res.scanned} wniosków, kwalifikuje się ${res.eligible}, nowych propozycji: ${res.proposed}`,
        );
      void qc.invalidateQueries({ queryKey: ["auto-dist-queue"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd");
    } finally {
      setSyncing(false);
    }
  };

  const proposals = (queue ?? []).filter((p: any) => p.status === "proposed");
  const decided = (queue ?? []).filter((p: any) => p.status !== "proposed");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Auto-dystrybucja</h1>
          <p className="text-sm text-muted-foreground">
            Kompletne wnioski z sensowną lokalizacją są automatycznie dopasowywane do instytucji wg
            ich kryteriów. Wysyłka rusza dopiero po Twoim zatwierdzeniu.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRunSync} disabled={syncing}>
          {syncing ? "Przeglądam wnioski…" : "Przejrzyj wnioski teraz"}
        </Button>
      </div>

      {/* Kolejka do zatwierdzenia */}
      <Card>
        <CardHeader>
          <CardTitle>Do zatwierdzenia ({proposals.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Brak oczekujących propozycji. Silnik przegląda wnioski co 30 minut.
            </p>
          )}
          {proposals.map((p: any) => (
            <ProposalRow
              key={p.id}
              proposal={p}
              busy={busyId === p.id}
              onApprove={() => onDecide(p.id, "approve")}
              onReject={() => onDecide(p.id, "reject")}
            />
          ))}
        </CardContent>
      </Card>

      {/* Kryteria instytucji */}
      <Card>
        <CardHeader>
          <CardTitle>Kryteria instytucji</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Widełki kwotowe i zawieszenia. Instytucja bez kryteriów dostaje wszystkie kompletne
            wnioski.
          </p>
          {(criteria ?? []).map((row: any) => (
            <CriteriaRow
              key={row.investor_id}
              row={row}
              onSave={async (patch) => {
                try {
                  await saveCriteria({ data: { investorId: row.investor_id, ...patch } });
                  toast.success(`Zapisano kryteria: ${row.name}`);
                  void qc.invalidateQueries({ queryKey: ["auto-dist-criteria"] });
                } catch (e: any) {
                  toast.error(e?.message ?? "Błąd zapisu");
                }
              }}
            />
          ))}
        </CardContent>
      </Card>

      {/* Ustawienia silnika */}
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle>Ustawienia silnika</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm
              settings={settings}
              onSave={async (next) => {
                try {
                  await saveSettings({ data: next });
                  toast.success("Ustawienia zapisane");
                  void qc.invalidateQueries({ queryKey: ["auto-dist-settings"] });
                } catch (e: any) {
                  toast.error(e?.message ?? "Błąd zapisu");
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Historia decyzji */}
      <Card>
        <CardHeader>
          <CardTitle>Historia ({decided.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {decided.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak rozstrzygniętych propozycji.</p>
          )}
          {decided.map((p: any) => {
            const badge = STATUS_BADGE[p.status] ?? { label: p.status, variant: "outline" as const };
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                <Badge variant={badge.variant}>{badge.label}</Badge>
                <span className="font-medium">{loanLabel(p)}</span>
                <span className="text-muted-foreground">{fmtPln(p.eligibility?.loan_amount)}</span>
                {p.sent_result?.sent?.length > 0 && (
                  <span className="text-muted-foreground">→ {p.sent_result.sent.join(", ")}</span>
                )}
                {p.error && <span className="text-destructive">{p.error}</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {p.decided_at ? new Date(p.decided_at).toLocaleString("pl-PL") : ""}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function loanLabel(p: any): string {
  const c = p.loan?.client;
  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null;
  const prop = Array.isArray(p.loan?.properties) ? p.loan.properties[0] : p.loan?.properties;
  return [name || "Wniosek", prop?.city, prop?.land_register_number]
    .filter(Boolean)
    .join(" · ");
}

function ProposalRow({
  proposal,
  busy,
  onApprove,
  onReject,
}: {
  proposal: any;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const score = proposal.eligibility?.location_score;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{loanLabel(proposal)}</span>
        <Badge variant="secondary">{fmtPln(proposal.eligibility?.loan_amount)}</Badge>
        <Badge variant="outline">
          Lokalizacja: {score == null ? "brak danych (neutralnie)" : `${Math.round(score)}/100`}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(proposal.proposed_at).toLocaleString("pl-PL")}
        </span>
      </div>
      <div className="text-sm text-muted-foreground">
        Trafi do {proposal.matches.length}{" "}
        {proposal.matches.length === 1 ? "instytucji" : "instytucji"}:{" "}
        {proposal.matches.map((m: any) => `${m.name} (${m.reason})`).join("; ")}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onApprove} disabled={busy}>
          {busy ? "Wysyłam…" : "Zatwierdź i wyślij"}
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
          Odrzuć
        </Button>
      </div>
    </div>
  );
}

function CriteriaRow({
  row,
  onSave,
}: {
  row: any;
  onSave: (patch: {
    minAmount: number | null;
    maxAmount: number | null;
    autoSendEnabled: boolean;
    acceptingApplications: boolean;
    notes: string | null;
  }) => Promise<void>;
}) {
  const c = row.criteria;
  const [min, setMin] = useState<string>(c?.min_amount != null ? String(c.min_amount) : "");
  const [max, setMax] = useState<string>(c?.max_amount != null ? String(c.max_amount) : "");
  const [autoSend, setAutoSend] = useState<boolean>(c?.auto_send_enabled ?? true);
  const [accepting, setAccepting] = useState<boolean>(c?.accepting_applications ?? true);
  const [notes, setNotes] = useState<string>(c?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const parseAmount = (v: string): number | null => {
    const t = v.replace(/\s/g, "").replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <div className="grid items-center gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto_auto_auto] sm:gap-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{row.name}</div>
        <div className="truncate text-xs text-muted-foreground">{row.email}</div>
      </div>
      <Input
        placeholder="Kwota od (zł)"
        inputMode="numeric"
        value={min}
        onChange={(e) => setMin(e.target.value)}
      />
      <Input
        placeholder="Kwota do (zł)"
        inputMode="numeric"
        value={max}
        onChange={(e) => setMax(e.target.value)}
      />
      <label className="flex items-center gap-1.5 text-xs">
        <Switch checked={accepting} onCheckedChange={setAccepting} />
        Przyjmuje
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        <Switch checked={autoSend} onCheckedChange={setAutoSend} />
        Automat
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await onSave({
            minAmount: parseAmount(min),
            maxAmount: parseAmount(max),
            autoSendEnabled: autoSend,
            acceptingApplications: accepting,
            notes: notes.trim() || null,
          });
          setSaving(false);
        }}
      >
        Zapisz
      </Button>
      <Input
        className="sm:col-span-6"
        placeholder="Notatka (np. promocja, powód zawieszenia)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </div>
  );
}

function SettingsForm({
  settings,
  onSave,
}: {
  settings: { enabled: boolean; min_location_score: number; daily_send_limit: number };
  onSave: (v: { enabled: boolean; minLocationScore: number; dailySendLimit: number }) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [minScore, setMinScore] = useState(String(settings.min_location_score));
  const [limit, setLimit] = useState(String(settings.daily_send_limit));
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        Silnik włączony
      </label>
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Min. potencjał lokalizacji (0–100)</div>
        <Input className="w-32" inputMode="numeric" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
      </div>
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Limit wysyłek / dobę</div>
        <Input className="w-32" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await onSave({
            enabled,
            minLocationScore: Number(minScore) || 40,
            dailySendLimit: Number(limit) || 20,
          });
          setSaving(false);
        }}
      >
        Zapisz ustawienia
      </Button>
    </div>
  );
}
