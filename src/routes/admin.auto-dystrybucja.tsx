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
import { listAnalysisPipelineRuns } from "@/lib/analysis-pipeline/analysis-pipeline.functions";
import {
  listCriteriaChangeProposals,
  decideCriteriaChange,
  listInstitutionQaThreads,
} from "@/lib/institution-mail-agent/institution-mail.functions";

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

      {/* Agent korespondencji: propozycje zmian kryteriów z maili */}
      <CriteriaProposalsCard />

      {/* Agent korespondencji: pytania instytucja ↔ klient */}
      <QaThreadsCard />

      {/* Pipeline analityczny — ostatnie przebiegi */}
      <PipelineRunsCard />

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

const PATCH_LABELS: Record<string, string> = {
  accepting_applications: "przyjmowanie wniosków",
  paused_until: "zawieszenie do",
  min_amount: "kwota od",
  max_amount: "kwota do",
};

function describePatch(patch: Record<string, unknown>): string {
  return Object.entries(patch ?? {})
    .map(([k, v]) => {
      const label = PATCH_LABELS[k] ?? k;
      if (typeof v === "boolean") return `${label}: ${v ? "TAK" : "NIE"}`;
      if (k === "paused_until" && typeof v === "string") return `${label} ${v.slice(0, 10)}`;
      return `${label}: ${v}`;
    })
    .join(" · ");
}

function CriteriaProposalsCard() {
  const qc = useQueryClient();
  const fetchProposals = useServerFn(listCriteriaChangeProposals);
  const decide = useServerFn(decideCriteriaChange);
  const { data: proposals } = useQuery({
    queryKey: ["criteria-change-proposals"],
    queryFn: () => fetchProposals(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const open = (proposals ?? []).filter((p: any) => p.status === "proposed");
  if (open.length === 0) return null;

  const onDecide = async (proposalId: string, decision: "apply" | "reject") => {
    setBusyId(proposalId);
    try {
      await decide({ data: { proposalId, decision } });
      toast.success(decision === "apply" ? "Kryteria zaktualizowane" : "Propozycja odrzucona");
      void qc.invalidateQueries({ queryKey: ["criteria-change-proposals"] });
      void qc.invalidateQueries({ queryKey: ["auto-dist-criteria"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zmiany kryteriów wykryte w mailach ({open.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Agent korespondencji wyłapał w mailach instytucji zmiany zasad przyjmowania wniosków.
          Zastosowanie aktualizuje kryteria auto-dystrybucji.
        </p>
        {open.map((p: any) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm">
            <span className="font-medium">{p.investor_name}</span>
            <span className="text-muted-foreground">{describePatch(p.proposed_patch)}</span>
            {p.summary && <span className="w-full text-xs text-muted-foreground">„{p.summary}"</span>}
            <div className="ml-auto flex gap-2">
              <Button size="sm" disabled={busyId === p.id} onClick={() => onDecide(p.id, "apply")}>
                Zastosuj
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === p.id}
                onClick={() => onDecide(p.id, "reject")}
              >
                Odrzuć
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const QA_STATUS_LABELS: Record<string, string> = {
  otwarte: "Czeka na odpowiedź klienta",
  przekazane: "Odpowiedź przekazana instytucjom",
  zamkniete: "Zamknięte",
};

function QaThreadsCard() {
  const fetchThreads = useServerFn(listInstitutionQaThreads);
  const { data: threads } = useQuery({
    queryKey: ["institution-qa-threads"],
    queryFn: () => fetchThreads(),
  });
  if (!threads?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pytania instytucji do klientów ({threads.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Agent scala pytania z maili instytucji, wysyła je klientowi jego kanałem (max raz na
          dobę) i odsyła odpowiedzi do wszystkich pytających.
        </p>
        {threads.map((t: any) => {
          const c = t.loan?.client;
          const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "Wniosek";
          const qs = (t.questions ?? []) as Array<{ text: string; from: string[] }>;
          return (
            <div key={t.id} className="space-y-1 rounded-md border p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={t.status === "otwarte" ? "default" : "secondary"}>
                  {QA_STATUS_LABELS[t.status] ?? t.status}
                </Badge>
                <span className="font-medium">{name}</span>
                {t.client_channel && (
                  <span className="text-xs text-muted-foreground">kanał: {t.client_channel}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleString("pl-PL")}
                </span>
              </div>
              <ul className="list-disc pl-5 text-muted-foreground">
                {qs.map((q, i) => (
                  <li key={i}>
                    {q.text}{" "}
                    <span className="text-xs">({(q.from ?? []).join(", ")})</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const STEP_LABELS: Record<string, string> = {
  kw: "Pobranie KW",
  coowners: "Właściciele",
  kw_analysis: "Analiza KW",
  risk: "Analiza ryzyka",
};

function PipelineRunsCard() {
  const fetchRuns = useServerFn(listAnalysisPipelineRuns);
  const { data: runs } = useQuery({
    queryKey: ["analysis-pipeline-runs"],
    queryFn: () => fetchRuns(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline analityczny — ostatnie przebiegi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Kompletne wnioski z potencjałem lokalizacji powyżej 50 automatycznie przechodzą: pobranie
          KW → właściciele → analiza KW → analiza ryzyka. Wyniki zasilają kartę oferty.
        </p>
        {(runs ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Brak przebiegów.</p>
        )}
        {(runs ?? []).map((r: any) => {
          const c = r.loan?.client;
          const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : r.kw_number;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
              <Badge
                variant={
                  r.status === "done" && !r.error
                    ? "secondary"
                    : r.status === "running"
                      ? "default"
                      : "destructive"
                }
              >
                {r.status === "done" ? (r.error ? "zakończony z błędami" : "gotowy") : r.status === "running" ? "w toku" : "błąd"}
              </Badge>
              <span className="font-medium">{name}</span>
              <span className="font-mono text-xs text-muted-foreground">{r.kw_number}</span>
              <span className="text-xs text-muted-foreground">
                {Object.entries(STEP_LABELS)
                  .map(([k, label]) => {
                    const st = r.steps?.[k]?.status ?? "pending";
                    const mark = st === "done" ? "✓" : st === "error" ? "✗" : "…";
                    return `${label} ${mark}`;
                  })
                  .join(" · ")}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(r.started_at).toLocaleString("pl-PL")}
              </span>
              {r.error && <span className="w-full text-xs text-destructive">{r.error}</span>}
            </div>
          );
        })}
      </CardContent>
    </Card>
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
