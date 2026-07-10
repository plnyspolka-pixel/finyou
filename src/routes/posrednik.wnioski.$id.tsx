import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, FileText, Image as ImageIcon, Home, Wallet, CalendarClock,
  MapPin, Landmark, Ruler, User, Building2, UserRound, StickyNote, Save,
  ImageOff, Calculator, Send, ArrowRight, Eye,
} from "lucide-react";
import { formatPLN } from "@/lib/loan-math";
import { LOAN_STATUS_ORDER, LOAN_STATUS_SHORT_LABELS, loanStatusLabel, normalizeLoanStatus } from "@/lib/loan-status";
import { resolveApplicationPhotoUrls } from "@/lib/property-photos";
import { SendToInvestorsDialog } from "@/components/broker/send-to-investors-dialog";
import { MediaPreviewDialog } from "@/components/admin/MediaPreviewDialog";
import { LoanCalculator } from "@/components/loan-calculator";
import { toast } from "sonner";

export const Route = createFileRoute("/posrednik/wnioski/$id")({
  component: BrokerApplicationDetail,
});

type Row = {
  id: string;
  status: string;
  broker_notes?: string | null;
  loan_amount: number | null;
  preferred_period_months: number | null;
  created_at: string;
  client: { first_name?: string; last_name?: string; city?: string; phone?: string; email?: string } | null;
  properties: Array<{
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

type Doc = { id: string; document_type: string | null; file_name: string | null; file_path: string | null; file_url: string | null; created_at: string };

function SmartImg({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}>
        <ImageOff className="h-8 w-8" />
      </div>
    );
  }
  return <img src={src} alt={alt ?? ""} loading="lazy" className={className} onError={() => setBroken(true)} />;
}

export function BrokerApplicationDetail() {
  const { id } = useParams({ from: "/posrednik/wnioski/$id" });
  const [row, setRow] = useState<Row | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState<null | "instytucjonalny" | "indywidualny">(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: app }, { data: d }] = await Promise.all([
        supabase
          .from("loan_applications")
          .select(
            "id, status, broker_notes, loan_amount, preferred_period_months, created_at, client:clients(first_name,last_name,city,phone,email), properties(property_type,address,street,city,voivodeship,land_register_number,additional_land_register_numbers,area_sqm,estimated_value,photos,description)"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("documents")
          .select("id, document_type, file_name, file_path, file_url, created_at")
          .eq("loan_application_id", id)
          .order("created_at", { ascending: false }),
      ]);
      const appRow = (app as any) ?? null;
      setRow(appRow);
      setNotes(appRow?.broker_notes ?? "");
      setDocs((d as any) ?? []);

      // Zdjęcia nieruchomości: tylko faktyczne obrazki (bez skanów dokumentów/PDF),
      // podpisane w Storage (ścieżki mogą leżeć w `property-photos` lub `documents`).
      // Wnioski z landingu mają zdjęcia wyłącznie w tabeli `documents`, dlatego łączymy
      // `properties.photos` z dokumentami — inaczej galeria bywała pusta.
      const p = Array.isArray(appRow?.properties) ? appRow.properties[0] : (appRow?.properties as any);
      const resolved = await resolveApplicationPhotoUrls(p?.photos, (d as any) ?? [], 60 * 60);
      setPhotos(resolved);
      setLoading(false);
    })();
  }, [id]);

  const saveNotes = async () => {
    if (!row) return;
    setSavingNotes(true);
    const { error } = await supabase.from("loan_applications").update({ broker_notes: notes } as any).eq("id", row.id);
    setSavingNotes(false);
    if (error) toast.error("Nie udało się zapisać notatek", { description: error.message });
    else toast.success("Notatki zapisane");
  };

  const changeStatus = async (newStatus: string) => {
    if (!row) return;
    setSavingStatus(true);
    const { error } = await supabase.from("loan_applications").update({ status: newStatus as any }).eq("id", row.id);
    setSavingStatus(false);
    if (error) return toast.error("Nie udało się zmienić statusu", { description: error.message });
    setRow({ ...row, status: newStatus });
    toast.success("Status zaktualizowany");
  };

  const p = useMemo(() => (row ? (Array.isArray(row.properties) ? row.properties[0] : (row.properties as any)) : null), [row]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm"><Link to="/posrednik/wnioski"><ArrowLeft className="mr-2 h-4 w-4" />Wróć</Link></Button>
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nie znaleziono wniosku.</CardContent></Card>
      </div>
    );
  }

  const clientName = [row.client?.first_name, row.client?.last_name].filter(Boolean).join(" ") || "Klient";
  const fullAddress = [p?.street ?? p?.address, p?.city, p?.voivodeship].filter(Boolean).join(", ");
  const additionalKw = Array.isArray(p?.additional_land_register_numbers) ? p!.additional_land_register_numbers!.filter(Boolean) : [];

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to="/posrednik/wnioski"><ArrowLeft className="mr-2 h-4 w-4" />Moje wnioski</Link>
        </Button>
        <FancyPageHeader
          eyebrow="Wniosek pożyczkowy"
          title={clientName}
          subtitle={new Date(row.created_at).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })}
          actions={<Badge variant="secondary" className="text-sm">{loanStatusLabel(row.status)}</Badge>}
        />
      </div>

      {/* Status + notatki */}
      <div className="grid gap-4 md:grid-cols-2">
        <FancyCard tone="slate">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70">Status wniosku</div>
          <Select value={normalizeLoanStatus(row.status)} onValueChange={changeStatus} disabled={savingStatus}>
            <SelectTrigger className="border-white/20 bg-white/10 text-white backdrop-blur"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOAN_STATUS_ORDER.map((s) => (<SelectItem key={s} value={s}>{LOAN_STATUS_SHORT_LABELS[s]}</SelectItem>))}
            </SelectContent>
          </Select>
        </FancyCard>
        <FancyCard tone="slate">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70">
              <StickyNote className="h-3.5 w-3.5" />Notatki pośrednika
            </div>
            <Button size="sm" variant="secondary" onClick={saveNotes} disabled={savingNotes} className="h-7">
              <Save className="mr-1 h-3.5 w-3.5" />Zapisz
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

      {/* Kluczowe parametry */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Wnioskowana kwota" value={row.loan_amount ? formatPLN(Number(row.loan_amount)) : "—"} accent />
        <StatCard icon={<CalendarClock className="h-5 w-5" />} label="Okres" value={row.preferred_period_months ? `${row.preferred_period_months} mies.` : "—"} />
        <StatCard icon={<Home className="h-5 w-5" />} label="Typ nieruchomości" value={p?.property_type ?? "—"} />
      </div>

      {/* MEGA CTA — dystrybucja + oferta wewnętrzna */}
      <div className="relative overflow-hidden rounded-3xl p-[2px] shadow-[0_20px_60px_-20px_oklch(0.40_0.25_268/0.7)]">
        <span aria-hidden className="absolute inset-0" style={{ background: "conic-gradient(from 0deg, oklch(0.40 0.25 268), oklch(0.65 0.18 240), oklch(0.55 0.20 255), oklch(0.30 0.15 265), oklch(0.40 0.25 268))", animation: "fy-cta-spin 10s linear infinite" }} />
        <div className="relative rounded-[22px] p-6 md:p-8" style={{ background: "radial-gradient(120% 140% at 100% 0%, oklch(0.32 0.16 265) 0%, oklch(0.15 0.05 265) 60%, oklch(0.10 0.03 265) 100%)" }}>
          <div className="mb-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
              <Send className="h-3.5 w-3.5" />Dystrybucja oferty
            </div>
            <h2 className="text-xl font-extrabold text-white md:text-2xl">Wyślij ofertę do inwestorów</h2>
            <p className="text-sm text-white/70 md:text-[15px]">
              Zdjęcia, dokumenty, KW i kwota trafią do wybranych odbiorców z Twoją stopką.
              Możesz też najpierw wygenerować ofertę wewnętrzną z prowizją operatora.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <CtaButton onClick={() => setSendOpen("instytucjonalny")} tone="primary" icon={<Building2 className="h-6 w-6" />} title="Inwestorzy instytucjonalni" hint="Fundusze, spółki, partnerzy strategiczni" />
            <CtaButton onClick={() => setSendOpen("indywidualny")} tone="secondary" icon={<UserRound className="h-6 w-6" />} title="Inwestorzy prywatni" hint="Baza aktywnych inwestorów indywidualnych" />
            <CtaButton onClick={() => setCalcOpen(true)} tone="ghost" icon={<Calculator className="h-6 w-6" />} title="Oferta wewnętrzna" hint="Kalkulator z Twoją prowizją operatora 2–5%" />
          </div>
        </div>
        <style>{`@keyframes fy-cta-spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Zdjęcia — hero grid */}
      <FancyCard tone="light">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><ImageIcon className="h-4 w-4" /></div>
            <div>
              <div className="text-sm font-bold">Zdjęcia nieruchomości</div>
              <div className="text-xs text-muted-foreground">Kliknij, aby powiększyć</div>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">{photos.length}</Badge>
        </div>
        {photos.length === 0 ? (
          <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">Brak zdjęć.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setLightbox(i)}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted transition hover:shadow-lg"
              >
                <SmartImg src={url} alt={`Zdjęcie ${i + 1}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                  Zdjęcie {i + 1} / {photos.length}
                </div>
              </button>
            ))}
          </div>
        )}
      </FancyCard>

      {/* Nieruchomość + klient */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FancyCard tone="light" title="Nieruchomość i KW" icon={<Landmark className="h-4 w-4" />}>
          <div className="space-y-3 text-sm">
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Adres" value={fullAddress || "—"} />
            <InfoRow icon={<FileText className="h-4 w-4" />} label="Numer KW" value={p?.land_register_number || "—"} mono />
            {additionalKw.length > 0 && (<InfoRow icon={<FileText className="h-4 w-4" />} label="Dodatkowe KW" value={additionalKw.join(", ")} mono />)}
            <InfoRow icon={<Ruler className="h-4 w-4" />} label="Powierzchnia" value={p?.area_sqm ? `${p.area_sqm} m²` : "—"} />
            <InfoRow icon={<Wallet className="h-4 w-4" />} label="Szacowana wartość" value={p?.estimated_value ? formatPLN(Number(p.estimated_value)) : "—"} />
          </div>
        </FancyCard>
        <FancyCard tone="light" title="Klient" icon={<User className="h-4 w-4" />}>
          <div className="space-y-3 text-sm">
            <InfoRow label="Imię i nazwisko" value={clientName} />
            <InfoRow label="Miasto" value={row.client?.city || "—"} />
            <InfoRow label="Telefon" value={row.client?.phone || "—"} />
            <InfoRow label="E-mail" value={row.client?.email || "—"} />
          </div>
        </FancyCard>
      </div>

      {/* Dokumenty */}
      <FancyCard
        tone="light"
        title="Dokumenty"
        icon={<FileText className="h-4 w-4" />}
        rightSlot={
          <div className="flex items-center gap-2">
            {docs.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Podgląd
              </Button>
            )}
            <Badge variant="outline">{docs.length}</Badge>
          </div>
        }
      >
        {docs.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Brak dokumentów.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {docs.map((doc) => (
              <button key={doc.id} type="button" onClick={() => setPreviewOpen(true)}
                className="group flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{doc.file_name || doc.document_type || "Dokument"}</div>
                  <div className="text-xs text-muted-foreground">{doc.document_type ?? "—"} · {new Date(doc.created_at).toLocaleDateString("pl-PL")}</div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            ))}
          </div>
        )}
      </FancyCard>

      {p?.description && (
        <FancyCard tone="light" title="Opis">
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</div>
        </FancyCard>
      )}

      {sendOpen && (
        <SendToInvestorsDialog open={!!sendOpen} onOpenChange={(o) => !o && setSendOpen(null)} applicationId={row.id} audience={sendOpen} />
      )}

      {/* Oferta wewnętrzna — dialog z kalkulatorem */}
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

      {/* Podgląd zdjęć i dokumentów (obrazki + PDF w iframe) */}
      <MediaPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        loanApplicationId={row.id}
        photoPaths={Array.isArray(p?.photos) ? (p!.photos as string[]).filter(Boolean) : []}
        title={`Dokumenty i zdjęcia — ${clientName}`}
      />

      {/* Lightbox */}
      <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl border-0 bg-black/95 p-2">
          {lightbox !== null && photos[lightbox] && (
            <div className="flex items-center justify-center">
              <img src={photos[lightbox]} alt={`Zdjęcie ${lightbox + 1}`} className="max-h-[85vh] w-auto rounded-lg object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ————— Building blocks ————— */

function FancyCard({
  children, tone, title, icon, rightSlot,
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
        <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(135deg, oklch(0.45 0.20 268), oklch(0.30 0.10 265) 60%, oklch(0.50 0.18 240))" }} />
        <div className="relative rounded-[15px] p-4 text-white" style={{ background: "radial-gradient(120% 140% at 0% 0%, oklch(0.25 0.10 265) 0%, oklch(0.13 0.04 265) 70%)" }}>
          {title && (
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">{icon}<span>{title}</span></div>
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
              {icon && <span className="text-primary">{icon}</span>}{title}
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
  onClick, tone, icon, title, hint,
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
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone === "primary" ? "bg-slate-900/10" : tone === "secondary" ? "bg-white/20" : "bg-slate-900/10"}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-extrabold leading-tight">{title}</div>
        <div className={`mt-0.5 text-xs ${tone === "secondary" ? "text-white/70" : "opacity-70"}`}>{hint}</div>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
    </button>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" : "border-primary/10"}>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent ? "bg-primary text-primary-foreground shadow-md" : "bg-primary/10 text-primary"}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="truncate text-base font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span>{label}</span></div>
      <div className={`text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}
