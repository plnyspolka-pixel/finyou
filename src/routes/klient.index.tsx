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
import { FileText, Image as ImageIcon, File as FileIcon, Save, BookText, Check } from "lucide-react";
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

  const { data: loanRow } = useQuery({
    queryKey: ["client-loan", clientRow?.id],
    queryFn: async () => {
      const { data } = await supabase.from("loan_applications")
        .select("id")
        .eq("client_id", clientRow!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: Boolean(clientRow?.id),
  });

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

  useEffect(() => {
    setKw(String((propertyRow as any)?.land_register_number ?? ""));
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

  const saveKw = async () => {
    if (!propertyRow?.id) return;
    setSavingKw(true);
    try {
      const { error } = await supabase.from("properties")
        .update({ land_register_number: kw.trim() || null })
        .eq("id", propertyRow.id);
      if (error) throw error;
      toast.success("Numer KW zapisany");
      void refetchProperty();
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zapisać");
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Twoje pliki
                </span>
                <Badge variant="secondary" className="font-normal">{totalFiles}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {totalFiles === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nie wgrałeś jeszcze żadnych zdjęć ani dokumentów.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {thumbUrls.map((u, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className="aspect-square overflow-hidden rounded border bg-muted hover:ring-2 hover:ring-primary transition"
                      >
                        <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    {docCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className="aspect-square rounded border bg-muted flex flex-col items-center justify-center gap-0.5 hover:ring-2 hover:ring-primary transition"
                      >
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                        <span className="text-[10px] font-medium">{docCount} dok.</span>
                      </button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setPreviewOpen(true)}
                  >
                    Otwórz podgląd
                  </Button>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span><ImageIcon className="h-3 w-3 inline" /> {photoPaths.length} zdjęć</span>
                    <span><FileText className="h-3 w-3 inline" /> {docCount} dokumentów</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <section className="relative overflow-hidden rounded-3xl border-2 border-accent/40 bg-gradient-to-br from-accent/10 via-background to-background p-5 shadow-[0_20px_60px_-20px_hsl(var(--accent)/0.35)] md:p-7">
            <div className="-mx-5 -mt-5 mb-5 border-b border-accent/20 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent px-5 py-4 md:-mx-7 md:-mt-7 md:px-7 md:py-5">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-foreground shadow-md">
                  <BookText className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-accent">Numer księgi wieczystej</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="kw" className="text-sm font-semibold">Wpisz numer KW nieruchomości</Label>
              <div className="relative">
                <Input
                  id="kw"
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                  placeholder="np. WA1M/00123456/7"
                  className="h-14 rounded-2xl border-2 border-accent/30 bg-background/80 pl-12 pr-4 text-lg font-bold tracking-wider tabular-nums shadow-inner focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
                />
                <BookText className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-accent" />
                {kw.trim().length >= 14 && (
                  <span className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-accent text-accent-foreground shadow">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Format: 4 znaki sądu / 8 cyfr / cyfra kontrolna (np. <span className="font-mono font-semibold">WA1M/00123456/7</span>).
              </p>
              <Button
                size="lg"
                onClick={() => void saveKw()}
                disabled={savingKw || !propertyRow?.id}
                className="w-full rounded-2xl bg-gradient-to-r from-accent to-accent/80 text-base font-bold text-accent-foreground shadow-[0_10px_30px_-10px_hsl(var(--accent)/0.6)] hover:from-accent hover:to-accent hover:shadow-[0_14px_40px_-10px_hsl(var(--accent)/0.7)]"
              >
                <Save className="mr-2 h-5 w-5" />
                {savingKw ? "Zapisywanie..." : "Zapisz numer KW"}
              </Button>
            </div>
          </section>
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
