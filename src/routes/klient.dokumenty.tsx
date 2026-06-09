import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Upload, Trash2, FileText, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyLoanProgress } from "@/lib/my-loan.functions";
import { detectKwNumbers } from "@/lib/kw-ocr.functions";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-documents";
import { Home } from "lucide-react";

export const Route = createFileRoute("/klient/dokumenty")({
  component: KlientDokumenty,
});

interface DocRow {
  id: string;
  file_name: string;
  file_path: string | null;
  document_type: string;
  created_at: string;
}

function KlientDokumenty() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const fetchProgress = useServerFn(getMyLoanProgress);
  const runKwOcr = useServerFn(detectKwNumbers);

  const [loanId, setLoanId] = useState<string | null>(null);
  const [loanStatus, setLoanStatus] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyType, setPropertyType] = useState<string | null>(null);
  const [kwNumber, setKwNumber] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [savingProp, setSavingProp] = useState(false);
  const [scanningKw, setScanningKw] = useState(false);

  const LOCKED_STATUSES = new Set<string>([
    "wniosek_kompletny","do_analizy","rokuje","nie_rokuje",
    "wyslany_do_inwestorow","oferta_od_inwestora","oferta_przekazana_klientowi",
    "zaakceptowany_przez_klienta","do_umowy","zamkniety","archiwalny",
  ]);
  const locked = !!(loanStatus && LOCKED_STATUSES.has(loanStatus));

  const { data: progress, refetch: refetchProgress, isLoading } = useQuery({
    queryKey: ["my-loan-progress", user?.id, "docs"],
    queryFn: () => fetchProgress(),
    enabled: Boolean(user),
  });

  const loadAll = async () => {
    if (!user) return;
    const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (!c) return;
    const { data: la } = await supabase
      .from("loan_applications").select("id, status").eq("client_id", c.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!la) { setLoanId(null); setLoanStatus(null); return; }
    setLoanId(la.id);
    setLoanStatus((la as any).status ?? null);
    const { data: p } = await supabase.from("properties")
      .select("id, property_type, land_register_number, area_sqm").eq("loan_application_id", la.id).maybeSingle();
    if (p) {
      setPropertyId(p.id);
      setPropertyType(p.property_type ?? null);
      setKwNumber(p.land_register_number ?? "");
      setAreaSqm(p.area_sqm ? String(p.area_sqm) : "");
    } else {
      setPropertyId(null);
      setPropertyType(null);
    }
    const { data: ds } = await supabase.from("documents").select("id, file_name, file_path, document_type, created_at")
      .eq("loan_application_id", la.id).order("created_at", { ascending: false });
    const rows = (ds as DocRow[]) ?? [];
    setDocs(rows);
    // Signed URLs (1 h) — used for thumbnails / preview, especially after submission
    const urlMap: Record<string, string> = {};
    await Promise.all(rows.map(async (d) => {
      if (!d.file_path) return;
      const { data: s } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      if (s?.signedUrl) urlMap[d.id] = s.signedUrl;
    }));
    setDocUrls(urlMap);
  };

  useEffect(() => { void loadAll(); /* eslint-disable-next-line */ }, [user]);

  const uploadDoc = async (file: File, docType: string, slotKey: string) => {
    if (locked) { toast.info("Wniosek jest w analizie — dokumenty są zamknięte do edycji."); return; }
    if (!loanId || !user) { toast.error("Najpierw utwórz wniosek"); navigate({ to: "/klient/wniosek" }); return; }
    setUploading(slotKey);
    const safeName = file.name
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l").replace(/Ł/g, "L")
      .replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120) || "plik";
    const path = `${user.id}/${loanId}/${Date.now()}-${safeName}`;
    const { error: ue } = await supabase.storage.from("documents").upload(path, file, {
      contentType: file.type || "application/octet-stream", upsert: false,
    });
    if (ue) { toast.error("Błąd uploadu", { description: ue.message }); setUploading(null); return; }
    const { error: ie } = await supabase.from("documents").insert({
      loan_application_id: loanId, file_name: file.name, file_path: path,
      document_type: docType, uploaded_by: user.id,
    });
    if (ie) { toast.error("Błąd zapisu", { description: ie.message }); setUploading(null); return; }
    toast.success(`Dodano: ${file.name}`);
    setUploading(null);
    await loadAll();
    void refetchProgress();
  };

  const deleteDoc = async (d: DocRow) => {
    if (locked) { toast.info("Wniosek jest w analizie — dokumentów nie można już usuwać."); return; }
    if (!confirm(`Usunąć dokument "${d.file_name}"?`)) return;
    if (d.file_path) await supabase.storage.from("documents").remove([d.file_path]);
    await supabase.from("documents").delete().eq("id", d.id);
    toast.success("Usunięto");
    await loadAll();
    void refetchProgress();
  };

  const saveProp = async (fields: { land_register_number?: string | null; area_sqm?: number | null }) => {
    if (locked) { toast.info("Wniosek jest w analizie — dane są zablokowane do edycji."); return; }
    if (!propertyId) { toast.error("Najpierw uzupełnij typ nieruchomości"); navigate({ to: "/klient/wniosek" }); return; }
    setSavingProp(true);
    const { error } = await supabase.from("properties").update(fields).eq("id", propertyId);
    setSavingProp(false);
    if (error) { toast.error("Błąd zapisu", { description: error.message }); return; }
    toast.success("Zapisano");
    void refetchProgress();
  };

  const scanKw = async () => {
    if (!loanId) return;
    setScanningKw(true);
    try {
      const res = await runKwOcr({ data: { loanApplicationId: loanId } });
      const found = res?.detected ?? [];
      if (found.length === 0) toast.info("Nie udało się odczytać numeru KW z dokumentów.");
      else { setKwNumber(found[0]); toast.success(`Znaleziono numer KW: ${found[0]}`); }
    } catch (e: any) {
      toast.error("Błąd skanowania", { description: e?.message });
    } finally { setScanningKw(false); }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Wróć
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Dokumenty</h1>
          <p className="text-sm text-muted-foreground">Wgraj dokumenty, których potrzebujemy do oceny wniosku.</p>
        </div>
      </div>

      {!loanId && !isLoading && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm">Nie masz jeszcze rozpoczętego wniosku.</p>
            <Button onClick={() => navigate({ to: "/wniosek-zabezpieczenie" })}>Rozpocznij wniosek</Button>
          </CardContent>
        </Card>
      )}

      {loanId && progress && (
        <>
          {/* Banner z typem nieruchomości — kontekst dla wymaganych dokumentów */}
          <Card className={propertyType ? "border-primary/30 bg-primary/5" : "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20"}>
            <CardContent className="pt-5 flex flex-wrap items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-background border">
                <Home className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Typ nieruchomości</div>
                <div className="text-base font-bold">
                  {propertyType
                    ? (PROPERTY_TYPE_LABELS[propertyType] ?? propertyType)
                    : "Jeszcze nie wybrano — wybierz, żebyśmy wiedzieli, jakich dokumentów potrzebujemy"}
                </div>
              </div>
              <Button size="sm" variant={propertyType ? "outline" : "cta"} onClick={() => navigate({ to: "/wniosek-zabezpieczenie" })}>
                {propertyType ? "Zmień" : "Wybierz typ"}
              </Button>
            </CardContent>
          </Card>

          {/* Pola tekstowe — KW + powierzchnia */}
          {progress.required_documents.some((r) => r.kind === "kw_number") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {kwNumber ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground/40" />}
                  Numer księgi wieczystej
                </CardTitle>
                <CardDescription>Wpisz numer KW lub wgraj wypis — odczytamy automatycznie.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Input value={kwNumber} onChange={(e) => setKwNumber(e.target.value)}
                    placeholder="np. WA1M/00000000/0" className="max-w-sm" />
                  <Button onClick={() => saveProp({ land_register_number: kwNumber || null })} disabled={savingProp}>
                    {savingProp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zapisz"}
                  </Button>
                  <Button variant="outline" onClick={scanKw} disabled={scanningKw || docs.length === 0}>
                    {scanningKw ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Odczytaj z dokumentów
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {progress.required_documents.some((r) => r.kind === "usable_area") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {areaSqm ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground/40" />}
                  Powierzchnia użytkowa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap items-end">
                  <div>
                    <Label htmlFor="area">m²</Label>
                    <Input id="area" type="number" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} className="max-w-[140px]" />
                  </div>
                  <Button onClick={() => saveProp({ area_sqm: areaSqm ? Number(areaSqm) : null })} disabled={savingProp}>
                    {savingProp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zapisz"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sloty plikowe — pozostałe wymagania */}
          {progress.required_documents
            .filter((r) => r.kind !== "kw_number" && r.kind !== "usable_area")
            .map((r) => {
              const done = progress.uploaded_documents.includes(r.label);
              const slotDocs = docs.filter((d) => (d.document_type ?? "").includes(r.kind));
              const slotKey = r.kind;
              return (
                <Card key={r.kind}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground/40" />}
                      {r.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {slotDocs.length > 0 && (
                      <ul className="space-y-1.5">
                        {slotDocs.map((d) => (
                          <li key={d.id} className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded px-2.5 py-1.5">
                            <span className="flex items-center gap-2 min-w-0 truncate"><FileText className="h-4 w-4 shrink-0" /> {d.file_name}</span>
                            <Button size="icon" variant="ghost" onClick={() => deleteDoc(d)}><Trash2 className="h-4 w-4" /></Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="file" multiple className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          void (async () => {
                            for (const f of files) await uploadDoc(f, r.kind, slotKey);
                          })();
                          e.target.value = "";
                        }} />
                      <Button asChild variant={done ? "outline" : "cta"}>
                        <span>
                          {uploading === slotKey
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wysyłam…</>
                            : <><Upload className="mr-2 h-4 w-4" /> {done ? "Dodaj kolejny" : "Wgraj plik"}</>}
                        </span>
                      </Button>
                    </label>
                  </CardContent>
                </Card>
              );
            })}

          {/* Inne wgrane dokumenty (nieprzypisane do slotów) */}
          {(() => {
            const handled = new Set<string>(progress.required_documents.map((r) => r.kind as string));
            const other = docs.filter((d) => !handled.has(d.document_type));
            if (other.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Inne dokumenty <Badge variant="secondary" className="ml-1">{other.length}</Badge></CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {other.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded px-2.5 py-1.5">
                        <span className="flex items-center gap-2 min-w-0 truncate"><FileText className="h-4 w-4 shrink-0" /> {d.file_name}</span>
                        <Button size="icon" variant="ghost" onClick={() => deleteDoc(d)}><Trash2 className="h-4 w-4" /></Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
