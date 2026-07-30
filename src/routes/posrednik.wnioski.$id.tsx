import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePanelBase } from "@/lib/panel-base";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft,
  Home,
  Wallet,
  CalendarClock,
  Landmark,
  User,
  Building2,
  UserRound,
  StickyNote,
  Save,
  Calculator,
  Send,
  ArrowRight,
} from "lucide-react";
import { formatPLN } from "@/lib/loan-math";
import {
  LOAN_STATUS_ORDER,
  LOAN_STATUS_SHORT_LABELS,
  loanStatusLabel,
  normalizeLoanStatus,
} from "@/lib/loan-status";
import { useAuth } from "@/hooks/use-auth";
import { ClientFilesManager } from "@/components/media/ClientFilesManager";
import { ClientCommsPreview } from "@/components/comms/ClientCommsPreview";
import { SendToInvestorsDialog } from "@/components/broker/send-to-investors-dialog";
import { LoanCalculator } from "@/components/loan-calculator";
import { EditableField } from "@/components/admin/EditableField";
import { KwPotentialBadge } from "@/components/location-scoring/kw-potential-badge";
import { toast } from "sonner";

export const Route = createFileRoute("/posrednik/wnioski/$id")({
  component: () => <BrokerApplicationDetail />,
});

type Row = {
  id: string;
  status: string;
  broker_notes?: string | null;
  loan_amount: number | null;
  preferred_period_months: number | null;
  created_at: string;
  client: {
    id?: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    phone?: string;
    email?: string;
  } | null;
  properties: Array<{
    id?: string;
    property_type?: string;
    address?: string;
    street?: string;
    city?: string;
    voivodeship?: string;
    land_register_number?: string;
    additional_land_register_numbers?: string[] | null;
    area_sqm?: number | null;
    estimated_value?: number | null;
    photos?: string[] | null;
    description?: string | null;
  }>;
};

export function BrokerApplicationDetail({
  showInternalOffer = false,
}: { showInternalOffer?: boolean } = {}) {
  const { id } = useParams({ strict: false }) as { id: string };
  const base = usePanelBase();
  const { roles } = useAuth();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState<null | "instytucjonalny" | "indywidualny">(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  // Historia komunikacji wisi na leadach — RLS udostępnia ją tylko personelowi
  // wewnętrznemu, więc pośrednikowi zewnętrznemu sekcji nie pokazujemy.
  const canSeeComms = roles.includes("operator") || roles.includes("administrator");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const { data: app } = await supabase
        .from("loan_applications")
        .select(
          "id, status, broker_notes, loan_amount, preferred_period_months, created_at, client:clients(id,first_name,last_name,city,phone,email), properties(id,property_type,address,street,city,voivodeship,land_register_number,additional_land_register_numbers,area_sqm,estimated_value,photos,description)",
        )
        .eq("id", id)
        .maybeSingle();
      const appRow = (app as any) ?? null;
      setRow(appRow);
      setNotes(appRow?.broker_notes ?? "");
      if (!silent) setLoading(false);
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const saveNotes = async () => {
    if (!row) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from("loan_applications")
      .update({ broker_notes: notes } as any)
      .eq("id", row.id);
    setSavingNotes(false);
    if (error) toast.error("Nie udało się zapisać notatek", { description: error.message });
    else toast.success("Notatki zapisane");
  };

  const changeStatus = async (newStatus: string) => {
    if (!row) return;
    setSavingStatus(true);
    const { error } = await supabase
      .from("loan_applications")
      .update({ status: newStatus as any })
      .eq("id", row.id);
    setSavingStatus(false);
    if (error) return toast.error("Nie udało się zmienić statusu", { description: error.message });
    setRow({ ...row, status: newStatus });
    toast.success("Status zaktualizowany");
  };

  const p = useMemo(
    () =>
      row ? (Array.isArray(row.properties) ? row.properties[0] : (row.properties as any)) : null,
    [row],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={`${base}/wnioski` as any}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Wróć
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nie znaleziono wniosku.
          </CardContent>
        </Card>
      </div>
    );
  }

  const clientName =
    [row.client?.first_name, row.client?.last_name].filter(Boolean).join(" ") || "Klient";
  const fullAddress = [p?.street ?? p?.address, p?.city, p?.voivodeship].filter(Boolean).join(", ");
  const additionalKw = Array.isArray(p?.additional_land_register_numbers)
    ? p!.additional_land_register_numbers!.filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to={`${base}/wnioski` as any}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Moje wnioski
          </Link>
        </Button>
        <FancyPageHeader
          eyebrow="Wniosek pożyczkowy"
          title={clientName}
          subtitle={new Date(row.created_at).toLocaleDateString("pl-PL", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
          actions={
            <Badge variant="secondary" className="text-sm">
              {loanStatusLabel(row.status)}
            </Badge>
          }
        />
      </div>

      {/* Status + notatki */}
      <div className="grid gap-4 md:grid-cols-2">
        <FancyCard tone="slate">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70">
            Status wniosku
          </div>
          <Select
            value={normalizeLoanStatus(row.status)}
            onValueChange={changeStatus}
            disabled={savingStatus}
          >
            <SelectTrigger className="border-white/20 bg-white/10 text-white backdrop-blur">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOAN_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {LOAN_STATUS_SHORT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FancyCard>
        <FancyCard tone="slate">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70">
              <StickyNote className="h-3.5 w-3.5" />
              Notatki pośrednika
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={saveNotes}
              disabled={savingNotes}
              className="h-7"
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              Zapisz
            </Button>
          </div>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notatki widoczne dla Ciebie i zespołu (nie dla klienta)."
            className="resize-none border-white/20 bg-white/10 text-white placeholder:text-white/40 backdrop-blur"
          />
        </FancyCard>
      </div>

      {/* Kluczowe parametry — edytowalne inline */}
      <div className="grid gap-4 sm:grid-cols-3">
        <EditableStatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Wnioskowana kwota"
          value={row.loan_amount ?? null}
          display={(v) => (v ? formatPLN(Number(v)) : "—")}
          type="number"
          table="loan_applications"
          rowId={row.id}
          column="loan_amount"
          onSaved={() => void load(true)}
          accent
        />
        <EditableStatCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="Okres (mies.)"
          value={row.preferred_period_months ?? null}
          display={(v) => (v ? `${v} mies.` : "—")}
          type="number"
          table="loan_applications"
          rowId={row.id}
          column="preferred_period_months"
          onSaved={() => void load(true)}
        />
        {p?.id ? (
          <EditableStatCard
            icon={<Home className="h-5 w-5" />}
            label="Typ nieruchomości"
            value={p.property_type ?? "inna"}
            display={(v) => (v ? String(v) : "—")}
            type="select"
            options={[
              { value: "mieszkanie", label: "Mieszkanie" },
              { value: "dom", label: "Dom" },
              { value: "lokal_uslugowy", label: "Lokal usługowy" },
              { value: "dzialka_budowlana", label: "Działka budowlana" },
              { value: "grunt_rolny", label: "Grunt rolny" },
              { value: "udzial_w_nieruchomosci", label: "Udział w nieruchomości" },
              { value: "inna", label: "Inna" },
            ]}
            table="properties"
            rowId={p.id}
            column="property_type"
            onSaved={() => void load(true)}
          />
        ) : (
          <StatCard icon={<Home className="h-5 w-5" />} label="Typ nieruchomości" value="—" />
        )}
      </div>

      {/* MEGA CTA — dystrybucja + oferta wewnętrzna */}
      <div className="relative overflow-hidden rounded-3xl p-[2px] shadow-[0_20px_60px_-20px_oklch(0.40_0.25_268/0.7)]">
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "conic-gradient(from 0deg, oklch(0.40 0.25 268), oklch(0.65 0.18 240), oklch(0.55 0.20 255), oklch(0.30 0.15 265), oklch(0.40 0.25 268))",
            animation: "fy-cta-spin 10s linear infinite",
          }}
        />
        <div
          className="relative rounded-[22px] p-6 md:p-8"
          style={{
            background:
              "radial-gradient(120% 140% at 100% 0%, oklch(0.32 0.16 265) 0%, oklch(0.15 0.05 265) 60%, oklch(0.10 0.03 265) 100%)",
          }}
        >
          <div className="mb-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
              <Send className="h-3.5 w-3.5" />
              Dystrybucja oferty
            </div>
            <h2 className="text-xl font-extrabold text-white md:text-2xl">
              Wyślij ofertę do inwestorów
            </h2>
            <p className="text-sm text-white/70 md:text-[15px]">
              Zdjęcia, dokumenty, KW i kwota trafią do wybranych odbiorców z Twoją stopką.
              {showInternalOffer &&
                " Możesz też najpierw wygenerować ofertę wewnętrzną z prowizją operatora."}
            </p>
          </div>
          <div className={`grid gap-3 ${showInternalOffer ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <CtaButton
              onClick={() => setSendOpen("instytucjonalny")}
              tone="primary"
              icon={<Building2 className="h-6 w-6" />}
              title="Inwestorzy instytucjonalni"
              hint="Fundusze, spółki, partnerzy strategiczni"
            />
            <CtaButton
              onClick={() => setSendOpen("indywidualny")}
              tone="secondary"
              icon={<UserRound className="h-6 w-6" />}
              title="Inwestorzy prywatni"
              hint="Baza aktywnych inwestorów indywidualnych"
            />
            {showInternalOffer && (
              <CtaButton
                onClick={() => setCalcOpen(true)}
                tone="ghost"
                icon={<Calculator className="h-6 w-6" />}
                title="Oferta wewnętrzna"
                hint="Kalkulator z Twoją prowizją operatora 2–5%"
              />
            )}
          </div>
        </div>
        <style>{`@keyframes fy-cta-spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Pliki klienta — jeden worek: zdjęcia, skany, załączniki. Wszystko jako miniatury. */}
      <FancyCard tone="light">
        <ClientFilesManager loanApplicationId={row.id} onChanged={() => void load(true)} />
      </FancyCard>

      {/* Podgląd komunikacji z klientem (voicebot / SMS / e-mail / Messenger / notatki) */}
      {canSeeComms && (
        <ClientCommsPreview loanApplicationId={row.id} clientId={row.client?.id ?? null} />
      )}

      {/* Nieruchomość + klient */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FancyCard tone="light" title="Nieruchomość i KW" icon={<Landmark className="h-4 w-4" />}>
          {p?.id ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <EditableField
                  label="Numer KW"
                  value={p.land_register_number ?? ""}
                  table="properties"
                  rowId={p.id}
                  column="land_register_number"
                  onSaved={() => void load(true)}
                />
                {p.land_register_number && (
                  <KwPotentialBadge
                    applicationId={row.id}
                    kwNumber={p.land_register_number}
                    propertyType={p.property_type}
                  />
                )}
              </div>
              <EditableField
                label="Powierzchnia (m²)"
                value={p.area_sqm ?? ""}
                table="properties"
                rowId={p.id}
                column="area_sqm"
                type="number"
                onSaved={() => void load(true)}
              />
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Brak danych nieruchomości.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const { error } = await supabase
                    .from("properties")
                    .insert({ loan_application_id: row.id, property_type: "inna" } as any);
                  if (error) toast.error("Nie udało się utworzyć", { description: error.message });
                  else {
                    toast.success("Utworzono — możesz edytować");
                    await load(true);
                  }
                }}
              >
                Dodaj dane nieruchomości
              </Button>
            </div>
          )}
        </FancyCard>
        <FancyCard tone="light" title="Klient" icon={<User className="h-4 w-4" />}>
          {row.client?.id ? (
            <div className="space-y-3 text-sm">
              <EditableField
                label="Imię"
                value={row.client.first_name ?? ""}
                table="clients"
                rowId={row.client.id}
                column="first_name"
                onSaved={() => void load(true)}
              />
              <EditableField
                label="Nazwisko"
                value={row.client.last_name ?? ""}
                table="clients"
                rowId={row.client.id}
                column="last_name"
                onSaved={() => void load(true)}
              />

              <EditableField
                label="Telefon"
                value={row.client.phone ?? ""}
                table="clients"
                rowId={row.client.id}
                column="phone"
                type="tel"
                onSaved={() => void load(true)}
              />
              <EditableField
                label="E-mail"
                value={row.client.email ?? ""}
                table="clients"
                rowId={row.client.id}
                column="email"
                type="email"
                onSaved={() => void load(true)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak przypisanego klienta.</p>
          )}
        </FancyCard>
      </div>

      {p?.description && (
        <FancyCard tone="light" title="Opis">
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</div>
        </FancyCard>
      )}

      {sendOpen && (
        <SendToInvestorsDialog
          open={!!sendOpen}
          onOpenChange={(o) => !o && setSendOpen(null)}
          applicationId={row.id}
          audience={sendOpen}
        />
      )}

      {/* Oferta wewnętrzna — dialog z kalkulatorem (tylko dla operatora) */}
      {showInternalOffer && (
        <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                Oferta wewnętrzna — {clientName}
              </DialogTitle>
            </DialogHeader>
            <div className="pt-2">
              <LoanCalculator
                investorGuidance
                hideFinanceYouFee
                internalOperatorMode
                initialOnHand={row.loan_amount ? Number(row.loan_amount) : undefined}
                initialMonths={row.preferred_period_months ?? undefined}
                clientEmail={row.client?.email ?? null}
                clientName={clientName}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ————— Building blocks ————— */

function FancyCard({
  children,
  tone,
  title,
  icon,
  rightSlot,
}: {
  children: React.ReactNode;
  tone: "light" | "slate";
  title?: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  if (tone === "slate") {
    return (
      <div className="relative overflow-hidden rounded-2xl p-[1.5px] shadow-[0_10px_35px_-15px_oklch(0.30_0.15_265/0.6)]">
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.45 0.20 268), oklch(0.30 0.10 265) 60%, oklch(0.50 0.18 240))",
          }}
        />
        <div
          className="relative rounded-[15px] p-4 text-white"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, oklch(0.25 0.10 265) 0%, oklch(0.13 0.04 265) 70%)",
          }}
        >
          {title && (
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                {icon}
                <span>{title}</span>
              </div>
              {rightSlot}
            </div>
          )}
          {children}
        </div>
      </div>
    );
  }
  return (
    <Card className="overflow-hidden border-primary/10 shadow-sm">
      {title && (
        <CardHeader className="bg-gradient-to-br from-primary/5 via-primary/[0.03] to-transparent pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              {icon && <span className="text-primary">{icon}</span>}
              {title}
            </CardTitle>
            {rightSlot}
          </div>
        </CardHeader>
      )}
      <CardContent className={title ? "pt-4" : "p-5"}>{children}</CardContent>
    </Card>
  );
}

function CtaButton({
  onClick,
  tone,
  icon,
  title,
  hint,
}: {
  onClick: () => void;
  tone: "primary" | "secondary" | "ghost";
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  const bg =
    tone === "primary"
      ? "bg-white text-slate-900 hover:bg-white/90"
      : tone === "secondary"
        ? "bg-white/15 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25"
        : "bg-amber-400/95 text-slate-950 hover:bg-amber-400";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-xl ${bg}`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone === "primary" ? "bg-slate-900/10" : tone === "secondary" ? "bg-white/20" : "bg-slate-900/10"}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-extrabold leading-tight">{title}</div>
        <div className={`mt-0.5 text-xs ${tone === "secondary" ? "text-white/70" : "opacity-70"}`}>
          {hint}
        </div>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
    </button>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card
      className={
        accent
          ? "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
          : "border-primary/10"
      }
    >
      <CardContent className="flex items-center gap-3 py-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent ? "bg-primary text-primary-foreground shadow-md" : "bg-primary/10 text-primary"}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="truncate text-base font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditableStatCard({
  icon,
  label,
  value,
  display,
  type,
  options,
  table,
  rowId,
  column,
  onSaved,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number | null;
  display: (v: string | number | null) => string;
  type: "number" | "text" | "select";
  options?: { value: string; label: string }[];
  table: string;
  rowId: string;
  column: string;
  onSaved?: () => void;
  accent?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    let payload: unknown = draft;
    if (type === "number") payload = draft === "" ? null : Number(draft);
    else if (draft === "") payload = null;
    const { error } = await supabase
      .from(table as any)
      .update({ [column]: payload } as any)
      .eq("id", rowId);
    setSaving(false);
    if (error) {
      toast.error("Błąd zapisu", { description: error.message });
      return;
    }
    toast.success("Zapisano");
    setEditing(false);
    onSaved?.();
  };

  return (
    <Card
      className={`group cursor-pointer transition ${accent ? "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" : "border-primary/10"} hover:border-primary/60`}
      onClick={() => {
        if (!editing) {
          setDraft(value == null ? "" : String(value));
          setEditing(true);
        }
      }}
    >
      <CardContent className="flex items-center gap-3 py-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent ? "bg-primary text-primary-foreground shadow-md" : "bg-primary/10 text-primary"}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          {editing ? (
            <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {type === "select" && options ? (
                <Select
                  value={draft}
                  onValueChange={(v) => {
                    setDraft(v);
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  autoFocus
                  type={type === "number" ? "number" : "text"}
                  className="h-8 w-full rounded border bg-background px-2 text-sm"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save();
                    if (e.key === "Escape") setEditing(false);
                  }}
                />
              )}
              <Button size="sm" className="h-8" disabled={saving} onClick={() => void save()}>
                OK
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
                ×
              </Button>
            </div>
          ) : (
            <div className="truncate text-base font-bold">{display(value)}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
