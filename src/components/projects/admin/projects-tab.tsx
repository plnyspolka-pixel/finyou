// Panel admina — zakładka „Projekty": zarządzanie pulą, zdjęcia (upload +
// zatwierdzanie), publikacja do puli, pauza/wycofanie, podgląd aktywnego
// przypisania. Zmiana istotnych parametrów tworzy nową wersję i unieważnia
// przypisania (obsługiwane po stronie serwera).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, ImageOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminListProjects,
  adminUpsertProject,
  adminSetProjectStatus,
  adminUploadProjectPhoto,
  adminApproveProjectPhoto,
  adminSignProjectFile,
} from "@/lib/projects/admin.functions";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type ProjectPropertyType,
} from "@/lib/projects/module-types";
import { formatPLN } from "@/lib/labels";
import { ProjectBadge, fmtDateTime } from "./shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const emptyProject = {
  amount: 0,
  propertyType: "mieszkanie",
  city: "",
  voivodeship: "",
  financingPurpose: "",
  periodMonths: 12,
  interestRatePercent: 12,
  propertyValue: 0,
  valuationSource: "",
  valuationDate: "",
  securityType: "",
  mortgagePosition: "",
  otherEncumbrances: "",
  borrowerBusinessForm: "",
  repaymentSource: "",
  repaymentType: "",
  docsComplete: false,
  docsCompletenessNote: "",
};

export function ProjectsTab() {
  const listFn = useServerFn(adminListProjects);
  const q = useQuery({ queryKey: ["admin-projects-list"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<Row | null | "new">(null);
  const projects = (q.data as { projects?: Row[] } | undefined)?.projects ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-2 h-4 w-4" /> Nowy projekt
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onEdit={() => setEditing(p)}
            onChanged={() => q.refetch()}
          />
        ))}
        {!q.isLoading && projects.length === 0 && (
          <p className="text-muted-foreground">Brak projektów w puli.</p>
        )}
      </div>

      {editing && (
        <ProjectEditDialog
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onChanged={() => q.refetch()}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onChanged,
}: {
  project: Row;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const statusFn = useServerFn(adminSetProjectStatus);
  const approveFn = useServerFn(adminApproveProjectPhoto);
  const signFn = useServerFn(adminSignProjectFile);
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const loadPhoto = async () => {
    if (!project.main_photo_path || photoUrl) return;
    try {
      const res = await signFn({ data: { path: project.main_photo_path } });
      setPhotoUrl(res.url);
    } catch {
      /* ignore */
    }
  };
  void loadPhoto();

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success("Zapisano.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operacja nie powiodła się.");
    } finally {
      setBusy(false);
    }
  };

  const canPublish = project.main_photo_path && project.photo_approved;

  return (
    <Card>
      <div className="relative h-36 w-full overflow-hidden rounded-t-xl bg-muted">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
        <div className="absolute right-2 top-2">
          <ProjectBadge status={project.status} />
        </div>
        {project.main_photo_path && project.photo_approved && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] text-white">
            <CheckCircle2 className="h-3 w-3" /> zdjęcie OK
          </div>
        )}
      </div>
      <CardContent className="space-y-2 pt-3">
        <div className="flex items-baseline justify-between">
          <div className="font-semibold">{formatPLN(Number(project.amount))}</div>
          <div className="text-xs text-muted-foreground">wersja {project.version}</div>
        </div>
        <div className="text-sm">
          {PROPERTY_TYPE_LABELS[project.property_type as ProjectPropertyType] ??
            project.property_type}{" "}
          · {project.city}
        </div>
        {project.rejection_count > 0 && (
          <div className="text-xs text-amber-600">
            Odrzucenia/wygaśnięcia: {project.rejection_count}
          </div>
        )}
        {project.activeAssignment && (
          <div className="rounded-md bg-muted p-2 text-xs">
            Aktywne przypisanie ({project.activeAssignment.status}), wygasa{" "}
            {fmtDateTime(project.activeAssignment.expires_at)}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edytuj / zdjęcie
          </Button>
          {!project.photo_approved && project.main_photo_path && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() => approveFn({ data: { projectId: project.id, approved: true } }))
              }
            >
              Zatwierdź zdjęcie
            </Button>
          )}
          {project.status !== "available_internal_pool" && (
            <Button
              size="sm"
              disabled={busy || !canPublish}
              title={canPublish ? "" : "Wymagane zatwierdzone zdjęcie główne"}
              onClick={() =>
                void run(() =>
                  statusFn({
                    data: {
                      projectId: project.id,
                      status: "available_internal_pool",
                      reason: "Publikacja do puli",
                    },
                  }),
                )
              }
            >
              Do puli
            </Button>
          )}
          {["available_internal_pool", "temporarily_assigned", "initial_interest"].includes(
            project.status,
          ) && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  statusFn({
                    data: { projectId: project.id, status: "paused", reason: "Wstrzymanie" },
                  }),
                )
              }
            >
              Wstrzymaj
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(() =>
                statusFn({
                  data: {
                    projectId: project.id,
                    status: "withdrawn",
                    reason: "Wycofanie projektu",
                  },
                }),
              )
            }
          >
            Wycofaj
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectEditDialog({
  project,
  onClose,
  onChanged,
}: {
  project: Row | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const upsertFn = useServerFn(adminUpsertProject);
  const uploadFn = useServerFn(adminUploadProjectPhoto);
  const [form, setForm] = useState({
    ...emptyProject,
    ...(project
      ? {
          amount: Number(project.amount) || 0,
          propertyType: project.property_type ?? "mieszkanie",
          city: project.city ?? "",
          voivodeship: project.voivodeship ?? "",
          financingPurpose: project.financing_purpose ?? "",
          periodMonths: project.period_months ?? 12,
          interestRatePercent: project.interest_rate_percent ?? 12,
          propertyValue: Number(project.property_value) || 0,
          valuationSource: project.valuation_source ?? "",
          valuationDate: project.valuation_date ?? "",
          securityType: project.security_type ?? "",
          mortgagePosition: project.mortgage_position ?? "",
          otherEncumbrances: project.other_encumbrances ?? "",
          borrowerBusinessForm: project.borrower_business_form ?? "",
          repaymentSource: project.repayment_source ?? "",
          repaymentType: project.repayment_type ?? "",
          docsComplete: project.docs_complete ?? false,
          docsCompletenessNote: project.docs_completeness_note ?? "",
        }
      : {}),
  });
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(project?.id ?? null);

  const set = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.amount || !form.city || !form.propertyType) {
      toast.error("Kwota, miejscowość i rodzaj nieruchomości są wymagane.");
      return;
    }
    setBusy(true);
    try {
      const res = await upsertFn({
        data: {
          projectId: projectId ?? undefined,
          project: {
            amount: form.amount,
            propertyType: form.propertyType,
            city: form.city,
            voivodeship: form.voivodeship || undefined,
            financingPurpose: form.financingPurpose || undefined,
            periodMonths: form.periodMonths || undefined,
            interestRatePercent: form.interestRatePercent || undefined,
            propertyValue: form.propertyValue || undefined,
            valuationSource: form.valuationSource || undefined,
            valuationDate: form.valuationDate || undefined,
            securityType: form.securityType || undefined,
            mortgagePosition: form.mortgagePosition || undefined,
            otherEncumbrances: form.otherEncumbrances || undefined,
            borrowerBusinessForm: form.borrowerBusinessForm || undefined,
            repaymentSource: form.repaymentSource || undefined,
            repaymentType: form.repaymentType || undefined,
            docsComplete: form.docsComplete,
            docsCompletenessNote: form.docsCompletenessNote || undefined,
          },
        },
      });
      setProjectId(res.projectId);
      toast.success(
        res.versionBumped
          ? "Zapisano jako nową wersję (przypisania unieważnione)."
          : "Zapisano projekt.",
      );
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (!projectId) {
      toast.error("Najpierw zapisz projekt, potem dodaj zdjęcie.");
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setBusy(true);
    try {
      await uploadFn({ data: { projectId, fileName: file.name, contentType: file.type, base64 } });
      toast.success("Zdjęcie wgrane. Wymaga jeszcze zatwierdzenia.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wgrać zdjęcia.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{projectId ? "Edytuj projekt" : "Nowy projekt"}</DialogTitle>
          <DialogDescription>
            Zmiana kwoty, wartości, zabezpieczenia, okresu lub nieruchomości przy projekcie już
            eksponowanym tworzy nową wersję i unieważnia aktywne przypisania.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormNum
            label="Kwota finansowania (zł)"
            value={form.amount}
            onChange={(v) => set("amount", v)}
          />
          <div className="space-y-1.5">
            <Label className="text-sm">Rodzaj nieruchomości</Label>
            <Select value={form.propertyType} onValueChange={(v) => set("propertyType", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {PROPERTY_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormText label="Miejscowość" value={form.city} onChange={(v) => set("city", v)} />
          <FormText
            label="Województwo"
            value={form.voivodeship}
            onChange={(v) => set("voivodeship", v)}
          />
          <FormNum
            label="Wartość nieruchomości (zł)"
            value={form.propertyValue}
            onChange={(v) => set("propertyValue", v)}
          />
          <FormText
            label="Źródło wyceny"
            value={form.valuationSource}
            onChange={(v) => set("valuationSource", v)}
          />
          <FormText
            label="Data wyceny"
            type="date"
            value={form.valuationDate}
            onChange={(v) => set("valuationDate", v)}
          />
          <FormNum
            label="Okres (mies.)"
            value={form.periodMonths}
            onChange={(v) => set("periodMonths", v)}
          />
          <FormNum
            label="Oprocentowanie (%)"
            value={form.interestRatePercent}
            onChange={(v) => set("interestRatePercent", v)}
          />
          <FormText
            label="Rodzaj zabezpieczenia"
            value={form.securityType}
            onChange={(v) => set("securityType", v)}
          />
          <FormText
            label="Miejsce hipoteki"
            value={form.mortgagePosition}
            onChange={(v) => set("mortgagePosition", v)}
          />
          <FormText
            label="Forma działalności pożyczkobiorcy"
            value={form.borrowerBusinessForm}
            onChange={(v) => set("borrowerBusinessForm", v)}
          />
          <FormText
            label="Źródło spłaty"
            value={form.repaymentSource}
            onChange={(v) => set("repaymentSource", v)}
          />
          <FormText
            label="Sposób spłaty"
            value={form.repaymentType}
            onChange={(v) => set("repaymentType", v)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Cel finansowania</Label>
          <Textarea
            rows={2}
            value={form.financingPurpose}
            onChange={(e) => set("financingPurpose", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Inne obciążenia (KW)</Label>
          <Textarea
            rows={2}
            value={form.otherEncumbrances}
            onChange={(e) => set("otherEncumbrances", e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.docsComplete}
            onChange={(e) => set("docsComplete", e.target.checked)}
          />
          Dokumentacja kompletna
        </label>

        <div className="rounded-md border p-3">
          <Label className="text-sm">Zdjęcie główne</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Projekt bez zaakceptowanego zdjęcia nie wejdzie do puli. Nie używamy zdjęć zastępczych.
          </p>
          <Input
            type="file"
            accept="image/*"
            disabled={!projectId || busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Zamknij
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {projectId ? "Zapisz zmiany" : "Utwórz projekt"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormText({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FormNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
