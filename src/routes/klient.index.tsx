import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { InvestorProposalCalculator } from "@/components/client/InvestorProposalCalculator";
import { MediaPreviewDialog } from "@/components/admin/MediaPreviewDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Image as ImageIcon, File as FileIcon, Save, BookText, Check, FolderOpen, Eye, Eye as EyeIcon, ShieldCheck, Sparkles } from "lucide-react";
import { FancyShell } from "@/components/landing/fancy-shell";
import { ClientProfileSections } from "@/components/client/ClientProfileSections";
import { NumberTicker } from "@/components/ui/number-ticker";
import { toast } from "sonner";

export const Route = createFileRoute("/klient/")({
  component: KlientDashboard,
});

function KlientDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const { data: clientRow, isLoading: clientLoading } = useQuery({
    queryKey: ["client-row", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("clients")
        .select("id, user_id")
        .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: Boolean(user),
  });

  const { data: loanRow, refetch: refetchLoan } = useQuery({
    queryKey: ["client-loan", clientRow?.id],
    queryFn: async () => {
      const { data } = await supabase.from("loan_applications")
        .select("id, view_count")
        .eq("client_id", clientRow!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: Boolean(clientRow?.id),
  });

  // Liczymy każde otwarcie strony przez właściciela wniosku jako "wyświetlenie".
  useEffect(() => {
    if (!loanRow?.id) return;
    const key = `viewed:own:${loanRow.id}:${new Date().toISOString().slice(0, 13)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void (async () => {
      try {
        await supabase.rpc("increment_loan_view", { _loan_id: loanRow.id });
        void refetchLoan();
      } catch { /* ignore */ }
    })();
  }, [loanRow?.id, refetchLoan]);

  const { data: propertyRow, refetch: refetchProperty } = useQuery({
    queryKey: ["client-property", loanRow?.id],
    queryFn: async () => {
      const { data } = await supabase.from("properties")
        .select("id, land_register_number, photos, loan_application_id")
        .eq("loan_application_id", loanRow!.id).maybeSingle();
      return data;
    },
    enabled: Boolean(loanRow?.id),
  });

  const { data: documentsList } = useQuery({
    queryKey: ["client-documents", loanRow?.id],
    queryFn: async () => {
      const { data } = await supabase.from("documents")
        .select("id, file_name, file_path, file_url, document_type, created_at")
        .eq("loan_application_id", loanRow!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: Boolean(loanRow?.id),
  });

  const photoPaths: string[] = Array.isArray((propertyRow as any)?.photos)
    ? ((propertyRow as any).photos as string[])
    : [];
  const docCount = documentsList?.length ?? 0;
  const totalFiles = photoPaths.length + docCount;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [thumbUrls, setThumbUrls] = useState<string[]>([]);
  const [kw, setKw] = useState("");
  const [savingKw, setSavingKw] = useState(false);
  const [kwTouched, setKwTouched] = useState(false);

  useEffect(() => {
    setKw(String((propertyRow as any)?.land_register_number ?? ""));
    setKwTouched(false);
  }, [propertyRow?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (photoPaths.length === 0) { setThumbUrls([]); return; }
      const { data } = await supabase.storage
        .from("property-photos")
        .createSignedUrls(photoPaths.slice(0, 6), 60 * 60);
      if (!cancelled && data) setThumbUrls(data.map((d) => d.signedUrl).filter(Boolean) as string[]);
    })();
    return () => { cancelled = true; };
  }, [photoPaths.join("|")]);

  // Walidacja numeru KW: 4 znaki kodu sądu / 8 cyfr / 1 cyfra kontrolna
  // np. WA1M/00123456/7
  const validateKw = (raw: string): { ok: boolean; error: string | null; hint: string | null } => {
    const value = raw.trim().toUpperCase();
    if (!value) return { ok: false, error: "Wpisz numer księgi wieczystej.", hint: null };

    const parts = value.split("/");
    if (parts.length !== 3) {
      return {
        ok: false,
        error: "Numer KW musi mieć trzy części oddzielone ukośnikami „/”.",
        hint: "Przykład: WA1M/00123456/7",
      };
    }
    const [court, digits, control] = parts;

    if (court.length !== 4) {
      return { ok: false, error: `Kod sądu musi mieć dokładnie 4 znaki (wpisano ${court.length}).`, hint: "np. WA1M" };
    }
    if (!/^[A-Z0-9]{4}$/.test(court)) {
      return { ok: false, error: "Kod sądu może zawierać tylko litery i cyfry (bez polskich znaków).", hint: "np. WA1M, GD1G, KR2K" };
    }
    if (digits.length !== 8) {
      return { ok: false, error: `Numer księgi musi mieć dokładnie 8 cyfr (wpisano ${digits.length}).`, hint: "Uzupełnij zerami z przodu, np. 00123456" };
    }
    if (!/^\d{8}$/.test(digits)) {
      return { ok: false, error: "Numer księgi może zawierać tylko cyfry (0–9).", hint: null };
    }
    if (control.length !== 1) {
      return { ok: false, error: "Cyfra kontrolna musi być dokładnie jedna.", hint: "Ostatnia cyfra z odpisu KW (0–9)." };
    }
    if (!/^\d$/.test(control)) {
      return { ok: false, error: "Cyfra kontrolna musi być cyfrą (0–9).", hint: null };
    }
    return { ok: true, error: null, hint: null };
  };

  const kwValidation = validateKw(kw);
  const showKwError = kwTouched && !kwValidation.ok && kw.trim().length > 0;

  const saveKw = async () => {
    if (!propertyRow?.id) return;
    setKwTouched(true);
    if (!kwValidation.ok) {
      toast.error(kwValidation.error ?? "Nieprawidłowy numer KW");
      return;
    }
    setSavingKw(true);
    try {
      const normalized = kw.trim().toUpperCase();
      const { error } = await supabase.from("properties")
        .update({ land_register_number: normalized })
        .eq("id", propertyRow.id);
      if (error) throw error;
      setKw(normalized);
      toast.success("Numer KW zapisany poprawnie");
      void refetchProperty();
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zapisać numeru KW");
    } finally {
      setSavingKw(false);
    }
  };

  if (authLoading || clientLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!clientRow) {
    return (
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Witaj!</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Nie masz jeszcze profilu. Uzupełnij dane, żeby rozpocząć wniosek.
          </p>
          <Button onClick={() => navigate({ to: "/klient/profil" })}>Uzupełnij profil</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <InvestorProposalCalculator />

      {loanRow?.id && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* === Twoje pliki (fancy) === */}
          <FancyShell>
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                  <FolderOpen className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div className="flex-1 leading-tight drop-shadow-[0_1px_8px_oklch(0.15_0.05_265/0.8)]">
                  <div className="text-base font-bold uppercase tracking-[0.18em] sm:text-lg">Twoje pliki</div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/65">
                    Zdjęcia nieruchomości i dokumenty
                  </div>
                </div>
                <Badge className="border-white/30 bg-white/15 font-bold text-white backdrop-blur-sm">
                  {totalFiles}
                </Badge>
              </div>

              {totalFiles === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-8 text-center text-sm text-white/75">
                  Nie wgrałeś jeszcze żadnych zdjęć ani dokumentów.
                </div>
              ) : (
                <>
                  {thumbUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {thumbUrls.map((u, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPreviewOpen(true)}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-white/25 bg-white/10 ring-1 ring-white/10 transition hover:ring-2 hover:ring-white/60"
                        >
                          <img src={u} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  )}

                  {docCount > 0 && (
                    <ul className="space-y-1.5">
                      {documentsList!.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm backdrop-blur-sm transition hover:bg-white/15"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/20 ring-1 ring-white/30">
                            <FileText className="h-3.5 w-3.5" />
                          </span>
                          <span className="flex-1 truncate font-medium text-white">{d.file_name}</span>
                          {d.document_type && (
                            <Badge className="border-white/30 bg-white/10 text-[10px] font-medium uppercase tracking-wider text-white/90">
                              {d.document_type}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex gap-3 text-[11px] text-white/75">
                      <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {photoPaths.length} zdjęć</span>
                      <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> {docCount} dokumentów</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setPreviewOpen(true)}
                      className="rounded-xl bg-white/20 font-semibold uppercase tracking-[0.12em] text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/30"
                    >
                      <Eye className="mr-1.5 h-4 w-4" /> Podgląd
                    </Button>
                  </div>
                </>
              )}
            </div>
          </FancyShell>

          {/* === Numer KW (fancy) === */}
          <FancyShell>
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                  <BookText className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div className="leading-tight drop-shadow-[0_1px_8px_oklch(0.15_0.05_265/0.8)]">
                  <div className="text-base font-bold uppercase tracking-[0.18em] sm:text-lg">Numer księgi wieczystej</div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/65">
                    Wpisz numer KW swojej nieruchomości
                  </div>
                </div>
              </div>

              <div className="relative">
                <Input
                  id="kw"
                  value={kw}
                  onChange={(e) => setKw(e.target.value.toUpperCase())}
                  onBlur={() => setKwTouched(true)}
                  placeholder="np. WA1M/00123456/7"
                  aria-invalid={showKwError || undefined}
                  aria-describedby="kw-help"
                  className={`h-14 rounded-2xl border-2 bg-white/10 pl-12 pr-12 text-lg font-bold tracking-wider tabular-nums text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:ring-2 ${
                    showKwError
                      ? "border-rose-400/70 focus-visible:border-rose-300 focus-visible:ring-rose-300/40"
                      : "border-white/30 focus-visible:border-white/70 focus-visible:ring-white/40"
                  }`}
                />
                <BookText className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${showKwError ? "text-rose-300" : "text-white/80"}`} />
                {kwValidation.ok && (
                  <span className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/25 ring-1 ring-white/40 shadow backdrop-blur-sm">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                )}
                {showKwError && (
                  <span className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-rose-500/90 text-white shadow ring-1 ring-rose-300/60">
                    <span className="text-sm font-black leading-none">!</span>
                  </span>
                )}
              </div>

              {showKwError ? (
                <div
                  id="kw-help"
                  role="alert"
                  className="rounded-xl border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-50 backdrop-blur-sm"
                >
                  <p className="font-semibold">{kwValidation.error}</p>
                  {kwValidation.hint && <p className="mt-0.5 text-rose-100/85">{kwValidation.hint}</p>}
                </div>
              ) : (
                <p id="kw-help" className="text-[11px] text-white/70">
                  Format: 4 znaki sądu / 8 cyfr / cyfra kontrolna (np. <span className="font-mono font-semibold text-white/90">WA1M/00123456/7</span>).
                </p>
              )}

              <Button
                size="lg"
                onClick={() => void saveKw()}
                disabled={savingKw || !propertyRow?.id || !kwValidation.ok}
                className="w-full rounded-2xl bg-white/15 text-base font-bold uppercase tracking-[0.14em] text-white ring-1 ring-white/30 backdrop-blur-sm shadow-[0_10px_30px_-10px_oklch(0.15_0.05_265/0.7)] hover:bg-white/25 disabled:opacity-50"
              >
                <Save className="mr-2 h-5 w-5" />
                {savingKw ? "Zapisywanie..." : "Zapisz numer KW"}
              </Button>
            </div>
          </FancyShell>
        </div>
      )}


      {loanRow?.id && (
        <MediaPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          loanApplicationId={loanRow.id}
          photoPaths={photoPaths}
          title="Twoje zdjęcia i dokumenty"
        />
      )}
    </div>
  );
}
